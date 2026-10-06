using {
dealer360.Regions as RegionEntity,
dealer360.States as StateEntity,
dealer360.DealerTypes as DealerTypeEntity,
dealer360.PaymentTerms as PaymentTermEntity,
dealer360.ProductCategories as ProductCategoryEntity,
dealer360.Products as ProductEntity,
dealer360.Taxes as TaxEntity
} from '../db/master-data';

@path: '/master-data'
@title: 'DEALER360 Master Data Service'
@description: 'Central master data service for DEALER360'

service MasterDataService {


entity Regions
    as projection on RegionEntity;

entity States
    as projection on StateEntity;

entity DealerTypes
    as projection on DealerTypeEntity;

entity PaymentTerms
    as projection on PaymentTermEntity;

entity ProductCategories
    as projection on ProductCategoryEntity;

entity Products
    as projection on ProductEntity;

entity Taxes
    as projection on TaxEntity;


}
