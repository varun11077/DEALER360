
#!/usr/bin/env bash

# =========================================================
# DEALER360 backend smoke test
#
# Usage:
#   cds watch
#   bash test/backend-smoke.sh
#
# Optional:
#   bash test/backend-smoke.sh http://localhost:4004
#
# Needs:
#   curl
#   python3
#
# Runs against local/dev database.
# =========================================================

B="${1:-http://localhost:4004}"
CURL_AUTH="${CURL_AUTH:-}"   # e.g. CURL_AUTH="-u alice:a" when auth is enabled

H='Content-Type: application/json'

PASS=0
FAIL=0

# =========================================================
# Helpers
# =========================================================

req() {
  # method path [body] -> sets CODE and BODY

  local out

  if [ -n "$3" ]; then
    out=$(curl -s $CURL_AUTH \
      -w $'\n%{http_code}' \
      -X "$1" \
      "$B/$2" \
      -H "$H" \
      -d "$3")
  else
    out=$(curl -s $CURL_AUTH \
      -w $'\n%{http_code}' \
      -X "$1" \
      "$B/$2")
  fi

  CODE=$(echo "$out" | tail -n1)
  BODY=$(echo "$out" | sed '$d')
}

js() {
  python3 -c "import sys,json;d=json.load(sys.stdin);print($1)" 2>/dev/null
}

check() {
  # description expectedCode

  if [ "$CODE" = "$2" ]; then
    PASS=$((PASS+1))
    printf "  PASS  %s (%s)\n" "$1" "$CODE"
  else
    FAIL=$((FAIL+1))
    printf "  FAIL  %s (expected %s, got %s) %s\n" \
      "$1" \
      "$2" \
      "$CODE" \
      "$(echo "$BODY" | head -c 160)"
  fi
}

eq() {
  # description actual expected

  if [ "$2" = "$3" ]; then
    PASS=$((PASS+1))
    printf "  PASS  %s (%s)\n" "$1" "$2"
  else
    FAIL=$((FAIL+1))
    printf "  FAIL  %s (expected %s, got %s)\n" \
      "$1" \
      "$3" \
      "$2"
  fi
}

# =========================================================
# Reads
# =========================================================

echo
echo "== Reads"

for s in \
  dealer/Dealers \
  credit/DealerCredits \
  purchase-order/PurchaseOrders \
  purchase-requisition/PurchaseRequisitions \
  fulfillment/Fulfillments \
  pricing/Products \
  master-data/Products
do
  req GET "$s?\$top=1"
  check "GET $s" 200
done

# =========================================================
# Dashboard
# =========================================================

echo
echo "== Dashboard"

req GET "dashboard/overview"
check "overview (default range)" 200

req GET "dashboard/overview(dateFrom=2026-03-01,dateTo=2026-01-01)"
check "overview rejects reversed range" 400

# =========================================================
# Get dealer type
# =========================================================

DT=$(
  curl -s $CURL_AUTH \
    "$B/dealer/DealerTypes?\$top=1&\$select=ID" |
    js "d['value'][0]['ID']"
)

echo
echo "Dealer Type ID: $DT"

# =========================================================
# Dealer create validation
# =========================================================

echo
echo "== Dealer create validation"

req POST \
  dealer/Dealers \
  "{\"legalName\":\"Smoke A\",\"primaryEmail\":\"a@x.com\"}"

check "create without dealer type" 400

req POST \
  dealer/Dealers \
  "{\"legalName\":\"Smoke A\",\"dealerType_ID\":\"$DT\",\"gstNumber\":\"BAD\"}"

check "create with bad GST" 400

req POST \
  dealer/Dealers \
  "{\"legalName\":\"Smoke A\",\"dealerType_ID\":\"$DT\",\"primaryEmail\":\"a@x.com\",\"status\":\"ACTIVE\"}"

check "create ignores/forces PENDING" 201

ID=$(echo "$BODY" | js "d['ID']")

eq \
  "new dealer starts PENDING" \
  "$(echo "$BODY" | js "d['status']")" \
  "PENDING"

# =========================================================
# Dealer update protection
# =========================================================

echo
echo "== Dealer update protection"

req PATCH \
  "dealer/Dealers($ID)" \
  '{"status":"ACTIVE"}'

check "PATCH status blocked" 400

req PATCH \
  "dealer/Dealers($ID)" \
  '{"dealerCode":"HACK"}'

check "PATCH dealerCode blocked" 400

req PATCH \
  "dealer/Dealers($ID)" \
  '{"gstNumber":"BAD"}'

check "PATCH bad GST rejected" 400

req PATCH \
  "dealer/Dealers($ID)" \
  '{"primaryEmail":"nope"}'

check "PATCH bad email rejected" 400

req PATCH \
  "dealer/Dealers($ID)" \
  '{"tradeName":"Smoke Trade","primaryEmail":"ok@x.com"}'

check "PATCH normal fields" 200

req DELETE \
  "dealer/Dealers($ID)"

check "DELETE dealer blocked" 405

