const cds = require("@sap/cds");

const {
    SELECT,
    UPDATE,
    INSERT
} = cds.ql;


/* =========================================================
   CREDIT MANAGER
   ========================================================= */

const {
    checkCredit,
    allocateCredit
} = require("./lib/credit-manager");


/* =========================================================
   CONSTANTS
   ========================================================= */

const PO_STATUS = {
    DRAFT: "DRAFT",
    SUBMITTED: "SUBMITTED",
    PENDING_APPROVAL: "PENDING_APPROVAL",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
    CREDIT_BLOCKED: "CREDIT_BLOCKED",
    ALLOCATED: "ALLOCATED",
    DISPATCHED: "DISPATCHED",
    DELIVERED: "DELIVERED",
    INVOICED: "INVOICED",
    CLOSED: "CLOSED",
    CANCELLED: "CANCELLED"
};


const APPROVAL_STATUS = {
    PENDING: "PENDING",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED"
};


const DECISION = {
    APPROVED: "APPROVED",
    REJECTED: "REJECTED"
};


const APPROVAL_LEVEL = "L1";


/* =========================================================
   VALIDATION HELPERS
   ========================================================= */

function validateId(id, fieldName = "ID") {

    if (!id || typeof id !== "string") {
        throw new Error(`${fieldName} is required.`);
    }

    const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(id)) {
        throw new Error(
            `${fieldName} must be a valid UUID.`
        );
    }

    return id;
}


function normalizeDecision(decision) {

    if (!decision || typeof decision !== "string") {
        throw new Error(
            "Approval decision is required."
        );
    }

    const normalized =
        decision.trim().toUpperCase();

    if (
        normalized !== DECISION.APPROVED &&
        normalized !== DECISION.REJECTED
    ) {
        throw new Error(
            "Invalid approval decision. Allowed values are APPROVED or REJECTED."
        );
    }

    return normalized;
}


/* =========================================================
   USER CONTEXT
   ========================================================= */

