# DEALER360 backend: API guide

Everything the frontend needs to know about the backend. Base URL locally: http://localhost:4004

## 1. Services

| Path | Purpose | Writable entities (direct) | Actions |
|---|---|---|---|
| /dealer | Dealer onboarding and lifecycle | Dealers (not status fields), DealerAddresses, DealerContacts, DealerDocuments | submitDealer, l1Approve, l2Approve, rejectDealer, blockDealer, unblockDealer, deactivateDealer, reactivateDealer |
| /credit | Credit facility and ledger | DealerCredits (limit only) | checkCredit, allocateCredit, releaseCredit, blockCredit, unblockCredit |
| /purchase-requisition | Requisitions | PurchaseRequisitions (not status), PurchaseRequisitionItems | submitPurchaseRequisition, cancelPurchaseRequisition, convertToPurchaseOrder |
| /purchase-requisition-approval | PR approvals | none (read only) | startApproval, processApprovalDecision |
| /purchase-order | Purchase orders | none (read only) | submitPurchaseOrder, startPurchaseOrderApproval, processPurchaseOrderApprovalDecision, allocateCreditToPurchaseOrder, cancelPurchaseOrder |
| /fulfillment | Dispatch, delivery, invoice | none (read only) | createFulfillment, dispatchFulfillment, deliverFulfillment, invoiceFulfillment, closeFulfillment, cancelFulfillment |
| /pricing | Prices | ProductPrices, DealerPrices, QuantityPriceSlabs | calculateDealerPrice |
| /master-data | Reference data | Regions, States, DealerTypes, PaymentTerms, ProductCategories, Products, Taxes | none |
| /dashboard | KPIs and chart data | none | overview (function) |
| /integration | Outbox monitor | none (read only) | none |

Anything not listed as writable answers 405 to POST/PATCH/DELETE. Fields that only an action may change answer 400 to PATCH.

## 2. Lifecycles

Dealer: PENDING -> SUBMITTED -> L1_APPROVED -> ACTIVE. From SUBMITTED or L1_APPROVED a dealer can be REJECTED. ACTIVE can become BLOCKED (and back with unblockDealer) or INACTIVE (and back with reactivateDealer).

Requisition: DRAFT -> SUBMITTED -> PENDING_APPROVAL -> APPROVED -> CONVERTED. Rejected at approval = REJECTED. cancelPurchaseRequisition works from DRAFT, SUBMITTED, PENDING_APPROVAL and APPROVED.

Purchase order: DRAFT -> SUBMITTED -> PENDING_APPROVAL -> APPROVED -> ALLOCATED -> DISPATCHED -> DELIVERED -> INVOICED -> CLOSED. cancelPurchaseOrder works up to ALLOCATED. After dispatch use cancelFulfillment. Both release any credit the order holds.

Credit: allocateCredit fails with 400 if the dealer has not enough available credit, and the order stays APPROVED so it can be retried after the limit is raised.

## 3. HTTP status codes

| Code | Meaning |
|---|---|
| 400 | Validation or wrong status (message says why, for example "Dealer can only be blocked from ACTIVE status") |
| 401 / 403 | Not logged in / role missing |
| 404 | Record does not exist |
| 405 | Direct write not allowed, use the action |
| 409 | Duplicate (GST, PAN, number) or credit changed by another request (retry) |

## 4. Roles (existing xs-security.json scopes, no change needed)

| Role | Can do |
|---|---|
| User | Read everything. Create and edit dealers and requisitions. Submit, cancel, start approvals, run fulfillment (create, dispatch, deliver, invoice, close). |
| Admin | Everything User can, plus dealer approvals, reject, block, deactivate, convert PR to PO, approval decisions, allocate credit, cancel fulfillment, change credit limits, prices, master data, integration monitor. |

Auth is still "dummy" in package.json, so nothing is restricted locally. The rules are enforced as soon as auth is switched to XSUAA.

## 5. Dashboard

GET /dashboard/overview or /dashboard/overview(dateFrom=2026-01-01,dateTo=2026-06-30) returns kpis, dealersByStatus, ordersByStatus, fulfillmentsByStatus, monthlyOrders, topDealers, creditUtilization, recentActivity. Default range is the last 12 months. Open orders, open fulfillments and pending counts are current state, not date filtered.

## 6. Tests

| Command | What it checks |
|---|---|
| bash test/backend-smoke.sh | 68 checks: reads, validation, write protection, dealer lifecycle, credit, full order flow |
| bash test/backend-lifecycle.sh | 45 checks: cancel flows, credit release, status history, dashboard shape |
| CDS_CONFIG="$(cat test/mock-auth.json)" cds watch, then bash test/auth-matrix.sh | 22 checks: roles are enforced |

Run the first two against a local or dev database: they create test dealers and orders.
With auth enabled add credentials: CURL_AUTH="-u alice:a" bash test/backend-smoke.sh

## 7. Known limits (decide later with the BTP work)

1. Auth is dummy until XSUAA is configured.
2. Dealer, PR and PO numbers use highest-number-plus-one. Two creates at the exact same moment can collide (the second gets a clean 409).
3. Dealer deactivate or block does not touch the dealer's open orders.
4. Seed credit data has used amounts without matching ledger entries (opening balances), so only credit activity from now on is reconciled in the ledger.
5. Tested on SQLite. Run the three test scripts once against HANA after the first deploy.
