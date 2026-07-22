import { ApiProperty } from '@nestjs/swagger';
import { BillingInterval } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class ChangePlanDto {
  @ApiProperty()
  @IsString()
  companyId!: string;

  @ApiProperty({ enum: ['STARTER', 'PRO', 'ENTERPRISE'] })
  @IsString()
  planCode!: string;

  @ApiProperty({ enum: BillingInterval })
  @IsEnum(BillingInterval)
  interval!: BillingInterval;
}

export class CancelSubscriptionDto {
  @ApiProperty()
  @IsString()
  companyId!: string;

  @ApiProperty({ default: true })
  @IsBoolean()
  atPeriodEnd!: boolean;
}

export class MockWebhookDto {
  @ApiProperty()
  @IsString()
  providerEventId!: string;

  @ApiProperty()
  @IsString()
  companyId!: string;

  @ApiProperty()
  @IsString()
  type!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  signature?: string;
}
