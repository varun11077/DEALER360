#!/usr/bin/env bash

# =========================================================
# DEALER360 lifecycle test: cancel flows and credit release
#
# Usage:
#   cds watch
#   bash test/backend-lifecycle.sh [base-url]
#
# With authentication enabled, pass credentials:
#   CURL_AUTH="-u alice:a" bash test/backend-lifecycle.sh
#
# Needs curl and python3. Creates test data (use a dev database).
# =========================================================

B="${1:-http://localhost:4004}"
H='Content-Type: application/json'
CURL_AUTH="${CURL_AUTH:-}"
PASS=0
FAIL=0

req() {
  local out
  if [ -n "$3" ]; then
    out=$(curl -s $CURL_AUTH -w $'\n%{http_code}' -X "$1" "$B/$2" -H "$H" -d "$3")
  else
    out=$(curl -s $CURL_AUTH -w $'\n%{http_code}' -X "$1" "$B/$2")
  fi
  CODE=$(echo "$out" | tail -n1)
  BODY=$(echo "$out" | sed '$d')
}

js() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)" 2>/dev/null; }

check() {
  if [ "$CODE" = "$2" ]; then PASS=$((PASS+1)); printf "  PASS  %s (%s)\n" "$1" "$CODE"
  else FAIL=$((FAIL+1)); printf "  FAIL  %s (expected %s, got %s) %s\n" "$1" "$2" "$CODE" "$(echo "$BODY" | head -c 200)"; fi
}

eq() {
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf "  PASS  %s (%s)\n" "$1" "$2"
  else FAIL=$((FAIL+1)); printf "  FAIL  %s (expected %s, got %s)\n" "$1" "$3" "$2"; fi
}

get() { curl -s $CURL_AUTH "$B/$1"; }

# ---------------------------------------------------------
# Test data helpers
# ---------------------------------------------------------

DL=$(get "credit/DealerCredits?\$filter=dealer/status%20eq%20'ACTIVE'%20and%20isBlocked%20eq%20false&\$top=1&\$select=dealer_ID" | js "d['value'][0]['dealer_ID']")
PROD=$(get "master-data/Products?\$top=1&\$select=ID" | js "d['value'][0]['ID']")

used() {
  get "credit/DealerCredits?\$filter=dealer_ID%20eq%20$DL&\$select=usedCredit" | js "d['value'][0]['usedCredit']"
}

new_pr() {
  # qty -> sets PR
  req POST purchase-requisition/PurchaseRequisitions "{\"dealer_ID\":\"$DL\",\"requestedDate\":\"2026-10-05\",\"requiredDate\":\"2026-10-20\",\"items\":[{\"itemNumber\":10,\"product_ID\":\"$PROD\",\"quantity\":${1:-5},\"unitOfMeasure\":\"EA\",\"requestedUnitPrice\":1000}]}"
  PR=$(echo "$BODY" | js "d['ID']")
}

submit_pr()  { req POST purchase-requisition/submitPurchaseRequisition "{\"requisitionId\":\"$PR\"}"; }
approve_pr() {
  req POST purchase-requisition-approval/startApproval "{\"requisitionId\":\"$PR\"}"
  PRAR=$(echo "$BODY" | js "d['approvalRequestId']")
  req POST purchase-requisition-approval/processApprovalDecision "{\"approvalRequestId\":\"$PRAR\",\"decision\":\"APPROVED\",\"comments\":\"ok\"}"
}

new_po() {
  # approved purchase order -> sets PO
  new_pr "${1:-5}"; submit_pr; approve_pr
  req POST purchase-requisition/convertToPurchaseOrder "{\"requisitionId\":\"$PR\"}"
  PO=$(echo "$BODY" | js "d['value']")
  req POST purchase-order/submitPurchaseOrder "{\"purchaseOrderId\":\"$PO\"}"
  req POST purchase-order/startPurchaseOrderApproval "{\"purchaseOrderId\":\"$PO\"}"
  POAR=$(echo "$BODY" | js "d['value']")
  req POST purchase-order/processPurchaseOrderApprovalDecision "{\"approvalRequestId\":\"$POAR\",\"decision\":\"APPROVED\",\"comments\":\"ok\"}"
}

