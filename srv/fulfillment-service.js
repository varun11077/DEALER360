const cds = require("@sap/cds");

const {
    releaseCreditForReference
} = require("./lib/credit-manager");

const {
    SELECT,
    INSERT,
    UPDATE
} = cds.ql;

const {
    PurchaseOrders,
    PurchaseOrderItems,
    Fulfillments,
    FulfillmentItems,
    FulfillmentStatusHistory
} = cds.entities("dealer360");

const PO_STATUS = {
    ALLOCATED: "ALLOCATED",
    DISPATCHED: "DISPATCHED",
    DELIVERED: "DELIVERED",
    INVOICED: "INVOICED",
    CLOSED: "CLOSED",
    CANCELLED: "CANCELLED"
};

function validateUUID(value, fieldName) {
    if (!value) {
        throw new Error(`${fieldName} is required`);
    }

    return value;
}

function validateText(value, fieldName) {
    if (
        value !== undefined &&
        value !== null &&
        String(value).trim() === ""
    ) {
        throw new Error(`${fieldName} cannot be empty`);
    }
}

function getUser(req) {
    return {
        id: req.user?.id || "SYSTEM",
        name:
            req.user?.attr?.name ||
            req.user?.id ||
            "SYSTEM"
    };
}

async function getPurchaseOrder(tx, purchaseOrderId) {
    return tx.run(
        SELECT.one
            .from(PurchaseOrders)
            .where({
                ID: purchaseOrderId
            })
    );
}

async function getFulfillment(tx, fulfillmentId) {
    return tx.run(
        SELECT.one
            .from(Fulfillments)
            .where({
                ID: fulfillmentId
            })
    );
}

async function getFulfillmentItems(tx, fulfillmentId) {
    return tx.run(
        SELECT.from(FulfillmentItems)
            .where({
                fulfillment_ID: fulfillmentId
            })
    );
}

async function generateFulfillmentNumber(tx) {

    const year = new Date().getFullYear();

    const existing = await tx.run(
        SELECT.from(Fulfillments)
            .columns("fulfillmentNumber")
            .where({
                fulfillmentNumber: {
                    like: `FUL-${year}-%`
                }
            })
    );

    let maxNumber = 0;

    for (const row of existing || []) {

        if (!row.fulfillmentNumber) {
            continue;
        }

        const match = row.fulfillmentNumber.match(
            new RegExp(`^FUL-${year}-(\\d+)$`)
        );

        if (match) {
            maxNumber = Math.max(
                maxNumber,
                Number(match[1])
            );
        }
    }

    return `FUL-${year}-${String(maxNumber + 1).padStart(6, "0")}`;
}

async function addStatusHistory(
    tx,
    {
        fulfillmentId,
        previousStatus,
        newStatus,
        user,
        reason
    }
) {

    await tx.run(
        INSERT.into(FulfillmentStatusHistory).entries({
            fulfillment_ID: fulfillmentId,
            previousStatus,
            newStatus,
            changedAt: new Date().toISOString(),
            changedBy: user.id,
            changedByName: user.name,
            reason
        })
    );
}

async function createFulfillment(
    tx,
    purchaseOrderId,
    user
) {

    validateUUID(
        purchaseOrderId,
        "purchaseOrderId"
    );

    const purchaseOrder =
        await getPurchaseOrder(
            tx,
            purchaseOrderId
        );

    if (!purchaseOrder) {
        throw new Error(
            "Purchase Order not found"
        );
    }

    if (
        purchaseOrder.status !==
        PO_STATUS.ALLOCATED
    ) {
        throw new Error(
            `Purchase Order must be ALLOCATED before fulfillment can be created. Current status: ${purchaseOrder.status}`
        );
    }

    const existing =
        await tx.run(
            SELECT.one
                .from(Fulfillments)
                .where({
                    purchaseOrder_ID:
                        purchaseOrderId
                })
        );

    if (existing) {
        throw new Error(
            "Fulfillment already exists for this Purchase Order"
        );
    }

    const purchaseOrderItems =
        await tx.run(
            SELECT.from(PurchaseOrderItems)
                .where({
                    purchaseOrder_ID:
                        purchaseOrderId
                })
        );

    if (!purchaseOrderItems?.length) {
        throw new Error(
            "Purchase Order has no items"
        );
    }

    const fulfillmentId =
        cds.utils.uuid();

    const fulfillmentNumber =
        await generateFulfillmentNumber(tx);

    await tx.run(
        INSERT.into(Fulfillments).entries({
            ID: fulfillmentId,
            fulfillmentNumber,
            purchaseOrder_ID:
                purchaseOrderId,
            status:
                PO_STATUS.ALLOCATED,
            plannedDispatchDate:
                purchaseOrder.requestedDeliveryDate ||
                null,
            plannedDeliveryDate:
                purchaseOrder.requestedDeliveryDate ||
                null,
            remarks:
                `Fulfillment created for Purchase Order ${purchaseOrder.purchaseOrderNumber}`
        })
    );

    for (const item of purchaseOrderItems) {

        const quantity =
            Number(item.quantity || 0);

        await tx.run(
            INSERT.into(FulfillmentItems).entries({
                fulfillment_ID:
                    fulfillmentId,
                purchaseOrderItem_ID:
                    item.ID,
                orderedQuantity:
                    quantity,
                fulfilledQuantity:
                    0,
                pendingQuantity:
                    quantity,
                unitOfMeasure:
                    item.unitOfMeasure ||
                    null
            })
        );
    }

    await addStatusHistory(tx, {
        fulfillmentId,
        previousStatus: null,
        newStatus:
            PO_STATUS.ALLOCATED,
        user,
        reason:
            "Fulfillment created"
    });

    return getFulfillment(
        tx,
        fulfillmentId
    );
}

