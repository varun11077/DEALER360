const cds = require("@sap/cds");

const {
    SELECT,
    UPDATE,
    INSERT
} = cds.ql;


/* =========================================================
   CONSTANTS
   ========================================================= */

const CREDIT_TRANSACTION_TYPE = {
    CREDIT: "CREDIT",
    DEBIT: "DEBIT",
    RELEASE: "RELEASE",
    ADJUSTMENT: "ADJUSTMENT"
};

const CREDIT_TRANSACTION_STATUS = {
    POSTED: "POSTED",
    PENDING: "PENDING",
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

function validateAmount(amount) {
    if (amount === undefined || amount === null) {
        throw new Error("Amount is required.");
    }

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount)) {
        throw new Error("Amount must be a valid number.");
    }

    if (numericAmount <= 0) {
        throw new Error("Amount must be greater than zero.");
    }

    return numericAmount;
}


/* =========================================================
   NORMALIZATION
   ========================================================= */

function toNumber(value) {
    if (value === undefined || value === null) {
        return 0;
    }

    return Number(value);
}


/* =========================================================
   GET DEALER CREDIT
   ========================================================= */

async function getDealerCredit(tx, dealerId) {

    validateDealerId(dealerId);

    const credit = await tx.run(
        SELECT.one
            .from("dealer360.DealerCredits")
            .where({ dealer_ID: dealerId })
    );

    if (!credit) {
        throw new Error(
            `No credit facility found for dealer ${dealerId}.`
        );
    }

    return credit;
}


/* =========================================================
   GET DEALER
   ========================================================= */

async function getDealer(tx, dealerId) {

    validateDealerId(dealerId);

    const dealer = await tx.run(
        SELECT.one
            .from("dealer360.Dealers")
            .where({ ID: dealerId })
    );

    if (!dealer) {
        throw new Error(
            `Dealer ${dealerId} does not exist.`
        );
    }

    return dealer;
}


/* =========================================================
   CALCULATE AVAILABLE CREDIT
   ---------------------------------------------------------
   This is the authoritative calculation.

       available = limit - used
   ========================================================= */

function calculateAvailableCredit(creditLimit, usedCredit) {

    const limit = toNumber(creditLimit);
    const used = toNumber(usedCredit);

    return Math.max(0, limit - used);
}


/* =========================================================
   BUILD CREDIT RESULT
   ========================================================= */

function buildCreditResult(
    credit,
    dealerId,
    requiredAmount,
    allowed,
    reason
) {

    const creditLimit = toNumber(credit.creditLimit);
    const usedCredit = toNumber(credit.usedCredit);

    const availableCredit =
        calculateAvailableCredit(
            creditLimit,
            usedCredit
        );

    const remainingCredit =
        Math.max(
            0,
            availableCredit - requiredAmount
        );

    return {
        allowed,
        dealerId,
        creditLimit,
        usedCredit,
        availableCredit,
        requiredAmount,
        remainingCredit,
        currency: credit.currency || "INR",
        reason
    };
}


/* =========================================================
   CHECK CREDIT
   ---------------------------------------------------------
   This method DOES NOT change credit.

   It only answers:

       Can dealer consume this amount?
   ========================================================= */

async function checkCredit(
    tx,
    dealerId,
    amount
) {

    const requiredAmount =
        validateAmount(amount);

    await getDealer(tx, dealerId);

    const credit =
        await getDealerCredit(
            tx,
            dealerId
        );

    const creditLimit =
        toNumber(credit.creditLimit);

    const usedCredit =
        toNumber(credit.usedCredit);

    const availableCredit =
        calculateAvailableCredit(
            creditLimit,
            usedCredit
        );


    /* =====================================================
       BLOCK CHECK
       ===================================================== */

    if (credit.isBlocked) {

        return buildCreditResult(
            credit,
            dealerId,
            requiredAmount,
            false,
            credit.blockedReason ||
            "Dealer credit is blocked."
        );
    }


    /* =====================================================
       CREDIT LIMIT CHECK
       ===================================================== */

    if (requiredAmount > availableCredit) {

        return buildCreditResult(
            credit,
            dealerId,
            requiredAmount,
            false,
            "Insufficient available credit."
        );
    }


    /* =====================================================
       SUCCESS
       ===================================================== */

    return buildCreditResult(
        credit,
        dealerId,
        requiredAmount,
        true,
        "Credit is available."
    );
}


