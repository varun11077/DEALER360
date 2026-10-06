const cds = require("@sap/cds");

const {
    SELECT,
    UPDATE,
    INSERT
} = cds.ql;


/* =========================================================
   CONSTANTS
   ========================================================= */

const PR_STATUS = {
    DRAFT: "DRAFT",
    SUBMITTED: "SUBMITTED",
    PENDING_APPROVAL: "PENDING_APPROVAL",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
    CANCELLED: "CANCELLED",
    CONVERTED: "CONVERTED"
};

const PO_STATUS = {
    DRAFT: "DRAFT"
};


/* =========================================================
   VALIDATION HELPERS
   ========================================================= */

function validateId(value, fieldName) {

    if (!value) {
        throw new Error(
            `${fieldName} is required.`
        );
    }

}


function validateQuantity(quantity) {

    if (
        quantity === undefined ||
        quantity === null
    ) {
        throw new Error(
            "Quantity is required."
        );
    }

    const numericQuantity =
        Number(quantity);

    if (
        !Number.isFinite(numericQuantity) ||
        numericQuantity <= 0
    ) {
        throw new Error(
            "Quantity must be greater than zero."
        );
    }

    return numericQuantity;
}


function validatePrice(price) {

    if (
        price === undefined ||
        price === null
    ) {
        throw new Error(
            "Requested unit price is required."
        );
    }

    const numericPrice =
        Number(price);

    if (
        !Number.isFinite(numericPrice) ||
        numericPrice < 0
    ) {
        throw new Error(
            "Requested unit price must be zero or greater."
        );
    }

    return numericPrice;
}


/* =========================================================
   DEALER VALIDATION
   ========================================================= */

async function getActiveDealer(
    tx,
    dealerId
) {

    validateId(
        dealerId,
        "Dealer ID"
    );

    const dealer =
        await tx.run(
            SELECT.one
                .from("dealer360.Dealers")
                .where({
                    ID: dealerId
                })
        );

    if (!dealer) {

        throw new Error(
            `Dealer ${dealerId} does not exist.`
        );

    }

    if (
        dealer.status !== "ACTIVE"
    ) {

        throw new Error(
            `Dealer ${dealerId} is not ACTIVE. Current status: ${dealer.status}.`
        );

    }

    return dealer;
}


/* =========================================================
   PRODUCT VALIDATION
   ========================================================= */

async function getActiveProduct(
    tx,
    productId
) {

    validateId(
        productId,
        "Product ID"
    );

    const product =
        await tx.run(
            SELECT.one
                .from("dealer360.Products")
                .where({
                    ID: productId
                })
        );

    if (!product) {

        throw new Error(
            `Product ${productId} does not exist.`
        );

    }

    if (
        product.isActive === false
    ) {

        throw new Error(
            `Product ${productId} is inactive.`
        );

    }

    return product;
}


/* =========================================================
   PR NUMBER GENERATION
   ========================================================= */

async function generateRequisitionNumber(tx) {

    const year = new Date().getFullYear();

    const rows =
        await tx.run(
            SELECT
                .from("dealer360.PurchaseRequisitions")
                .columns("requisitionNumber")
                .where({ requisitionNumber: { like: `PR-${year}-%` } })
        );

    const pattern = new RegExp(`^PR-${year}-(\\d+)$`);

    let maxNumber = 0;

    for (const row of rows || []) {

        const match = String(row.requisitionNumber || "").match(pattern);

        if (match) {
            maxNumber = Math.max(maxNumber, Number(match[1]));
        }
    }

    return `PR-${year}-${String(maxNumber + 1).padStart(6, "0")}`;
}


async function generatePurchaseOrderNumber(tx) {

    const year = new Date().getFullYear();

    const rows =
        await tx.run(
            SELECT
                .from("dealer360.PurchaseOrders")
                .columns("purchaseOrderNumber")
                .where({ purchaseOrderNumber: { like: `PO-${year}-%` } })
        );

    const pattern = new RegExp(`^PO-${year}-(\\d+)$`);

    let maxNumber = 0;

    for (const row of rows || []) {

        const match = String(row.purchaseOrderNumber || "").match(pattern);

        if (match) {
            maxNumber = Math.max(maxNumber, Number(match[1]));
        }
    }

    return `PO-${year}-${String(maxNumber + 1).padStart(6, "0")}`;
}


/* =========================================================
   PO NUMBER GENERATION
   ========================================================= */