async function dispatchFulfillment(
    tx,
    fulfillmentId,
    carrierName,
    trackingNumber,
    shipmentReference,
    user
) {

    validateUUID(
        fulfillmentId,
        "fulfillmentId"
    );

    validateText(
        carrierName,
        "carrierName"
    );

    validateText(
        trackingNumber,
        "trackingNumber"
    );

    const fulfillment =
        await getFulfillment(
            tx,
            fulfillmentId
        );

    if (!fulfillment) {
        throw new Error(
            "Fulfillment not found"
        );
    }

    if (
        fulfillment.status !==
        PO_STATUS.ALLOCATED
    ) {
        throw new Error(
            `Fulfillment must be ALLOCATED before dispatch. Current status: ${fulfillment.status}`
        );
    }

    const now =
        new Date().toISOString();

    const updated =
        await tx.run(
            UPDATE(Fulfillments)
                .set({
                    status:
                        PO_STATUS.DISPATCHED,
                    carrierName,
                    trackingNumber,
                    shipmentReference:
                        shipmentReference ||
                        null,
                    actualDispatchDate:
                        now.substring(0, 10)
                })
                .where({
                    ID: fulfillmentId,
                    status:
                        PO_STATUS.ALLOCATED
                })
        );

    if (!updated) {
        throw new Error(
            "Fulfillment status changed by another transaction"
        );
    }

    const purchaseOrder =
        await getPurchaseOrder(
            tx,
            fulfillment.purchaseOrder_ID
        );

    if (purchaseOrder) {

        await tx.run(
            UPDATE(PurchaseOrders)
                .set({
                    status:
                        PO_STATUS.DISPATCHED,
                    dispatchedAt:
                        now
                })
                .where({
                    ID:
                        fulfillment.purchaseOrder_ID,
                    status:
                        PO_STATUS.ALLOCATED
                })
        );
    }

    await addStatusHistory(tx, {
        fulfillmentId,
        previousStatus:
            PO_STATUS.ALLOCATED,
        newStatus:
            PO_STATUS.DISPATCHED,
        user,
        reason:
            "Fulfillment dispatched"
    });

    return getFulfillment(
        tx,
        fulfillmentId
    );
}

async function deliverFulfillment(
    tx,
    fulfillmentId,
    deliveryNoteNumber,
    deliveryRemarks,
    user
) {

    validateUUID(
        fulfillmentId,
        "fulfillmentId"
    );

    validateText(
        deliveryNoteNumber,
        "deliveryNoteNumber"
    );

    const fulfillment =
        await getFulfillment(
            tx,
            fulfillmentId
        );

    if (!fulfillment) {
        throw new Error(
            "Fulfillment not found"
        );
    }

    if (
        fulfillment.status !==
        PO_STATUS.DISPATCHED
    ) {
        throw new Error(
            `Fulfillment must be DISPATCHED before delivery. Current status: ${fulfillment.status}`
        );
    }

    const items =
        await getFulfillmentItems(
            tx,
            fulfillmentId
        );

    if (!items?.length) {
        throw new Error(
            "Fulfillment has no items"
        );
    }

    const now =
        new Date().toISOString();

    for (const item of items) {

        await tx.run(
            UPDATE(FulfillmentItems)
                .set({
                    fulfilledQuantity:
                        item.orderedQuantity,
                    pendingQuantity:
                        0
                })
                .where({
                    ID: item.ID
                })
        );
    }

    const updated =
        await tx.run(
            UPDATE(Fulfillments)
                .set({
                    status:
                        PO_STATUS.DELIVERED,

                    actualDispatchDate:
                        fulfillment.actualDispatchDate,

                    actualDeliveryDate:
                        now.substring(0, 10),

                    deliveryNoteNumber,

                    deliveryRemarks:
                        deliveryRemarks ||
                        null
                })
                .where({
                    ID: fulfillmentId,
                    status:
                        PO_STATUS.DISPATCHED
                })
        );

    if (!updated) {
        throw new Error(
            "Fulfillment status changed by another transaction"
        );
    }

    await tx.run(
        UPDATE(PurchaseOrders)
            .set({
                status:
                    PO_STATUS.DELIVERED,
                deliveredAt:
                    now
            })
            .where({
                ID:
                    fulfillment.purchaseOrder_ID,
                status:
                    PO_STATUS.DISPATCHED
            })
    );

    await addStatusHistory(tx, {
        fulfillmentId,
        previousStatus:
            PO_STATUS.DISPATCHED,
        newStatus:
            PO_STATUS.DELIVERED,
        user,
        reason:
            "Fulfillment delivered"
    });

    return getFulfillment(
        tx,
        fulfillmentId
    );
}

