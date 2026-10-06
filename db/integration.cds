namespace dealer360;

using { cuid, managed } from '@sap/cds/common';

using {
    dealer360.OutboxEventStatus
} from './schema';


/* =========================================================
   OUTBOX EVENT
   =========================================================
   
   Reliable event record created in the same database
   transaction as the business operation.

   Example:
   
   Dealer submitted
          ↓
   Dealer UPDATE
          +
   OutboxEvent INSERT
          ↓
   Event Processor
          ↓
   BPA / Integration Suite / External API
   ========================================================= */

@title: 'Outbox Event'
entity OutboxEvents : cuid, managed {

    eventType : String(100) @mandatory;

    aggregateType : String(100) @mandatory;

    aggregateId : String(36) @mandatory;

    eventVersion : Integer default 1;

    status : OutboxEventStatus
        default 'PENDING';

    payload : LargeString @mandatory;

    correlationId : String(100);

    idempotencyKey : String(255);

    destination : String(100);

    retryCount : Integer default 0;

    maxRetries : Integer default 5;

    nextRetryAt : Timestamp;

    processedAt : Timestamp;

    failedAt : Timestamp;

    lastError : String(2000);

    publishedAt : Timestamp;

    createdByService : String(100);

    remarks : String(1000);
}