/* =========================================================
   ITEM AMOUNT CALCULATION
   ========================================================= */

function calculateItemAmount(
    quantity,
    unitPrice
) {

    return Number(
        (
            quantity *
            unitPrice
        ).toFixed(2)
    );

}


/* =========================================================
   PR TOTAL CALCULATION
   ========================================================= */

function calculateTotal(
    items
) {

    return Number(
        items
            .reduce(
                (
                    total,
                    item
                ) => {

                    return (
                        total +
                        Number(
                            item.estimatedAmount || 0
                        )
                    );

                },
                0
            )
            .toFixed(2)
    );

}


/* =========================================================
   STATUS HISTORY
   ========================================================= */

async function createStatusHistory(
    tx,
    {
        purchaseRequisitionId,
        previousStatus,
        newStatus,
        changedBy,
        changedByName,
        reason
    }
) {

    validateId(
        purchaseRequisitionId,
        "Purchase Requisition ID"
    );

    if (!newStatus) {

        throw new Error(
            "New Purchase Requisition status is required."
        );

    }

    await tx.run(
        INSERT.into(
            "dealer360.PurchaseRequisitionStatusHistory"
        )
            .entries({

                purchaseRequisition_ID:
                    purchaseRequisitionId,

                previousStatus:
                    previousStatus || null,

                newStatus,

                changedAt:
                    new Date(),

                changedBy:
                    changedBy || "SYSTEM",

                changedByName:
                    changedByName || "System",

                reason:
                    reason || null

            })
    );

}


/* =========================================================
   PREPARE PURCHASE REQUISITION
   ========================================================= */

async function preparePurchaseRequisition(
    tx,
    data
) {

    /* -----------------------------------------------------
       DEALER VALIDATION
       ----------------------------------------------------- */

    await getActiveDealer(
        tx,
        data.dealer_ID
    );


    /* -----------------------------------------------------
       ITEM VALIDATION
       ----------------------------------------------------- */

    if (
        !data.items ||
        !Array.isArray(data.items) ||
        data.items.length === 0
    ) {

        throw new Error(
            "Purchase Requisition must contain at least one item."
        );

    }


    /* -----------------------------------------------------
       PR NUMBER
       ----------------------------------------------------- */

    if (
        !data.requisitionNumber
    ) {

        data.requisitionNumber =
            await generateRequisitionNumber(
                tx
            );

    }


    /* -----------------------------------------------------
       INITIAL STATUS
       ----------------------------------------------------- */

    data.status =
        PR_STATUS.DRAFT;


    /* -----------------------------------------------------
       CURRENCY
       ----------------------------------------------------- */

    data.currency =
        data.currency ||
        "INR";


    /* -----------------------------------------------------
       REQUESTED DATE
       ----------------------------------------------------- */

    if (
        !data.requestedDate
    ) {

        data.requestedDate =
            new Date()
                .toISOString()
                .slice(0, 10);

    }


    /* -----------------------------------------------------
       PROCESS ITEMS
       ----------------------------------------------------- */

    const processedItems = [];

    for (
        let index = 0;
        index < data.items.length;
        index++
    ) {

        const item =
            data.items[index];


        /* -------------------------------------------------
           PRODUCT
           ------------------------------------------------- */

        const productId =
            item.product_ID;

        const product =
            await getActiveProduct(
                tx,
                productId
            );


        /* -------------------------------------------------
           QUANTITY
           ------------------------------------------------- */

        const quantity =
            validateQuantity(
                item.quantity
            );


        /* -------------------------------------------------
           UNIT PRICE
           ------------------------------------------------- */

        const unitPrice =
            validatePrice(
                item.requestedUnitPrice
            );


        /* -------------------------------------------------
           AMOUNT
           ------------------------------------------------- */

        const estimatedAmount =
            calculateItemAmount(
                quantity,
                unitPrice
            );


        /* -------------------------------------------------
           NORMALIZE ITEM
           ------------------------------------------------- */

        item.itemNumber =
            index + 1;

        item.product_ID =
            product.ID;

        item.quantity =
            quantity;

        item.requestedUnitPrice =
            unitPrice;

        item.unitOfMeasure =
            item.unitOfMeasure ||
            product.unitOfMeasure;

        item.estimatedAmount =
            estimatedAmount;

        item.currency =
            item.currency ||
            data.currency ||
            "INR";

        item.requiredDate =
            item.requiredDate ||
            data.requiredDate ||
            null;


        processedItems.push(
            item
        );

    }


    /* -----------------------------------------------------
       TOTAL AMOUNT
       ----------------------------------------------------- */

    data.totalAmount =
        calculateTotal(
            processedItems
        );


    return data;
}