async function invoiceFulfillment(
    tx,
    fulfillmentId,
    invoiceNumber,
    user
) {

    validateUUID(
        fulfillmentId,
        "fulfillmentId"
    );

    validateText(
        invoiceNumber,
        "invoiceNumber"
    );

    const fulfillment =
        await getFulfillment(
            tx,
            fulfillmentId
        );

    if (!fulfillment) {
        throw new Error(
            "Fulfillment not found"
        );
    }

    if (
        fulfillment.status !==
        PO_STATUS.DELIVERED
    ) {
        throw new Error(
            `Fulfillment must be DELIVERED before invoicing. Current status: ${fulfillment.status}`
        );
    }

    const now =
        new Date().toISOString();

    const updated =
        await tx.run(
            UPDATE(Fulfillments)
                .set({
                    status:
                        PO_STATUS.INVOICED,
                    invoiceNumber,
                    invoiceDate:
                        now.substring(0, 10)
                })
                .where({
                    ID: fulfillmentId,
                    status:
                        PO_STATUS.DELIVERED
                })
        );

    if (!updated) {
        throw new Error(
            "Fulfillment status changed by another transaction"
        );
    }

    await tx.run(
        UPDATE(PurchaseOrders)
            .set({
                status:
                    PO_STATUS.INVOICED,
                invoicedAt:
                    now
            })
            .where({
                ID:
                    fulfillment.purchaseOrder_ID,
                status:
                    PO_STATUS.DELIVERED
            })
    );

    await addStatusHistory(tx, {
        fulfillmentId,
        previousStatus:
            PO_STATUS.DELIVERED,
        newStatus:
            PO_STATUS.INVOICED,
        user,
        reason:
            `Invoice ${invoiceNumber} created`
    });

    return getFulfillment(
        tx,
        fulfillmentId
    );
}

async function closeFulfillment(
    tx,
    fulfillmentId,
    user
) {

    validateUUID(
        fulfillmentId,
        "fulfillmentId"
    );

    const fulfillment =
        await getFulfillment(
            tx,
            fulfillmentId
        );

    if (!fulfillment) {
        throw new Error(
            "Fulfillment not found"
        );
    }

    if (
        fulfillment.status !==
        PO_STATUS.INVOICED
    ) {
        throw new Error(
            `Fulfillment must be INVOICED before closing. Current status: ${fulfillment.status}`
        );
    }

    const now =
        new Date().toISOString();

    const updated =
        await tx.run(
            UPDATE(Fulfillments)
                .set({
                    status:
                        PO_STATUS.CLOSED,
                    closedAt:
                        now
                })
                .where({
                    ID: fulfillmentId,
                    status:
                        PO_STATUS.INVOICED
                })
        );

    if (!updated) {
        throw new Error(
            "Fulfillment status changed by another transaction"
        );
    }

    await tx.run(
        UPDATE(PurchaseOrders)
            .set({
                status:
                    PO_STATUS.CLOSED,
                closedAt:
                    now
            })
            .where({
                ID:
                    fulfillment.purchaseOrder_ID,
                status:
                    PO_STATUS.INVOICED
            })
    );

    await addStatusHistory(tx, {
        fulfillmentId,
        previousStatus:
            PO_STATUS.INVOICED,
        newStatus:
            PO_STATUS.CLOSED,
        user,
        reason:
            "Fulfillment closed"
    });

    return getFulfillment(
        tx,
        fulfillmentId
    );
}

