
require("./outbox-processor-scheduler");

const cds = require("@sap/cds");

const { SELECT } = cds.ql;


/* =========================================================
   SERVICE IMPLEMENTATION
   ========================================================= */

module.exports = cds.service.impl(function () {

    /* =====================================================
       OUTBOX EVENTS - READ ONLY
       ===================================================== */

    this.before(
        "READ",
        "OutboxEvents",
        async (req) => {

            /*
             * OutboxEvents is currently a monitoring/read-only
             * endpoint.
             *
             * The actual publishing of events to SAP Build
             * Process Automation will be handled later by
             * the Outbox Processor.
             *
             * Therefore we intentionally do not modify the
             * event here.
             */
        }
    );

});