/* =========================================================
   VERIFY PR ITEMS BEFORE SUBMISSION
   ========================================================= */

async function validatePurchaseRequisitionItems(
    tx,
    requisitionId
) {

    const items =
        await tx.run(
            SELECT.from(
                "dealer360.PurchaseRequisitionItems"
            )
                .where({
                    purchaseRequisition_ID:
                        requisitionId
                })
        );

    if (
        !items ||
        items.length === 0
    ) {

        throw new Error(
            "Purchase Requisition must contain at least one item."
        );

    }

    const processedItems = [];

    for (const item of items) {

        const product =
            await getActiveProduct(
                tx,
                item.product_ID
            );

        const quantity =
            validateQuantity(
                item.quantity
            );

        const unitPrice =
            validatePrice(
                item.requestedUnitPrice
            );

        const estimatedAmount =
            calculateItemAmount(
                quantity,
                unitPrice
            );

        processedItems.push({

            ...item,

            product_ID:
                product.ID,

            quantity,

            requestedUnitPrice:
                unitPrice,

            estimatedAmount

        });

    }

    return processedItems;
}


/* =========================================================
   SUBMIT PURCHASE REQUISITION
   ========================================================= */

async function submitPurchaseRequisition(
    tx,
    requisitionId,
    userId,
    userName
) {

    /* -----------------------------------------------------
       VALIDATE ID
       ----------------------------------------------------- */

    validateId(
        requisitionId,
        "Purchase Requisition ID"
    );


    /* -----------------------------------------------------
       LOAD PR
       ----------------------------------------------------- */

    const requisition =
        await tx.run(
            SELECT.one
                .from(
                    "dealer360.PurchaseRequisitions"
                )
                .where({
                    ID: requisitionId
                })
        );

    if (!requisition) {

        throw new Error(
            `Purchase Requisition ${requisitionId} does not exist.`
        );

    }


    /* -----------------------------------------------------
       STATUS VALIDATION
       ----------------------------------------------------- */

    if (
        requisition.status !==
        PR_STATUS.DRAFT
    ) {

        throw new Error(
            `Purchase Requisition can only be submitted from DRAFT status. Current status: ${requisition.status}.`
        );

    }


    /* -----------------------------------------------------
       DEALER VALIDATION
       ----------------------------------------------------- */

    await getActiveDealer(
        tx,
        requisition.dealer_ID
    );


    /* -----------------------------------------------------
       ITEM VALIDATION
       ----------------------------------------------------- */

    const items =
        await validatePurchaseRequisitionItems(
            tx,
            requisitionId
        );


    /* -----------------------------------------------------
       RECALCULATE TOTAL
       ----------------------------------------------------- */

    const recalculatedTotal =
        calculateTotal(
            items
        );


    /* -----------------------------------------------------
       UPDATE PR
       ----------------------------------------------------- */

    const now =
        new Date();

    await tx.run(
        UPDATE(
            "dealer360.PurchaseRequisitions"
        )
            .set({

                status:
                    PR_STATUS.SUBMITTED,

                totalAmount:
                    recalculatedTotal,

                submittedAt:
                    now

            })
            .where({
                ID:
                    requisitionId
            })
    );


    /* -----------------------------------------------------
       STATUS HISTORY
       ----------------------------------------------------- */

    await createStatusHistory(
        tx,
        {
            purchaseRequisitionId:
                requisitionId,

            previousStatus:
                PR_STATUS.DRAFT,

            newStatus:
                PR_STATUS.SUBMITTED,

            changedBy:
                userId,

            changedByName:
                userName,

            reason:
                "Purchase Requisition submitted."
        }
    );


    /* -----------------------------------------------------
       RETURN UPDATED PR
       ----------------------------------------------------- */

    return await tx.run(
        SELECT.one
            .from(
                "dealer360.PurchaseRequisitions"
            )
            .where({
                ID:
                    requisitionId
            })
    );
}


/* =========================================================
   CONVERT PR TO PURCHASE ORDER
   ========================================================= */

