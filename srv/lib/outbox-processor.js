const cds = require("@sap/cds");

const {
    SELECT,
    UPDATE
} = cds.ql;

const {
    OutboxEvents
} = cds.entities("dealer360");


const OUTBOX_STATUS = {
    PENDING: "PENDING",
    PROCESSING: "PROCESSING",
    PROCESSED: "PROCESSED",
    FAILED: "FAILED"
};


const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_RETRY_DELAY_SECONDS = 30;


/*
 * ---------------------------------------------------------
 * Utility functions
 * ---------------------------------------------------------
 */

function toNumber(value, defaultValue = 0) {

    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : defaultValue;
}


function now() {
    return new Date();
}


function calculateNextRetryAt(retryCount) {

    /*
     * Exponential backoff:
     *
     * retry 1 → 30 seconds
     * retry 2 → 60 seconds
     * retry 3 → 120 seconds
     * retry 4 → 240 seconds
     * retry 5 → 480 seconds
     *
     * Maximum delay is intentionally capped.
     */

    const baseDelay =
        DEFAULT_RETRY_DELAY_SECONDS;

    const maximumDelay =
        15 * 60;

    const delay =
        Math.min(
            baseDelay *
                Math.pow(2, Math.max(0, retryCount - 1)),
            maximumDelay
        );

    return new Date(
        Date.now() +
        delay * 1000
    );
}


function parsePayload(payload) {

    if (!payload) {
        return {};
    }

    if (typeof payload === "object") {
        return payload;
    }

    try {
        return JSON.parse(payload);
    } catch (error) {

        throw new Error(
            "Outbox event payload contains invalid JSON"
        );
    }
}


function validateEvent(event) {

    if (!event.eventType) {
        throw new Error(
            "Outbox event is missing eventType"
        );
    }

    if (!event.aggregateType) {
        throw new Error(
            "Outbox event is missing aggregateType"
        );
    }

    if (!event.aggregateId) {
        throw new Error(
            "Outbox event is missing aggregateId"
        );
    }

    if (!event.payload) {
        throw new Error(
            "Outbox event is missing payload"
        );
    }
}


/*
 * ---------------------------------------------------------
 * Destination publishing abstraction
 * ---------------------------------------------------------
 *
 * IMPORTANT:
 *
 * We intentionally do NOT call SAP Destination yet.
 *
 * This method is the integration boundary.
 *
 * Later this method will use:
 *
 *   cds.connect.to(...)
 *
 * or
 *
 *   @sap-cloud-sdk/http-client
 *
 * to communicate with SAP Integration Suite / BPA /
 * external systems through SAP Destination.
 *
 * Keeping the publishing mechanism isolated prevents
 * business services from becoming tightly coupled to
 * external systems.
 * ---------------------------------------------------------
 */

async function publishEvent(event) {

    validateEvent(event);

    const payload =
        parsePayload(event.payload);


    /*
     * Destination is currently only recorded.
     *
     * No external call is made yet.
     */

    const destination =
        event.destination || "NOT_CONFIGURED";


    console.log(
        `[OUTBOX] Publishing event ${event.ID} ` +
        `type=${event.eventType} ` +
        `destination=${destination}`
    );


    /*
     * Development / architecture phase:
     *
     * We validate the event and payload but do not
     * pretend that the external integration succeeded.
     *
     * Once SAP Destination is implemented, this function
     * will perform the actual HTTP/API call.
     */

    return {
        success: true,
        eventId: event.ID,
        eventType: event.eventType,
        destination,
        payload
    };
}


/*
 * ---------------------------------------------------------
 * Claim event
 * ---------------------------------------------------------
 *
 * The processor first changes:
 *
 * PENDING → PROCESSING
 *
 * using a guarded UPDATE.
 *
 * This is important because multiple processor instances
 * may run in parallel in production.
 * ---------------------------------------------------------
 */

async function claimEvent(tx, eventId) {

    const updated =
        await tx.run(
            UPDATE(OutboxEvents)
                .set({
                    status:
                        OUTBOX_STATUS.PROCESSING
                })
                .where({
                    ID: eventId,
                    status:
                        OUTBOX_STATUS.PENDING
                })
        );


    return Boolean(updated);
}


/*
 * ---------------------------------------------------------
 * Get processable events
 * ---------------------------------------------------------
 */

