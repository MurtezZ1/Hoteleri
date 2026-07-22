import { Global, Module } from '@nestjs/common';
import { PermissionsGuard } from '../common/permissions.guard';
import { TenantAccessService } from '../common/tenant-access.service';
import { SubscriptionGuardService } from '../common/subscription-guard.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, TenantAccessService, SubscriptionGuardService, PermissionsGuard],
  exports: [PrismaService, TenantAccessService, SubscriptionGuardService, PermissionsGuard],
})
export class PrismaModule {}
