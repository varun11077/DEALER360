
const cds = require("@sap/cds");

const {
    SELECT,
    INSERT
} = cds.ql;

const {
    ProductPrices,
    DealerPrices,
    QuantityPriceSlabs,
    PriceHistory,
    Products,
    Dealers
} = cds.entities("dealer360");


/* =========================================================
   CONSTANTS
   ========================================================= */

const PRICE_STATUS = {
    ACTIVE: "ACTIVE",
    INACTIVE: "INACTIVE",
    EXPIRED: "EXPIRED"
};


/* =========================================================
   BASIC UTILITIES
   ========================================================= */

function getToday() {
    return new Date().toISOString().slice(0, 10);
}


function normalizeCurrency(currency) {
    return currency
        ? String(currency).trim().toUpperCase()
        : "INR";
}


function validatePrice(price) {

    if (
        price === undefined ||
        price === null ||
        price === ""
    ) {
        return "Price is mandatory.";
    }

    const value = Number(price);

    if (!Number.isFinite(value)) {
        return "Price must be a valid number.";
    }

    if (value < 0) {
        return "Price cannot be negative.";
    }

    return null;
}


function validateDiscount(discount) {

    if (
        discount === undefined ||
        discount === null ||
        discount === ""
    ) {
        return null;
    }

    const value = Number(discount);

    if (!Number.isFinite(value)) {
        return "Discount percentage must be a valid number.";
    }

    if (value < 0 || value > 100) {
        return "Discount percentage must be between 0 and 100.";
    }

    return null;
}


function validateQuantity(quantity) {

    if (
        quantity === undefined ||
        quantity === null ||
        quantity === ""
    ) {
        return "Quantity is mandatory.";
    }

    const value = Number(quantity);

    if (!Number.isFinite(value)) {
        return "Quantity must be a valid number.";
    }

    if (value <= 0) {
        return "Quantity must be greater than zero.";
    }

    return null;
}


function validateDateRange(validFrom, validTo) {

    if (!validFrom) {
        return "Valid From date is mandatory.";
    }

    if (
        validTo &&
        new Date(validTo) < new Date(validFrom)
    ) {
        return "Valid To cannot be earlier than Valid From.";
    }

    return null;
}


function isPriceCurrentlyValid(
    priceRecord,
    today = getToday()
) {

    if (!priceRecord) {
        return false;
    }

    if (priceRecord.status !== PRICE_STATUS.ACTIVE) {
        return false;
    }

    if (
        priceRecord.validFrom &&
        priceRecord.validFrom > today
    ) {
        return false;
    }

    if (
        priceRecord.validTo &&
        priceRecord.validTo < today
    ) {
        return false;
    }

    return true;
}


function calculateDiscountedPrice(
    price,
    discountPercentage
) {

    const basePrice = Number(price);
    const discount = Number(discountPercentage || 0);

    return Number(
        (
            basePrice -
            (basePrice * discount / 100)
        ).toFixed(2)
    );
}


/* =========================================================
   DATE OVERLAP HELPER
   =========================================================

   Two validity periods overlap when:

       existing.validFrom <= new.validTo
       AND
       existing.validTo >= new.validFrom

   An open-ended validity period is treated as extending
   indefinitely into the future.
   ========================================================= */

function datesOverlap(
    existingFrom,
    existingTo,
    newFrom,
    newTo
) {

    const existingStart =
        new Date(existingFrom);

    const existingEnd =
        existingTo
            ? new Date(existingTo)
            : new Date("9999-12-31");

    const newStart =
        new Date(newFrom);

    const newEnd =
        newTo
            ? new Date(newTo)
            : new Date("9999-12-31");

    return (
        existingStart <= newEnd &&
        existingEnd >= newStart
    );
}


/* =========================================================
   MASTER DATA HELPERS
   ========================================================= */

async function getProduct(
    tx,
    productId
) {

    if (!productId) {
        return null;
    }

    return tx.run(
        SELECT.one
            .from(Products)
            .where({
                ID: productId
            })
    );
}


async function getDealer(
    tx,
    dealerId
) {

    if (!dealerId) {
        return null;
    }

    return tx.run(
        SELECT.one
            .from(Dealers)
            .where({
                ID: dealerId
            })
    );
}


/* =========================================================
   PRODUCT PRICE HELPERS
   ========================================================= */

async function findProductPrice(
    tx,
    productId
) {

    const today = getToday();

    const prices = await tx.run(
        SELECT
            .from(ProductPrices)
            .where({
                product_ID: productId,
                status: PRICE_STATUS.ACTIVE
            })
            .orderBy({
                validFrom: "desc"
            })
    );

    return prices.find(price =>
        isPriceCurrentlyValid(
            price,
            today
        )
    );
}