async function convertToPurchaseOrder(
    tx,
    requisitionId,
    userId,
    userName
) {

    /* -----------------------------------------------------
       VALIDATE ID
       ----------------------------------------------------- */

    validateId(
        requisitionId,
        "Purchase Requisition ID"
    );


    /* -----------------------------------------------------
       LOAD PR
       ----------------------------------------------------- */

    const requisition =
        await tx.run(
            SELECT.one
                .from(
                    "dealer360.PurchaseRequisitions"
                )
                .where({
                    ID:
                        requisitionId
                })
        );

    if (!requisition) {

        throw new Error(
            `Purchase Requisition ${requisitionId} does not exist.`
        );

    }


    /* -----------------------------------------------------
       PR MUST BE APPROVED
       ----------------------------------------------------- */

    if (
        requisition.status !==
        PR_STATUS.APPROVED
    ) {

        throw new Error(
            `Only APPROVED Purchase Requisitions can be converted to Purchase Order. Current status: ${requisition.status}.`
        );

    }


    /* -----------------------------------------------------
       DEALER VALIDATION
       ----------------------------------------------------- */

    await getActiveDealer(
        tx,
        requisition.dealer_ID
    );


    /* -----------------------------------------------------
       LOAD PR ITEMS
       ----------------------------------------------------- */

    const prItems =
        await tx.run(
            SELECT.from(
                "dealer360.PurchaseRequisitionItems"
            )
                .where({
                    purchaseRequisition_ID:
                        requisitionId
                })
                .orderBy(
                    "itemNumber"
                )
        );

    if (
        !prItems ||
        prItems.length === 0
    ) {

        throw new Error(
            "Approved Purchase Requisition must contain at least one item."
        );

    }


    /* -----------------------------------------------------
       GENERATE PO NUMBER
       ----------------------------------------------------- */

    const purchaseOrderNumber =
        await generatePurchaseOrderNumber(
            tx
        );


    /* -----------------------------------------------------
       GENERATE PO ID
       ----------------------------------------------------- */

    const purchaseOrderId =
        cds.utils.uuid();


    const now =
        new Date();


    /* -----------------------------------------------------
       CREATE PO HEADER
       ----------------------------------------------------- */

    await tx.run(
        INSERT.into(
            "dealer360.PurchaseOrders"
        )
            .entries({

                ID:
                    purchaseOrderId,

                purchaseOrderNumber,

                dealer_ID:
                    requisition.dealer_ID,

                status:
                    PO_STATUS.DRAFT,

                orderDate:
                    now
                        .toISOString()
                        .slice(0, 10),

                requestedDeliveryDate:
                    requisition.requiredDate,

                currency:
                    requisition.currency ||
                    "INR",

                subtotal:
                    0,

                taxAmount:
                    0,

                totalAmount:
                    0,

                creditChecked:
                    false,

                creditBlocked:
                    false,

                remarks:
                    requisition.remarks ||
                    null

            })
    );


    /* -----------------------------------------------------
       CREATE PO ITEMS
       ----------------------------------------------------- */

    let subtotal = 0;

    for (
        const prItem of prItems
    ) {

        const product =
            await getActiveProduct(
                tx,
                prItem.product_ID
            );


        const quantity =
            validateQuantity(
                prItem.quantity
            );


        const unitPrice =
            validatePrice(
                prItem.requestedUnitPrice
            );


        const netAmount =
            calculateItemAmount(
                quantity,
                unitPrice
            );


        subtotal +=
            netAmount;


        await tx.run(
            INSERT.into(
                "dealer360.PurchaseOrderItems"
            )
                .entries({

                    ID:
                        cds.utils.uuid(),

                    purchaseOrder_ID:
                        purchaseOrderId,

                    itemNumber:
                        prItem.itemNumber,

                    product_ID:
                        product.ID,

                    quantity,

                    unitOfMeasure:
                        prItem.unitOfMeasure ||
                        product.unitOfMeasure,

                    unitPrice,

                    discountPercentage:
                        0,

                    netAmount,

                    taxPercentage:
                        0,

                    taxAmount:
                        0,

                    totalAmount:
                        netAmount,

                    currency:
                        prItem.currency ||
                        requisition.currency ||
                        "INR",

                    requestedDeliveryDate:
                        prItem.requiredDate ||
                        requisition.requiredDate,

                    remarks:
                        prItem.remarks ||
                        null,

                    purchaseRequisitionItem_ID:
                        prItem.ID

                })
        );

    }


    /* -----------------------------------------------------
       CALCULATE PO TOTALS
       ----------------------------------------------------- */

    subtotal =
        Number(
            subtotal.toFixed(2)
        );


    const taxAmount =
        0;


    const totalAmount =
        Number(
            (
                subtotal +
                taxAmount
            ).toFixed(2)
        );


    /* -----------------------------------------------------
       UPDATE PO TOTALS
       ----------------------------------------------------- */

    await tx.run(
        UPDATE(
            "dealer360.PurchaseOrders"
        )
            .set({

                subtotal,

                taxAmount,

                totalAmount

            })
            .where({
                ID:
                    purchaseOrderId
            })
    );


    /* -----------------------------------------------------
       UPDATE PR TO CONVERTED
       ----------------------------------------------------- */

    const updatedPR =
        await tx.run(
            UPDATE(
                "dealer360.PurchaseRequisitions"
            )
                .set({

                    status:
                        PR_STATUS.CONVERTED

                })
                .where({

                    ID:
                        requisitionId,

                    status:
                        PR_STATUS.APPROVED

                })
        );


    if (
        updatedPR === 0
    ) {

        throw new Error(
            "Purchase Requisition could not be converted because its status changed."
        );

    }


    /* -----------------------------------------------------
       PR STATUS HISTORY
       ----------------------------------------------------- */

    await createStatusHistory(
        tx,
        {

            purchaseRequisitionId:
                requisitionId,

            previousStatus:
                PR_STATUS.APPROVED,

            newStatus:
                PR_STATUS.CONVERTED,

            changedBy:
                userId,

            changedByName:
                userName,

            reason:
                `Purchase Requisition converted to Purchase Order ${purchaseOrderNumber}.`

        }
    );


    /* -----------------------------------------------------
       RETURN PO ID
       ----------------------------------------------------- */

    return purchaseOrderId;
}