async function cancelFulfillment(
    tx,
    fulfillmentId,
    reason,
    user
) {

    validateUUID(
        fulfillmentId,
        "fulfillmentId"
    );

    if (
        !reason ||
        !reason.trim()
    ) {
        throw new Error(
            "Cancellation reason is required"
        );
    }

    const fulfillment =
        await getFulfillment(
            tx,
            fulfillmentId
        );

    if (!fulfillment) {
        throw new Error(
            "Fulfillment not found"
        );
    }

    const cancellableStatuses = [
        PO_STATUS.ALLOCATED,
        PO_STATUS.DISPATCHED
    ];

    if (
        !cancellableStatuses.includes(
            fulfillment.status
        )
    ) {
        throw new Error(
            `Fulfillment cannot be cancelled from status ${fulfillment.status}`
        );
    }

    const previousStatus =
        fulfillment.status;

    const now =
        new Date().toISOString();

    const updated =
        await tx.run(
            UPDATE(Fulfillments)
                .set({
                    status:
                        PO_STATUS.CANCELLED,
                    cancelledAt:
                        now,
                    cancellationReason:
                        reason
                })
                .where({
                    ID: fulfillmentId,
                    status:
                        previousStatus
                })
        );

    if (!updated) {
        throw new Error(
            "Fulfillment status changed by another transaction"
        );
    }

    await tx.run(
        UPDATE(PurchaseOrders)
            .set({
                status:
                    PO_STATUS.CANCELLED,
                cancelledAt:
                    now,
                cancellationReason:
                    reason
            })
            .where({
                ID:
                    fulfillment.purchaseOrder_ID,
                status:
                    previousStatus
            })
        );

    /*
     * The purchase order is cancelled, so the credit it was
     * holding goes back to the dealer. Idempotent: it releases
     * only what is still allocated for this order.
     */

    const cancelledOrder =
        await tx.run(
            SELECT.one
                .from(PurchaseOrders)
                .columns("ID", "dealer_ID", "purchaseOrderNumber")
                .where({
                    ID:
                        fulfillment.purchaseOrder_ID
                })
        );

    if (cancelledOrder) {

        await releaseCreditForReference(
            tx,
            {
                dealerId:
                    cancelledOrder.dealer_ID,

                referenceType:
                    "PURCHASE_ORDER",

                referenceId:
                    cancelledOrder.ID,

                description:
                    `Credit released: ${cancelledOrder.purchaseOrderNumber} cancelled (fulfillment cancelled).`,

                postedBy:
                    user?.id || "SYSTEM"
            }
        );
    }

    await addStatusHistory(tx, {
        fulfillmentId,
        previousStatus,
        newStatus:
            PO_STATUS.CANCELLED,
        user,
        reason
    });

    return getFulfillment(
        tx,
        fulfillmentId
    );
}

module.exports = cds.service.impl(
    function () {

        this.on(
            "createFulfillment",
            async (req) => {

                const user =
                    getUser(req);

                try {

                    return await createFulfillment(
                        cds.tx(req),
                        req.data.purchaseOrderId,
                        user
                    );

                } catch (error) {

                    req.error(
                        400,
                        error.message
                    );
                }
            }
        );

        this.on(
            "dispatchFulfillment",
            async (req) => {

                const user =
                    getUser(req);

                try {

                    return await dispatchFulfillment(
                        cds.tx(req),
                        req.data.fulfillmentId,
                        req.data.carrierName,
                        req.data.trackingNumber,
                        req.data.shipmentReference,
                        user
                    );

                } catch (error) {

                    req.error(
                        400,
                        error.message
                    );
                }
            }
        );

        this.on(
            "deliverFulfillment",
            async (req) => {

                const user =
                    getUser(req);

                try {

                    return await deliverFulfillment(
                        cds.tx(req),
                        req.data.fulfillmentId,
                        req.data.deliveryNoteNumber,
                        req.data.deliveryRemarks,
                        user
                    );

                } catch (error) {

                    req.error(
                        400,
                        error.message
                    );
                }
            }
        );

        this.on(
            "invoiceFulfillment",
            async (req) => {

                const user =
                    getUser(req);

                try {

                    return await invoiceFulfillment(
                        cds.tx(req),
                        req.data.fulfillmentId,
                        req.data.invoiceNumber,
                        user
                    );

                } catch (error) {

                    req.error(
                        400,
                        error.message
                    );
                }
            }
        );

        this.on(
            "closeFulfillment",
            async (req) => {

                const user =
                    getUser(req);

                try {

                    return await closeFulfillment(
                        cds.tx(req),
                        req.data.fulfillmentId,
                        user
                    );

                } catch (error) {

                    req.error(
                        400,
                        error.message
                    );
                }
            }
        );

        this.on(
            "cancelFulfillment",
            async (req) => {

                const user =
                    getUser(req);

                try {

                    return await cancelFulfillment(
                        cds.tx(req),
                        req.data.fulfillmentId,
                        req.data.reason,
                        user
                    );

                } catch (error) {

                    req.error(
                        400,
                        error.message
                    );
                }
            }
        );

    }
);