po_status() { get "purchase-order/PurchaseOrders($PO)?\$select=status" | js "d['status']"; }


echo "== Cancel purchase requisition"

new_pr 2
req POST purchase-requisition/cancelPurchaseRequisition "{\"requisitionId\":\"$PR\"}"; check "cancel without reason rejected" 400
req POST purchase-requisition/cancelPurchaseRequisition "{\"requisitionId\":\"not-a-uuid\",\"reason\":\"x\"}"; check "cancel with invalid id rejected" 400
req POST purchase-requisition/cancelPurchaseRequisition "{\"requisitionId\":\"00000000-0000-0000-0000-000000000000\",\"reason\":\"x\"}"; check "cancel unknown PR -> 404" 404
req POST purchase-requisition/cancelPurchaseRequisition "{\"requisitionId\":\"$PR\",\"reason\":\"Entered by mistake\"}"; check "cancel DRAFT PR" 200
eq "PR is CANCELLED" "$(echo "$BODY" | js "d['status']")" CANCELLED
req POST purchase-requisition/cancelPurchaseRequisition "{\"requisitionId\":\"$PR\",\"reason\":\"again\"}"; check "cancel twice rejected" 400
req POST purchase-requisition/submitPurchaseRequisition "{\"requisitionId\":\"$PR\"}"; check "cancelled PR cannot be submitted" 400
req GET "purchase-requisition/PurchaseRequisitionStatusHistory?\$filter=purchaseRequisition_ID%20eq%20$PR%20and%20newStatus%20eq%20'CANCELLED'&\$count=true&\$top=0"
eq "cancel written to status history" "$(echo "$BODY" | js "d['@odata.count']")" 1

new_pr 2; submit_pr
req POST purchase-requisition-approval/startApproval "{\"requisitionId\":\"$PR\"}"; PRAR=$(echo "$BODY" | js "d['approvalRequestId']")
req POST purchase-requisition/cancelPurchaseRequisition "{\"requisitionId\":\"$PR\",\"reason\":\"Withdrawn during approval\"}"; check "cancel PR in approval" 200
eq "open approval request is cancelled too" "$(get "purchase-requisition-approval/ApprovalRequests($PRAR)?\$select=status" | js "d['status']")" CANCELLED

new_pr 2; submit_pr; approve_pr
req POST purchase-requisition/cancelPurchaseRequisition "{\"requisitionId\":\"$PR\",\"reason\":\"Not needed\"}"; check "cancel APPROVED PR (not yet converted)" 200

new_pr 2; submit_pr; approve_pr
req POST purchase-requisition/convertToPurchaseOrder "{\"requisitionId\":\"$PR\"}"
req POST purchase-requisition/cancelPurchaseRequisition "{\"requisitionId\":\"$PR\",\"reason\":\"Too late\"}"; check "converted PR cannot be cancelled" 400


echo "== Cancel purchase order (no credit held)"

new_po 3
eq "PO is APPROVED" "$(po_status)" APPROVED
BEFORE=$(used)
req POST purchase-order/cancelPurchaseOrder "{\"purchaseOrderId\":\"$PO\"}"; check "cancel PO without reason rejected" 400
req POST purchase-order/cancelPurchaseOrder "{\"purchaseOrderId\":\"00000000-0000-0000-0000-000000000000\",\"reason\":\"x\"}"; check "cancel unknown PO -> 404" 404
req POST purchase-order/cancelPurchaseOrder "{\"purchaseOrderId\":\"$PO\",\"reason\":\"Dealer changed mind\"}"; check "cancel APPROVED PO" 200
eq "PO is CANCELLED" "$(echo "$BODY" | js "d['status']")" CANCELLED
eq "cancel reason stored" "$(echo "$BODY" | js "d['cancellationReason']")" "Dealer changed mind"
eq "credit unchanged (none was held)" "$(used)" "$BEFORE"
req POST purchase-order/cancelPurchaseOrder "{\"purchaseOrderId\":\"$PO\",\"reason\":\"again\"}"; check "cancel twice rejected" 400
req POST purchase-order/allocateCreditToPurchaseOrder "{\"purchaseOrderId\":\"$PO\"}"; check "cancelled PO cannot get credit" 400