req PATCH \
  "credit/Dealers($ID)" \
  '{"status":"ACTIVE"}'

check "PATCH dealer via /credit blocked" 405

req PATCH \
  "pricing/Dealers($ID)" \
  '{"status":"BLOCKED"}'

check "PATCH dealer via /pricing blocked" 405

req DELETE \
  "pricing/Dealers($ID)"

check "DELETE dealer via /pricing blocked" 405

# =========================================================
# Dealer lifecycle
# =========================================================

echo
echo "== Dealer lifecycle"

act() {
  req POST "dealer/$1" "$2"
}

act \
  reactivateDealer \
  "{\"dealerId\":\"$ID\"}"

check "reactivate from PENDING rejected" 400

act \
  submitDealer \
  "{\"dealerId\":\"$ID\"}"

check "submitDealer" 200

eq \
  "status SUBMITTED" \
  "$(echo "$BODY" | js "d['status']")" \
  "SUBMITTED"

eq \
  "dealerCode assigned" \
  "$(echo "$BODY" | js "bool(d['dealerCode'])")" \
  "True"

act \
  l1Approve \
  "{\"dealerId\":\"$ID\"}"

check "l1Approve" 200

act \
  l2Approve \
  "{\"dealerId\":\"$ID\"}"

check "l2Approve" 200

eq \
  "status ACTIVE" \
  "$(echo "$BODY" | js "d['status']")" \
  "ACTIVE"

act \
  deactivateDealer \
  "{\"dealerId\":\"$ID\"}"

check "deactivate needs reason" 400

act \
  deactivateDealer \
  "{\"dealerId\":\"$ID\",\"reason\":\"Smoke test\"}"

check "deactivateDealer" 200

eq \
  "status INACTIVE" \
  "$(echo "$BODY" | js "d['status']")" \
  "INACTIVE"

act \
  reactivateDealer \
  "{\"dealerId\":\"$ID\"}"

check "reactivateDealer" 200

act \
  blockDealer \
  "{\"dealerId\":\"$ID\",\"reason\":\"Smoke test\"}"

check "blockDealer" 200

act \
  unblockDealer \
  "{\"dealerId\":\"$ID\"}"

check "unblockDealer" 200

eq \
  "status ACTIVE again" \
  "$(echo "$BODY" | js "d['status']")" \
  "ACTIVE"

act \
  submitDealer \
  "{\"dealerId\":\"00000000-0000-0000-0000-000000000000\"}"

check "unknown dealer -> 404" 404

req GET \
  "dealer/DealerStatusHistory?\$filter=dealer_ID%20eq%20$ID&\$count=true&\$top=0"

eq \
  "status history rows written" \
  "$(echo "$BODY" | js "d['@odata.count']>=7")" \
  "True"

# =========================================================
# Credit consistency
# =========================================================

echo
echo "== Credit consistency"

req POST \
  credit/DealerCredits \
  "{\"dealer_ID\":\"$ID\",\"creditLimit\":1000000,\"usedCredit\":999}"

check "credit create blocked when usedCredit sent" 400

req POST \
  credit/DealerCredits \
  "{\"dealer_ID\":\"$ID\",\"creditLimit\":1000000}"

check "credit create" 201

CID=$(echo "$BODY" | js "d['ID']")

eq \
  "available = limit on create" \
  "$(echo "$BODY" | js "d['availableCredit']")" \
  "1000000"

req PATCH \
  "credit/DealerCredits($CID)" \
  '{"usedCredit":0}'

check "PATCH usedCredit blocked" 400

req PATCH \
  "credit/DealerCredits($CID)" \
  '{"creditLimit":2000000}'

check "raise credit limit" 200

eq \
  "available recalculated" \
  "$(echo "$BODY" | js "d['availableCredit']")" \
  "2000000"

req POST \
  credit/allocateCredit \
  "{\"dealerId\":\"$ID\",\"amount\":500000,\"referenceType\":\"SMOKE\",\"referenceId\":\"S1\",\"description\":\"smoke\"}"

check "allocateCredit" 200

req PATCH \
  "credit/DealerCredits($CID)" \
  '{"creditLimit":100000}'

check "limit below used rejected" 400

req POST \
  credit/releaseCredit \
  "{\"dealerId\":\"$ID\",\"amount\":500000,\"referenceType\":\"SMOKE\",\"referenceId\":\"S1\",\"description\":\"smoke\"}"

check "releaseCredit" 200

# =========================================================
# Other services are action-only
# =========================================================

echo
echo "== Other services are action-only"

PO=$(
  curl -s $CURL_AUTH \
    "$B/purchase-order/PurchaseOrders?\$top=1&\$select=ID" |
    js "d['value'][0]['ID']"
)

req PATCH \
  "purchase-order/PurchaseOrders($PO)" \
  '{"status":"CLOSED"}'

check "PATCH PO blocked" 405

req DELETE \
  "purchase-order/PurchaseOrders($PO)"

check "DELETE PO blocked" 405

