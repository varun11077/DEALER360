
using {
    dealer360.PurchaseRequisitionApprovalRequests as ApprovalRequestEntity,
    dealer360.PurchaseRequisitionApprovalHistory as ApprovalHistoryEntity
} from '../db/approval';

using {
    dealer360.PurchaseRequisitions as PurchaseRequisitionEntity
} from '../db/purchasing';


type ApprovalStartResult {
    success : Boolean;
    approvalRequestId : UUID;
    purchaseRequisitionId : UUID;
    requisitionNumber : String(50);
    status : String(30);
    message : String(1000);
}


type ApprovalDecisionResult {
    success : Boolean;
    approvalRequestId : UUID;
    purchaseRequisitionId : UUID;
    requisitionNumber : String(50);
    decision : String(30);
    status : String(30);
    message : String(1000);
}


@path: '/purchase-requisition-approval'
@title: 'DEALER360 Purchase Requisition Approval Service'
@description: 'PR approval orchestration and BPA integration service'

service PurchaseRequisitionApprovalService {

    @readonly
    entity PurchaseRequisitions
        as projection on PurchaseRequisitionEntity;

    @readonly
    entity ApprovalRequests
        as projection on ApprovalRequestEntity;

    @readonly
    entity ApprovalHistory
        as projection on ApprovalHistoryEntity;


    /* =====================================================
       START PR APPROVAL
       ===================================================== */

    action startApproval(
        requisitionId : UUID
    ) returns ApprovalStartResult;


    /* =====================================================
       BPA APPROVAL CALLBACK
       ===================================================== */

    action processApprovalDecision(
        approvalRequestId : UUID,
        decision : String(30),
        comments : String(2000),
        bpaInstanceId : String(255),
        bpaTaskId : String(255),
        correlationId : String(255)
    ) returns ApprovalDecisionResult;

}