echo "== Cancel purchase order (credit allocated)"

new_po 4
BEFORE=$(used)
req POST purchase-order/allocateCreditToPurchaseOrder "{\"purchaseOrderId\":\"$PO\"}"; check "allocate credit" 200
HELD=$(used)
eq "credit is held" "$(python3 -c "print($HELD > $BEFORE)")" True
req POST purchase-order/cancelPurchaseOrder "{\"purchaseOrderId\":\"$PO\",\"reason\":\"Cancelled after allocation\"}"; check "cancel ALLOCATED PO" 200
eq "credit fully released" "$(used)" "$BEFORE"
req GET "credit/CreditTransactions?\$filter=referenceId%20eq%20'$PO'%20and%20transactionType%20eq%20'RELEASE'&\$count=true&\$top=0"
eq "one RELEASE transaction posted" "$(echo "$BODY" | js "d['@odata.count']")" 1
req GET "purchase-order/PurchaseOrderStatusHistory?\$filter=purchaseOrder_ID%20eq%20$PO%20and%20newStatus%20eq%20'CANCELLED'&\$count=true&\$top=0"
eq "cancel written to PO status history" "$(echo "$BODY" | js "d['@odata.count']")" 1


echo "== Cancel purchase order with open fulfillment"

new_po 2
req POST purchase-order/allocateCreditToPurchaseOrder "{\"purchaseOrderId\":\"$PO\"}"
req POST fulfillment/createFulfillment "{\"purchaseOrderId\":\"$PO\"}"; FU=$(echo "$BODY" | js "d['ID']")
BEFORE_RELEASE=$(used)
req POST purchase-order/cancelPurchaseOrder "{\"purchaseOrderId\":\"$PO\",\"reason\":\"Cancel with fulfillment\"}"; check "cancel PO that has a fulfillment" 200
eq "fulfillment is CANCELLED too" "$(get "fulfillment/Fulfillments($FU)?\$select=status" | js "d['status']")" CANCELLED
eq "credit released" "$(python3 -c "print($BEFORE_RELEASE > $(used))")" True


echo "== Cancel dispatched order via fulfillment"

new_po 2
BEFORE=$(used)
req POST purchase-order/allocateCreditToPurchaseOrder "{\"purchaseOrderId\":\"$PO\"}"
req POST fulfillment/createFulfillment "{\"purchaseOrderId\":\"$PO\"}"; FU=$(echo "$BODY" | js "d['ID']")
req POST fulfillment/dispatchFulfillment "{\"fulfillmentId\":\"$FU\",\"carrierName\":\"BlueDart\",\"trackingNumber\":\"T9\",\"shipmentReference\":\"S9\"}"; check "dispatch" 200
req POST purchase-order/cancelPurchaseOrder "{\"purchaseOrderId\":\"$PO\",\"reason\":\"too late\"}"; check "cancelPurchaseOrder refused once DISPATCHED" 400
req POST fulfillment/cancelFulfillment "{\"fulfillmentId\":\"$FU\",\"reason\":\"Lost in transit\"}"; check "cancelFulfillment of dispatched order" 200
eq "PO is CANCELLED" "$(po_status)" CANCELLED
eq "credit released (no leak)" "$(used)" "$BEFORE"


echo "== Dashboard"

req GET "dashboard/overview"; check "overview" 200
for key in kpis dealersByStatus ordersByStatus fulfillmentsByStatus monthlyOrders topDealers creditUtilization recentActivity; do
  eq "overview has $key" "$(echo "$BODY" | js "'$key' in d")" True
done
req GET "dashboard/overview(dateFrom=2026-03-01,dateTo=2026-01-01)"; check "reversed range rejected" 400


echo
echo "=============================================="
echo "Result: $PASS passed, $FAIL failed"
echo "=============================================="

[ "$FAIL" -eq 0 ]
