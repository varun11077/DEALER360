
namespace dealer360;

using { cuid, managed } from '@sap/cds/common';

using {
    dealer360.PurchaseRequisitions
} from './purchasing';

using {
    dealer360.ApprovalLevel,
    dealer360.ApprovalStatus
} from './schema';


/* =========================================================
   PURCHASE REQUISITION APPROVAL REQUEST
   ========================================================= */

@title: 'Purchase Requisition Approval Request'
@assert.unique.approvalRequest: [purchaseRequisition, approvalLevel]
entity PurchaseRequisitionApprovalRequests : cuid, managed {

    @mandatory
    purchaseRequisition : Association to PurchaseRequisitions;

    @mandatory
    approvalLevel : ApprovalLevel;

    status : ApprovalStatus default 'PENDING';

    requestedAt : Timestamp;

    requestedByUserId : String(255);

    requestedByName : String(255);

    requestedByEmail : String(255);

    approverUserId : String(255);

    approverName : String(255);

    approverEmail : String(255);

    approvedAt : Timestamp;

    rejectedAt : Timestamp;

    decisionComments : String(2000);

    bpaDefinitionId : String(255);

    bpaInstanceId : String(255);

    bpaTaskId : String(255);

    callbackReceivedAt : Timestamp;

    callbackCorrelationId : String(255);

    errorMessage : String(2000);
}


/* =========================================================
   PURCHASE REQUISITION APPROVAL HISTORY
   ========================================================= */

@title: 'Purchase Requisition Approval History'
entity PurchaseRequisitionApprovalHistory : cuid, managed {

    @mandatory
    purchaseRequisition : Association to PurchaseRequisitions;

    approvalRequest :
        Association to PurchaseRequisitionApprovalRequests;

    @mandatory
    approvalLevel : ApprovalLevel;

    previousStatus : ApprovalStatus;

    @mandatory
    newStatus : ApprovalStatus;

    @mandatory
    decision : String(30);

    performedAt : Timestamp;

    performedByUserId : String(255);

    performedByName : String(255);

    performedByEmail : String(255);

    comments : String(2000);

    bpaInstanceId : String(255);

    bpaTaskId : String(255);

    correlationId : String(255);
}

