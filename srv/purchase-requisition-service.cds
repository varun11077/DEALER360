using {
    dealer360.PurchaseRequisitions as PurchaseRequisitionEntity,
    dealer360.PurchaseRequisitionItems as PurchaseRequisitionItemEntity,
    dealer360.PurchaseRequisitionStatusHistory as PurchaseRequisitionStatusHistoryEntity
} from '../db/purchasing';


@path: '/purchase-requisition'
@title: 'DEALER360 Purchase Requisition Service'
@description: 'Purchase Requisition management and lifecycle service'

service PurchaseRequisitionService {

    entity PurchaseRequisitions
        as projection on PurchaseRequisitionEntity;

    entity PurchaseRequisitionItems
        as projection on PurchaseRequisitionItemEntity;

    /* Status timeline - written by the lifecycle actions only */
    @readonly
    entity PurchaseRequisitionStatusHistory
        as projection on PurchaseRequisitionStatusHistoryEntity;


    /* =====================================================
       SUBMIT PURCHASE REQUISITION
       ===================================================== */

    action submitPurchaseRequisition(
        requisitionId : UUID
    ) returns PurchaseRequisitions;


    /* =====================================================
       CONVERT PR TO PURCHASE ORDER
       ===================================================== */

    action convertToPurchaseOrder(
        requisitionId : UUID
    ) returns UUID;

    /* =====================================================
       CANCEL PURCHASE REQUISITION
       ===================================================== */

    action cancelPurchaseRequisition(
        requisitionId : UUID,
        reason : String(1000)
    ) returns PurchaseRequisitions;

}
