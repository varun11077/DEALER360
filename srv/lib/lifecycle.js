const cds = require("@sap/cds");

const {
    SELECT,
    UPDATE,
    INSERT
} = cds.ql;

const {
    releaseCreditForReference
} = require("./credit-manager");


/* =========================================================
   CANCEL ACTIONS
   ---------------------------------------------------------
   cancelPurchaseRequisition   (PurchaseRequisitionService)
   cancelPurchaseOrder         (PurchaseOrderService)

   Both follow the same rules as the other lifecycle actions:
   status check, optimistic update, status history row and
   a clear 400 / 404 / 409 error.

   Cancelling a purchase order that already holds credit
   releases that credit again.
   ========================================================= */

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* A requisition can be withdrawn until it is converted */

const PR_CANCELLABLE = [
    "DRAFT",
    "SUBMITTED",
    "PENDING_APPROVAL",
    "APPROVED"
];

/*
 * A purchase order can be cancelled until goods leave.
 * Once DISPATCHED, use cancelFulfillment (it also cancels
 * the order and releases the credit).
 */

const PO_CANCELLABLE = [
    "DRAFT",
    "SUBMITTED",
    "PENDING_APPROVAL",
    "APPROVED",
    "ALLOCATED"
];


function actor(req) {

    return {
        id:
            req.user?.id ||
            "SYSTEM",

        name:
            req.user?.attr?.name ||
            req.user?.attr?.displayName ||
            req.user?.id ||
            "System"
    };
}


function validateInput(req, idValue, idLabel) {

    if (!idValue || !UUID_PATTERN.test(idValue)) {

        req.reject(
            400,
            `${idLabel} must be a valid UUID.`
        );
    }

    if (
        !req.data.reason ||
        !String(req.data.reason).trim()
    ) {

        req.reject(
            400,
            "Cancellation reason is required."
        );
    }
}


/* =========================================================
   PURCHASE REQUISITION
   ========================================================= */

function registerRequisitionCancel(srv) {

    srv.on(
        "cancelPurchaseRequisition",
        async (req) => {

            const {
                requisitionId,
                reason
            } = req.data;

            validateInput(
                req,
                requisitionId,
                "Purchase Requisition ID"
            );

            const tx = cds.tx(req);

            const user = actor(req);

            const requisition =
                await tx.run(
                    SELECT.one
                        .from("dealer360.PurchaseRequisitions")
                        .where({ ID: requisitionId })
                );

            if (!requisition) {

                return req.reject(
                    404,
                    `Purchase Requisition ${requisitionId} does not exist.`
                );
            }

            if (!PR_CANCELLABLE.includes(requisition.status)) {

                return req.reject(
                    400,
                    `Purchase Requisition cannot be cancelled from status ${requisition.status}.`
                );
            }

            const updated =
                await tx.run(
                    UPDATE("dealer360.PurchaseRequisitions")
                        .set({ status: "CANCELLED" })
                        .where({
                            ID: requisitionId,
                            status: requisition.status
                        })
                );

            if (!updated) {

                return req.reject(
                    409,
                    "Purchase Requisition was changed by another request. Please retry."
                );
            }

            /* Close any approval that is still waiting */

            await tx.run(
                UPDATE("dealer360.PurchaseRequisitionApprovalRequests")
                    .set({ status: "CANCELLED" })
                    .where({
                        purchaseRequisition_ID: requisitionId,
                        status: "PENDING"
                    })
            );

            await tx.run(
                INSERT.into("dealer360.PurchaseRequisitionStatusHistory")
                    .entries({
                        purchaseRequisition_ID: requisitionId,
                        previousStatus: requisition.status,
                        newStatus: "CANCELLED",
                        changedAt: new Date().toISOString(),
                        changedBy: user.id,
                        changedByName: user.name,
                        reason: String(reason).trim()
                    })
            );

            return tx.run(
                SELECT.one
                    .from("dealer360.PurchaseRequisitions")
                    .where({ ID: requisitionId })
            );
        }
    );
}


