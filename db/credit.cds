namespace dealer360;

using { cuid, managed } from '@sap/cds/common';

using {
    dealer360.Dealers
} from './dealer';

using {
    dealer360.CreditTransactionType,
    dealer360.CreditTransactionStatus
} from './schema';


/* =========================================================
   DEALER CREDIT
   ---------------------------------------------------------
   Represents the credit facility assigned to a dealer.

   Business meaning:

   creditLimit     = Maximum credit approved for dealer
   usedCredit      = Credit currently consumed/reserved
   availableCredit = Display/reporting value

   IMPORTANT:
   The authoritative calculation is:

       available credit = creditLimit - usedCredit

   availableCredit is maintained for reporting/display.
   Business logic must not blindly trust it.
   ========================================================= */

@title: 'Dealer Credit'
@assert.unique.dealerCredit: [ dealer ]
entity DealerCredits : cuid, managed {

    dealer : Association to Dealers @mandatory;

    creditLimit : Decimal(18,2) @mandatory;

    usedCredit : Decimal(18,2) default 0;

    availableCredit : Decimal(18,2) default 0;

    currency : String(3) default 'INR';

    isBlocked : Boolean default false;

    blockedReason : String(1000);

    validFrom : Date;

    validTo : Date;

    lastCreditCheckAt : Timestamp;

    remarks : String(1000);
}


/* =========================================================
   CREDIT TRANSACTION
   ---------------------------------------------------------
   Immutable business/audit history of credit movements.

   CREDIT      -> Credit facility added
   DEBIT       -> Credit consumed
   RELEASE     -> Previously allocated credit released
   ADJUSTMENT  -> Manual/business adjustment
   ========================================================= */

@title: 'Credit Transaction'
entity CreditTransactions : cuid, managed {

    dealer : Association to Dealers @mandatory;

    transactionType : CreditTransactionType @mandatory;

    transactionStatus : CreditTransactionStatus
        default 'POSTED';

    amount : Decimal(18,2) @mandatory;

    currency : String(3) default 'INR';

    referenceType : String(50);

    referenceId : String(100);

    description : String(1000);

    transactionDate : Timestamp;

    postedAt : Timestamp;

    postedBy : String(255);

    reversalOf : Association to CreditTransactions;
}