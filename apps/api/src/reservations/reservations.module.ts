import { Module } from '@nestjs/common';
import {
  HousekeepingController,
  InvoicesController,
  MaintenanceController,
  ReservationsController,
} from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [WhatsAppModule],
  controllers: [
    ReservationsController,
    HousekeepingController,
    MaintenanceController,
    InvoicesController,
  ],
  providers: [ReservationsService],
})
export class ReservationsModule {}
