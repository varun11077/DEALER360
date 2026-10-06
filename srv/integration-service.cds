using {
    dealer360.OutboxEvents as OutboxEventEntity
} from '../db/integration';

@path: '/integration'
@title: 'DEALER360 Integration Service'
@description: 'Integration and Outbox event monitoring service'

service IntegrationService {

    @readonly
    entity OutboxEvents
        as projection on OutboxEventEntity;

}