/* =========================================================
   PURCHASE ORDER
   ========================================================= */

function registerPurchaseOrderCancel(srv) {

    srv.on(
        "cancelPurchaseOrder",
        async (req) => {

            const {
                purchaseOrderId,
                reason
            } = req.data;

            validateInput(
                req,
                purchaseOrderId,
                "Purchase Order ID"
            );

            const tx = cds.tx(req);

            const user = actor(req);

            const order =
                await tx.run(
                    SELECT.one
                        .from("dealer360.PurchaseOrders")
                        .where({ ID: purchaseOrderId })
                );

            if (!order) {

                return req.reject(
                    404,
                    `Purchase Order ${purchaseOrderId} does not exist.`
                );
            }

            if (!PO_CANCELLABLE.includes(order.status)) {

                return req.reject(
                    400,
                    `Purchase Order cannot be cancelled from status ${order.status}. ` +
                    (
                        ["DISPATCHED"].includes(order.status)
                            ? "Use cancelFulfillment for a dispatched order."
                            : ""
                    )
                );
            }

            const now = new Date().toISOString();

            const cleanReason = String(reason).trim();

            const updated =
                await tx.run(
                    UPDATE("dealer360.PurchaseOrders")
                        .set({
                            status: "CANCELLED",
                            cancelledAt: now,
                            cancellationReason: cleanReason
                        })
                        .where({
                            ID: purchaseOrderId,
                            status: order.status
                        })
                );

            if (!updated) {

                return req.reject(
                    409,
                    "Purchase Order was changed by another request. Please retry."
                );
            }

            /* An open fulfillment would otherwise be left dangling */

            const fulfillments =
                await tx.run(
                    SELECT.from("dealer360.Fulfillments")
                        .columns("ID", "status")
                        .where({
                            purchaseOrder_ID: purchaseOrderId,
                            status: "ALLOCATED"
                        })
                );

            for (const f of fulfillments || []) {

                await tx.run(
                    UPDATE("dealer360.Fulfillments")
                        .set({
                            status: "CANCELLED",
                            cancelledAt: now,
                            cancellationReason: cleanReason
                        })
                        .where({ ID: f.ID })
                );

                await tx.run(
                    INSERT.into("dealer360.FulfillmentStatusHistory")
                        .entries({
                            fulfillment_ID: f.ID,
                            previousStatus: f.status,
                            newStatus: "CANCELLED",
                            changedAt: now,
                            changedBy: user.id,
                            changedByName: user.name,
                            reason: cleanReason
                        })
                );
            }

            /* Pending approvals of this order are no longer needed */

            await tx.run(
                UPDATE("dealer360.PurchaseOrderApprovals")
                    .set({ status: "CANCELLED" })
                    .where({
                        purchaseOrder_ID: purchaseOrderId,
                        status: "PENDING"
                    })
            );

            /* Give back any credit this order was holding */

            await releaseCreditForReference(
                tx,
                {
                    dealerId: order.dealer_ID,
                    referenceType: "PURCHASE_ORDER",
                    referenceId: order.ID,
                    description:
                        `Credit released: ${order.purchaseOrderNumber} cancelled.`,
                    postedBy: user.id
                }
            );

            await tx.run(
                INSERT.into("dealer360.PurchaseOrderStatusHistory")
                    .entries({
                        ID: cds.utils.uuid(),
                        purchaseOrder_ID: purchaseOrderId,
                        previousStatus: order.status,
                        newStatus: "CANCELLED",
                        changedAt: now,
                        changedBy: user.id,
                        changedByName: user.name,
                        reason: cleanReason
                    })
            );

            return tx.run(
                SELECT.one
                    .from("dealer360.PurchaseOrders")
                    .where({ ID: purchaseOrderId })
            );
        }
    );
}


module.exports = {
    registerRequisitionCancel,
    registerPurchaseOrderCancel
};
