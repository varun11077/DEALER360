const cds = require("@sap/cds");

const {
    processBatch,
    recoverStaleEvents
} = require("./lib/outbox-processor");


/* =========================================================
   CONFIGURATION
   ========================================================= */

const PROCESS_INTERVAL_MS = 30 * 1000;

const STALE_EVENT_INTERVAL_MS = 5 * 60 * 1000;

const BATCH_SIZE = 20;

const STALE_MINUTES = 15;


/* =========================================================
   PROCESS OUTBOX EVENTS
   ========================================================= */

let processing = false;

async function processOutboxEvents() {

    if (processing) {
        console.log(
            "[OutboxProcessor] Previous batch is still running. Skipping."
        );

        return;
    }

    processing = true;

    try {

        const result =
            await processBatch({
                batchSize: BATCH_SIZE
            });

        if (result.processed > 0) {

            console.log(
                "[OutboxProcessor] Batch completed:",
                result
            );
        }

    } catch (error) {

        console.error(
            "[OutboxProcessor] Batch processing failed:",
            error.message
        );

    } finally {

        processing = false;
    }
}


/* =========================================================
   RECOVER STALE EVENTS
   ========================================================= */

let recovering = false;

async function recoverOutboxEvents() {

    if (recovering) {
        return;
    }

    recovering = true;

    try {

        const result =
            await recoverStaleEvents({
                staleMinutes: STALE_MINUTES
            });

        if (result.recovered > 0) {

            console.log(
                "[OutboxProcessor] Recovered stale events:",
                result.recovered
            );
        }

    } catch (error) {

        console.error(
            "[OutboxProcessor] Stale event recovery failed:",
            error.message
        );

    } finally {

        recovering = false;
    }
}


/* =========================================================
   START SCHEDULER
   ========================================================= */

function startOutboxProcessor() {

    console.log(
        `[OutboxProcessor] Scheduler started. Interval: ${PROCESS_INTERVAL_MS / 1000}s`
    );


    /* -----------------------------------------------------
       Process pending events
       ----------------------------------------------------- */

    const processingTimer =
        setInterval(
            processOutboxEvents,
            PROCESS_INTERVAL_MS
        );


    /* -----------------------------------------------------
       Recover stale PROCESSING events
       ----------------------------------------------------- */

    const recoveryTimer =
        setInterval(
            recoverOutboxEvents,
            STALE_EVENT_INTERVAL_MS
        );


    /* -----------------------------------------------------
       Allow Node.js process to shut down normally
       ----------------------------------------------------- */

    processingTimer.unref();

    recoveryTimer.unref();


    /* -----------------------------------------------------
       Initial processing
       ----------------------------------------------------- */

    processOutboxEvents();

    recoverOutboxEvents();
}


/* =========================================================
   CAP APPLICATION BOOTSTRAP
   ========================================================= */

cds.on("served", () => {

    startOutboxProcessor();

});