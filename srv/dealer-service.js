
const cds = require("@sap/cds");

const {
    SELECT,
    UPDATE,
    INSERT
} = cds.ql;

const {
    Dealers,
    DealerAddresses,
    DealerContacts,
    DealerDocuments,
    OnboardingApprovals,
    DealerStatusHistory
} = cds.entities("dealer360");

const {
    OutboxEvents
} = cds.entities("dealer360");


/* =========================================================
   CONSTANTS
   ========================================================= */

const DEALER_STATUS = {

    PENDING: "PENDING",

    SUBMITTED: "SUBMITTED",

    L1_APPROVED: "L1_APPROVED",

    ACTIVE: "ACTIVE",

    REJECTED: "REJECTED",

    BLOCKED: "BLOCKED",

    INACTIVE: "INACTIVE"

};


const APPROVAL_LEVEL = {

    L1: "L1",

    L2: "L2"

};


const APPROVAL_STATUS = {

    PENDING: "PENDING",

    APPROVED: "APPROVED",

    REJECTED: "REJECTED",

    CANCELLED: "CANCELLED"

};


/* =========================================================
   VALIDATION HELPERS
   ========================================================= */

function validateDealerId(dealerId) {

    if (!dealerId) {

        throw new Error("Dealer ID is required.");

    }

}


function validateGST(gstNumber) {

    if (!gstNumber) {

        return;

    }

    const gstRegex =
        /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

    if (!gstRegex.test(gstNumber)) {

        const error =
            new Error("Invalid GST number format.");

        error.code = "INVALID_GST";

        throw error;

    }

}


function validatePAN(panNumber) {

    if (!panNumber) {

        return;

    }

    const panRegex =
        /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

    if (!panRegex.test(panNumber)) {

        const error =
            new Error("Invalid PAN number format.");

        error.code = "INVALID_PAN";

        throw error;

    }

}


function validatePhone(phoneNumber) {

    if (!phoneNumber) {

        return;

    }

    const phoneRegex =
        /^[6-9][0-9]{9}$/;

    if (!phoneRegex.test(phoneNumber)) {

        const error =
            new Error("Invalid phone number format.");

        error.code = "INVALID_PHONE";

        throw error;

    }

}


function validateEmail(email) {

    if (!email) {

        return;

    }

    const emailRegex =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {

        const error =
            new Error("Invalid email address format.");

        error.code = "INVALID_EMAIL";

        throw error;

    }

}


/* =========================================================
   LIFECYCLE UPDATE
   =========================================================

   Lifecycle actions are the only business operations that
   intentionally change protected fields such as:

   - status
   - dealerCode

   The lifecycle update is executed directly through the
   current transaction using tx.run().

   Normal OData PATCH/UPDATE requests are protected by the
   before UPDATE handler below.

   ========================================================= */

async function runLifecycleDealerUpdate(tx, query) {

    const context = cds.context;

    if (!context) {
        throw new Error(
            "Dealer lifecycle update requires an active CAP request context."
        );
    }

    const previousValue =
        context._dealerLifecycleUpdate;

    context._dealerLifecycleUpdate = true;      // <-- was commented out

    try {

        return await tx.run(query);

    } finally {

        if (previousValue === undefined) {
            delete context._dealerLifecycleUpdate;
        } else {
            context._dealerLifecycleUpdate =
                previousValue;
        }
    }
}

/* =========================================================
   DEALER LOOKUP
   ========================================================= */

async function getDealer(tx, dealerId) {

    validateDealerId(dealerId);

    const dealer =
        await tx.run(
            SELECT.one
                .from(Dealers)
                .where({
                    ID: dealerId
                })
        );

    if (!dealer) {

        const error =
            new Error("Dealer not found.");

        error.code = "DEALER_NOT_FOUND";

        throw error;

    }

    return dealer;

}


/* =========================================================
   DEALER CODE GENERATION
   ========================================================= */

async function generateDealerCode(tx) {

    const currentYear =
        new Date().getFullYear();

    const prefix =
        `DLR-${currentYear}-`;

    const dealers =
        await tx.run(
            SELECT
                .from(Dealers)
                .columns("dealerCode")
                .where({
                    dealerCode: {
                        like: `${prefix}%`
                    }
                })
        );

    let maxNumber = 0;

    for (const dealer of dealers) {

        if (!dealer.dealerCode) {

            continue;

        }

        const numberPart =
            dealer.dealerCode.replace(
                prefix,
                ""
            );

        const number =
            parseInt(
                numberPart,
                10
            );

        if (
            !Number.isNaN(number) &&
            number > maxNumber
        ) {

            maxNumber = number;

        }

    }

    const nextNumber =
        maxNumber + 1;

    return (
        prefix +
        String(nextNumber).padStart(
            6,
            "0"
        )
    );

}


