const cds = require("@sap/cds");

const {
    SELECT,
    UPDATE
} = cds.ql;

const {
    checkCredit,
    allocateCredit,
    releaseCredit,
    blockCredit,
    unblockCredit
} = require("./lib/credit-manager");


/* =========================================================
   CREDIT SERVICE
   ========================================================= */

module.exports = cds.service.impl(function () {

    /* =====================================================
       CREATE CREDIT
       -----------------------------------------------------
       Business rules:

       - usedCredit is always 0 when a facility is created
       - availableCredit starts equal to creditLimit
       - client must not provide usedCredit
       ===================================================== */

    this.before("CREATE", "DealerCredits", async (req) => {

        if (
            req.data.usedCredit !== undefined &&
            req.data.usedCredit !== null
        ) {
            return req.reject(
                400,
                "usedCredit cannot be provided when creating credit."
            );
        }

        const creditLimit = Number(req.data.creditLimit);

        if (
            req.data.creditLimit === undefined ||
            req.data.creditLimit === null ||
            !Number.isFinite(creditLimit) ||
            creditLimit < 0
        ) {
            return req.reject(
                400,
                "creditLimit must be a valid non-negative number."
            );
        }

        req.data.usedCredit = 0;
        req.data.availableCredit = creditLimit;

        if (!req.data.currency) {
            req.data.currency = "INR";
        }
    });


    /* =====================================================
       UPDATE CREDIT
       -----------------------------------------------------
       Client may change creditLimit.

       Client may NOT directly change:
       - usedCredit
       - availableCredit
       - block fields

       availableCredit is recalculated automatically.
       ===================================================== */

    this.before("UPDATE", "DealerCredits", async (req) => {

        const data = req.data || {};

        if (
            data.usedCredit !== undefined ||
            data.availableCredit !== undefined
        ) {
            return req.reject(
                400,
                "usedCredit and availableCredit can only be changed through business actions."
            );
        }

        if (
            data.isBlocked !== undefined ||
            data.blockedReason !== undefined
        ) {
            return req.reject(
                400,
                "Credit block fields can only be changed through business actions."
            );
        }

        if (data.creditLimit === undefined) {
            return;
        }

        const creditId =
            req.params?.[0]?.ID ||
            req.data?.ID;

        if (!creditId) {
            return req.reject(
                400,
                "Credit ID is required."
            );
        }

        const credit =
            await cds.tx(req).run(
                SELECT.one
                    .from("dealer360.DealerCredits")
                    .where({ ID: creditId })
            );

        if (!credit) {
            return req.reject(
                404,
                "Credit facility not found."
            );
        }

        const creditLimit =
            Number(data.creditLimit);

        const usedCredit =
            Number(credit.usedCredit || 0);

        if (
            !Number.isFinite(creditLimit) ||
            creditLimit < 0
        ) {
            return req.reject(
                400,
                "creditLimit must be a valid non-negative number."
            );
        }

        if (creditLimit < usedCredit) {
            return req.reject(
                400,
                "Credit limit cannot be less than used credit."
            );
        }

        data.availableCredit =
            creditLimit - usedCredit;
    });


    /* =====================================================
       CREDIT CHECK
       ===================================================== */

    this.on("checkCredit", async (req) => {

        const {
            dealerId,
            amount
        } = req.data;

        try {

            return await checkCredit(
                cds.tx(req),
                dealerId,
                amount
            );

        } catch (error) {

            req.error(
                400,
                error.message
            );
        }
    });


    /* =====================================================
       ALLOCATE CREDIT
       ===================================================== */

    this.on("allocateCredit", async (req) => {

        const {
            dealerId,
            amount,
            referenceType,
            referenceId,
            description
        } = req.data;

        try {

            return await allocateCredit(
                cds.tx(req),
                {
                    dealerId,
                    amount,
                    referenceType,
                    referenceId,
                    description,
                    postedBy:
                        req.user?.id || "SYSTEM"
                }
            );

        } catch (error) {

            req.error(
                400,
                error.message
            );
        }
    });


    /* =====================================================
       RELEASE CREDIT
       ===================================================== */

    this.on("releaseCredit", async (req) => {

        const {
            dealerId,
            amount,
            referenceType,
            referenceId,
            description
        } = req.data;

        try {

            return await releaseCredit(
                cds.tx(req),
                {
                    dealerId,
                    amount,
                    referenceType,
                    referenceId,
                    description,
                    postedBy:
                        req.user?.id || "SYSTEM"
                }
            );

        } catch (error) {

            req.error(
                400,
                error.message
            );
        }
    });


    /* =====================================================
       BLOCK CREDIT
       ===================================================== */

    this.on("blockCredit", async (req) => {

        const {
            dealerId,
            reason
        } = req.data;

        try {

            return await blockCredit(
                cds.tx(req),
                dealerId,
                reason
            );

        } catch (error) {

            req.error(
                400,
                error.message
            );
        }
    });


    /* =====================================================
       UNBLOCK CREDIT
       ===================================================== */

    this.on("unblockCredit", async (req) => {

        const {
            dealerId
        } = req.data;

        try {

            return await unblockCredit(
                cds.tx(req),
                dealerId
            );

        } catch (error) {

            req.error(
                400,
                error.message
            );
        }
    });

});
