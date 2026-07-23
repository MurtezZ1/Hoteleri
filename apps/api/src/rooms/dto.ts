import { ApiProperty } from '@nestjs/swagger';
import {
  FeeRuleType,
  PromotionType,
  RatePlanType,
  RateRestrictionType,
  RoomStatus,
  SaleStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateRoomTypeDto {
  @ApiProperty()
  @IsString()
  propertyId!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  capacity!: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  adultsLimit!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  childrenLimit!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  basePrice!: number;

  @ApiProperty({ enum: SaleStatus, required: false })
  @IsOptional()
  @IsEnum(SaleStatus)
  saleStatus?: SaleStatus;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenityNames?: string[];

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoUrls?: string[];
}

export class UpdateRoomTypeDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  capacity?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  adultsLimit?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  childrenLimit?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  basePrice?: number;

  @ApiProperty({ enum: SaleStatus, required: false })
  @IsOptional()
  @IsEnum(SaleStatus)
  saleStatus?: SaleStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateRoomDto {
  @ApiProperty()
  @IsString()
  propertyId!: string;

  @ApiProperty()
  @IsString()
  roomTypeId!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  floor?: string;

  @ApiProperty({ enum: RoomStatus, required: false })
  @IsOptional()
  @IsEnum(RoomStatus)
  status?: RoomStatus;

  @ApiProperty({ enum: SaleStatus, required: false })
  @IsOptional()
  @IsEnum(SaleStatus)
  saleStatus?: SaleStatus;
}

export class UpdateRoomDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  roomTypeId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  floor?: string;

  @ApiProperty({ enum: RoomStatus, required: false })
  @IsOptional()
  @IsEnum(RoomStatus)
  status?: RoomStatus;

  @ApiProperty({ enum: RoomStatus, required: false })
  @IsOptional()
  @IsEnum(RoomStatus)
  cleaningStatus?: RoomStatus;

  @ApiProperty({ enum: RoomStatus, required: false })
  @IsOptional()
  @IsEnum(RoomStatus)
  maintenanceStatus?: RoomStatus;

  @ApiProperty({ enum: SaleStatus, required: false })
  @IsOptional()
  @IsEnum(SaleStatus)
  saleStatus?: SaleStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class BulkCreateRoomsDto {
  @ApiProperty()
  @IsString()
  propertyId!: string;

  @ApiProperty()
  @IsString()
  roomTypeId!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  names!: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  floor?: string;
}

export class BulkRoomStatusDto {
  @ApiProperty()
  @IsString()
  propertyId!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  roomIds!: string[];

  @ApiProperty({ enum: RoomStatus, required: false })
  @IsOptional()
  @IsEnum(RoomStatus)
  status?: RoomStatus;

  @ApiProperty({ enum: RoomStatus, required: false })
  @IsOptional()
  @IsEnum(RoomStatus)
  cleaningStatus?: RoomStatus;

  @ApiProperty({ enum: RoomStatus, required: false })
  @IsOptional()
  @IsEnum(RoomStatus)
  maintenanceStatus?: RoomStatus;

  @ApiProperty({ enum: SaleStatus, required: false })
  @IsOptional()
  @IsEnum(SaleStatus)
  saleStatus?: SaleStatus;
}

export class CreateRatePlanDto {
  @ApiProperty()
  @IsString()
  propertyId!: string;

  @ApiProperty()
  @IsString()
  roomTypeId!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  code!: string;

  @ApiProperty({ enum: RatePlanType, required: false })
  @IsOptional()
  @IsEnum(RatePlanType)
  type?: RatePlanType;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  basePrice!: number;
}

export class BulkDailyRateItemDto {
  @ApiProperty()
  @IsDateString()
  date!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price!: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  closed?: boolean;
}

export class BulkDailyRateDto {
  @ApiProperty()
  @IsString()
  propertyId!: string;

  @ApiProperty()
  @IsString()
  ratePlanId!: string;

  @ApiProperty({ type: [BulkDailyRateItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkDailyRateItemDto)
  rates!: BulkDailyRateItemDto[];
}

export class UpsertRestrictionDto {
  @ApiProperty()
  @IsString()
  propertyId!: string;

  @ApiProperty()
  @IsString()
  roomTypeId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  ratePlanId?: string;

  @ApiProperty()
  @IsDateString()
  date!: string;

  @ApiProperty({ enum: RateRestrictionType })
  @IsEnum(RateRestrictionType)
  type!: RateRestrictionType;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  value!: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpsertInventoryOverrideDto {
  @ApiProperty()
  @IsString()
  propertyId!: string;

  @ApiProperty()
  @IsString()
  roomTypeId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  roomId?: string;

  @ApiProperty()
  @IsDateString()
  date!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  quantity!: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  stopSell?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AvailabilityQueryDto {
  @ApiProperty()
  @IsString()
  propertyId!: string;

  @ApiProperty()
  @IsDateString()
  from!: string;

  @ApiProperty()
  @IsDateString()
  to!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  roomTypeId?: string;
}

export class PriceQuoteDto {
  @ApiProperty()
  @IsString()
  propertyId!: string;

  @ApiProperty()
  @IsString()
  ratePlanId!: string;

  @ApiProperty()
  @IsDateString()
  checkInDate!: string;

  @ApiProperty()
  @IsDateString()
  checkOutDate!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  adults!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  children!: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  promotionCode?: string;
}

export class CreateCancellationPolicyDto {
  @ApiProperty()
  @IsString()
  propertyId!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  refundableUntilHoursBeforeCheckIn?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  penaltyPercent?: number;
}

export class CreateTaxProfileDto {
  @ApiProperty()
  @IsString()
  propertyId!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  ruleName!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  rate!: number;
}

export class CreateFeeRuleDto {
  @ApiProperty()
  @IsString()
  propertyId!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ enum: FeeRuleType })
  @IsEnum(FeeRuleType)
  type!: FeeRuleType;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  value!: number;
}

export class CreatePromotionDto {
  @ApiProperty()
  @IsString()
  propertyId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  ratePlanId?: string;

  @ApiProperty()
  @IsString()
  code!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ enum: PromotionType })
  @IsEnum(PromotionType)
  type!: PromotionType;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  value!: number;

  @ApiProperty()
  @IsDateString()
  startsAt!: string;

  @ApiProperty()
  @IsDateString()
  endsAt!: string;
}
