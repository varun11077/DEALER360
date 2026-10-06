namespace dealer360;

using { cuid, managed } from '@sap/cds/common';


/* =========================================================
   REGION
   ========================================================= */

@title: 'Region'
entity Regions : cuid, managed {

    code : String(10) @mandatory;

    name : String(100) @mandatory;

    description : String(255);

    isActive : Boolean default true;

}


/* =========================================================
   STATE
   ========================================================= */

@title: 'State'
entity States : cuid, managed {

    code : String(10) @mandatory;

    name : String(100) @mandatory;

    description : String(255);

    region : Association to Regions @mandatory;

    countryCode : String(2) default 'IN';

    isActive : Boolean default true;

}


/* =========================================================
   DEALER TYPE MASTER
   ========================================================= */

@title: 'Dealer Type'
entity DealerTypes : cuid, managed {

    code : String(30) @mandatory;

    name : String(100) @mandatory;

    description : String(255);

    isActive : Boolean default true;

}


/* =========================================================
   PAYMENT TERMS
   ========================================================= */

@title: 'Payment Terms'
entity PaymentTerms : cuid, managed {

    code : String(20) @mandatory;

    name : String(100) @mandatory;

    description : String(255);

    creditDays : Integer default 0;

    isActive : Boolean default true;

}


/* =========================================================
   PRODUCT CATEGORY
   ========================================================= */

@title: 'Product Category'
entity ProductCategories : cuid, managed {

    code : String(30) @mandatory;

    name : String(100) @mandatory;

    description : String(255);

    isActive : Boolean default true;

}


/* =========================================================
   PRODUCT
   ========================================================= */

@title: 'Product'
entity Products : cuid, managed {

    productCode : String(40) @mandatory;

    productName : String(150) @mandatory;

    description : String(500);

    category : Association to ProductCategories @mandatory;

    unitOfMeasure : String(10);

    basePrice : Decimal(15,2);

    currency : String(3) default 'INR';

    isActive : Boolean default true;

}


/* =========================================================
   TAX MASTER
   ========================================================= */

@title: 'Tax'
entity Taxes : cuid, managed {

    code : String(20) @mandatory;

    name : String(100) @mandatory;

    percentage : Decimal(5,2) @mandatory;

    description : String(255);

    isActive : Boolean default true;

}