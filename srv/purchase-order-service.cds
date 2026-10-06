using {
    dealer360.PurchaseOrders as PurchaseOrderEntity,
    dealer360.PurchaseOrderItems as PurchaseOrderItemEntity,
    dealer360.PurchaseOrderApprovals as PurchaseOrderApprovalEntity,
    dealer360.PurchaseOrderStatusHistory as PurchaseOrderStatusHistoryEntity
} from '../db/purchasing';


@path: '/purchase-order'
@title: 'DEALER360 Purchase Order Service'
@description: 'Purchase Order management and lifecycle service'

service PurchaseOrderService {

    /* =====================================================
       PURCHASE ORDER
       ===================================================== */

    entity PurchaseOrders
        as projection on PurchaseOrderEntity;


    /* =====================================================
       PURCHASE ORDER ITEMS
       ===================================================== */

    entity PurchaseOrderItems
        as projection on PurchaseOrderItemEntity;


    /* =====================================================
       PURCHASE ORDER APPROVALS
       ===================================================== */

    entity PurchaseOrderApprovals
        as projection on PurchaseOrderApprovalEntity;


    /* =====================================================
       PURCHASE ORDER STATUS HISTORY
       ===================================================== */

    entity PurchaseOrderStatusHistory
        as projection on PurchaseOrderStatusHistoryEntity;


    /* =====================================================
       SUBMIT PURCHASE ORDER
       ===================================================== */

    action submitPurchaseOrder(
        purchaseOrderId : UUID
    ) returns PurchaseOrders;


    /* =====================================================
       START PURCHASE ORDER APPROVAL
       ===================================================== */

    action startPurchaseOrderApproval(
        purchaseOrderId : UUID
    ) returns UUID;


    /* =====================================================
       PROCESS PURCHASE ORDER APPROVAL DECISION
       ===================================================== */

    action processPurchaseOrderApprovalDecision(
        approvalRequestId : UUID,
        decision : String(30),
        comments : String(2000),
        bpaInstanceId : String(255),
        bpaTaskId : String(255),
        correlationId : String(255)
    ) returns UUID;


    /* =====================================================
       CHECK AND ALLOCATE CREDIT
       ===================================================== */

    action allocateCreditToPurchaseOrder(
        purchaseOrderId : UUID
    ) returns UUID;

    /* =====================================================
       CANCEL PURCHASE ORDER
       ===================================================== */

    action cancelPurchaseOrder(
        purchaseOrderId : UUID,
        reason : String(1000)
    ) returns PurchaseOrders;

}