/* =========================================================
   CREATE CREDIT TRANSACTION
   ========================================================= */

async function createCreditTransaction(
    tx,
    {
        dealerId,
        transactionType,
        amount,
        referenceType,
        referenceId,
        description,
        postedBy
    }
) {

    const now = new Date();

    const transaction = {
        dealer_ID: dealerId,

        transactionType,

        transactionStatus:
            CREDIT_TRANSACTION_STATUS.POSTED,

        amount,

        currency: "INR",

        referenceType,

        referenceId,

        description,

        transactionDate: now,

        postedAt: now,

        postedBy
    };

    await tx.run(
        INSERT.into("dealer360.CreditTransactions")
            .entries(transaction)
    );

    return transaction;
}


/* =========================================================
   ALLOCATE CREDIT
   ---------------------------------------------------------
   Business operation:

       1. Check credit
       2. Increase usedCredit
       3. Recalculate availableCredit
       4. Create DEBIT transaction

   Example:

       Limit       = 100,000
       Used        = 0
       PO Amount   = 85,500

       New Used    = 85,500
       Available   = 14,500
   ========================================================= */


/* =========================================================
   GUARDED CREDIT UPDATE
   ---------------------------------------------------------
   usedCredit is read, changed and written back. Two requests
   doing that at the same time would overwrite each other
   (lost update) and the dealer could exceed the credit limit.

   The UPDATE therefore only succeeds if usedCredit is still
   the value that was read. If another request got there
   first, nothing is written and the caller gets a 409 and
   can simply retry.
   ========================================================= */

async function updateCreditGuarded(
    tx,
    credit,
    newUsedCredit,
    newAvailableCredit
) {

    const affected =
        await tx.run(
            UPDATE("dealer360.DealerCredits")
                .set({
                    usedCredit: newUsedCredit,
                    availableCredit: newAvailableCredit
                })
                .where({
                    ID: credit.ID,
                    usedCredit: credit.usedCredit
                })
        );

    if (!affected) {

        const error =
            new Error(
                "The dealer's credit was changed by another request. Please retry."
            );

        error.code = "CREDIT_CONFLICT";

        error.statusCode = 409;

        throw error;
    }
}

async function allocateCredit(
    tx,
    {
        dealerId,
        amount,
        referenceType,
        referenceId,
        description,
        postedBy
    }
) {

    const allocationAmount =
        validateAmount(amount);


    const check =
        await checkCredit(
            tx,
            dealerId,
            allocationAmount
        );


    if (!check.allowed) {
        throw new Error(check.reason);
    }


    const credit =
        await getDealerCredit(
            tx,
            dealerId
        );


    const currentUsed =
        toNumber(credit.usedCredit);

    const creditLimit =
        toNumber(credit.creditLimit);


    const newUsedCredit =
        currentUsed + allocationAmount;


    if (newUsedCredit > creditLimit) {
        throw new Error(
            "Credit allocation exceeds the dealer credit limit."
        );
    }


    const newAvailableCredit =
        calculateAvailableCredit(
            creditLimit,
            newUsedCredit
        );


    await updateCreditGuarded(
        tx,
        credit,
        newUsedCredit,
        newAvailableCredit
    );


    await createCreditTransaction(
        tx,
        {
            dealerId,

            transactionType:
                CREDIT_TRANSACTION_TYPE.DEBIT,

            amount: allocationAmount,

            referenceType,

            referenceId,

            description:
                description ||
                "Credit allocated.",

            postedBy
        }
    );


    return {
        allowed: true,

        dealerId,

        creditLimit,

        usedCredit: newUsedCredit,

        availableCredit: newAvailableCredit,

        requiredAmount: allocationAmount,

        remainingCredit: newAvailableCredit,

        currency: credit.currency || "INR",

        reason: "Credit allocated successfully."
    };
}


/* =========================================================
   RELEASE CREDIT
   ---------------------------------------------------------
   Releases previously allocated credit.

       usedCredit -= amount
   ========================================================= */

