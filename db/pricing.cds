namespace dealer360;

using { cuid, managed } from '@sap/cds/common';

using {
    dealer360.Products
} from './master-data';

using {
    dealer360.Dealers
} from './dealer';

using {
    dealer360.PriceStatus
} from './schema';


/* =========================================================
   PRODUCT PRICE
   ========================================================= */

@title: 'Product Price'
entity ProductPrices : cuid, managed {

    product : Association to Products @mandatory;

    price : Decimal(15,2) @mandatory;

    currency : String(3) default 'INR';

    validFrom : Date @mandatory;

    validTo : Date;

    status : PriceStatus default 'ACTIVE';

    remarks : String(500);
}


/* =========================================================
   DEALER PRICE
   ========================================================= */

@title: 'Dealer Price'
entity DealerPrices : cuid, managed {

    dealer : Association to Dealers @mandatory;

    product : Association to Products @mandatory;

    price : Decimal(15,2) @mandatory;

    currency : String(3) default 'INR';

    discountPercentage : Decimal(5,2) default 0;

    validFrom : Date @mandatory;

    validTo : Date;

    status : PriceStatus default 'ACTIVE';

    remarks : String(500);
}
@title: 'Quantity Price Slab'
entity QuantityPriceSlabs : cuid, managed {

    product : Association to Products @mandatory;

    dealer : Association to Dealers;

    minQuantity : Decimal(15,3) @mandatory;

    maxQuantity : Decimal(15,3);

    discountPercentage : Decimal(5,2) default 0;

    validFrom : Date @mandatory;

    validTo : Date;

    status : PriceStatus default 'ACTIVE';

    remarks : String(500);
}

/* =========================================================
   PRICE HISTORY
   ========================================================= */

@title: 'Price History'
entity PriceHistory : cuid, managed {

    dealer : Association to Dealers;

    product : Association to Products @mandatory;

    priceType : String(30) @mandatory;

    previousPrice : Decimal(15,2);

    newPrice : Decimal(15,2) @mandatory;

    currency : String(3) default 'INR';

    previousDiscountPercentage : Decimal(5,2);

    newDiscountPercentage : Decimal(5,2);

    changedAt : Timestamp;

    changedByUserId : String(255);

    reason : String(1000);
}