async function getProductPriceById(
    tx,
    priceId
) {

    return tx.run(
        SELECT.one
            .from(ProductPrices)
            .where({
                ID: priceId
            })
    );
}


/* =========================================================
   PRODUCT PRICE OVERLAP VALIDATION
   ========================================================= */

async function hasProductPriceOverlap(
    tx,
    productId,
    validFrom,
    validTo,
    excludeId = null
) {

    const existingPrices = await tx.run(
        SELECT
            .from(ProductPrices)
            .where({
                product_ID: productId
            })
    );

    return existingPrices.some(existing => {

        if (
            excludeId &&
            existing.ID === excludeId
        ) {
            return false;
        }

        /*
         * Only ACTIVE prices participate in the
         * overlapping-price rule.
         */
        if (
            existing.status !==
            PRICE_STATUS.ACTIVE
        ) {
            return false;
        }

        return datesOverlap(
            existing.validFrom,
            existing.validTo,
            validFrom,
            validTo
        );
    });
}


/* =========================================================
   DEALER PRICE HELPERS
   ========================================================= */

async function findDealerPrice(
    tx,
    dealerId,
    productId
) {

    const today = getToday();

    const prices = await tx.run(
        SELECT
            .from(DealerPrices)
            .where({
                dealer_ID: dealerId,
                product_ID: productId,
                status: PRICE_STATUS.ACTIVE
            })
            .orderBy({
                validFrom: "desc"
            })
    );

    return prices.find(price =>
        isPriceCurrentlyValid(
            price,
            today
        )
    );
}


async function getDealerPriceById(
    tx,
    priceId
) {

    return tx.run(
        SELECT.one
            .from(DealerPrices)
            .where({
                ID: priceId
            })
    );
}


/* =========================================================
   DEALER PRICE OVERLAP VALIDATION
   ========================================================= */

async function hasDealerPriceOverlap(
    tx,
    dealerId,
    productId,
    validFrom,
    validTo,
    excludeId = null
) {

    const existingPrices = await tx.run(
        SELECT
            .from(DealerPrices)
            .where({
                dealer_ID: dealerId,
                product_ID: productId
            })
    );

    return existingPrices.some(existing => {

        if (
            excludeId &&
            existing.ID === excludeId
        ) {
            return false;
        }

        if (
            existing.status !==
            PRICE_STATUS.ACTIVE
        ) {
            return false;
        }

        return datesOverlap(
            existing.validFrom,
            existing.validTo,
            validFrom,
            validTo
        );
    });
}


/* =========================================================
   QUANTITY SLAB HELPERS
   ========================================================= */

async function findQuantityPriceSlab(
    tx,
    dealerId,
    productId,
    quantity
) {

    const today = getToday();

    /*
     * -----------------------------------------------------
     * 1. Dealer-specific slabs
     * -----------------------------------------------------
     */

    const dealerSlabs = await tx.run(
        SELECT
            .from(QuantityPriceSlabs)
            .where({
                dealer_ID: dealerId,
                product_ID: productId,
                status: PRICE_STATUS.ACTIVE
            })
            .orderBy({
                minQuantity: "desc"
            })
    );

    const validDealerSlab =
        dealerSlabs.find(slab => {

            if (
                !isPriceCurrentlyValid(
                    slab,
                    today
                )
            ) {
                return false;
            }

            const min =
                Number(slab.minQuantity);

            const max =
                slab.maxQuantity === null ||
                slab.maxQuantity === undefined
                    ? null
                    : Number(slab.maxQuantity);

            const qty =
                Number(quantity);

            if (qty < min) {
                return false;
            }

            if (
                max !== null &&
                qty > max
            ) {
                return false;
            }

            return true;
        });

    if (validDealerSlab) {
        return validDealerSlab;
    }


    /*
     * -----------------------------------------------------
     * 2. Product-level slabs
     * -----------------------------------------------------
     */

    const productSlabs = await tx.run(
        SELECT
            .from(QuantityPriceSlabs)
            .where({
                product_ID: productId,
                status: PRICE_STATUS.ACTIVE
            })
            .orderBy({
                minQuantity: "desc"
            })
    );

    return productSlabs.find(slab => {

        if (
            !isPriceCurrentlyValid(
                slab,
                today
            )
        ) {
            return false;
        }

        const min =
            Number(slab.minQuantity);

        const max =
            slab.maxQuantity === null ||
            slab.maxQuantity === undefined
                ? null
                : Number(slab.maxQuantity);

        const qty =
            Number(quantity);

        if (qty < min) {
            return false;
        }

        if (
            max !== null &&
            qty > max
        ) {
            return false;
        }

        return true;
    });
}


async function getQuantitySlabById(
    tx,
    slabId
) {

    return tx.run(
        SELECT.one
            .from(QuantityPriceSlabs)
            .where({
                ID: slabId
            })
    );
}


