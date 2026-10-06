const cds = require("@sap/cds");

const {
    SELECT,
    UPDATE,
    INSERT
} = cds.ql;


/* =========================================================
   DATABASE ENTITIES
   ========================================================= */

const {
    PurchaseRequisitions,
    PurchaseRequisitionApprovalRequests,
    PurchaseRequisitionApprovalHistory,
    PurchaseRequisitionStatusHistory,
    OutboxEvents
} = cds.entities("dealer360");


/* =========================================================
   STATUS CONSTANTS
   ========================================================= */

const PR_STATUS = {
    SUBMITTED: "SUBMITTED",
    PENDING_APPROVAL: "PENDING_APPROVAL",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED"
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


/* =========================================================
   APPROVAL CONFIGURATION
   ========================================================= */

const APPROVAL_LEVEL = "L1";

const BPA_PROCESS = "DEALER360_PR_APPROVAL";

const OUTBOX_EVENT = "PR_APPROVAL_REQUESTED";

const OUTBOX_AGGREGATE_TYPE = "PurchaseRequisition";

const OUTBOX_DESTINATION = "BPA";

const EVENT_VERSION = 1;


/* =========================================================
   ERROR HELPER
   ========================================================= */

function createError(message, statusCode = 400) {

    const error = new Error(message);

    error.statusCode = statusCode;

    return error;
}


/* =========================================================
   VALIDATE UUID
   ========================================================= */

function validateUUID(value, fieldName) {

    if (!value || typeof value !== "string") {

        throw createError(
            `${fieldName} is required.`
        );
    }

    return value;
}


/* =========================================================
   NORMALIZE DECISION
   ========================================================= */

function normalizeDecision(value) {

    if (!value || typeof value !== "string") {

        throw createError(
            "Decision is required."
        );
    }

    const decision =
        value.trim().toUpperCase();

    if (
        decision !== DECISION.APPROVED &&
        decision !== DECISION.REJECTED
    ) {

        throw createError(
            "Decision must be either APPROVED or REJECTED."
        );
    }

    return decision;
}


/* =========================================================
   USER INFORMATION
   ========================================================= */

function getUserId(req) {

    return (
        req.user?.id ||
        req.user?.attr?.userId ||
        "SYSTEM"
    );
}


function getUserName(req) {

    return (
        req.user?.attr?.name ||
        req.user?.attr?.given_name ||
        req.user?.id ||
        "System"
    );
}


function getUserEmail(req) {

    return (
        req.user?.attr?.email ||
        null
    );
}


/* =========================================================
   CORRELATION ID
   ========================================================= */

function getCorrelationId(req) {

    return (
        req.headers?.["x-correlation-id"] ||
        cds.utils.uuid()
    );
}


/* =========================================================
   LOAD PURCHASE REQUISITION
   ========================================================= */

async function getPurchaseRequisition(
    tx,
    requisitionId
) {

    const requisition =
        await tx.run(
            SELECT.one
                .from(PurchaseRequisitions)
                .where({
                    ID: requisitionId
                })
        );

    if (!requisition) {

        throw createError(
            `Purchase Requisition ${requisitionId} was not found.`,
            404
        );
    }

    return requisition;
}


/* =========================================================
   VALIDATE DEALER
   ========================================================= */

async function validateDealer(
    tx,
    dealerId
) {

    if (!dealerId) {

        throw createError(
            "Purchase Requisition does not contain a dealer."
        );
    }

    const dealer =
        await tx.run(
            SELECT.one
                .from("dealer360.Dealers")
                .columns(
                    "ID",
                    "dealerCode",
                    "legalName",
                    "status"
                )
                .where({
                    ID: dealerId
                })
        );

    if (!dealer) {

        throw createError(
            `Dealer ${dealerId} was not found.`
        );
    }

    if (
        dealer.status !== "ACTIVE"
    ) {

        throw createError(
            `Dealer must be ACTIVE to start PR approval. Current status: ${dealer.status}.`
        );
    }

    return dealer;
}


/* =========================================================
   FIND EXISTING APPROVAL REQUEST
   ========================================================= */

async function getExistingApprovalRequest(
    tx,
    requisitionId,
    approvalLevel
) {

    return tx.run(
        SELECT.one
            .from(
                PurchaseRequisitionApprovalRequests
            )
            .where({

                purchaseRequisition_ID:
                    requisitionId,

                approvalLevel

            })
    );
}


/* =========================================================
   CREATE PR STATUS HISTORY
   ========================================================= */

async function createPRStatusHistory(
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

    await tx.run(
        INSERT
            .into(
                PurchaseRequisitionStatusHistory
            )
            .entries({

                ID:
                    cds.utils.uuid(),

                purchaseRequisition_ID:
                    purchaseRequisitionId,

                previousStatus,

                newStatus,

                changedAt:
                    new Date(),

                changedBy,

                changedByName,

                reason

            })
    );
}


/* =========================================================
   CREATE APPROVAL HISTORY
   ========================================================= */

async function createApprovalHistory(
    tx,
    {
        purchaseRequisitionId,
        approvalRequestId,
        approvalLevel,
        previousStatus,
        newStatus,
        decision,
        performedByUserId,
        performedByName,
        performedByEmail,
        comments,
        bpaInstanceId,
        bpaTaskId,
        correlationId
    }
) {

    await tx.run(
        INSERT
            .into(
                PurchaseRequisitionApprovalHistory
            )
            .entries({

                ID:
                    cds.utils.uuid(),

                purchaseRequisition_ID:
                    purchaseRequisitionId,

                approvalRequest_ID:
                    approvalRequestId,

                approvalLevel,

                previousStatus,

                newStatus,

                decision,

                performedAt:
                    new Date(),

                performedByUserId,

                performedByName,

                performedByEmail,

                comments,

                bpaInstanceId,

                bpaTaskId,

                correlationId

            })
    );
}


/* =========================================================
   CREATE BPA APPROVAL PAYLOAD
   ========================================================= */

function createBPAApprovalPayload({
    requisition,
    dealer,
    approvalRequestId,
    requestedByUserId,
    requestedByName,
    requestedByEmail
}) {

    return {

        process:
            BPA_PROCESS,

        approvalLevel:
            APPROVAL_LEVEL,

        approvalRequestId,

        purchaseRequisitionId:
            requisition.ID,

        requisitionNumber:
            requisition.requisitionNumber,

        dealerId:
            dealer.ID,

        dealerCode:
            dealer.dealerCode,

        totalAmount:
            Number(requisition.totalAmount || 0),

        currency:
            requisition.currency,

        requestedBy: {

            userId:
                requestedByUserId,

            name:
                requestedByName,

            email:
                requestedByEmail

        },

        remarks:
            requisition.remarks || null

    };
}


/* =========================================================
   CREATE OUTBOX EVENT
   ========================================================= */

async function createApprovalOutboxEvent(
    tx,
    {
        requisition,
        dealer,
        approvalRequestId,
        requestedByUserId,
        requestedByName,
        requestedByEmail,
        correlationId
    }
) {

    const payload =
        createBPAApprovalPayload({

            requisition,

            dealer,

            approvalRequestId,

            requestedByUserId,

            requestedByName,

            requestedByEmail

        });


    const idempotencyKey =
        `PR_APPROVAL:${requisition.ID}:${APPROVAL_LEVEL}`;


    await tx.run(
        INSERT
            .into(OutboxEvents)
            .entries({

                ID:
                    cds.utils.uuid(),

                eventType:
                    OUTBOX_EVENT,

                aggregateType:
                    OUTBOX_AGGREGATE_TYPE,

                aggregateId:
                    requisition.ID,

                eventVersion:
                    EVENT_VERSION,

                status:
                    "PENDING",

                payload:
                    JSON.stringify(payload),

                correlationId,

                idempotencyKey,

                destination:
                    OUTBOX_DESTINATION,

                retryCount:
                    0,

                maxRetries:
                    5,

                createdByService:
                    "PurchaseRequisitionApprovalService",

                remarks:
                    "PR approval request created for SAP Build Process Automation."

            })
    );

    return payload;
}


/* =========================================================
   START PURCHASE REQUISITION APPROVAL
   ========================================================= */

async function startApproval(
    tx,
    req,
    requisitionId
) {

    validateUUID(
        requisitionId,
        "requisitionId"
    );


    /* -----------------------------------------------------
       LOAD PR
       ----------------------------------------------------- */

    const requisition =
        await getPurchaseRequisition(
            tx,
            requisitionId
        );


    /* -----------------------------------------------------
       PR MUST BE SUBMITTED
       ----------------------------------------------------- */

    if (
        requisition.status !==
        PR_STATUS.SUBMITTED
    ) {

        throw createError(
            `Purchase Requisition can only start approval from SUBMITTED status. Current status: ${requisition.status}.`
        );
    }


    /* -----------------------------------------------------
       VALIDATE DEALER
       ----------------------------------------------------- */

    const dealer =
        await validateDealer(
            tx,
            requisition.dealer_ID
        );


    /* -----------------------------------------------------
       CHECK DUPLICATE APPROVAL
       ----------------------------------------------------- */

    const existingRequest =
        await getExistingApprovalRequest(
            tx,
            requisitionId,
            APPROVAL_LEVEL
        );


    if (existingRequest) {

        throw createError(
            `An L1 approval request already exists for Purchase Requisition ${requisition.requisitionNumber}.`
        );
    }


    /* -----------------------------------------------------
       REQUESTER INFORMATION
       ----------------------------------------------------- */

    const userId =
        getUserId(req);

    const userName =
        getUserName(req);

    const userEmail =
        getUserEmail(req);


    const correlationId =
        getCorrelationId(req);


    const approvalRequestId =
        cds.utils.uuid();


    const requestedAt =
        new Date();


    /* -----------------------------------------------------
       CREATE APPROVAL REQUEST
       ----------------------------------------------------- */

    await tx.run(
        INSERT
            .into(
                PurchaseRequisitionApprovalRequests
            )
            .entries({

                ID:
                    approvalRequestId,

                purchaseRequisition_ID:
                    requisitionId,

                approvalLevel:
                    APPROVAL_LEVEL,

                status:
                    APPROVAL_STATUS.PENDING,

                requestedAt,

                requestedByUserId:
                    userId,

                requestedByName:
                    userName,

                requestedByEmail:
                    userEmail

            })
    );


    /* -----------------------------------------------------
       UPDATE PR STATUS
       ----------------------------------------------------- */

    const updateResult =
        await tx.run(
            UPDATE(
                PurchaseRequisitions
            )
                .set({

                    status:
                        PR_STATUS.PENDING_APPROVAL

                })
                .where({

                    ID:
                        requisitionId,

                    status:
                        PR_STATUS.SUBMITTED

                })
        );


    if (
        updateResult === 0
    ) {

        throw createError(
            "Purchase Requisition status could not be changed to PENDING_APPROVAL."
        );
    }


    /* -----------------------------------------------------
       PR STATUS HISTORY
       ----------------------------------------------------- */

    await createPRStatusHistory(
        tx,
        {

            purchaseRequisitionId:
                requisitionId,

            previousStatus:
                PR_STATUS.SUBMITTED,

            newStatus:
                PR_STATUS.PENDING_APPROVAL,

            changedBy:
                userId,

            changedByName:
                userName,

            reason:
                "Purchase Requisition approval started."

        }
    );


    /* -----------------------------------------------------
       APPROVAL HISTORY
       ----------------------------------------------------- */

    await createApprovalHistory(
        tx,
        {

            purchaseRequisitionId:
                requisitionId,

            approvalRequestId,

            approvalLevel:
                APPROVAL_LEVEL,

            previousStatus:
                null,

            newStatus:
                APPROVAL_STATUS.PENDING,

            decision:
                "SUBMITTED",

            performedByUserId:
                userId,

            performedByName:
                userName,

            performedByEmail:
                userEmail,

            comments:
                "Approval request created.",

            correlationId

        }
    );


    /* -----------------------------------------------------
       CREATE OUTBOX EVENT
       ----------------------------------------------------- */

    await createApprovalOutboxEvent(
        tx,
        {

            requisition,

            dealer,

            approvalRequestId,

            requestedByUserId:
                userId,

            requestedByName:
                userName,

            requestedByEmail:
                userEmail,

            correlationId

        }
    );


    /* -----------------------------------------------------
       RESULT
       ----------------------------------------------------- */

    return {

        success:
            true,

        approvalRequestId,

        purchaseRequisitionId:
            requisitionId,

        requisitionNumber:
            requisition.requisitionNumber,

        status:
            PR_STATUS.PENDING_APPROVAL,

        message:
            "Purchase Requisition approval request created successfully."

    };
}


/* =========================================================
   PROCESS APPROVAL DECISION
   ========================================================= */

async function processApprovalDecision(
    tx,
    req,
    data
) {

    const approvalRequestId =
        validateUUID(
            data.approvalRequestId,
            "approvalRequestId"
        );


    const decision =
        normalizeDecision(
            data.decision
        );


    /* -----------------------------------------------------
       LOAD APPROVAL REQUEST
       ----------------------------------------------------- */

    const approvalRequest =
        await tx.run(
            SELECT.one
                .from(
                    PurchaseRequisitionApprovalRequests
                )
                .where({

                    ID:
                        approvalRequestId

                })
        );


    if (!approvalRequest) {

        throw createError(
            `Approval Request ${approvalRequestId} was not found.`,
            404
        );
    }


    /* -----------------------------------------------------
       APPROVAL REQUEST MUST BE PENDING
       ----------------------------------------------------- */

    if (
        approvalRequest.status !==
        APPROVAL_STATUS.PENDING
    ) {

        throw createError(
            `Approval Request has already been processed. Current status: ${approvalRequest.status}.`
        );
    }


    /* -----------------------------------------------------
       LOAD PR
       ----------------------------------------------------- */

    const requisition =
        await getPurchaseRequisition(
            tx,
            approvalRequest.purchaseRequisition_ID
        );


    /* -----------------------------------------------------
       PR MUST BE PENDING APPROVAL
       ----------------------------------------------------- */

    if (
        requisition.status !==
        PR_STATUS.PENDING_APPROVAL
    ) {

        throw createError(
            `Purchase Requisition is not pending approval. Current status: ${requisition.status}.`
        );
    }


    /* -----------------------------------------------------
       APPROVER INFORMATION
       ----------------------------------------------------- */

    const approverUserId =
        getUserId(req);

    const approverName =
        getUserName(req);

    const approverEmail =
        getUserEmail(req);

    const now =
        new Date();


    /* -----------------------------------------------------
       DETERMINE NEW STATUSES
       ----------------------------------------------------- */

    const newApprovalStatus =
        decision === DECISION.APPROVED
            ? APPROVAL_STATUS.APPROVED
            : APPROVAL_STATUS.REJECTED;


    const newPRStatus =
        decision === DECISION.APPROVED
            ? PR_STATUS.APPROVED
            : PR_STATUS.REJECTED;


    /* -----------------------------------------------------
       UPDATE APPROVAL REQUEST
       ----------------------------------------------------- */

    const approvalUpdate = {

        status:
            newApprovalStatus,

        approverUserId,

        approverName,

        approverEmail,

        decisionComments:
            data.comments || null,

        callbackReceivedAt:
            now,

        callbackCorrelationId:
            data.correlationId || null,

        bpaInstanceId:
            data.bpaInstanceId || null,

        bpaTaskId:
            data.bpaTaskId || null

    };


    if (
        decision ===
        DECISION.APPROVED
    ) {

        approvalUpdate.approvedAt =
            now;

    } else {

        approvalUpdate.rejectedAt =
            now;
    }


    const approvalUpdateResult =
        await tx.run(
            UPDATE(
                PurchaseRequisitionApprovalRequests
            )
                .set(approvalUpdate)
                .where({

                    ID:
                        approvalRequestId,

                    status:
                        APPROVAL_STATUS.PENDING

                })
        );


    if (
        approvalUpdateResult === 0
    ) {

        throw createError(
            "Approval Request could not be updated because it may have already been processed."
        );
    }


    /* -----------------------------------------------------
       UPDATE PR
       ----------------------------------------------------- */

    const prUpdate = {

        status:
            newPRStatus

    };


    if (
        decision ===
        DECISION.APPROVED
    ) {

        prUpdate.approvedAt =
            now;

    } else {

        prUpdate.rejectedAt =
            now;

        prUpdate.rejectionReason =
            data.comments ||
            "Rejected by approver.";
    }


    const prUpdateResult =
        await tx.run(
            UPDATE(
                PurchaseRequisitions
            )
                .set(prUpdate)
                .where({

                    ID:
                        requisition.ID,

                    status:
                        PR_STATUS.PENDING_APPROVAL

                })
        );


    if (
        prUpdateResult === 0
    ) {

        throw createError(
            "Purchase Requisition could not be updated because its status has changed."
        );
    }


    /* -----------------------------------------------------
       PR STATUS HISTORY
       ----------------------------------------------------- */

    await createPRStatusHistory(
        tx,
        {

            purchaseRequisitionId:
                requisition.ID,

            previousStatus:
                PR_STATUS.PENDING_APPROVAL,

            newStatus:
                newPRStatus,

            changedBy:
                approverUserId,

            changedByName:
                approverName,

            reason:
                data.comments ||
                `PR ${decision.toLowerCase()} by approver.`

        }
    );


    /* -----------------------------------------------------
       APPROVAL HISTORY
       ----------------------------------------------------- */

    await createApprovalHistory(
        tx,
        {

            purchaseRequisitionId:
                requisition.ID,

            approvalRequestId,

            approvalLevel:
                approvalRequest.approvalLevel,

            previousStatus:
                APPROVAL_STATUS.PENDING,

            newStatus:
                newApprovalStatus,

            decision,

            performedByUserId:
                approverUserId,

            performedByName:
                approverName,

            performedByEmail:
                approverEmail,

            comments:
                data.comments || null,

            bpaInstanceId:
                data.bpaInstanceId || null,

            bpaTaskId:
                data.bpaTaskId || null,

            correlationId:
                data.correlationId || null

        }
    );


    /* -----------------------------------------------------
       RESULT
       ----------------------------------------------------- */

    return {

        success:
            true,

        approvalRequestId,

        purchaseRequisitionId:
            requisition.ID,

        requisitionNumber:
            requisition.requisitionNumber,

        decision,

        status:
            newPRStatus,

        message:
            decision === DECISION.APPROVED
                ? "Purchase Requisition approved successfully."
                : "Purchase Requisition rejected successfully."

    };
}


/* =========================================================
   SERVICE IMPLEMENTATION
   ========================================================= */

module.exports =
    cds.service.impl(
        async function () {


            /* =============================================
               START APPROVAL
               ============================================= */

            this.on(
                "startApproval",
                async (req) => {

                    try {

                        const tx =
                            cds.tx(req);

                        return await startApproval(
                            tx,
                            req,
                            req.data.requisitionId
                        );

                    } catch (error) {

                        req.reject(
                            error.statusCode || 500,
                            error.message
                        );

                    }

                }
            );


            /* =============================================
               PROCESS APPROVAL DECISION
               ============================================= */

            this.on(
                "processApprovalDecision",
                async (req) => {

                    try {

                        const tx =
                            cds.tx(req);

                        return await processApprovalDecision(
                            tx,
                            req,
                            req.data
                        );

                    } catch (error) {

                        req.reject(
                            error.statusCode || 500,
                            error.message
                        );

                    }

                }
            );

        }
    );