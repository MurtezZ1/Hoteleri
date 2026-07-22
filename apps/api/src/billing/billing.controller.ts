import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { BillingService } from './billing.service';
import { CancelSubscriptionDto, ChangePlanDto, MockWebhookDto } from './dto';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('plans')
  plans() {
    return this.billing.plans();
  }

  @Get('subscription/:companyId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('settings.manage')
  subscription(@CurrentUser() user: AuthenticatedUser, @Param('companyId') companyId: string) {
    return this.billing.subscription(user.sub, companyId);
  }

  @Post('change-plan')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('settings.manage')
  changePlan(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePlanDto) {
    return this.billing.changePlan(user.sub, dto.companyId, dto.planCode, dto.interval);
  }

  @Post('cancel')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('settings.manage')
  cancel(@CurrentUser() user: AuthenticatedUser, @Body() dto: CancelSubscriptionDto) {
    return this.billing.cancel(user.sub, dto.companyId, dto.atPeriodEnd);
  }

  @Post('webhooks/mock')
  mockWebhook(@Body() dto: MockWebhookDto) {
    return this.billing.recordMockWebhook(dto);
  }
}