/* =========================================================
   QUANTITY SLAB OVERLAP VALIDATION
   =========================================================

   Quantity slabs cannot overlap when they belong to the
   same pricing scope.

   Scope 1:
       dealer + product

   Scope 2:
       product-level slab where dealer is NULL
   ========================================================= */

async function hasQuantitySlabOverlap(
    tx,
    dealerId,
    productId,
    minQuantity,
    maxQuantity,
    validFrom,
    validTo,
    excludeId = null
) {

    const existingSlabs = await tx.run(
        SELECT
            .from(QuantityPriceSlabs)
            .where({
                product_ID: productId
            })
    );

    const newMin =
        Number(minQuantity);

    const newMax =
        maxQuantity === null ||
        maxQuantity === undefined
            ? null
            : Number(maxQuantity);

    return existingSlabs.some(existing => {

        if (
            excludeId &&
            existing.ID === excludeId
        ) {
            return false;
        }

        if (
            existing.status !==
            PRICE_STATUS.ACTIVE
        ) {
            return false;
        }

        /*
         * Dealer-specific slabs only overlap with
         * another slab for the same dealer.
         *
         * Product-level slabs only overlap with
         * another product-level slab.
         */
        const existingDealer =
            existing.dealer_ID || null;

        const newDealer =
            dealerId || null;

        if (
            existingDealer !==
            newDealer
        ) {
            return false;
        }

        /*
         * First check date validity.
         */
        if (
            !datesOverlap(
                existing.validFrom,
                existing.validTo,
                validFrom,
                validTo
            )
        ) {
            return false;
        }

        const existingMin =
            Number(existing.minQuantity);

        const existingMax =
            existing.maxQuantity === null ||
            existing.maxQuantity === undefined
                ? null
                : Number(existing.maxQuantity);

        /*
         * Open-ended quantity range:
         *
         * 100 -> infinity
         *
         * Therefore:
         *
         * ranges overlap when:
         *
         * existingMin <= newMax
         * AND
         * existingMax >= newMin
         */

        const effectiveExistingMax =
            existingMax === null
                ? Infinity
                : existingMax;

        const effectiveNewMax =
            newMax === null
                ? Infinity
                : newMax;

        return (
            existingMin <= effectiveNewMax &&
            effectiveExistingMax >= newMin
        );
    });
}


/* =========================================================
   PRICE HISTORY
   ========================================================= */

async function insertPriceHistory(
    tx,
    {
        dealerId,
        productId,
        priceType,
        previousPrice,
        newPrice,
        currency,
        previousDiscountPercentage,
        newDiscountPercentage,
        reason,
        changedByUserId
    }
) {

    await tx.run(
        INSERT.into(PriceHistory).entries({

            dealer_ID:
                dealerId || null,

            product_ID:
                productId,

            priceType,

            previousPrice:
                previousPrice !== undefined
                    ? previousPrice
                    : null,

            newPrice:
                newPrice !== undefined
                    ? newPrice
                    : null,

            currency:
                normalizeCurrency(currency),

            previousDiscountPercentage:
                previousDiscountPercentage !== undefined
                    ? previousDiscountPercentage
                    : null,

            newDiscountPercentage:
                newDiscountPercentage !== undefined
                    ? newDiscountPercentage
                    : null,

            changedAt:
                new Date(),

            changedByUserId:
                changedByUserId ||
                "SYSTEM",

            reason:
                reason ||
                "Price changed."
        })
    );
}


/* =========================================================
   SERVICE IMPLEMENTATION
   ========================================================= */

