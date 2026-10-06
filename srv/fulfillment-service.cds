using {
    dealer360.Fulfillments as FulfillmentEntity,
    dealer360.FulfillmentItems as FulfillmentItemEntity,
    dealer360.FulfillmentStatusHistory as FulfillmentStatusHistoryEntity
} from '../db/fulfillment';

@path: '/fulfillment'
@title: 'DEALER360 Fulfillment Service'
@description: 'Purchase Order fulfillment and delivery lifecycle service'

service FulfillmentService {

    entity Fulfillments
        as projection on FulfillmentEntity;

    entity FulfillmentItems
        as projection on FulfillmentItemEntity;

    @readonly
    entity FulfillmentStatusHistory
        as projection on FulfillmentStatusHistoryEntity;


    action createFulfillment(
        purchaseOrderId : UUID
    ) returns Fulfillments;


    action dispatchFulfillment(
        fulfillmentId : UUID,
        carrierName : String(255),
        trackingNumber : String(255),
        shipmentReference : String(255)
    ) returns Fulfillments;


    action deliverFulfillment(
        fulfillmentId : UUID,
        deliveryNoteNumber : String(100),
        deliveryRemarks : String(1000)
    ) returns Fulfillments;


    action invoiceFulfillment(
        fulfillmentId : UUID,
        invoiceNumber : String(100)
    ) returns Fulfillments;


    action closeFulfillment(
        fulfillmentId : UUID
    ) returns Fulfillments;


    action cancelFulfillment(
        fulfillmentId : UUID,
        reason : String(1000)
    ) returns Fulfillments;
}