FU=$(
  curl -s $CURL_AUTH \
    "$B/fulfillment/Fulfillments?\$top=1&\$select=ID" |
    js "d['value'][0]['ID']"
)

req DELETE \
  "fulfillment/Fulfillments($FU)"

check "DELETE fulfillment blocked" 405

PR=$(
  curl -s $CURL_AUTH \
    "$B/purchase-requisition/PurchaseRequisitions?\$top=1&\$select=ID" |
    js "d['value'][0]['ID']"
)

req PATCH \
  "purchase-requisition/PurchaseRequisitions($PR)" \
  '{"status":"APPROVED"}'

check "PATCH PR status blocked" 400

req DELETE \
  "purchase-requisition/PurchaseRequisitions($PR)"

check "DELETE PR blocked" 405

# =========================================================
# End-to-end order flow
#
# PR -> PO -> Credit -> Fulfillment
# =========================================================

echo
echo "== End-to-end order flow (PR -> PO -> credit -> fulfillment)"

DL=$(
  curl -s $CURL_AUTH \
    "$B/credit/DealerCredits?\$filter=dealer/status%20eq%20'ACTIVE'%20and%20isBlocked%20eq%20false&\$top=1&\$select=dealer_ID" |
    js "d['value'][0]['dealer_ID']"
)

PROD=$(
  curl -s $CURL_AUTH \
    "$B/master-data/Products?\$top=1&\$select=ID" |
    js "d['value'][0]['ID']"
)

flow() {
  req POST "$1" "$2"
  check "$3" "${4:-200}"
}

for n in 1 2
do
  req POST \
    purchase-requisition/PurchaseRequisitions \
    "{\"dealer_ID\":\"$DL\",\"requestedDate\":\"2026-10-05\",\"requiredDate\":\"2026-10-20\",\"items\":[{\"itemNumber\":10,\"product_ID\":\"$PROD\",\"quantity\":5,\"unitOfMeasure\":\"EA\",\"requestedUnitPrice\":1000}]}"

  check "create PR #$n" 201

  PR=$(echo "$BODY" | js "d['ID']")
done

flow \
  purchase-requisition/submitPurchaseRequisition \
  "{\"requisitionId\":\"$PR\"}" \
  "submit PR"

flow \
  purchase-requisition-approval/startApproval \
  "{\"requisitionId\":\"$PR\"}" \
  "start PR approval"

AR=$(echo "$BODY" | js "d['approvalRequestId']")

flow \
  purchase-requisition-approval/processApprovalDecision \
  "{\"approvalRequestId\":\"$AR\",\"decision\":\"APPROVED\",\"comments\":\"ok\"}" \
  "approve PR"

flow \
  purchase-requisition/convertToPurchaseOrder \
  "{\"requisitionId\":\"$PR\"}" \
  "convert PR to PO"

PO=$(echo "$BODY" | js "d.get('value')")

flow \
  purchase-order/submitPurchaseOrder \
  "{\"purchaseOrderId\":\"$PO\"}" \
  "submit PO"

flow \
  purchase-order/startPurchaseOrderApproval \
  "{\"purchaseOrderId\":\"$PO\"}" \
  "start PO approval"

POAR=$(echo "$BODY" | js "d.get('value')")

flow \
  purchase-order/processPurchaseOrderApprovalDecision \
  "{\"approvalRequestId\":\"$POAR\",\"decision\":\"APPROVED\",\"comments\":\"ok\"}" \
  "approve PO"

flow \
  purchase-order/allocateCreditToPurchaseOrder \
  "{\"purchaseOrderId\":\"$PO\"}" \
  "allocate credit"

flow \
  fulfillment/createFulfillment \
  "{\"purchaseOrderId\":\"$PO\"}" \
  "create fulfillment"

FU=$(echo "$BODY" | js "d['ID']")

flow \
  fulfillment/dispatchFulfillment \
  "{\"fulfillmentId\":\"$FU\",\"carrierName\":\"BlueDart\",\"trackingNumber\":\"T1\",\"shipmentReference\":\"S1\"}" \
  "dispatch"

flow \
  fulfillment/deliverFulfillment \
  "{\"fulfillmentId\":\"$FU\",\"deliveryNoteNumber\":\"DN1\",\"deliveryRemarks\":\"ok\"}" \
  "deliver"

flow \
  fulfillment/invoiceFulfillment \
  "{\"fulfillmentId\":\"$FU\",\"invoiceNumber\":\"INV1\"}" \
  "invoice"

flow \
  fulfillment/closeFulfillment \
  "{\"fulfillmentId\":\"$FU\"}" \
  "close"

req GET \
  "purchase-order/PurchaseOrders($PO)?\$select=status"

eq \
  "PO ends CLOSED" \
  "$(echo "$BODY" | js "d['status']")" \
  "CLOSED"

# =========================================================
# Result
# =========================================================

echo
echo "=============================================="
echo "Result: $PASS passed, $FAIL failed"
echo "=============================================="

[ "$FAIL" -eq 0 ]
