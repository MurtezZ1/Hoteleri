import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { GuestsModule } from './guests/guests.module';
import { HealthModule } from './health/health.module';
import { ModuleRecordsModule } from './module-records/module-records.module';
import { PrismaModule } from './prisma/prisma.module';
import { PropertiesModule } from './properties/properties.module';
import { ReservationsModule } from './reservations/reservations.module';
import { RoomsModule } from './rooms/rooms.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    CompaniesModule,
    PropertiesModule,
    RoomsModule,
    GuestsModule,
    HealthModule,
    ReservationsModule,
    ModuleRecordsModule,
    DashboardModule,
  ],
})
export class AppModule {}
