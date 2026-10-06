const cds = require("@sap/cds");

const LOG = cds.log("dealer360-guard");

const DEALER_PROTECTED = [
    "status", "dealerCode", "submittedAt", "l1ApprovedAt", "activatedAt",
    "rejectedAt", "blockedAt", "rejectionReason", "blockReason",
    "approvals", "statusHistory"
];

/*
 * Deny by default: an entity that is not listed here is read-only
 * through the API and can change only through its actions.
 *   ops     = direct operations allowed
 *   protect = fields only the lifecycle actions may change
 */
const WRITE_POLICY = {
    "DealerService.Dealers": {
        ops: ["CREATE", "UPDATE"],
        protect: DEALER_PROTECTED,
        protectOnCreate: false          // CREATE handler resets them itself
    },
    "DealerService.DealerAddresses": { ops: ["CREATE", "UPDATE", "DELETE"] },
    "DealerService.DealerContacts":  { ops: ["CREATE", "UPDATE", "DELETE"] },
    "DealerService.DealerDocuments": { ops: ["CREATE", "UPDATE", "DELETE"] },

    "CreditService.DealerCredits": {
        ops: ["CREATE", "UPDATE"],
        protect: ["usedCredit", "availableCredit", "isBlocked",
                  "blockedReason", "lastCreditCheckAt"]
    },

    "PricingService.ProductPrices":      { ops: ["CREATE", "UPDATE"] },
    "PricingService.DealerPrices":       { ops: ["CREATE", "UPDATE"] },
    "PricingService.QuantityPriceSlabs": { ops: ["CREATE", "UPDATE", "DELETE"] },

    "MasterDataService.Regions":           { ops: ["CREATE", "UPDATE"] },
    "MasterDataService.States":            { ops: ["CREATE", "UPDATE"] },
    "MasterDataService.DealerTypes":       { ops: ["CREATE", "UPDATE"] },
    "MasterDataService.PaymentTerms":      { ops: ["CREATE", "UPDATE"] },
    "MasterDataService.ProductCategories": { ops: ["CREATE", "UPDATE"] },
    "MasterDataService.Products":          { ops: ["CREATE", "UPDATE"] },
    "MasterDataService.Taxes":             { ops: ["CREATE", "UPDATE"] },

    "PurchaseRequisitionService.PurchaseRequisitions": {
        ops: ["CREATE", "UPDATE"],
        protect: ["status", "requisitionNumber", "submittedAt", "approvedAt",
                  "rejectedAt", "rejectionReason", "statusHistory"]
    },
    "PurchaseRequisitionService.PurchaseRequisitionItems": {
        ops: ["CREATE", "UPDATE", "DELETE"]
    }

    // Not listed => read-only: PurchaseOrderService.*, FulfillmentService.*,
    // PurchaseRequisitionApprovalService.*, IntegrationService.*, every
    // *StatusHistory / *Approvals entity, and Dealers inside Credit/Pricing.
};

function installWriteGuard(srv) {

    srv.before(["CREATE", "UPDATE", "DELETE"], "*", (req) => {

        const entity = req.target && req.target.name;

        if (!entity) {
            return;
        }

        const policy = WRITE_POLICY[entity];

        if (!policy || !policy.ops.includes(req.event)) {

            LOG.warn(`Blocked direct ${req.event} on ${entity}`);

            return req.reject(
                405,
                `${req.event} is not allowed on ${entity.split(".").pop()}. ` +
                "Use the provided business actions."
            );
        }

        if (!policy.protect || !req.data) {
            return;
        }

        if (req.event === "CREATE" && policy.protectOnCreate === false) {
            return;
        }

        const touched =
            policy.protect.filter((f) => req.data[f] !== undefined);

        if (touched.length > 0) {

            return req.reject(
                400,
                `Field(s) ${touched.join(", ")} cannot be changed directly. ` +
                "Use the lifecycle actions."
            );
        }
    });
}

function installErrorMapper(srv) {

    srv.on("error", (err) => {

        if (err.statusCode || err.status) {
            return;
        }

        const code = String(err.code || "");

        if (/UNIQUE/.test(code) || code === "301" || code === "23505") {
            err.statusCode = 409;
            return;
        }

        if (err.constructor === Error && /^[A-Z][A-Z0-9_]+$/.test(code)) {
            err.statusCode = /NOT_FOUND$/.test(code) ? 404 : 400;
        }
    });
}

/*
 * Only services exposed under an @path (the API). The internal "db"
 * service is skipped, so the handlers' own tx.run(UPDATE ...) calls
 * are never blocked.
 *
 * prepend: the guard must run BEFORE the service's own handlers,
 * otherwise it would see values those handlers set themselves.
 */
cds.on("serving", (srv) => {

    if (!srv.definition || !srv.definition["@path"]) {
        return;
    }

    srv.prepend(() => installWriteGuard(srv));

    installErrorMapper(srv);
});

module.exports = cds.server;