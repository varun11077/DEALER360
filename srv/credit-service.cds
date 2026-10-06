using {
    dealer360.DealerCredits as DealerCreditEntity,
    dealer360.CreditTransactions as CreditTransactionEntity
} from '../db/credit';

using {
    dealer360.Dealers as DealerEntity
} from '../db/dealer';


type CreditCheckResult {
    allowed : Boolean;

    dealerId : UUID;

    creditLimit : Decimal(18,2);

    usedCredit : Decimal(18,2);

    availableCredit : Decimal(18,2);

    requiredAmount : Decimal(18,2);

    remainingCredit : Decimal(18,2);

    currency : String(3);

    reason : String(1000);
}


@path: '/credit'
@title: 'DEALER360 Credit Service'
@description: 'Dealer credit management, credit checks and credit allocation'

service CreditService {

    entity Dealers
        as projection on DealerEntity;


    /* =====================================================
       CREDIT FACILITY
       -----------------------------------------------------
       CREATE is allowed because the initial credit facility
       must be created for a dealer.

       UPDATE/DELETE should later be controlled through
       dedicated business actions if required.
       ===================================================== */

    entity DealerCredits
        as projection on DealerCreditEntity;


    /* =====================================================
       CREDIT TRANSACTIONS
       -----------------------------------------------------
       Transactions are audit records.

       They must NOT be directly modified by consumers.
       ===================================================== */

    @readonly
    entity CreditTransactions
        as projection on CreditTransactionEntity;


    /* =====================================================
       CREDIT CHECK
       ===================================================== */

    action checkCredit(
        dealerId : UUID,
        amount : Decimal(18,2)
    ) returns CreditCheckResult;


    /* =====================================================
       ALLOCATE CREDIT
       ===================================================== */

    action allocateCredit(
        dealerId : UUID,
        amount : Decimal(18,2),
        referenceType : String(50),
        referenceId : String(100),
        description : String(1000)
    ) returns CreditCheckResult;


    /* =====================================================
       RELEASE CREDIT
       ===================================================== */

    action releaseCredit(
        dealerId : UUID,
        amount : Decimal(18,2),
        referenceType : String(50),
        referenceId : String(100),
        description : String(1000)
    ) returns CreditCheckResult;


    /* =====================================================
       BLOCK CREDIT
       ===================================================== */

    action blockCredit(
        dealerId : UUID,
        reason : String(1000)
    ) returns DealerCredits;


    /* =====================================================
       UNBLOCK CREDIT
       ===================================================== */

    action unblockCredit(
        dealerId : UUID
    ) returns DealerCredits;
}