/* =========================================================
   STATUS HISTORY
   ========================================================= */

async function createStatusHistory(
    tx,
    {
        dealerId,
        previousStatus,
        newStatus,
        changedBy,
        changedByName,
        reason
    }
) {

    await tx.run(
        INSERT
            .into(DealerStatusHistory)
            .entries({

                dealer_ID:
                    dealerId,

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
   ONBOARDING APPROVAL
   ========================================================= */

async function createApproval(
    tx,
    {
        dealerId,
        approvalLevel,
        approverUserId,
        approverName,
        approverEmail,
        comments
    }
) {

    await tx.run(
        INSERT
            .into(OnboardingApprovals)
            .entries({

                dealer_ID:
                    dealerId,

                approvalLevel,

                status:
                    APPROVAL_STATUS.PENDING,

                approverUserId:
                    approverUserId || null,

                approverName:
                    approverName || null,

                approverEmail:
                    approverEmail || null,

                requestedAt:
                    new Date().toISOString(),

                comments:
                    comments || null

            })
    );

}


/* =========================================================
   OUTBOX EVENT
   ========================================================= */

async function createOutboxEvent(
    tx,
    {
        eventType,
        dealerId,
        payload
    }
) {

    if (!OutboxEvents) {

        return;

    }

    await tx.run(
        INSERT
            .into(OutboxEvents)
            .entries({

                eventType,

                aggregateType:
                    "Dealer",

                aggregateId:
                    dealerId,

                payload:
                    JSON.stringify(
                        payload || {}
                    ),

                status:
                    "PENDING",

                createdAt:
                    new Date().toISOString()

            })
    );

}


/* =========================================================
   SERVICE IMPLEMENTATION
   ========================================================= */

module.exports =
    cds.service.impl(function () {


        /* =====================================================
           CREATE DEALER
           ===================================================== */

        this.before(
            "CREATE",
            "Dealers",
            async (req) => {

                const data = req.data;


                /* ---------------------------------------------
                   Required fields
                   --------------------------------------------- */

                if (!data.legalName) {

                    return req.reject(
                        400,
                        "Legal name is required."
                    );

                }


                if (!data.dealerType_ID) {

                    return req.reject(
                        400,
                        "Dealer type is required."
                    );

                }


                /* ---------------------------------------------
                   Format validation
                   --------------------------------------------- */

                try {

                    validateGST(
                        data.gstNumber
                    );

                    validatePAN(
                        data.panNumber
                    );

                    validatePhone(
                        data.primaryPhone
                    );

                    validateEmail(
                        data.primaryEmail
                    );

                } catch (error) {

                    return req.reject(
                        400,
                        error.message
                    );

                }


                /* ---------------------------------------------
                   Duplicate GST
                   --------------------------------------------- */

                if (data.gstNumber) {

                    const duplicateGST =
                        await SELECT.one
                            .from(Dealers)
                            .where({
                                gstNumber:
                                    data.gstNumber
                            });

                    if (duplicateGST) {

                        return req.reject(
                            400,
                            "A dealer with this GST number already exists."
                        );

                    }

                }


                /* ---------------------------------------------
                   Duplicate PAN
                   --------------------------------------------- */

                if (data.panNumber) {

                    const duplicatePAN =
                        await SELECT.one
                            .from(Dealers)
                            .where({
                                panNumber:
                                    data.panNumber
                            });

                    if (duplicatePAN) {

                        return req.reject(
                            400,
                            "A dealer with this PAN number already exists."
                        );

                    }

                }


                /* ---------------------------------------------
                   Force initial lifecycle state
                   --------------------------------------------- */

                data.status =
                    DEALER_STATUS.PENDING;

                data.dealerCode =
                    null;

                data.submittedAt =
                    null;

                data.l1ApprovedAt =
                    null;

                data.activatedAt =
                    null;

                data.rejectedAt =
                    null;

                data.blockedAt =
                    null;

            }
        );


        /* =====================================================
           UPDATE DEALER VALIDATION
           ===================================================== */

        this.before(
            "UPDATE",
            "Dealers",
            async (req) => {

                const data = req.data;

                const ID =
                    data.ID ||
                    (
                        req.params?.[0] &&
                        typeof req.params[0] === "object"
                            ? req.params[0].ID
                            : req.params?.[0]
                    );


                /* ---------------------------------------------
                   Manual PATCH protection

                   Normal external UPDATE/PATCH requests are
                   not allowed to modify lifecycle-controlled
                   fields.

                   Lifecycle actions use tx.run() directly and
                   therefore do not depend on this service-level
                   UPDATE protection.
                   --------------------------------------------- */

                if (
                    Object.prototype.hasOwnProperty.call(
                        data,
                        "status"
                    )
                ) {

                    return req.reject(
                        400,
                        "Dealer status can only be changed through lifecycle actions."
                    );

                }


                if (
                    Object.prototype.hasOwnProperty.call(
                        data,
                        "dealerCode"
                    )
                ) {

                    return req.reject(
                        400,
                        "Dealer code can only be changed through its business action."
                    );

                }


                /* ---------------------------------------------
                   Format validation

                   Only validate fields actually supplied in
                   the UPDATE/PATCH request.
                   --------------------------------------------- */

                try {

                    if (
                        Object.prototype.hasOwnProperty.call(
                            data,
                            "gstNumber"
                        )
                    ) {

                        validateGST(
                            data.gstNumber
                        );

                    }


                    if (
                        Object.prototype.hasOwnProperty.call(
                            data,
                            "panNumber"
                        )
                    ) {

                        validatePAN(
                            data.panNumber
                        );

                    }


                    if (
                        Object.prototype.hasOwnProperty.call(
                            data,
                            "primaryPhone"
                        )
                    ) {

                        validatePhone(
                            data.primaryPhone
                        );

                    }


                    if (
                        Object.prototype.hasOwnProperty.call(
                            data,
                            "primaryEmail"
                        )
                    ) {

                        validateEmail(
                            data.primaryEmail
                        );

                    }

                } catch (error) {

                    return req.reject(
                        400,
                        error.message
                    );

                }


                /* ---------------------------------------------
                   Duplicate GST
                   --------------------------------------------- */

                if (
                    Object.prototype.hasOwnProperty.call(
                        data,
                        "gstNumber"
                    ) &&
                    data.gstNumber
                ) {

                    const duplicateGST =
                        await SELECT.one
                            .from(Dealers)
                            .where({

                                gstNumber:
                                    data.gstNumber,

                                ID: {
                                    "!=":
                                        ID
                                }

                            });

                    if (duplicateGST) {

                        return req.reject(
                            400,
                            "A dealer with this GST number already exists."
                        );

                    }

                }


                /* ---------------------------------------------
                   Duplicate PAN
                   --------------------------------------------- */

                if (
                    Object.prototype.hasOwnProperty.call(
                        data,
                        "panNumber"
                    ) &&
                    data.panNumber
                ) {

                    const duplicatePAN =
                        await SELECT.one
                            .from(Dealers)
                            .where({

                                panNumber:
                                    data.panNumber,

                                ID: {
                                    "!=":
                                        ID
                                }

                            });

                    if (duplicatePAN) {

                        return req.reject(
                            400,
                            "A dealer with this PAN number already exists."
                        );

                    }

                }

            }
        );


        /* =====================================================
           SUBMIT DEALER
           ===================================================== */

        this.on(
            "submitDealer",
            async (req) => {

                const {
                    dealerId
                } = req.data;

                try {

                    validateDealerId(
                        dealerId
                    );


                    const tx =
                        cds.tx(req);


                    const dealer =
                        await getDealer(
                            tx,
                            dealerId
                        );


                    /* -----------------------------------------
                       Lifecycle validation
                       ----------------------------------------- */

                    if (
                        dealer.status !==
                        DEALER_STATUS.PENDING
                    ) {

                        return req.reject(
                            400,
                            `Dealer cannot be submitted from status ${dealer.status}.`
                        );

                    }


                    /* -----------------------------------------
                       Mandatory information
                       ----------------------------------------- */

                    if (!dealer.legalName) {

                        return req.reject(
                            400,
                            "Legal name is required before submission."
                        );

                    }


                    if (!dealer.dealerType_ID) {

                        return req.reject(
                            400,
                            "Dealer type is required before submission."
                        );

                    }


                    /* -----------------------------------------
                       Field validations
                       ----------------------------------------- */

                    validateGST(
                        dealer.gstNumber
                    );

                    validatePAN(
                        dealer.panNumber
                    );

                    validatePhone(
                        dealer.primaryPhone
                    );

                    validateEmail(
                        dealer.primaryEmail
                    );


                    /* -----------------------------------------
                       Duplicate GST
                       ----------------------------------------- */

                    if (dealer.gstNumber) {

                        const duplicateGST =
                            await tx.run(
                                SELECT.one
                                    .from(Dealers)
                                    .where({

                                        gstNumber:
                                            dealer.gstNumber,

                                        ID: {
                                            "!=":
                                                dealer.ID
                                        }

                                    })
                            );

                        if (duplicateGST) {

                            const error =
                                new Error(
                                    "A dealer with this GST number already exists."
                                );

                            error.code =
                                "DUPLICATE_GST";

                            throw error;

                        }

                    }


                    /* -----------------------------------------
                       Duplicate PAN
                       ----------------------------------------- */

                    if (dealer.panNumber) {

                        const duplicatePAN =
                            await tx.run(
                                SELECT.one
                                    .from(Dealers)
                                    .where({

                                        panNumber:
                                            dealer.panNumber,

                                        ID: {
                                            "!=":
                                                dealer.ID
                                        }

                                    })
                            );

                        if (duplicatePAN) {

                            const error =
                                new Error(
                                    "A dealer with this PAN number already exists."
                                );

                            error.code =
                                "DUPLICATE_PAN";

                            throw error;

                        }

                    }


                    /* -----------------------------------------
                       Generate dealer code
                       ----------------------------------------- */

                    const dealerCode =
                        await generateDealerCode(
                            tx
                        );


                    /* -----------------------------------------
                       Update dealer

                       This is an internal lifecycle update.
                       It intentionally changes dealerCode/status.
                       ----------------------------------------- */

                    const submittedAt =
                        new Date().toISOString();


                    await runLifecycleDealerUpdate(
                        tx,
                        UPDATE(Dealers)
                            .set({

                                dealerCode,

                                status:
                                    DEALER_STATUS.SUBMITTED,

                                submittedAt

                            })
                            .where({

                                ID:
                                    dealerId

                            })
                    );


                    /* -----------------------------------------
                       Create L1 approval
                       ----------------------------------------- */

                    await createApproval(
                        tx,
                        {

                            dealerId,

                            approvalLevel:
                                APPROVAL_LEVEL.L1

                        }
                    );


                    /* -----------------------------------------
                       Status history
                       ----------------------------------------- */

                    await createStatusHistory(
                        tx,
                        {

                            dealerId,

                            previousStatus:
                                DEALER_STATUS.PENDING,

                            newStatus:
                                DEALER_STATUS.SUBMITTED,

                            changedBy:
                                req.user?.id ||
                                "SYSTEM",

                            changedByName:
                                req.user?.attr?.name ||
                                "System",

                            reason:
                                "Dealer submitted for onboarding approval."

                        }
                    );


                    /* -----------------------------------------
                       Outbox event
                       ----------------------------------------- */

                    await createOutboxEvent(
                        tx,
                        {

                            eventType:
                                "DEALER_SUBMITTED",

                            dealerId,

                            payload: {

                                dealerId,

                                dealerCode,

                                status:
                                    DEALER_STATUS.SUBMITTED

                            }

                        }
                    );


                    return await getDealer(
                        tx,
                        dealerId
                    );

                } catch (error) {

                    return req.reject(
                        error.code ===
                            "DEALER_NOT_FOUND"
                            ? 404
                            : 400,

                        error.message
                    );

                }

            }
        );


        /* =====================================================
           L1 APPROVAL
           ===================================================== */

        this.on(
            "l1Approve",
            async (req) => {

                const {
                    dealerId
                } = req.data;

                try {

                    validateDealerId(
                        dealerId
                    );


                    const tx =
                        cds.tx(req);


                    const dealer =
                        await getDealer(
                            tx,
                            dealerId
                        );


                    /* -----------------------------------------
                       Lifecycle validation
                       ----------------------------------------- */

                    if (
                        dealer.status !==
                        DEALER_STATUS.SUBMITTED
                    ) {

                        return req.reject(
                            400,
                            `Dealer cannot be L1 approved from status ${dealer.status}.`
                        );

                    }


                    /* -----------------------------------------
                       Find pending L1 approval
                       ----------------------------------------- */

                    const approval =
                        await tx.run(
                            SELECT.one
                                .from(
                                    OnboardingApprovals
                                )
                                .where({

                                    dealer_ID:
                                        dealerId,

                                    approvalLevel:
                                        APPROVAL_LEVEL.L1,

                                    status:
                                        APPROVAL_STATUS.PENDING

                                })
                        );


                    if (!approval) {

                        return req.reject(
                            400,
                            "Pending L1 approval not found."
                        );

                    }


                    const approvedAt =
                        new Date().toISOString();


                    /* -----------------------------------------
                       Approve L1 record
                       ----------------------------------------- */

                    await tx.run(
                        UPDATE(
                            OnboardingApprovals
                        )
                            .set({

                                status:
                                    APPROVAL_STATUS.APPROVED,

                                approverUserId:
                                    req.user?.id ||
                                    "SYSTEM",

                                approverName:
                                    req.user?.attr?.name ||
                                    "System",

                                approvedAt

                            })
                            .where({

                                ID:
                                    approval.ID

                            })
                    );


                    /* -----------------------------------------
                       Update dealer lifecycle
                       ----------------------------------------- */

                    await runLifecycleDealerUpdate(
                        tx,
                        UPDATE(Dealers)
                            .set({

                                status:
                                    DEALER_STATUS.L1_APPROVED,

                                l1ApprovedAt:
                                    approvedAt

                            })
                            .where({

                                ID:
                                    dealerId

                            })
                    );


                    /* -----------------------------------------
                       Create L2 approval
                       ----------------------------------------- */

                    await createApproval(
                        tx,
                        {

                            dealerId,

                            approvalLevel:
                                APPROVAL_LEVEL.L2

                        }
                    );


                    /* -----------------------------------------
                       Status history
                       ----------------------------------------- */

                    await createStatusHistory(
                        tx,
                        {

                            dealerId,

                            previousStatus:
                                DEALER_STATUS.SUBMITTED,

                            newStatus:
                                DEALER_STATUS.L1_APPROVED,

                            changedBy:
                                req.user?.id ||
                                "SYSTEM",

                            changedByName:
                                req.user?.attr?.name ||
                                "System",

                            reason:
                                "L1 dealer onboarding approval completed."

                        }
                    );


                    /* -----------------------------------------
                       Outbox event
                       ----------------------------------------- */

                    await createOutboxEvent(
                        tx,
                        {

                            eventType:
                                "DEALER_L1_APPROVED",

                            dealerId,

                            payload: {

                                dealerId,

                                status:
                                    DEALER_STATUS.L1_APPROVED

                            }

                        }
                    );


                    return await getDealer(
                        tx,
                        dealerId
                    );

                } catch (error) {

                    return req.reject(
                        error.code ===
                            "DEALER_NOT_FOUND"
                            ? 404
                            : 400,

                        error.message
                    );

                }

            }
        );


        /* =====================================================
           L2 APPROVAL
           ===================================================== */

        this.on(
            "l2Approve",
            async (req) => {

                const {
                    dealerId
                } = req.data;

                try {

                    validateDealerId(
                        dealerId
                    );


                    const tx =
                        cds.tx(req);


                    const dealer =
                        await getDealer(
                            tx,
                            dealerId
                        );


                    /* -----------------------------------------
                       Lifecycle validation
                       ----------------------------------------- */

                    if (
                        dealer.status !==
                        DEALER_STATUS.L1_APPROVED
                    ) {

                        return req.reject(
                            400,
                            `Dealer cannot be L2 approved from status ${dealer.status}.`
                        );

                    }


                    /* -----------------------------------------
                       Find pending L2 approval
                       ----------------------------------------- */

                    const approval =
                        await tx.run(
                            SELECT.one
                                .from(
                                    OnboardingApprovals
                                )
                                .where({

                                    dealer_ID:
                                        dealerId,

                                    approvalLevel:
                                        APPROVAL_LEVEL.L2,

                                    status:
                                        APPROVAL_STATUS.PENDING

                                })
                        );


                    if (!approval) {

                        return req.reject(
                            400,
                            "Pending L2 approval not found."
                        );

                    }


                    const approvedAt =
                        new Date().toISOString();


                    /* -----------------------------------------
                       Approve L2 record
                       ----------------------------------------- */

                    await tx.run(
                        UPDATE(
                            OnboardingApprovals
                        )
                            .set({

                                status:
                                    APPROVAL_STATUS.APPROVED,

                                approverUserId:
                                    req.user?.id ||
                                    "SYSTEM",

                                approverName:
                                    req.user?.attr?.name ||
                                    "System",

                                approvedAt

                            })
                            .where({

                                ID:
                                    approval.ID

                            })
                    );


                    /* -----------------------------------------
                       Activate dealer
                       ----------------------------------------- */

                    await runLifecycleDealerUpdate(
                        tx,
                        UPDATE(Dealers)
                            .set({

                                status:
                                    DEALER_STATUS.ACTIVE,

                                activatedAt:
                                    approvedAt

                            })
                            .where({

                                ID:
                                    dealerId

                            })
                    );


                    /* -----------------------------------------
                       Status history
                       ----------------------------------------- */

                    await createStatusHistory(
                        tx,
                        {

                            dealerId,

                            previousStatus:
                                DEALER_STATUS.L1_APPROVED,

                            newStatus:
                                DEALER_STATUS.ACTIVE,

                            changedBy:
                                req.user?.id ||
                                "SYSTEM",

                            changedByName:
                                req.user?.attr?.name ||
                                "System",

                            reason:
                                "L2 dealer onboarding approval completed. Dealer activated."

                        }
                    );


                    /* -----------------------------------------
                       Outbox event
                       ----------------------------------------- */

                    await createOutboxEvent(
                        tx,
                        {

                            eventType:
                                "DEALER_ACTIVATED",

                            dealerId,

                            payload: {

                                dealerId,

                                status:
                                    DEALER_STATUS.ACTIVE

                            }

                        }
                    );


                    return await getDealer(
                        tx,
                        dealerId
                    );

                } catch (error) {

                    return req.reject(
                        error.code ===
                            "DEALER_NOT_FOUND"
                            ? 404
                            : 400,

                        error.message
                    );

                }

            }
        );


        /* =====================================================
           REJECT DEALER
           ===================================================== */

        this.on(
            "rejectDealer",
            async (req) => {

                const {
                    dealerId,
                    reason
                } = req.data;

                try {

                    validateDealerId(
                        dealerId
                    );


                    if (!reason) {

                        return req.reject(
                            400,
                            "Rejection reason is required."
                        );

                    }


                    const tx =
                        cds.tx(req);


                    const dealer =
                        await getDealer(
                            tx,
                            dealerId
                        );


                    const previousStatus =
                        dealer.status;


                    /* -----------------------------------------
                       Rejection rules
                       ----------------------------------------- */

                    if (
                        previousStatus ===
                            DEALER_STATUS.ACTIVE ||

                        previousStatus ===
                            DEALER_STATUS.BLOCKED
                    ) {

                        return req.reject(
                            400,
                            `Dealer cannot be rejected from status ${previousStatus}.`
                        );

                    }


                    const rejectedAt =
                        new Date().toISOString();


                    /* -----------------------------------------
                       Update dealer lifecycle
                       ----------------------------------------- */

                    await runLifecycleDealerUpdate(
                        tx,
                        UPDATE(Dealers)
                            .set({

                                status:
                                    DEALER_STATUS.REJECTED,

                                rejectedAt,

                                rejectionReason:
                                    reason

                            })
                            .where({

                                ID:
                                    dealerId

                            })
                    );


                    /* -----------------------------------------
                       Reject pending approvals
                       ----------------------------------------- */

                    await tx.run(
                        UPDATE(
                            OnboardingApprovals
                        )
                            .set({

                                status:
                                    APPROVAL_STATUS.REJECTED,

                                rejectedAt,

                                comments:
                                    reason

                            })
                            .where({

                                dealer_ID:
                                    dealerId,

                                status:
                                    APPROVAL_STATUS.PENDING

                            })
                    );


                    /* -----------------------------------------
                       Status history
                       ----------------------------------------- */

                    await createStatusHistory(
                        tx,
                        {

                            dealerId,

                            previousStatus,

                            newStatus:
                                DEALER_STATUS.REJECTED,

                            changedBy:
                                req.user?.id ||
                                "SYSTEM",

                            changedByName:
                                req.user?.attr?.name ||
                                "System",

                            reason

                        }
                    );


                    /* -----------------------------------------
                       Outbox event
                       ----------------------------------------- */

                    await createOutboxEvent(
                        tx,
                        {

                            eventType:
                                "DEALER_REJECTED",

                            dealerId,

                            payload: {

                                dealerId,

                                reason,

                                status:
                                    DEALER_STATUS.REJECTED

                            }

                        }
                    );


                    return await getDealer(
                        tx,
                        dealerId
                    );

                } catch (error) {

                    return req.reject(
                        error.code ===
                            "DEALER_NOT_FOUND"
                            ? 404
                            : 400,

                        error.message
                    );

                }

            }
        );


        /* =====================================================
           BLOCK DEALER
           ===================================================== */

        this.on(
            "blockDealer",
            async (req) => {

                const {
                    dealerId,
                    reason
                } = req.data;

                try {

                    validateDealerId(
                        dealerId
                    );


                    if (!reason) {

                        return req.reject(
                            400,
                            "Block reason is required."
                        );

                    }


                    const tx =
                        cds.tx(req);


                    const dealer =
                        await getDealer(
                            tx,
                            dealerId
                        );


                    /* -----------------------------------------
                       Block is allowed only from ACTIVE
                       ----------------------------------------- */

                    if (
                        dealer.status !==
                        DEALER_STATUS.ACTIVE
                    ) {

                        return req.reject(
                            400,
                            `Dealer can only be blocked from ACTIVE status. Current status: ${dealer.status}.`
                        );

                    }


                    const blockedAt =
                        new Date().toISOString();


                    /* -----------------------------------------
                       Update dealer lifecycle
                       ----------------------------------------- */

                    await runLifecycleDealerUpdate(
                        tx,
                        UPDATE(Dealers)
                            .set({

                                status:
                                    DEALER_STATUS.BLOCKED,

                                blockedAt,

                                blockReason:
                                    reason

                            })
                            .where({

                                ID:
                                    dealerId

                            })
                    );


                    /* -----------------------------------------
                       Status history
                       ----------------------------------------- */

                    await createStatusHistory(
                        tx,
                        {

                            dealerId,

                            previousStatus:
                                DEALER_STATUS.ACTIVE,

                            newStatus:
                                DEALER_STATUS.BLOCKED,

                            changedBy:
                                req.user?.id ||
                                "SYSTEM",

                            changedByName:
                                req.user?.attr?.name ||
                                "System",

                            reason

                        }
                    );


                    /* -----------------------------------------
                       Outbox event
                       ----------------------------------------- */

                    await createOutboxEvent(
                        tx,
                        {

                            eventType:
                                "DEALER_BLOCKED",

                            dealerId,

                            payload: {

                                dealerId,

                                reason,

                                status:
                                    DEALER_STATUS.BLOCKED

                            }

                        }
                    );


                    return await getDealer(
                        tx,
                        dealerId
                    );

                } catch (error) {

                    return req.reject(
                        error.code ===
                            "DEALER_NOT_FOUND"
                            ? 404
                            : 400,

                        error.message
                    );

                }

            }
        );


        /* =====================================================
           DEACTIVATE DEALER
           ===================================================== */

        this.on(
            "deactivateDealer",
            async (req) => {

                const {
                    dealerId,
                    reason
                } = req.data;

                try {

                    validateDealerId(
                        dealerId
                    );


                    if (!reason) {

                        return req.reject(
                            400,
                            "Deactivation reason is required."
                        );

                    }


                    const tx =
                        cds.tx(req);


                    const dealer =
                        await getDealer(
                            tx,
                            dealerId
                        );


                    /* -----------------------------------------
                       Deactivation allowed only from ACTIVE
                       ----------------------------------------- */

                    if (
                        dealer.status !==
                        DEALER_STATUS.ACTIVE
                    ) {

                        return req.reject(
                            400,
                            `Dealer can only be deactivated from ACTIVE status. Current status: ${dealer.status}.`
                        );

                    }


                    /* -----------------------------------------
                       Update dealer lifecycle
                       ----------------------------------------- */

                    await runLifecycleDealerUpdate(
                        tx,
                        UPDATE(Dealers)
                            .set({

                                status:
                                    DEALER_STATUS.INACTIVE

                            })
                            .where({

                                ID:
                                    dealerId

                            })
                    );


                    /* -----------------------------------------
                       Status history
                       ----------------------------------------- */

                    await createStatusHistory(
                        tx,
                        {

                            dealerId,

                            previousStatus:
                                DEALER_STATUS.ACTIVE,

                            newStatus:
                                DEALER_STATUS.INACTIVE,

                            changedBy:
                                req.user?.id ||
                                "SYSTEM",

                            changedByName:
                                req.user?.attr?.name ||
                                "System",

                            reason

                        }
                    );


                    /* -----------------------------------------
                       Outbox event
                       ----------------------------------------- */

                    await createOutboxEvent(
                        tx,
                        {

                            eventType:
                                "DEALER_DEACTIVATED",

                            dealerId,

                            payload: {

                                dealerId,

                                reason,

                                status:
                                    DEALER_STATUS.INACTIVE

                            }

                        }
                    );


                    return await getDealer(
                        tx,
                        dealerId
                    );

                } catch (error) {

                    return req.reject(
                        error.code ===
                            "DEALER_NOT_FOUND"
                            ? 404
                            : 400,

                        error.message
                    );

                }

            }
        );


        /* =====================================================
           REACTIVATE DEALER
           ===================================================== */

        this.on(
            "reactivateDealer",
            async (req) => {

                const {
                    dealerId
                } = req.data;

                try {

                    validateDealerId(
                        dealerId
                    );


                    const tx =
                        cds.tx(req);


                    const dealer =
                        await getDealer(
                            tx,
                            dealerId
                        );


                    /* -----------------------------------------
                       Reactivation allowed only from INACTIVE
                       ----------------------------------------- */

                    if (
                        dealer.status !==
                        DEALER_STATUS.INACTIVE
                    ) {

                        return req.reject(
                            400,
                            `Dealer can only be reactivated from INACTIVE status. Current status: ${dealer.status}.`
                        );

                    }


                    const activatedAt =
                        new Date().toISOString();


                    /* -----------------------------------------
                       Update dealer lifecycle
                       ----------------------------------------- */

                    await runLifecycleDealerUpdate(
                        tx,
                        UPDATE(Dealers)
                            .set({

                                status:
                                    DEALER_STATUS.ACTIVE,

                                activatedAt

                            })
                            .where({

                                ID:
                                    dealerId

                            })
                    );


                    /* -----------------------------------------
                       Status history
                       ----------------------------------------- */

                    await createStatusHistory(
                        tx,
                        {

                            dealerId,

                            previousStatus:
                                DEALER_STATUS.INACTIVE,

                            newStatus:
                                DEALER_STATUS.ACTIVE,

                            changedBy:
                                req.user?.id ||
                                "SYSTEM",

                            changedByName:
                                req.user?.attr?.name ||
                                "System",

                            reason:
                                "Dealer reactivated"

                        }
                    );


                    /* -----------------------------------------
                       Outbox event
                       ----------------------------------------- */

                    await createOutboxEvent(
                        tx,
                        {

                            eventType:
                                "DEALER_REACTIVATED",

                            dealerId,

                            payload: {

                                dealerId,

                                status:
                                    DEALER_STATUS.ACTIVE

                            }

                        }
                    );


                    return await getDealer(
                        tx,
                        dealerId
                    );

                } catch (error) {

                    return req.reject(
                        error.code ===
                            "DEALER_NOT_FOUND"
                            ? 404
                            : 400,

                        error.message
                    );

                }

            }
        );


        /* =====================================================
           UNBLOCK DEALER
           ===================================================== */

        this.on(
            "unblockDealer",
            async (req) => {

                const {
                    dealerId
                } = req.data;

                try {

                    validateDealerId(
                        dealerId
                    );


                    const tx =
                        cds.tx(req);


                    const dealer =
                        await getDealer(
                            tx,
                            dealerId
                        );


                    /* -----------------------------------------
                       Unblock allowed only from BLOCKED
                       ----------------------------------------- */

                    if (
                        dealer.status !==
                        DEALER_STATUS.BLOCKED
                    ) {

                        return req.reject(
                            400,
                            `Dealer can only be unblocked from BLOCKED status. Current status: ${dealer.status}.`
                        );

                    }


                    const activatedAt =
                        new Date().toISOString();


                    /* -----------------------------------------
                       Update dealer lifecycle
                       ----------------------------------------- */

                    await runLifecycleDealerUpdate(
                        tx,
                        UPDATE(Dealers)
                            .set({

                                status:
                                    DEALER_STATUS.ACTIVE,

                                activatedAt,

                                blockedAt:
                                    null,

                                blockReason:
                                    null

                            })
                            .where({

                                ID:
                                    dealerId

                            })
                    );


                    /* -----------------------------------------
                       Status history
                       ----------------------------------------- */

                    await createStatusHistory(
                        tx,
                        {

                            dealerId,

                            previousStatus:
                                DEALER_STATUS.BLOCKED,

                            newStatus:
                                DEALER_STATUS.ACTIVE,

                            changedBy:
                                req.user?.id ||
                                "SYSTEM",

                            changedByName:
                                req.user?.attr?.name ||
                                "System",

                            reason:
                                "Dealer unblocked"

                        }
                    );


                    /* -----------------------------------------
                       Outbox event
                       ----------------------------------------- */

                    await createOutboxEvent(
                        tx,
                        {

                            eventType:
                                "DEALER_UNBLOCKED",

                            dealerId,

                            payload: {

                                dealerId,

                                status:
                                    DEALER_STATUS.ACTIVE

                            }

                        }
                    );


                    return await getDealer(
                        tx,
                        dealerId
                    );

                } catch (error) {

                    return req.reject(
                        error.code ===
                            "DEALER_NOT_FOUND"
                            ? 404
                            : 400,

                        error.message
                    );

                }

            }
        );

    });

