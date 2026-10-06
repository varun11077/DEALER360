namespace dealer360;

using {
   cuid,
   managed
} from '@sap/cds/common';

using {
   dealer360.Regions,
   dealer360.States,
   dealer360.DealerTypes,
   dealer360.PaymentTerms
} from './master-data';

using {
   dealer360.DealerStatus,
   dealer360.AddressType,
   dealer360.ContactType,
   dealer360.Gender,
   dealer360.DocumentType,
   dealer360.DocumentStatus,
   dealer360.ApprovalLevel,
   dealer360.ApprovalStatus
} from './schema';


@title                   : 'Dealer'
@assert.unique.dealerCode: [dealerCode]
entity Dealers : cuid, managed {

   dealerCode          : String(20);

   legalName           : String(200)                @mandatory;

   tradeName           : String(200);

   dealerType          : Association to DealerTypes @mandatory;

   status              : DealerStatus default 'PENDING';


   /* =====================================================
      REGISTRATION INFORMATION
      ===================================================== */

   gstNumber           : String(15);

   panNumber           : String(10);

   registrationNumber  : String(50);

   registrationDate    : Date;


   /* =====================================================
      CONTACT INFORMATION
      ===================================================== */

   primaryEmail        : String(255);

   primaryPhone        : String(30);

   alternatePhone      : String(30);

   website             : String(255);


   /* =====================================================
      BUSINESS INFORMATION
      ===================================================== */

   annualTurnover      : Decimal(18, 2);

   employeeCount       : Integer;

   yearEstablished     : Integer;


   /* =====================================================
      ORGANIZATIONAL LOCATION
      ===================================================== */

   region              : Association to Regions;

   state               : Association to States;


   /* =====================================================
      FINANCIAL INFORMATION
      ===================================================== */

   paymentTerms        : Association to PaymentTerms;

   creditLimit         : Decimal(18, 2);

   currency            : String(3) default 'INR';


   /* =====================================================
      BANK INFORMATION
      ===================================================== */

   bankName            : String(150);

   bankBranch          : String(150);

   bankAccountNumber   : String(50);

   ifscCode            : String(20);


   /* =====================================================
      ONBOARDING INFORMATION
      ===================================================== */

   onboardingRemarks   : String(1000);

   submittedAt         : Timestamp;

   l1ApprovedAt        : Timestamp;

   activatedAt         : Timestamp;

   rejectedAt          : Timestamp;

   blockedAt           : Timestamp;

   rejectionReason     : String(1000);

   blockReason         : String(1000);


   /* =====================================================
      CHILD OBJECTS
      ===================================================== */

   addresses           : Composition of many DealerAddresses
                            on addresses.dealer = $self;

   contacts            : Composition of many DealerContacts
                            on contacts.dealer = $self;

   documents           : Composition of many DealerDocuments
                            on documents.dealer = $self;

   onboardingApprovals : Composition of many OnboardingApprovals
                            on onboardingApprovals.dealer = $self;

   statusHistory       : Composition of many DealerStatusHistory
                            on statusHistory.dealer = $self;
}


/* =========================================================
   DEALER ADDRESS
   ========================================================= */

@title: 'Dealer Address'
entity DealerAddresses : cuid, managed {

   dealer       : Association to Dealers @mandatory;

   addressType  : AddressType            @mandatory;

   addressLine1 : String(200)            @mandatory;

   addressLine2 : String(200);

   addressLine3 : String(200);

   city         : String(100)            @mandatory;

   district     : String(100);

   state        : Association to States;

   postalCode   : String(10);

   countryCode  : String(2) default 'IN';

   latitude     : Decimal(10, 7);

   longitude    : Decimal(10, 7);

   isPrimary    : Boolean default false;

   isActive     : Boolean default true;
}


/* =========================================================
   DEALER CONTACT
   ========================================================= */

@title: 'Dealer Contact'
entity DealerContacts : cuid, managed {

   dealer         : Association to Dealers @mandatory;

   contactType    : ContactType            @mandatory;

   firstName      : String(100)            @mandatory;

   lastName       : String(100);

   designation    : String(100);

   gender         : Gender;

   email          : String(255);

   phone          : String(30);

   alternatePhone : String(30);

   dateOfBirth    : Date;

   isPrimary      : Boolean default false;

   isActive       : Boolean default true;
}


/* =========================================================
   DEALER DOCUMENT
   ========================================================= */

@title: 'Dealer Document'
entity DealerDocuments : cuid, managed {

   dealer              : Association to Dealers @mandatory;

   documentType        : DocumentType           @mandatory;

   documentNumber      : String(100);

   fileName            : String(255);

   mimeType            : String(100);

   fileSize            : Integer64;

   storageUrl          : String(1000);

   documentStatus      : DocumentStatus default 'PENDING';

   uploadedAt          : Timestamp;

   verifiedAt          : Timestamp;

   expiryDate          : Date;

   verificationRemarks : String(1000);

   isMandatory         : Boolean default false;
}


/* =========================================================
   ONBOARDING APPROVAL
   ========================================================= */

@title: 'Onboarding Approval'
entity OnboardingApprovals : cuid, managed {

   dealer         : Association to Dealers @mandatory;

   approvalLevel  : ApprovalLevel          @mandatory;

   status         : ApprovalStatus default 'PENDING';

   approverUserId : String(255);

   approverName   : String(255);

   approverEmail  : String(255);

   requestedAt    : Timestamp;

   approvedAt     : Timestamp;

   rejectedAt     : Timestamp;

   comments       : String(1000);

   bpaInstanceId  : String(255);
}


/* =========================================================
   DEALER STATUS HISTORY
   ========================================================= */

@title: 'Dealer Status History'
entity DealerStatusHistory : cuid, managed {

   dealer         : Association to Dealers @mandatory;

   previousStatus : DealerStatus;

   newStatus      : DealerStatus           @mandatory;

   changedAt      : Timestamp;

   changedBy      : String(255);

   changedByName  : String(255);

   reason         : String(1000);
}