/* =========================================================
   SERVICE IMPLEMENTATION
   ========================================================= */

module.exports =
    cds.service.impl(
        function () {

        require("./lib/lifecycle").registerRequisitionCancel(this);



            /* =================================================
               CREATE PURCHASE REQUISITION
               ================================================= */

            this.before(
                "CREATE",
                "PurchaseRequisitions",
                async (req) => {

                    try {

                        await preparePurchaseRequisition(
                            cds.tx(req),
                            req.data
                        );

                    } catch (error) {

                        req.reject(
                            400,
                            error.message
                        );

                    }

                }
            );


            /* =================================================
               CREATE PR STATUS HISTORY
               ================================================= */

            this.after(
                "CREATE",
                "PurchaseRequisitions",
                async (data, req) => {

                    try {

                        const userId =
                            req.user?.id ||
                            "SYSTEM";

                        const userName =
                            req.user?.attr?.name ||
                            req.user?.attr?.displayName ||
                            "System";

                        await createStatusHistory(
                            cds.tx(req),
                            {

                                purchaseRequisitionId:
                                    data.ID,

                                previousStatus:
                                    null,

                                newStatus:
                                    PR_STATUS.DRAFT,

                                changedBy:
                                    userId,

                                changedByName:
                                    userName,

                                reason:
                                    "Purchase Requisition created."

                            }
                        );

                    } catch (error) {

                        req.reject(
                            400,
                            error.message
                        );

                    }

                }
            );


            /* =================================================
               SUBMIT PURCHASE REQUISITION
               ================================================= */

            this.on(
                "submitPurchaseRequisition",
                async (req) => {

                    const {
                        requisitionId
                    } = req.data;

                    try {

                        const userId =
                            req.user?.id ||
                            "SYSTEM";

                        const userName =
                            req.user?.attr?.name ||
                            req.user?.attr?.displayName ||
                            "System";

                        return await submitPurchaseRequisition(
                            cds.tx(req),
                            requisitionId,
                            userId,
                            userName
                        );

                    } catch (error) {

                        req.reject(
                            400,
                            error.message
                        );

                    }

                }
            );


            /* =================================================
               CONVERT PR TO PURCHASE ORDER
               ================================================= */

            this.on(
                "convertToPurchaseOrder",
                async (req) => {

                    const {
                        requisitionId
                    } = req.data;

                    try {

                        const userId =
                            req.user?.id ||
                            "SYSTEM";

                        const userName =
                            req.user?.attr?.name ||
                            req.user?.attr?.displayName ||
                            "System";

                        return await convertToPurchaseOrder(
                            cds.tx(req),
                            requisitionId,
                            userId,
                            userName
                        );

                    } catch (error) {

                        req.reject(
                            400,
                            error.message
                        );

                    }

                }
            );

        }
    );