
namespace dealer360;

using { cuid, managed } from '@sap/cds/common';

using {
    dealer360.Dealers
} from './dealer';

using {
    dealer360.Products,
    dealer360.Taxes,
    dealer360.PaymentTerms
} from './master-data';

using {
    dealer360.PurchaseRequisitionStatus,
    dealer360.PurchaseOrderStatus,
    dealer360.PurchaseOrderApprovalStatus
} from './schema';


/* =========================================================
   PURCHASE REQUISITION
   ========================================================= */

@title: 'Purchase Requisition'
@assert.unique.requisitionNumber: [ requisitionNumber ]
entity PurchaseRequisitions : cuid, managed {

    requisitionNumber : String(30);

    dealer : Association to Dealers @mandatory;

    status : PurchaseRequisitionStatus
        default 'DRAFT';

    requestedDate : Date;

    requiredDate : Date;

    currency : String(3) default 'INR';

    totalAmount : Decimal(18,2) default 0;

    remarks : String(1000);

    submittedAt : Timestamp;

    approvedAt : Timestamp;

    rejectedAt : Timestamp;

    rejectionReason : String(1000);

    items : Composition of many PurchaseRequisitionItems
        on items.purchaseRequisition = $self;

    statusHistory : Composition of many PurchaseRequisitionStatusHistory
        on statusHistory.purchaseRequisition = $self;
}


/* =========================================================
   PURCHASE REQUISITION ITEM
   ========================================================= */

@title: 'Purchase Requisition Item'
@assert.unique.requisitionItem: [
    purchaseRequisition,
    itemNumber
]
entity PurchaseRequisitionItems : cuid, managed {

    purchaseRequisition :
        Association to PurchaseRequisitions @mandatory;

    itemNumber : Integer @mandatory;

    product : Association to Products @mandatory;

    quantity : Decimal(15,3) @mandatory;

    unitOfMeasure : String(10);

    requestedUnitPrice : Decimal(15,2);

    estimatedAmount : Decimal(18,2);

    currency : String(3) default 'INR';

    requiredDate : Date;

    remarks : String(500);

    purchaseOrderItem :
        Association to PurchaseOrderItems;
}


/* =========================================================
   PURCHASE REQUISITION STATUS HISTORY
   ========================================================= */

@title: 'Purchase Requisition Status History'
entity PurchaseRequisitionStatusHistory : cuid, managed {

    purchaseRequisition :
        Association to PurchaseRequisitions @mandatory;

    previousStatus : PurchaseRequisitionStatus;

    newStatus : PurchaseRequisitionStatus @mandatory;

    changedAt : Timestamp;

    changedBy : String(255);

    changedByName : String(255);

    reason : String(1000);
}


/* =========================================================
   PURCHASE ORDER
   ========================================================= */

@title: 'Purchase Order'
@assert.unique.purchaseOrderNumber: [ purchaseOrderNumber ]
entity PurchaseOrders : cuid, managed {

    purchaseOrderNumber : String(30);

    dealer : Association to Dealers @mandatory;

    paymentTerms : Association to PaymentTerms;

    status : PurchaseOrderStatus
        default 'DRAFT';

    orderDate : Date;

    requestedDeliveryDate : Date;

    currency : String(3) default 'INR';

    subtotal : Decimal(18,2) default 0;

    taxAmount : Decimal(18,2) default 0;

    totalAmount : Decimal(18,2) default 0;

    creditChecked : Boolean default false;

    creditBlocked : Boolean default false;

    creditBlockReason : String(1000);

    submittedAt : Timestamp;

    approvedAt : Timestamp;

    allocatedAt : Timestamp;

    dispatchedAt : Timestamp;

    deliveredAt : Timestamp;

    invoicedAt : Timestamp;

    closedAt : Timestamp;

    cancelledAt : Timestamp;

    cancellationReason : String(1000);

    remarks : String(1000);

    items : Composition of many PurchaseOrderItems
        on items.purchaseOrder = $self;

    approvals : Composition of many PurchaseOrderApprovals
        on approvals.purchaseOrder = $self;

    statusHistory : Composition of many PurchaseOrderStatusHistory
        on statusHistory.purchaseOrder = $self;
}


/* =========================================================
   PURCHASE ORDER ITEM
   ========================================================= */

@title: 'Purchase Order Item'
@assert.unique.purchaseOrderItem: [
    purchaseOrder,
    itemNumber
]
entity PurchaseOrderItems : cuid, managed {

    purchaseOrder :
        Association to PurchaseOrders @mandatory;

    itemNumber : Integer @mandatory;

    product : Association to Products @mandatory;

    quantity : Decimal(15,3) @mandatory;

    unitOfMeasure : String(10);

    unitPrice : Decimal(15,2) @mandatory;

    discountPercentage : Decimal(5,2) default 0;

    netAmount : Decimal(18,2);

    tax : Association to Taxes;

    taxPercentage : Decimal(5,2) default 0;

    taxAmount : Decimal(18,2);

    totalAmount : Decimal(18,2);

    currency : String(3) default 'INR';

    requestedDeliveryDate : Date;

    remarks : String(500);

    purchaseRequisitionItem :
        Association to PurchaseRequisitionItems;
}


/* =========================================================
   PURCHASE ORDER APPROVAL
   ========================================================= */

@title: 'Purchase Order Approval'
entity PurchaseOrderApprovals : cuid, managed {

    purchaseOrder :
        Association to PurchaseOrders @mandatory;

    approvalLevel : String(30) @mandatory;

    status : PurchaseOrderApprovalStatus
        default 'PENDING';

    approverUserId : String(255);

    approverName : String(255);

    approverEmail : String(255);

    requestedAt : Timestamp;

    approvedAt : Timestamp;

    rejectedAt : Timestamp;

    comments : String(1000);

    bpaInstanceId : String(255);
}


/* =========================================================
   PURCHASE ORDER STATUS HISTORY
   ========================================================= */

@title: 'Purchase Order Status History'
entity PurchaseOrderStatusHistory : cuid, managed {

    purchaseOrder :
        Association to PurchaseOrders @mandatory;

    previousStatus : PurchaseOrderStatus;

    newStatus : PurchaseOrderStatus @mandatory;

    changedAt : Timestamp;

    changedBy : String(255);

    changedByName : String(255);

    reason : String(1000);
}

