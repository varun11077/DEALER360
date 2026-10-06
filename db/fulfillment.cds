namespace dealer360;

using { cuid, managed } from '@sap/cds/common';

using {
    dealer360.PurchaseOrders,
    dealer360.PurchaseOrderItems
} from './purchasing';

using {
    dealer360.PurchaseOrderStatus
} from './schema';


@title: 'Fulfillment'
@assert.unique.fulfillmentNumber: [ fulfillmentNumber ]
entity Fulfillments : cuid, managed {

    fulfillmentNumber : String(30);

    purchaseOrder : Association to PurchaseOrders @mandatory;

    status : PurchaseOrderStatus default 'ALLOCATED';

    plannedDispatchDate : Date;
    actualDispatchDate : Date;

    plannedDeliveryDate : Date;
    actualDeliveryDate : Date;

    carrierName : String(255);
    trackingNumber : String(255);
    shipmentReference : String(255);

    deliveryNoteNumber : String(100);
    deliveryRemarks : String(1000);

    invoiceNumber : String(100);
    invoiceDate : Date;

    closedAt : Timestamp;
    cancelledAt : Timestamp;
    cancellationReason : String(1000);

    remarks : String(1000);

    items : Composition of many FulfillmentItems
        on items.fulfillment = $self;

    statusHistory : Composition of many FulfillmentStatusHistory
        on statusHistory.fulfillment = $self;
}


@title: 'Fulfillment Item'
entity FulfillmentItems : cuid, managed {

    fulfillment : Association to Fulfillments @mandatory;

    purchaseOrderItem : Association to PurchaseOrderItems @mandatory;

    orderedQuantity : Decimal(15,3) @mandatory;

    fulfilledQuantity : Decimal(15,3) default 0;

    pendingQuantity : Decimal(15,3) default 0;

    unitOfMeasure : String(10);

    remarks : String(500);
}


@title: 'Fulfillment Status History'
entity FulfillmentStatusHistory : cuid, managed {

    fulfillment : Association to Fulfillments @mandatory;

    previousStatus : PurchaseOrderStatus;

    newStatus : PurchaseOrderStatus @mandatory;

    changedAt : Timestamp;

    changedBy : String(255);

    changedByName : String(255);

    reason : String(1000);
}