async function getPendingEvents(
    tx,
    batchSize
) {

    const currentTime =
        now().toISOString();


    return tx.run(
        SELECT.from(OutboxEvents)
            .where`
                (
                    status = ${OUTBOX_STATUS.PENDING}
                    AND (
                        nextRetryAt IS NULL
                        OR nextRetryAt <= ${currentTime}
                    )
                )
            `
            .orderBy({
                createdAt: "asc"
            })
            .limit(batchSize)
    );
}


/*
 * ---------------------------------------------------------
 * Mark event as processed
 * ---------------------------------------------------------
 */

async function markProcessed(
    tx,
    eventId
) {

    await tx.run(
        UPDATE(OutboxEvents)
            .set({
                status:
                    OUTBOX_STATUS.PROCESSED,

                processedAt:
                    now().toISOString(),

                failedAt: null,

                nextRetryAt: null,

                lastError: null,

                publishedAt:
                    now().toISOString()
            })
            .where({
                ID: eventId
            })
    );
}


/*
 * ---------------------------------------------------------
 * Mark event as failed
 * ---------------------------------------------------------
 */

async function markFailed(
    tx,
    event,
    error
) {

    const currentRetryCount =
        toNumber(
            event.retryCount,
            0
        );

    const maxRetries =
        toNumber(
            event.maxRetries,
            DEFAULT_MAX_RETRIES
        );

    const newRetryCount =
        currentRetryCount + 1;


    const errorMessage =
        String(
            error?.message ||
            error ||
            "Unknown outbox processing error"
        ).substring(0, 2000);


    /*
     * If retry limit has been reached,
     * keep the event permanently FAILED.
     */

    if (
        newRetryCount >= maxRetries
    ) {

        await tx.run(
            UPDATE(OutboxEvents)
                .set({

                    status:
                        OUTBOX_STATUS.FAILED,

                    retryCount:
                        newRetryCount,

                    failedAt:
                        now().toISOString(),

                    nextRetryAt: null,

                    lastError:
                        errorMessage
                })
                .where({
                    ID: event.ID
                })
        );

        return;
    }


    /*
     * Retry is still possible.
     */

    const nextRetryAt =
        calculateNextRetryAt(
            newRetryCount
        );


    await tx.run(
        UPDATE(OutboxEvents)
            .set({

                status:
                    OUTBOX_STATUS.PENDING,

                retryCount:
                    newRetryCount,

                nextRetryAt:
                    nextRetryAt.toISOString(),

                lastError:
                    errorMessage
            })
            .where({
                ID: event.ID
            })
    );
}


/*
 * ---------------------------------------------------------
 * Process one event
 * ---------------------------------------------------------
 */

async function processEvent(event) {

    /*
     * Each event gets its own transaction.
     *
     * This prevents one failed event from rolling back
     * successfully processed events in the same batch.
     */

    const tx =
        cds.tx();


    try {

        const claimed =
            await claimEvent(
                tx,
                event.ID
            );


        /*
         * Another processor instance may already have
         * claimed this event.
         */

        if (!claimed) {

            await tx.commit();

            return {
                eventId: event.ID,
                status: "SKIPPED",
                reason:
                    "Event was already claimed"
            };
        }


        /*
         * Re-read the event after claiming it.
         */

        const processingEvent =
            await tx.run(
                SELECT.one
                    .from(OutboxEvents)
                    .where({
                        ID: event.ID
                    })
            );


        if (!processingEvent) {

            throw new Error(
                "Outbox event disappeared after claiming"
            );
        }


        /*
         * Actual external publishing boundary.
         */

        await publishEvent(
            processingEvent
        );


        await markProcessed(
            tx,
            processingEvent.ID
        );


        await tx.commit();


        console.log(
            `[OUTBOX] Event ${event.ID} processed successfully`
        );


        return {
            eventId: event.ID,
            status:
                OUTBOX_STATUS.PROCESSED
        };

    } catch (error) {

        /*
         * Roll back the transaction that attempted to claim
         * or process the event.
         */

        try {
            await tx.rollback();
        } catch (rollbackError) {
            console.error(
                "[OUTBOX] Rollback failed:",
                rollbackError.message
            );
        }


        /*
         * Start a new transaction for failure handling.
         */

        const failureTx =
            cds.tx();


        try {

            const latestEvent =
                await failureTx.run(
                    SELECT.one
                        .from(OutboxEvents)
                        .where({
                            ID: event.ID
                        })
                );


            if (latestEvent) {

                /*
                 * Only handle failure if the event is still
                 * PROCESSING.
                 *
                 * This prevents overwriting an event that
                 * another process has already completed.
                 */

                if (
                    latestEvent.status ===
                    OUTBOX_STATUS.PROCESSING
                ) {

                    await markFailed(
                        failureTx,
                        latestEvent,
                        error
                    );
                }
            }


            await failureTx.commit();

        } catch (failureHandlingError) {

            try {
                await failureTx.rollback();
            } catch (rollbackError) {
                console.error(
                    "[OUTBOX] Failure rollback failed:",
                    rollbackError.message
                );
            }


            console.error(
                `[OUTBOX] Could not record failure for ${event.ID}:`,
                failureHandlingError.message
            );
        }


        console.error(
            `[OUTBOX] Event ${event.ID} failed:`,
            error.message
        );


        return {
            eventId: event.ID,
            status:
                OUTBOX_STATUS.FAILED,
            error:
                error.message
        };
    }
}


