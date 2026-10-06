
using {
    dealer360.Dealers as DealerEntity,
    dealer360.DealerAddresses as DealerAddressEntity,
    dealer360.DealerContacts as DealerContactEntity,
    dealer360.DealerDocuments as DealerDocumentEntity,
    dealer360.OnboardingApprovals as OnboardingApprovalEntity,
    dealer360.DealerStatusHistory as DealerStatusHistoryEntity
} from '../db/dealer';

using {
    dealer360.Regions as RegionEntity,
    dealer360.States as StateEntity,
    dealer360.DealerTypes as DealerTypeEntity,
    dealer360.PaymentTerms as PaymentTermEntity
} from '../db/master-data';


@path: '/dealer'

@title: 'DEALER360 Dealer Service'

@description: 'Dealer onboarding and dealer lifecycle management service'

service DealerService {

    /* =====================================================
       MASTER DATA
       ===================================================== */

    entity Regions
        as projection on RegionEntity;

    entity States
        as projection on StateEntity;

    entity DealerTypes
        as projection on DealerTypeEntity;

    entity PaymentTerms
        as projection on PaymentTermEntity;


    /* =====================================================
       DEALER
       ===================================================== */

    entity Dealers
        as projection on DealerEntity;


    /* =====================================================
       DEALER ADDRESSES
       ===================================================== */

    entity DealerAddresses
        as projection on DealerAddressEntity;


    /* =====================================================
       DEALER CONTACTS
       ===================================================== */

    entity DealerContacts
        as projection on DealerContactEntity;


    /* =====================================================
       DEALER DOCUMENTS
       ===================================================== */

    entity DealerDocuments
        as projection on DealerDocumentEntity;


    /* =====================================================
       ONBOARDING APPROVALS
       ===================================================== */

    entity OnboardingApprovals
        as projection on OnboardingApprovalEntity;


    /* =====================================================
       STATUS HISTORY
       ===================================================== */

    entity DealerStatusHistory
        as projection on DealerStatusHistoryEntity;


    /* =====================================================
       DEALER ONBOARDING ACTIONS
       ===================================================== */

    action submitDealer(
        dealerId : UUID
    ) returns Dealers;


    action l1Approve(
        dealerId : UUID
    ) returns Dealers;


    action l2Approve(
        dealerId : UUID
    ) returns Dealers;


    action rejectDealer(
        dealerId : UUID,
        reason : String(1000)
    ) returns Dealers;


    action blockDealer(
        dealerId : UUID,
        reason : String(1000)
    ) returns Dealers;


    action deactivateDealer(
        dealerId : UUID,
        reason : String(1000)
    ) returns Dealers;


    action reactivateDealer(
        dealerId : UUID
    ) returns Dealers;


    action unblockDealer(
        dealerId : UUID
    ) returns Dealers;

}
