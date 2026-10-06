/* =========================================================
   DEALER360 AUTHORIZATION
   ---------------------------------------------------------
   Uses the two roles that already exist in xs-security.json:

     User   = day-to-day work: read everything, create and
              edit dealers and requisitions, run the order
              and fulfillment flow
     Admin  = everything User can do, plus approvals,
              blocking, credit, pricing, master data and the
              integration monitor

   With the current auth "dummy" setting these annotations
   do not restrict anything, so local development is not
   affected. When auth is switched to XSUAA (BTP deployment)
   they are enforced without any code change - the role
   collections just have to be assigned to the users.
   ========================================================= */

using { DealerService }                      from './dealer-service';
using { CreditService }                      from './credit-service';
using { PricingService }                     from './pricing-service';
using { MasterDataService }                  from './master-data-service';
using { PurchaseRequisitionService }         from './purchase-requisition-service';
using { PurchaseRequisitionApprovalService } from './purchase-requisition-approval-service';
using { PurchaseOrderService }               from './purchase-order-service';
using { FulfillmentService }                 from './fulfillment-service';
using { IntegrationService }                 from './integration-service';
using { DashboardService }                   from './dashboard-service';


/* ---------------------------------------------------------
   BASELINE: every service needs at least the User role
   --------------------------------------------------------- */

annotate DealerService                      with @(requires: 'User');
annotate CreditService                      with @(requires: 'User');
annotate PricingService                     with @(requires: 'User');
annotate MasterDataService                  with @(requires: 'User');
annotate PurchaseRequisitionService         with @(requires: 'User');
annotate PurchaseRequisitionApprovalService with @(requires: 'User');
annotate PurchaseOrderService               with @(requires: 'User');
annotate FulfillmentService                 with @(requires: 'User');
annotate DashboardService                   with @(requires: 'User');

/* The integration monitor shows outbox payloads: Admin only */
annotate IntegrationService                 with @(requires: 'Admin');


/* ---------------------------------------------------------
   DEALERS
   --------------------------------------------------------- */

annotate DealerService.submitDealer     with @(requires: 'User');

annotate DealerService.l1Approve        with @(requires: 'Admin');
annotate DealerService.l2Approve        with @(requires: 'Admin');
annotate DealerService.rejectDealer     with @(requires: 'Admin');
annotate DealerService.blockDealer      with @(requires: 'Admin');
annotate DealerService.unblockDealer    with @(requires: 'Admin');
annotate DealerService.deactivateDealer with @(requires: 'Admin');
annotate DealerService.reactivateDealer with @(requires: 'Admin');

/* Onboarding history is written by the system only */
annotate DealerService.OnboardingApprovals with @(restrict: [{ grant: 'READ', to: 'User' }]);
annotate DealerService.DealerStatusHistory with @(restrict: [{ grant: 'READ', to: 'User' }]);

/* Reference data is maintained in MasterDataService (Admin) */
annotate DealerService.Regions      with @(restrict: [{ grant: 'READ', to: 'User' }]);
annotate DealerService.States       with @(restrict: [{ grant: 'READ', to: 'User' }]);
annotate DealerService.DealerTypes  with @(restrict: [{ grant: 'READ', to: 'User' }]);
annotate DealerService.PaymentTerms with @(restrict: [{ grant: 'READ', to: 'User' }]);


/* ---------------------------------------------------------
   CREDIT  (money: Admin only for anything that changes it)
   --------------------------------------------------------- */

annotate CreditService.checkCredit    with @(requires: 'User');

annotate CreditService.allocateCredit with @(requires: 'Admin');
annotate CreditService.releaseCredit  with @(requires: 'Admin');
annotate CreditService.blockCredit    with @(requires: 'Admin');
annotate CreditService.unblockCredit  with @(requires: 'Admin');

annotate CreditService.DealerCredits with @(restrict: [
    { grant: 'READ',  to: 'User'  },
    { grant: 'WRITE', to: 'Admin' }
]);


/* ---------------------------------------------------------
   PRICING
   --------------------------------------------------------- */

annotate PricingService.calculateDealerPrice with @(requires: 'User');

annotate PricingService.ProductPrices with @(restrict: [
    { grant: 'READ',  to: 'User'  },
    { grant: 'WRITE', to: 'Admin' }
]);

annotate PricingService.DealerPrices with @(restrict: [
    { grant: 'READ',  to: 'User'  },
    { grant: 'WRITE', to: 'Admin' }
]);

annotate PricingService.QuantityPriceSlabs with @(restrict: [
    { grant: 'READ',  to: 'User'  },
    { grant: 'WRITE', to: 'Admin' }
]);


/* ---------------------------------------------------------
   MASTER DATA
   --------------------------------------------------------- */

annotate MasterDataService.Regions with @(restrict: [
    { grant: 'READ',  to: 'User'  },
    { grant: 'WRITE', to: 'Admin' }
]);

annotate MasterDataService.States with @(restrict: [
    { grant: 'READ',  to: 'User'  },
    { grant: 'WRITE', to: 'Admin' }
]);

annotate MasterDataService.DealerTypes with @(restrict: [
    { grant: 'READ',  to: 'User'  },
    { grant: 'WRITE', to: 'Admin' }
]);

annotate MasterDataService.PaymentTerms with @(restrict: [
    { grant: 'READ',  to: 'User'  },
    { grant: 'WRITE', to: 'Admin' }
]);

annotate MasterDataService.ProductCategories with @(restrict: [
    { grant: 'READ',  to: 'User'  },
    { grant: 'WRITE', to: 'Admin' }
]);

annotate MasterDataService.Products with @(restrict: [
    { grant: 'READ',  to: 'User'  },
    { grant: 'WRITE', to: 'Admin' }
]);

annotate MasterDataService.Taxes with @(restrict: [
    { grant: 'READ',  to: 'User'  },
    { grant: 'WRITE', to: 'Admin' }
]);


/* ---------------------------------------------------------
   PURCHASE REQUISITION
   --------------------------------------------------------- */

annotate PurchaseRequisitionService.submitPurchaseRequisition with @(requires: 'User');
annotate PurchaseRequisitionService.cancelPurchaseRequisition with @(requires: 'User');
annotate PurchaseRequisitionService.convertToPurchaseOrder    with @(requires: 'Admin');

/* Approval decisions are Admin only; starting an approval is part of submitting */
annotate PurchaseRequisitionApprovalService.startApproval           with @(requires: 'User');
annotate PurchaseRequisitionApprovalService.processApprovalDecision with @(requires: 'Admin');


/* ---------------------------------------------------------
   PURCHASE ORDER
   --------------------------------------------------------- */

annotate PurchaseOrderService.submitPurchaseOrder        with @(requires: 'User');
annotate PurchaseOrderService.startPurchaseOrderApproval with @(requires: 'User');
annotate PurchaseOrderService.cancelPurchaseOrder        with @(requires: 'User');

annotate PurchaseOrderService.processPurchaseOrderApprovalDecision with @(requires: 'Admin');
annotate PurchaseOrderService.allocateCreditToPurchaseOrder        with @(requires: 'Admin');


/* ---------------------------------------------------------
   FULFILLMENT
   --------------------------------------------------------- */

annotate FulfillmentService.createFulfillment   with @(requires: 'User');
annotate FulfillmentService.dispatchFulfillment with @(requires: 'User');
annotate FulfillmentService.deliverFulfillment  with @(requires: 'User');
annotate FulfillmentService.invoiceFulfillment  with @(requires: 'User');
annotate FulfillmentService.closeFulfillment    with @(requires: 'User');

annotate FulfillmentService.cancelFulfillment   with @(requires: 'Admin');