module.exports = cds.service.impl(function () {


    /* =====================================================
       PRODUCT PRICE
       CREATE
       ===================================================== */

    this.before(
        "CREATE",
        "ProductPrices",
        async (req) => {

            const data = req.data;
            const tx = cds.tx(req);


            /*
             * Product validation
             */

            if (!data.product_ID) {
                return req.reject(
                    400,
                    "Product is mandatory."
                );
            }

            const product =
                await getProduct(
                    tx,
                    data.product_ID
                );

            if (!product) {
                return req.reject(
                    400,
                    "Product does not exist."
                );
            }


            /*
             * Price validation
             */

            const priceError =
                validatePrice(data.price);

            if (priceError) {
                return req.reject(
                    400,
                    priceError
                );
            }


            /*
             * Date validation
             */

            const dateError =
                validateDateRange(
                    data.validFrom,
                    data.validTo
                );

            if (dateError) {
                return req.reject(
                    400,
                    dateError
                );
            }


            /*
             * Default values
             */

            data.currency =
                normalizeCurrency(
                    data.currency
                );

            if (!data.status) {
                data.status =
                    PRICE_STATUS.ACTIVE;
            }


            /*
             * Overlap validation only applies
             * to ACTIVE prices.
             */

            if (
                data.status ===
                PRICE_STATUS.ACTIVE
            ) {

                const overlap =
                    await hasProductPriceOverlap(
                        tx,
                        data.product_ID,
                        data.validFrom,
                        data.validTo
                    );

                if (overlap) {
                    return req.reject(
                        409,
                        "An active product price already exists for an overlapping validity period."
                    );
                }
            }
        }
    );


    /* =====================================================
       PRODUCT PRICE
       AFTER CREATE
       ===================================================== */

    this.after(
        "CREATE",
        "ProductPrices",
        async (data, req) => {

            const tx = cds.tx(req);

            await insertPriceHistory(
                tx,
                {
                    productId:
                        data.product_ID,

                    priceType:
                        "PRODUCT",

                    previousPrice:
                        null,

                    newPrice:
                        data.price,

                    currency:
                        data.currency,

                    reason:
                        "Initial product price created.",

                    changedByUserId:
                        req.user?.id ||
                        "SYSTEM"
                }
            );
        }
    );


    /* =====================================================
       PRODUCT PRICE
       BEFORE UPDATE
       ===================================================== */

    this.before(
        "UPDATE",
        "ProductPrices",
        async (req) => {

            const tx = cds.tx(req);

            const id =
                req.data.ID ||
                req.params?.[0]?.ID;

            if (!id) {
                return req.reject(
                    400,
                    "Product price ID is required."
                );
            }


            /*
             * Capture OLD record before UPDATE.
             *
             * This is important for correct
             * PriceHistory.
             */

            const existing =
                await getProductPriceById(
                    tx,
                    id
                );

            if (!existing) {
                return req.reject(
                    404,
                    "Product price not found."
                );
            }

            req._oldProductPrice =
                { ...existing };


            /*
             * Determine final values after update.
             */

            const productId =
                req.data.product_ID ||
                existing.product_ID;

            const validFrom =
                req.data.validFrom ||
                existing.validFrom;

            const validTo =
                req.data.validTo !== undefined
                    ? req.data.validTo
                    : existing.validTo;

            const status =
                req.data.status ||
                existing.status;

            const price =
                req.data.price !== undefined
                    ? req.data.price
                    : existing.price;


            /*
             * Product validation
             */

            const product =
                await getProduct(
                    tx,
                    productId
                );

            if (!product) {
                return req.reject(
                    400,
                    "Product does not exist."
                );
            }


            /*
             * Price validation
             */

            const priceError =
                validatePrice(price);

            if (priceError) {
                return req.reject(
                    400,
                    priceError
                );
            }


            /*
             * Date validation
             */

            const dateError =
                validateDateRange(
                    validFrom,
                    validTo
                );

            if (dateError) {
                return req.reject(
                    400,
                    dateError
                );
            }


            /*
             * Normalize currency.
             */

            if (req.data.currency) {
                req.data.currency =
                    normalizeCurrency(
                        req.data.currency
                    );
            }


            /*
             * Active-price overlap validation.
             */

            if (
                status ===
                PRICE_STATUS.ACTIVE
            ) {

                const overlap =
                    await hasProductPriceOverlap(
                        tx,
                        productId,
                        validFrom,
                        validTo,
                        id
                    );

                if (overlap) {
                    return req.reject(
                        409,
                        "The updated product price overlaps another active product price."
                    );
                }
            }
        }
    );


    /* =====================================================
       PRODUCT PRICE
       AFTER UPDATE
       ===================================================== */

    this.after(
        "UPDATE",
        "ProductPrices",
        async (data, req) => {

            const old =
                req._oldProductPrice;

            if (!old) {
                return;
            }


            /*
             * Determine NEW values using the update
             * payload, falling back to old values.
             */

            const newPrice =
                data.price !== undefined
                    ? data.price
                    : old.price;

            const newCurrency =
                data.currency ||
                old.currency ||
                "INR";

            const newProductId =
                data.product_ID ||
                old.product_ID;

            const priceChanged =
                Number(old.price) !==
                Number(newPrice);

            const currencyChanged =
                normalizeCurrency(
                    old.currency
                ) !==
                normalizeCurrency(
                    newCurrency
                );

            const validityChanged =
                data.validFrom !== undefined ||
                data.validTo !== undefined;

            const statusChanged =
                data.status !== undefined &&
                data.status !== old.status;

            if (
                !priceChanged &&
                !currencyChanged &&
                !validityChanged &&
                !statusChanged
            ) {
                return;
            }


            const tx = cds.tx(req);

            await insertPriceHistory(
                tx,
                {
                    productId:
                        newProductId,

                    priceType:
                        "PRODUCT_UPDATE",

                    previousPrice:
                        old.price,

                    newPrice:
                        newPrice,

                    currency:
                        newCurrency,

                    reason:
                        "Product price updated.",

                    changedByUserId:
                        req.user?.id ||
                        "SYSTEM"
                }
            );
        }
    );


    /* =====================================================
       DEALER PRICE
       CREATE
       ===================================================== */

    this.before(
        "CREATE",
        "DealerPrices",
        async (req) => {

            const data = req.data;
            const tx = cds.tx(req);


            /*
             * Dealer validation
             */

            if (!data.dealer_ID) {
                return req.reject(
                    400,
                    "Dealer is mandatory."
                );
            }

            const dealer =
                await getDealer(
                    tx,
                    data.dealer_ID
                );

            if (!dealer) {
                return req.reject(
                    400,
                    "Dealer does not exist."
                );
            }


            /*
             * Product validation
             */

            if (!data.product_ID) {
                return req.reject(
                    400,
                    "Product is mandatory."
                );
            }

            const product =
                await getProduct(
                    tx,
                    data.product_ID
                );

            if (!product) {
                return req.reject(
                    400,
                    "Product does not exist."
                );
            }


            /*
             * Price validation
             */

            const priceError =
                validatePrice(data.price);

            if (priceError) {
                return req.reject(
                    400,
                    priceError
                );
            }


            /*
             * Discount validation
             */

            const discountError =
                validateDiscount(
                    data.discountPercentage
                );

            if (discountError) {
                return req.reject(
                    400,
                    discountError
                );
            }


            /*
             * Date validation
             */

            const dateError =
                validateDateRange(
                    data.validFrom,
                    data.validTo
                );

            if (dateError) {
                return req.reject(
                    400,
                    dateError
                );
            }


            /*
             * Defaults
             */

            data.currency =
                normalizeCurrency(
                    data.currency
                );

            if (
                data.discountPercentage ===
                undefined ||
                data.discountPercentage ===
                null
            ) {
                data.discountPercentage = 0;
            }

            if (!data.status) {
                data.status =
                    PRICE_STATUS.ACTIVE;
            }


            /*
             * Prevent overlapping active dealer
             * prices.
             */

            if (
                data.status ===
                PRICE_STATUS.ACTIVE
            ) {

                const overlap =
                    await hasDealerPriceOverlap(
                        tx,
                        data.dealer_ID,
                        data.product_ID,
                        data.validFrom,
                        data.validTo
                    );

                if (overlap) {
                    return req.reject(
                        409,
                        "An active dealer-specific price already exists for an overlapping validity period."
                    );
                }
            }
        }
    );


    /* =====================================================
       DEALER PRICE
       AFTER CREATE
       ===================================================== */

    this.after(
        "CREATE",
        "DealerPrices",
        async (data, req) => {

            const tx = cds.tx(req);

            await insertPriceHistory(
                tx,
                {
                    dealerId:
                        data.dealer_ID,

                    productId:
                        data.product_ID,

                    priceType:
                        "DEALER",

                    previousPrice:
                        null,

                    newPrice:
                        data.price,

                    currency:
                        data.currency,

                    previousDiscountPercentage:
                        null,

                    newDiscountPercentage:
                        data.discountPercentage ||
                        0,

                    reason:
                        "Initial dealer-specific price created.",

                    changedByUserId:
                        req.user?.id ||
                        "SYSTEM"
                }
            );
        }
    );


    /* =====================================================
       DEALER PRICE
       BEFORE UPDATE
       ===================================================== */

    this.before(
        "UPDATE",
        "DealerPrices",
        async (req) => {

            const tx = cds.tx(req);

            const id =
                req.data.ID ||
                req.params?.[0]?.ID;

            if (!id) {
                return req.reject(
                    400,
                    "Dealer price ID is required."
                );
            }


            /*
             * Capture OLD record.
             */

            const existing =
                await getDealerPriceById(
                    tx,
                    id
                );

            if (!existing) {
                return req.reject(
                    404,
                    "Dealer price not found."
                );
            }

            req._oldDealerPrice =
                { ...existing };


            /*
             * Determine final values.
             */

            const dealerId =
                req.data.dealer_ID ||
                existing.dealer_ID;

            const productId =
                req.data.product_ID ||
                existing.product_ID;

            const validFrom =
                req.data.validFrom ||
                existing.validFrom;

            const validTo =
                req.data.validTo !== undefined
                    ? req.data.validTo
                    : existing.validTo;

            const status =
                req.data.status ||
                existing.status;

            const price =
                req.data.price !== undefined
                    ? req.data.price
                    : existing.price;

            const discount =
                req.data.discountPercentage !==
                undefined
                    ? req.data.discountPercentage
                    : existing.discountPercentage;


            /*
             * Dealer validation.
             */

            const dealer =
                await getDealer(
                    tx,
                    dealerId
                );

            if (!dealer) {
                return req.reject(
                    400,
                    "Dealer does not exist."
                );
            }


            /*
             * Product validation.
             */

            const product =
                await getProduct(
                    tx,
                    productId
                );

            if (!product) {
                return req.reject(
                    400,
                    "Product does not exist."
                );
            }


            /*
             * Price validation.
             */

            const priceError =
                validatePrice(price);

            if (priceError) {
                return req.reject(
                    400,
                    priceError
                );
            }


            /*
             * Discount validation.
             */

            const discountError =
                validateDiscount(discount);

            if (discountError) {
                return req.reject(
                    400,
                    discountError
                );
            }


            /*
             * Date validation.
             */

            const dateError =
                validateDateRange(
                    validFrom,
                    validTo
                );

            if (dateError) {
                return req.reject(
                    400,
                    dateError
                );
            }


            /*
             * Currency normalization.
             */

            if (req.data.currency) {
                req.data.currency =
                    normalizeCurrency(
                        req.data.currency
                    );
            }


            /*
             * Overlap validation.
             */

            if (
                status ===
                PRICE_STATUS.ACTIVE
            ) {

                const overlap =
                    await hasDealerPriceOverlap(
                        tx,
                        dealerId,
                        productId,
                        validFrom,
                        validTo,
                        id
                    );

                if (overlap) {
                    return req.reject(
                        409,
                        "The updated dealer price overlaps another active dealer-specific price."
                    );
                }
            }
        }
    );


    /* =====================================================
       DEALER PRICE
       AFTER UPDATE
       ===================================================== */

    this.after(
        "UPDATE",
        "DealerPrices",
        async (data, req) => {

            const old =
                req._oldDealerPrice;

            if (!old) {
                return;
            }


            const newPrice =
                data.price !== undefined
                    ? data.price
                    : old.price;

            const newDiscount =
                data.discountPercentage !==
                undefined
                    ? data.discountPercentage
                    : old.discountPercentage;

            const newCurrency =
                data.currency ||
                old.currency ||
                "INR";

            const newDealerId =
                data.dealer_ID ||
                old.dealer_ID;

            const newProductId =
                data.product_ID ||
                old.product_ID;


            const priceChanged =
                Number(old.price) !==
                Number(newPrice);

            const discountChanged =
                Number(
                    old.discountPercentage || 0
                ) !==
                Number(
                    newDiscount || 0
                );

            const currencyChanged =
                normalizeCurrency(
                    old.currency
                ) !==
                normalizeCurrency(
                    newCurrency
                );

            const validityChanged =
                data.validFrom !== undefined ||
                data.validTo !== undefined;

            const statusChanged =
                data.status !== undefined &&
                data.status !== old.status;


            if (
                !priceChanged &&
                !discountChanged &&
                !currencyChanged &&
                !validityChanged &&
                !statusChanged
            ) {
                return;
            }


            const tx = cds.tx(req);

            await insertPriceHistory(
                tx,
                {
                    dealerId:
                        newDealerId,

                    productId:
                        newProductId,

                    priceType:
                        "DEALER_UPDATE",

                    previousPrice:
                        old.price,

                    newPrice:
                        newPrice,

                    currency:
                        newCurrency,

                    previousDiscountPercentage:
                        old.discountPercentage,

                    newDiscountPercentage:
                        newDiscount,

                    reason:
                        "Dealer-specific price updated.",

                    changedByUserId:
                        req.user?.id ||
                        "SYSTEM"
                }
            );
        }
    );


    /* =====================================================
       QUANTITY PRICE SLAB
       CREATE
       ===================================================== */

    this.before(
        "CREATE",
        "QuantityPriceSlabs",
        async (req) => {

            const data = req.data;
            const tx = cds.tx(req);


            /*
             * Product is mandatory.
             */

            if (!data.product_ID) {
                return req.reject(
                    400,
                    "Product is mandatory."
                );
            }

            const product =
                await getProduct(
                    tx,
                    data.product_ID
                );

            if (!product) {
                return req.reject(
                    400,
                    "Product does not exist."
                );
            }


            /*
             * Dealer is optional.
             *
             * If supplied, it must exist.
             */

            if (data.dealer_ID) {

                const dealer =
                    await getDealer(
                        tx,
                        data.dealer_ID
                    );

                if (!dealer) {
                    return req.reject(
                        400,
                        "Dealer does not exist."
                    );
                }
            }


            /*
             * Minimum quantity.
             */

            if (
                data.minQuantity ===
                undefined ||
                data.minQuantity ===
                null
            ) {
                return req.reject(
                    400,
                    "Minimum quantity is mandatory."
                );
            }

            const minQuantity =
                Number(
                    data.minQuantity
                );

            if (
                !Number.isFinite(
                    minQuantity
                ) ||
                minQuantity <= 0
            ) {
                return req.reject(
                    400,
                    "Minimum quantity must be greater than zero."
                );
            }


            /*
             * Maximum quantity.
             */

            if (
                data.maxQuantity !==
                    undefined &&
                data.maxQuantity !==
                    null
            ) {

                const maxQuantity =
                    Number(
                        data.maxQuantity
                    );

                if (
                    !Number.isFinite(
                        maxQuantity
                    ) ||
                    maxQuantity <
                        minQuantity
                ) {
                    return req.reject(
                        400,
                        "Maximum quantity must be greater than or equal to minimum quantity."
                    );
                }
            }


            /*
             * Discount.
             */

            const discountError =
                validateDiscount(
                    data.discountPercentage
                );

            if (discountError) {
                return req.reject(
                    400,
                    discountError
                );
            }


            /*
             * Date range.
             */

            const dateError =
                validateDateRange(
                    data.validFrom,
                    data.validTo
                );

            if (dateError) {
                return req.reject(
                    400,
                    dateError
                );
            }


            /*
             * Defaults.
             */

            if (
                data.discountPercentage ===
                    undefined ||
                data.discountPercentage ===
                    null
            ) {
                data.discountPercentage = 0;
            }

            if (!data.status) {
                data.status =
                    PRICE_STATUS.ACTIVE;
            }


            /*
             * Overlap validation.
             */

            if (
                data.status ===
                PRICE_STATUS.ACTIVE
            ) {

                const overlap =
                    await hasQuantitySlabOverlap(
                        tx,
                        data.dealer_ID || null,
                        data.product_ID,
                        minQuantity,
                        data.maxQuantity,
                        data.validFrom,
                        data.validTo
                    );

                if (overlap) {
                    return req.reject(
                        409,
                        "An active quantity price slab already overlaps this quantity and validity range."
                    );
                }
            }
        }
    );


    /* =====================================================
       QUANTITY PRICE SLAB
       BEFORE UPDATE
       ===================================================== */

    this.before(
        "UPDATE",
        "QuantityPriceSlabs",
        async (req) => {

            const tx = cds.tx(req);

            const id =
                req.data.ID ||
                req.params?.[0]?.ID;

            if (!id) {
                return req.reject(
                    400,
                    "Quantity price slab ID is required."
                );
            }


            /*
             * Read old slab.
             */

            const existing =
                await getQuantitySlabById(
                    tx,
                    id
                );

            if (!existing) {
                return req.reject(
                    404,
                    "Quantity price slab not found."
                );
            }


            /*
             * Keep old values for potential future
             * history/audit enhancements.
             */

            req._oldQuantityPriceSlab =
                { ...existing };


            /*
             * Determine final values.
             */

            const dealerId =
                req.data.dealer_ID !==
                undefined
                    ? req.data.dealer_ID
                    : existing.dealer_ID;

            const productId =
                req.data.product_ID ||
                existing.product_ID;

            const minQuantity =
                req.data.minQuantity !==
                undefined
                    ? Number(
                        req.data.minQuantity
                    )
                    : Number(
                        existing.minQuantity
                    );

            const maxQuantity =
                req.data.maxQuantity !==
                undefined
                    ? req.data.maxQuantity
                    : existing.maxQuantity;

            const validFrom =
                req.data.validFrom ||
                existing.validFrom;

            const validTo =
                req.data.validTo !==
                undefined
                    ? req.data.validTo
                    : existing.validTo;

            const status =
                req.data.status ||
                existing.status;


            /*
             * Product validation.
             */

            const product =
                await getProduct(
                    tx,
                    productId
                );

            if (!product) {
                return req.reject(
                    400,
                    "Product does not exist."
                );
            }


            /*
             * Dealer validation.
             */

            if (dealerId) {

                const dealer =
                    await getDealer(
                        tx,
                        dealerId
                    );

                if (!dealer) {
                    return req.reject(
                        400,
                        "Dealer does not exist."
                    );
                }
            }


            /*
             * Quantity validation.
             */

            if (
                !Number.isFinite(
                    minQuantity
                ) ||
                minQuantity <= 0
            ) {
                return req.reject(
                    400,
                    "Minimum quantity must be greater than zero."
                );
            }


            if (
                maxQuantity !== null &&
                maxQuantity !== undefined
            ) {

                const numericMax =
                    Number(
                        maxQuantity
                    );

                if (
                    !Number.isFinite(
                        numericMax
                    ) ||
                    numericMax <
                        minQuantity
                ) {
                    return req.reject(
                        400,
                        "Maximum quantity must be greater than or equal to minimum quantity."
                    );
                }
            }


            /*
             * Discount validation.
             */

            if (
                req.data.discountPercentage !==
                undefined
            ) {

                const discountError =
                    validateDiscount(
                        req.data.discountPercentage
                    );

                if (discountError) {
                    return req.reject(
                        400,
                        discountError
                    );
                }
            }


            /*
             * Date validation.
             */

            const dateError =
                validateDateRange(
                    validFrom,
                    validTo
                );

            if (dateError) {
                return req.reject(
                    400,
                    dateError
                );
            }


            /*
             * Overlap validation.
             */

            if (
                status ===
                PRICE_STATUS.ACTIVE
            ) {

                const overlap =
                    await hasQuantitySlabOverlap(
                        tx,
                        dealerId || null,
                        productId,
                        minQuantity,
                        maxQuantity,
                        validFrom,
                        validTo,
                        id
                    );

                if (overlap) {
                    return req.reject(
                        409,
                        "The updated quantity price slab overlaps another active quantity slab."
                    );
                }
            }
        }
    );


    /* =====================================================
       CALCULATE DEALER PRICE
       ===================================================== */

    this.on(
        "calculateDealerPrice",
        async (req) => {

            const {
                dealerId,
                productId,
                quantity
            } = req.data;


            /* ---------------------------------------------
               VALIDATE DEALER
               --------------------------------------------- */

            if (!dealerId) {
                return req.reject(
                    400,
                    "Dealer ID is required."
                );
            }


            /* ---------------------------------------------
               VALIDATE PRODUCT
               --------------------------------------------- */

            if (!productId) {
                return req.reject(
                    400,
                    "Product ID is required."
                );
            }


            /* ---------------------------------------------
               VALIDATE QUANTITY
               --------------------------------------------- */

            const quantityError =
                validateQuantity(
                    quantity
                );

            if (quantityError) {
                return req.reject(
                    400,
                    quantityError
                );
            }


            const tx = cds.tx(req);


            /* ---------------------------------------------
               DEALER
               --------------------------------------------- */

            const dealer =
                await getDealer(
                    tx,
                    dealerId
                );

            if (!dealer) {
                return req.reject(
                    404,
                    "Dealer not found."
                );
            }


            /* ---------------------------------------------
               PRODUCT
               --------------------------------------------- */

            const product =
                await getProduct(
                    tx,
                    productId
                );

            if (!product) {
                return req.reject(
                    404,
                    "Product not found."
                );
            }


            /* ---------------------------------------------
               DEALER-SPECIFIC PRICE
               --------------------------------------------- */

            const dealerPrice =
                await findDealerPrice(
                    tx,
                    dealerId,
                    productId
                );


            /* ---------------------------------------------
               PRODUCT PRICE
               --------------------------------------------- */

            const productPrice =
                await findProductPrice(
                    tx,
                    productId
                );


            /* ---------------------------------------------
               DETERMINE BASE PRICE
               --------------------------------------------- */

            let basePrice;
            let currency;


            if (dealerPrice) {

                /*
                 * IMPORTANT BUSINESS RULE
                 *
                 * DealerPrices.price is the negotiated
                 * dealer base price.
                 *
                 * Therefore:
                 *
                 * DealerPrices.discountPercentage
                 *
                 * is NOT applied again here.
                 */

                basePrice =
                    Number(
                        dealerPrice.price
                    );

                currency =
                    dealerPrice.currency ||
                    "INR";

            } else if (productPrice) {

                /*
                 * Product-specific fallback.
                 */

                basePrice =
                    Number(
                        productPrice.price
                    );

                currency =
                    productPrice.currency ||
                    "INR";

            } else if (
                product.basePrice !==
                    undefined &&
                product.basePrice !==
                    null
            ) {

                /*
                 * Final fallback to product master.
                 */

                basePrice =
                    Number(
                        product.basePrice
                    );

                currency =
                    product.currency ||
                    "INR";

            } else {

                return req.reject(
                    404,
                    "No valid price found for this product."
                );
            }


            /* ---------------------------------------------
               QUANTITY SLAB
               --------------------------------------------- */

            const quantitySlab =
                await findQuantityPriceSlab(
                    tx,
                    dealerId,
                    productId,
                    quantity
                );


            /* ---------------------------------------------
               FINAL PRICE
               --------------------------------------------- */

            let finalPrice =
                basePrice;


            /*
             * Quantity slab provides an ADDITIONAL
             * discount.
             */

            if (quantitySlab) {

                finalPrice =
                    calculateDiscountedPrice(
                        basePrice,
                        quantitySlab.discountPercentage
                    );
            }


            /* ---------------------------------------------
               RETURN
               --------------------------------------------- */

            return finalPrice;
        }
    );

});