function getUserContext(req) {

    return {
        userId:
            req.user?.id ||
            "SYSTEM",

        userName:
            req.user?.attr?.name ||
            req.user?.attr?.displayName ||
            "System",

        userEmail:
            req.user?.attr?.email ||
            req.user?.attr?.mail ||
            null
    };
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

    if (dealer.status !== "ACTIVE") {
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

    if (product.active === false) {
        throw new Error(
            `Product ${productId} is not active.`
        );
    }

    return product;
}


/* =========================================================
   PURCHASE ORDER STATUS HISTORY
   ========================================================= */

async function createPurchaseOrderStatusHistory(
    tx,
    {
        purchaseOrderId,
        previousStatus,
        newStatus,
        changedBy,
        changedByName,
        reason
    }
) {

    await tx.run(
        INSERT.into(
            "dealer360.PurchaseOrderStatusHistory"
        ).entries({
            ID: cds.utils.uuid(),

            purchaseOrder_ID:
                purchaseOrderId,

            previousStatus:
                previousStatus || null,

            newStatus,

            changedAt:
                new Date().toISOString(),

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
   GET PURCHASE ORDER
   ========================================================= */

async function getPurchaseOrder(
    tx,
    purchaseOrderId
) {

    validateId(
        purchaseOrderId,
        "Purchase Order ID"
    );

    const purchaseOrder =
        await tx.run(
            SELECT.one
                .from("dealer360.PurchaseOrders")
                .where({
                    ID: purchaseOrderId
                })
        );

    if (!purchaseOrder) {
        throw new Error(
            `Purchase Order ${purchaseOrderId} does not exist.`
        );
    }

    return purchaseOrder;
}


/* =========================================================
   SUBMIT PURCHASE ORDER
   ========================================================= */

async function submitPurchaseOrder(
    tx,
    purchaseOrderId,
    userId,
    userName
) {

    const purchaseOrder =
        await getPurchaseOrder(
            tx,
            purchaseOrderId
        );

    if (
        purchaseOrder.status !==
        PO_STATUS.DRAFT
    ) {
        throw new Error(
            `Only DRAFT Purchase Orders can be submitted. Current status: ${purchaseOrder.status}.`
        );
    }

    await getActiveDealer(
        tx,
        purchaseOrder.dealer_ID
    );

    const items =
        await tx.run(
            SELECT.from(
                "dealer360.PurchaseOrderItems"
            )
                .where({
                    purchaseOrder_ID:
                        purchaseOrderId
                })
                .orderBy("itemNumber")
        );

    if (
        !items ||
        items.length === 0
    ) {
        throw new Error(
            "Purchase Order must contain at least one item before submission."
        );
    }

    for (const item of items) {

        await getActiveProduct(
            tx,
            item.product_ID
        );

        if (
            item.quantity === null ||
            item.quantity === undefined ||
            Number(item.quantity) <= 0
        ) {
            throw new Error(
                `Invalid quantity for Purchase Order item ${item.itemNumber}.`
            );
        }

        if (
            item.unitPrice === null ||
            item.unitPrice === undefined ||
            Number(item.unitPrice) < 0
        ) {
            throw new Error(
                `Invalid unit price for Purchase Order item ${item.itemNumber}.`
            );
        }
    }

    const now =
        new Date().toISOString();

    const updated =
        await tx.run(
            UPDATE(
                "dealer360.PurchaseOrders"
            )
                .set({
                    status:
                        PO_STATUS.SUBMITTED,

                    submittedAt:
                        now
                })
                .where({
                    ID: purchaseOrderId,

                    status:
                        PO_STATUS.DRAFT
                })
        );

    if (updated === 0) {
        throw new Error(
            "Purchase Order could not be submitted because its status changed."
        );
    }

    await createPurchaseOrderStatusHistory(
        tx,
        {
            purchaseOrderId,

            previousStatus:
                PO_STATUS.DRAFT,

            newStatus:
                PO_STATUS.SUBMITTED,

            changedBy:
                userId,

            changedByName:
                userName,

            reason:
                "Purchase Order submitted for approval."
        }
    );

    return await getPurchaseOrder(
        tx,
        purchaseOrderId
    );
}


/* =========================================================
   START PURCHASE ORDER APPROVAL
   ========================================================= */

async function startPurchaseOrderApproval(
    tx,
    purchaseOrderId,
    userId,
    userName,
    userEmail
) {

    const purchaseOrder =
        await getPurchaseOrder(
            tx,
            purchaseOrderId
        );

    if (
        purchaseOrder.status !==
        PO_STATUS.SUBMITTED
    ) {
        throw new Error(
            `Only SUBMITTED Purchase Orders can start approval. Current status: ${purchaseOrder.status}.`
        );
    }

    await getActiveDealer(
        tx,
        purchaseOrder.dealer_ID
    );

    const existingApproval =
        await tx.run(
            SELECT.one
                .from(
                    "dealer360.PurchaseOrderApprovals"
                )
                .where({
                    purchaseOrder_ID:
                        purchaseOrderId,

                    approvalLevel:
                        APPROVAL_LEVEL,

                    status:
                        APPROVAL_STATUS.PENDING
                })
        );

    if (existingApproval) {
        throw new Error(
            `A pending approval already exists for Purchase Order ${purchaseOrder.purchaseOrderNumber}.`
        );
    }

    const approvalId =
        cds.utils.uuid();

    const now =
        new Date().toISOString();

    await tx.run(
        INSERT.into(
            "dealer360.PurchaseOrderApprovals"
        ).entries({

            ID:
                approvalId,

            purchaseOrder_ID:
                purchaseOrderId,

            approvalLevel:
                APPROVAL_LEVEL,

            status:
                APPROVAL_STATUS.PENDING,

            approverUserId:
                null,

            approverName:
                null,

            approverEmail:
                null,

            requestedAt:
                now,

            comments:
                null,

            bpaInstanceId:
                null
        })
    );

    const updated =
        await tx.run(
            UPDATE(
                "dealer360.PurchaseOrders"
            )
                .set({
                    status:
                        PO_STATUS.PENDING_APPROVAL
                })
                .where({
                    ID:
                        purchaseOrderId,

                    status:
                        PO_STATUS.SUBMITTED
                })
        );

    if (updated === 0) {
        throw new Error(
            "Purchase Order could not enter approval because its status changed."
        );
    }

    await createPurchaseOrderStatusHistory(
        tx,
        {
            purchaseOrderId,

            previousStatus:
                PO_STATUS.SUBMITTED,

            newStatus:
                PO_STATUS.PENDING_APPROVAL,

            changedBy:
                userId,

            changedByName:
                userName,

            reason:
                "Purchase Order approval process started."
        }
    );

    return approvalId;
}


/* =========================================================
   PROCESS PURCHASE ORDER APPROVAL DECISION
   ========================================================= */

async function processPurchaseOrderApprovalDecision(
    tx,
    approvalRequestId,
    decision,
    comments,
    bpaInstanceId,
    bpaTaskId,
    correlationId,
    userId,
    userName,
    userEmail
) {

    validateId(
        approvalRequestId,
        "Approval Request ID"
    );

    const normalizedDecision =
        normalizeDecision(decision);

    const approval =
        await tx.run(
            SELECT.one
                .from(
                    "dealer360.PurchaseOrderApprovals"
                )
                .where({
                    ID:
                        approvalRequestId
                })
        );

    if (!approval) {
        throw new Error(
            `Purchase Order Approval ${approvalRequestId} does not exist.`
        );
    }

    if (
        approval.status !==
        APPROVAL_STATUS.PENDING
    ) {
        throw new Error(
            `Purchase Order Approval is not pending. Current status: ${approval.status}.`
        );
    }

    const purchaseOrder =
        await getPurchaseOrder(
            tx,
            approval.purchaseOrder_ID
        );

    if (
        purchaseOrder.status !==
        PO_STATUS.PENDING_APPROVAL
    ) {
        throw new Error(
            `Purchase Order is not awaiting approval. Current status: ${purchaseOrder.status}.`
        );
    }

    const now =
        new Date().toISOString();

    const newApprovalStatus =
        normalizedDecision ===
        DECISION.APPROVED
            ? APPROVAL_STATUS.APPROVED
            : APPROVAL_STATUS.REJECTED;

    const newPurchaseOrderStatus =
        normalizedDecision ===
        DECISION.APPROVED
            ? PO_STATUS.APPROVED
            : PO_STATUS.REJECTED;

    const approvalUpdate = {

        status:
            newApprovalStatus,

        approverUserId:
            userId,

        approverName:
            userName,

        approverEmail:
            userEmail,

        comments:
            comments || null
    };

    if (
        normalizedDecision ===
        DECISION.APPROVED
    ) {
        approvalUpdate.approvedAt =
            now;
    } else {
        approvalUpdate.rejectedAt =
            now;
    }

    if (bpaInstanceId) {
        approvalUpdate.bpaInstanceId =
            bpaInstanceId;
    }

    const updatedApproval =
        await tx.run(
            UPDATE(
                "dealer360.PurchaseOrderApprovals"
            )
                .set(approvalUpdate)
                .where({
                    ID:
                        approvalRequestId,

                    status:
                        APPROVAL_STATUS.PENDING
                })
        );

    if (updatedApproval === 0) {
        throw new Error(
            "Approval decision could not be processed because the approval status changed."
        );
    }

    const poUpdate = {

        status:
            newPurchaseOrderStatus
    };

    if (
        normalizedDecision ===
        DECISION.APPROVED
    ) {
        poUpdate.approvedAt =
            now;
    }

    const updatedPO =
        await tx.run(
            UPDATE(
                "dealer360.PurchaseOrders"
            )
                .set(poUpdate)
                .where({
                    ID:
                        purchaseOrder.ID,

                    status:
                        PO_STATUS.PENDING_APPROVAL
                })
        );

    if (updatedPO === 0) {
        throw new Error(
            "Purchase Order status could not be updated because its status changed."
        );
    }

    await createPurchaseOrderStatusHistory(
        tx,
        {
            purchaseOrderId:
                purchaseOrder.ID,

            previousStatus:
                PO_STATUS.PENDING_APPROVAL,

            newStatus:
                newPurchaseOrderStatus,

            changedBy:
                userId,

            changedByName:
                userName,

            reason:
                comments ||
                `Purchase Order approval decision: ${normalizedDecision}.`
        }
    );

    return purchaseOrder.ID;
}


/* =========================================================
   ALLOCATE CREDIT TO PURCHASE ORDER
   ========================================================= */

async function allocateCreditToPurchaseOrder(
    tx,
    purchaseOrderId,
    userId,
    userName
) {

    const purchaseOrder =
        await getPurchaseOrder(
            tx,
            purchaseOrderId
        );


    /* =====================================================
       PO MUST BE APPROVED
       ===================================================== */

    if (
        purchaseOrder.status !==
        PO_STATUS.APPROVED
    ) {
        throw new Error(
            `Only APPROVED Purchase Orders can have credit allocated. Current status: ${purchaseOrder.status}.`
        );
    }


    /* =====================================================
       PREVENT DUPLICATE ALLOCATION
       ===================================================== */

    const existingTransaction =
        await tx.run(
            SELECT.one
                .from(
                    "dealer360.CreditTransactions"
                )
                .where({
                    referenceType:
                        "PURCHASE_ORDER",

                    referenceId:
                        purchaseOrder.ID,

                    transactionType:
                        "DEBIT",

                    transactionStatus:
                        "POSTED"
                })
        );

    if (existingTransaction) {
        throw new Error(
            `Credit has already been allocated for Purchase Order ${purchaseOrder.purchaseOrderNumber}.`
        );
    }


    /* =====================================================
       VALIDATE DEALER
       ===================================================== */

    await getActiveDealer(
        tx,
        purchaseOrder.dealer_ID
    );


    /* =====================================================
       VALIDATE AMOUNT
       ===================================================== */

    const amount =
        Number(purchaseOrder.totalAmount);

    if (
        !Number.isFinite(amount) ||
        amount <= 0
    ) {
        throw new Error(
            `Purchase Order ${purchaseOrder.purchaseOrderNumber} has an invalid total amount.`
        );
    }


    /* =====================================================
       CREDIT CHECK
       ===================================================== */

    const creditCheck =
        await checkCredit(
            tx,
            purchaseOrder.dealer_ID,
            amount
        );


    if (!creditCheck.allowed) {

        await tx.run(
            UPDATE(
                "dealer360.PurchaseOrders"
            )
                .set({
                    status:
                        PO_STATUS.CREDIT_BLOCKED,

                    creditChecked:
                        true,

                    creditBlocked:
                        true,

                    creditBlockReason:
                        creditCheck.reason
                })
                .where({
                    ID:
                        purchaseOrder.ID,

                    status:
                        PO_STATUS.APPROVED
                })
        );

        await createPurchaseOrderStatusHistory(
            tx,
            {
                purchaseOrderId:
                    purchaseOrder.ID,

                previousStatus:
                    PO_STATUS.APPROVED,

                newStatus:
                    PO_STATUS.CREDIT_BLOCKED,

                changedBy:
                    userId,

                changedByName:
                    userName,

                reason:
                    creditCheck.reason
            }
        );

        throw new Error(
            `Credit check failed: ${creditCheck.reason}`
        );
    }


    /* =====================================================
       ALLOCATE CREDIT
       ===================================================== */

    const allocation =
        await allocateCredit(
            tx,
            {
                dealerId:
                    purchaseOrder.dealer_ID,

                amount,

                referenceType:
                    "PURCHASE_ORDER",

                referenceId:
                    purchaseOrder.ID,

                description:
                    `Credit allocated for Purchase Order ${purchaseOrder.purchaseOrderNumber}.`,

                postedBy:
                    userId
            }
        );


    /* =====================================================
       UPDATE PURCHASE ORDER
       ===================================================== */

    const updated =
        await tx.run(
            UPDATE(
                "dealer360.PurchaseOrders"
            )
                .set({
                    status:
                        PO_STATUS.ALLOCATED,

                    creditChecked:
                        true,

                    creditBlocked:
                        false,

                    creditBlockReason:
                        null,

                    allocatedAt:
                        new Date().toISOString()
                })
                .where({
                    ID:
                        purchaseOrder.ID,

                    status:
                        PO_STATUS.APPROVED
                })
        );


    if (updated === 0) {
        throw new Error(
            "Purchase Order could not be allocated because its status changed."
        );
    }


    /* =====================================================
       PO STATUS HISTORY
       ===================================================== */

    await createPurchaseOrderStatusHistory(
        tx,
        {
            purchaseOrderId:
                purchaseOrder.ID,

            previousStatus:
                PO_STATUS.APPROVED,

            newStatus:
                PO_STATUS.ALLOCATED,

            changedBy:
                userId,

            changedByName:
                userName,

            reason:
                `Credit of ${amount} ${purchaseOrder.currency || "INR"} allocated successfully.`
        }
    );


    return purchaseOrder.ID;
}


/* =========================================================
   SERVICE IMPLEMENTATION
   ========================================================= */

module.exports = cds.service.impl(
    async function () {

        require("./lib/lifecycle").registerPurchaseOrderCancel(this);



        /* =================================================
           SUBMIT PURCHASE ORDER
           ================================================= */

        this.on(
            "submitPurchaseOrder",
            async (req) => {

                const {
                    purchaseOrderId
                } = req.data;

                try {

                    const {
                        userId,
                        userName
                    } = getUserContext(req);

                    return await submitPurchaseOrder(
                        cds.tx(req),
                        purchaseOrderId,
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
           START PURCHASE ORDER APPROVAL
           ================================================= */

        this.on(
            "startPurchaseOrderApproval",
            async (req) => {

                const {
                    purchaseOrderId
                } = req.data;

                try {

                    const {
                        userId,
                        userName,
                        userEmail
                    } = getUserContext(req);

                    return await startPurchaseOrderApproval(
                        cds.tx(req),
                        purchaseOrderId,
                        userId,
                        userName,
                        userEmail
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
           PROCESS PURCHASE ORDER APPROVAL DECISION
           ================================================= */

        this.on(
            "processPurchaseOrderApprovalDecision",
            async (req) => {

                const {
                    approvalRequestId,
                    decision,
                    comments,
                    bpaInstanceId,
                    bpaTaskId,
                    correlationId
                } = req.data;

                try {

                    const {
                        userId,
                        userName,
                        userEmail
                    } = getUserContext(req);

                    return await processPurchaseOrderApprovalDecision(
                        cds.tx(req),
                        approvalRequestId,
                        decision,
                        comments,
                        bpaInstanceId,
                        bpaTaskId,
                        correlationId,
                        userId,
                        userName,
                        userEmail
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
           ALLOCATE CREDIT TO PURCHASE ORDER
           ================================================= */

        this.on(
            "allocateCreditToPurchaseOrder",
            async (req) => {

                const {
                    purchaseOrderId
                } = req.data;

                try {

                    const {
                        userId,
                        userName
                    } = getUserContext(req);

                    return await allocateCreditToPurchaseOrder(
                        cds.tx(req),
                        purchaseOrderId,
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