namespace dealer360;


/* =========================================================
   DEALER360
   COMMON CDS TYPES AND ENUMERATIONS

   This file contains reusable business types only.
   No database entities are defined here.
   ========================================================= */


/* =========================================================
   COMMON DATA TYPES
   ========================================================= */

type CurrencyCode : String(3);

type CountryCode : String(2);

type LanguageCode : String(2);

type EmailAddress : String(255);

type PhoneNumber : String(30);

type Percentage : Decimal(5,2);

type Amount : Decimal(15,2);

type Quantity : Decimal(15,3);


/* =========================================================
   DEALER STATUS
   ========================================================= */

type DealerStatus : String enum {
    PENDING;
    SUBMITTED;
    L1_APPROVED;
    ACTIVE;
    REJECTED;
    BLOCKED;
    INACTIVE;
};


/* =========================================================
   DEALER TYPE
   ========================================================= */

type DealerType : String enum {
    AUTHORIZED_DEALER;
    DISTRIBUTOR;
    SUB_DEALER;
    SERVICE_DEALER;
};


/* =========================================================
   GENDER
   ========================================================= */

type Gender : String enum {
    MALE;
    FEMALE;
    OTHER;
};


/* =========================================================
   DOCUMENT TYPE
   ========================================================= */

type DocumentType : String enum {
    GST_CERTIFICATE;
    PAN_CARD;
    AADHAAR_CARD;
    BANK_PROOF;
    ADDRESS_PROOF;
    INCORPORATION_CERTIFICATE;
    OTHER;
};


/* =========================================================
   DOCUMENT STATUS
   ========================================================= */

type DocumentStatus : String enum {
    PENDING;
    VERIFIED;
    REJECTED;
    EXPIRED;
};


/* =========================================================
   APPROVAL STATUS
   ========================================================= */

type ApprovalStatus : String enum {
    PENDING;
    APPROVED;
    REJECTED;
    CANCELLED;
};


/* =========================================================
   APPROVAL LEVEL
   ========================================================= */

type ApprovalLevel : String enum {
    L1;
    L2;
    FINANCE;
    CREDIT;
};


/* =========================================================
   PRICE STATUS
   ========================================================= */

type PriceStatus : String enum {
    ACTIVE;
    INACTIVE;
    EXPIRED;
};


/* =========================================================
   CREDIT TRANSACTION TYPE
   ========================================================= */

type CreditTransactionType : String enum {
    CREDIT;
    DEBIT;
    RELEASE;
    ADJUSTMENT;
};


/* =========================================================
   CREDIT TRANSACTION STATUS
   ========================================================= */

type CreditTransactionStatus : String enum {
    POSTED;
    PENDING;
    CANCELLED;
};


/* =========================================================
   PURCHASE REQUISITION STATUS
   ========================================================= */

type PurchaseRequisitionStatus : String enum {
    DRAFT;
    SUBMITTED;
    PENDING_APPROVAL;
    APPROVED;
    REJECTED;
    CANCELLED;
    CONVERTED;
};


/* =========================================================
   PURCHASE ORDER STATUS
   ========================================================= */

type PurchaseOrderStatus : String enum {
    DRAFT;
    SUBMITTED;
    PENDING_APPROVAL;
    APPROVED;
    REJECTED;
    CREDIT_BLOCKED;
    ALLOCATED;
    DISPATCHED;
    DELIVERED;
    INVOICED;
    CLOSED;
    CANCELLED;
};


/* =========================================================
   PURCHASE ORDER APPROVAL STATUS
   ========================================================= */

type PurchaseOrderApprovalStatus : String enum {
    PENDING;
    APPROVED;
    REJECTED;
    CANCELLED;
};


/* =========================================================
   OUTBOX EVENT STATUS
   ========================================================= */

type OutboxEventStatus : String enum {
    PENDING;
    PROCESSING;
    PROCESSED;
    FAILED;
};


/* =========================================================
   ADDRESS TYPE
   ========================================================= */

type AddressType : String enum {
    REGISTERED;
    BILLING;
    SHIPPING;
    OFFICE;
    SERVICE;
};


/* =========================================================
   CONTACT TYPE
   ========================================================= */

type ContactType : String enum {
    PRIMARY;
    SALES;
    FINANCE;
    SERVICE;
    MANAGEMENT;
};


/* =========================================================
   PAYMENT MODE
   ========================================================= */

type PaymentMode : String enum {
    BANK_TRANSFER;
    CHEQUE;
    CASH;
    ONLINE;
};


/* =========================================================
   UNIT OF MEASURE
   ========================================================= */

type UnitOfMeasure : String enum {
    EA;
    KG;
    L;
    M;
    BOX;
    SET;
};