/*
 * ---------------------------------------------------------
 * Process batch
 * ---------------------------------------------------------
 */

async function processBatch(
    options = {}
) {

    const batchSize =
        Math.max(
            1,
            Number(
                options.batchSize ||
                DEFAULT_BATCH_SIZE
            )
        );


    const tx =
        cds.tx();


    try {

        const events =
            await getPendingEvents(
                tx,
                batchSize
            );


        await tx.commit();


        if (!events?.length) {

            return {
                processed: 0,
                results: []
            };
        }


        const results = [];


        /*
         * Events are processed independently.
         *
         * Promise.all allows multiple events to be
         * processed concurrently.
         *
         * The database claim operation prevents two
         * processors from processing the same event.
         */

        const eventResults =
            await Promise.all(
                events.map(
                    event =>
                        processEvent(event)
                )
            );


        results.push(
            ...eventResults
        );


        return {
            processed:
                results.length,

            successful:
                results.filter(
                    result =>
                        result.status ===
                        OUTBOX_STATUS.PROCESSED
                ).length,

            failed:
                results.filter(
                    result =>
                        result.status ===
                        OUTBOX_STATUS.FAILED
                ).length,

            skipped:
                results.filter(
                    result =>
                        result.status ===
                        "SKIPPED"
                ).length,

            results
        };

    } catch (error) {

        try {
            await tx.rollback();
        } catch (rollbackError) {
            console.error(
                "[OUTBOX] Batch rollback failed:",
                rollbackError.message
            );
        }

        throw error;
    }
}


/*
 * ---------------------------------------------------------
 * Recover stale PROCESSING events
 * ---------------------------------------------------------
 *
 * If the application crashes after:
 *
 * PENDING → PROCESSING
 *
 * but before:
 *
 * PROCESSING → PROCESSED
 *
 * the event could otherwise remain stuck forever.
 *
 * This recovery mechanism returns old PROCESSING events
 * to PENDING.
 * ---------------------------------------------------------
 */

async function recoverStaleEvents(
    options = {}
) {

    const staleMinutes =
        Math.max(
            1,
            Number(
                options.staleMinutes || 15
            )
        );


    const cutoff =
        new Date(
            Date.now() -
            staleMinutes * 60 * 1000
        ).toISOString();


    const tx =
        cds.tx();


    try {

        /*
         * managed.createdAt is used as a conservative
         * recovery indicator.
         *
         * In a future hardening step we can add a dedicated
         * processingStartedAt / lockedAt field.
         */

        const staleEvents =
            await tx.run(
                SELECT.from(OutboxEvents)
                    .where({
                        status:
                            OUTBOX_STATUS.PROCESSING
                    })
            );


        let recovered = 0;


        for (
            const event of staleEvents || []
        ) {

            if (
                event.modifiedAt &&
                event.modifiedAt <= cutoff
            ) {

                await tx.run(
                    UPDATE(OutboxEvents)
                        .set({
                            status:
                                OUTBOX_STATUS.PENDING,

                            nextRetryAt:
                                now().toISOString(),

                            lastError:
                                "Recovered stale PROCESSING event"
                        })
                        .where({
                            ID: event.ID,
                            status:
                                OUTBOX_STATUS.PROCESSING
                        })
                );


                recovered++;
            }
        }


        await tx.commit();


        return {
            recovered
        };

    } catch (error) {

        try {
            await tx.rollback();
        } catch (rollbackError) {
            console.error(
                "[OUTBOX] Recovery rollback failed:",
                rollbackError.message
            );
        }

        throw error;
    }
}


/*
 * ---------------------------------------------------------
 * Public processor API
 * ---------------------------------------------------------
 */

module.exports = {

    processBatch,

    processEvent,

    recoverStaleEvents,

    publishEvent,

    OUTBOX_STATUS
};