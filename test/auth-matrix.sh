#!/usr/bin/env bash

# =========================================================
# DEALER360 authorization matrix
#
# Start the backend with mock users (alice = User+Admin,
# bob = User, carol = no role):
#
#   CDS_CONFIG="$(cat test/mock-auth.json)" cds watch
#
# Then:
#   bash test/auth-matrix.sh [base-url]
#
# With the normal "dummy" auth nothing is restricted, so this
# test only makes sense against the mocked-user server above
# (and later against XSUAA with real users).
# =========================================================

B="${1:-http://localhost:4004}"
H='Content-Type: application/json'
ZERO='00000000-0000-0000-0000-000000000000'
PASS=0
FAIL=0

# user  description  expected  curl-args...
t() {
  local user="$1" desc="$2" want="$3"; shift 3
  local auth=()
  [ -n "$user" ] && auth=(-u "$user")
  local got
  got=$(curl -s -o /dev/null -w "%{http_code}" "${auth[@]}" "$@")
  if [ "$got" = "$want" ]; then PASS=$((PASS+1)); printf "  PASS  %-9s %-34s %s\n" "${user:-anon}" "$desc" "$got"
  else FAIL=$((FAIL+1)); printf "  FAIL  %-9s %-34s expected %s, got %s\n" "${user:-anon}" "$desc" "$want" "$got"; fi
}

echo "== Authentication"
t ""         "no credentials"                  401 "$B/dealer/Dealers?\$top=1"
t "carol:c"  "logged in but no role"           403 "$B/dealer/Dealers?\$top=1"

echo "== User role (bob)"
t "bob:b"    "read dealers"                    200 "$B/dealer/Dealers?\$top=1"
t "bob:b"    "read dashboard"                  200 "$B/dashboard/overview"
t "bob:b"    "read credit"                     200 "$B/credit/DealerCredits?\$top=1"
t "bob:b"    "submit dealer (allowed)"         404 -X POST "$B/dealer/submitDealer" -H "$H" -d "{\"dealerId\":\"$ZERO\"}"
t "bob:b"    "cancel purchase order (allowed)" 404 -X POST "$B/purchase-order/cancelPurchaseOrder" -H "$H" -d "{\"purchaseOrderId\":\"$ZERO\",\"reason\":\"x\"}"
t "bob:b"    "cancel requisition (allowed)"    404 -X POST "$B/purchase-requisition/cancelPurchaseRequisition" -H "$H" -d "{\"requisitionId\":\"$ZERO\",\"reason\":\"x\"}"
t "bob:b"    "L2 approve dealer"               403 -X POST "$B/dealer/l2Approve" -H "$H" -d "{\"dealerId\":\"$ZERO\"}"
t "bob:b"    "block dealer"                    403 -X POST "$B/dealer/blockDealer" -H "$H" -d "{\"dealerId\":\"$ZERO\",\"reason\":\"x\"}"
t "bob:b"    "allocate credit"                 403 -X POST "$B/credit/allocateCredit" -H "$H" -d '{}'
t "bob:b"    "change credit limit"             403 -X PATCH "$B/credit/DealerCredits($ZERO)" -H "$H" -d '{"creditLimit":1}'
t "bob:b"    "PR approval decision"            403 -X POST "$B/purchase-requisition-approval/processApprovalDecision" -H "$H" -d '{}'
t "bob:b"    "PO approval decision"            403 -X POST "$B/purchase-order/processPurchaseOrderApprovalDecision" -H "$H" -d '{}'
t "bob:b"    "cancel fulfillment"              403 -X POST "$B/fulfillment/cancelFulfillment" -H "$H" -d '{}'
t "bob:b"    "write master data"               403 -X POST "$B/master-data/Regions" -H "$H" -d '{"name":"X","code":"X"}'
t "bob:b"    "write prices"                    403 -X POST "$B/pricing/ProductPrices" -H "$H" -d '{}'
t "bob:b"    "integration monitor"             403 "$B/integration/OutboxEvents?\$top=1"

echo "== Admin role (alice)"
t "alice:a"  "read dealers"                    200 "$B/dealer/Dealers?\$top=1"
t "alice:a"  "integration monitor"             200 "$B/integration/OutboxEvents?\$top=1"
t "alice:a"  "L2 approve (allowed)"            404 -X POST "$B/dealer/l2Approve" -H "$H" -d "{\"dealerId\":\"$ZERO\"}"
t "alice:a"  "cancel fulfillment (allowed)"    400 -X POST "$B/fulfillment/cancelFulfillment" -H "$H" -d '{}'

echo
echo "=============================================="
echo "Result: $PASS passed, $FAIL failed"
echo "=============================================="

[ "$FAIL" -eq 0 ]
