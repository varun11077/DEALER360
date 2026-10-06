using {
    dealer360.ProductPrices as ProductPriceEntity,
    dealer360.DealerPrices as DealerPriceEntity,
    dealer360.QuantityPriceSlabs as QuantityPriceSlabEntity,
    dealer360.PriceHistory as PriceHistoryEntity
} from '../db/pricing';

using {
    dealer360.Products as ProductEntity
} from '../db/master-data';

using {
    dealer360.Dealers as DealerEntity
} from '../db/dealer';


@path: '/pricing'
@title: 'DEALER360 Pricing Service'
@description: 'Product, dealer-specific and quantity-based pricing service'

service PricingService {

    entity Products
        as projection on ProductEntity;

    entity Dealers
        as projection on DealerEntity;

    entity ProductPrices
        as projection on ProductPriceEntity;

    entity DealerPrices
        as projection on DealerPriceEntity;

    entity QuantityPriceSlabs
        as projection on QuantityPriceSlabEntity;

    entity PriceHistory
        as projection on PriceHistoryEntity;

    action calculateDealerPrice(
        dealerId : UUID,
        productId : UUID,
        quantity : Decimal(15,3)
    ) returns Decimal(15,2);

}