async function releaseCredit(
    tx,
    {
        dealerId,
        amount,
        referenceType,
        referenceId,
        description,
        postedBy
    }
) {

    const releaseAmount =
        validateAmount(amount);


    await getDealer(tx, dealerId);


    const credit =
        await getDealerCredit(
            tx,
            dealerId
        );


    const currentUsed =
        toNumber(credit.usedCredit);

    const creditLimit =
        toNumber(credit.creditLimit);


    if (releaseAmount > currentUsed) {
        throw new Error(
            "Release amount cannot be greater than used credit."
        );
    }


    const newUsedCredit =
        currentUsed - releaseAmount;


    const newAvailableCredit =
        calculateAvailableCredit(
            creditLimit,
            newUsedCredit
        );


    await updateCreditGuarded(
        tx,
        credit,
        newUsedCredit,
        newAvailableCredit
    );


    await createCreditTransaction(
        tx,
        {
            dealerId,

            transactionType:
                CREDIT_TRANSACTION_TYPE.RELEASE,

            amount: releaseAmount,

            referenceType,

            referenceId,

            description:
                description ||
                "Credit released.",

            postedBy
        }
    );


    return {
        allowed: true,

        dealerId,

        creditLimit,

        usedCredit: newUsedCredit,

        availableCredit: newAvailableCredit,

        requiredAmount: releaseAmount,

        remainingCredit: newAvailableCredit,

        currency: credit.currency || "INR",

        reason: "Credit released successfully."
    };
}


/* =========================================================
   BLOCK CREDIT
   ========================================================= */


/* =========================================================
   RELEASE CREDIT FOR A REFERENCE (idempotent)
   ---------------------------------------------------------
   Releases whatever is still allocated for one business
   object, e.g. a purchase order:

       still allocated = sum(DEBIT) - sum(RELEASE)

   Used when an order or fulfillment is cancelled. Calling it
   twice releases nothing the second time, so a cancel can
   never give the dealer more credit than was ever allocated.
   ========================================================= */

async function releaseCreditForReference(
    tx,
    {
        dealerId,
        referenceType,
        referenceId,
        description,
        postedBy
    }
) {

    validateDealerId(dealerId);

    const rows =
        await tx.run(
            SELECT.from("dealer360.CreditTransactions")
                .columns("transactionType", "amount")
                .where({
                    dealer_ID: dealerId,
                    referenceType,
                    referenceId: String(referenceId),
                    transactionStatus:
                        CREDIT_TRANSACTION_STATUS.POSTED
                })
        );

    let allocated = 0;

    for (const row of rows || []) {

        if (row.transactionType === CREDIT_TRANSACTION_TYPE.DEBIT) {
            allocated += toNumber(row.amount);
        }

        if (row.transactionType === CREDIT_TRANSACTION_TYPE.RELEASE) {
            allocated -= toNumber(row.amount);
        }
    }

    allocated = Math.round(allocated * 100) / 100;

    if (allocated <= 0) {
        return { released: 0 };
    }

    await releaseCredit(
        tx,
        {
            dealerId,
            amount: allocated,
            referenceType,
            referenceId: String(referenceId),
            description:
                description ||
                "Credit released.",
            postedBy
        }
    );

    return { released: allocated };
}

async function blockCredit(
    tx,
    dealerId,
    reason
) {

    validateDealerId(dealerId);


    if (!reason || !reason.trim()) {
        throw new Error(
            "Credit block reason is required."
        );
    }


    const credit =
        await getDealerCredit(
            tx,
            dealerId
        );


    await tx.run(
        UPDATE("dealer360.DealerCredits")
            .set({
                isBlocked: true,
                blockedReason: reason
            })
            .where({ ID: credit.ID })
    );


    return {
        ...credit,
        isBlocked: true,
        blockedReason: reason
    };
}


/* =========================================================
   UNBLOCK CREDIT
   ========================================================= */

async function unblockCredit(
    tx,
    dealerId
) {

    validateDealerId(dealerId);


    const credit =
        await getDealerCredit(
            tx,
            dealerId
        );


    await tx.run(
        UPDATE("dealer360.DealerCredits")
            .set({
                isBlocked: false,
                blockedReason: null
            })
            .where({ ID: credit.ID })
    );


    return {
        ...credit,
        isBlocked: false,
        blockedReason: null
    };
}


/* =========================================================
   EXPORTS
   ========================================================= */

module.exports = {
    checkCredit,
    allocateCredit,
    releaseCredit,
    releaseCreditForReference,
    updateCreditGuarded,
    blockCredit,
    unblockCredit,

    getDealerCredit,
    getDealer,

    calculateAvailableCredit
};