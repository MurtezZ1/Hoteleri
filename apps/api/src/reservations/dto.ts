import { ApiProperty } from '@nestjs/swagger';
import {
  BookingSource,
  HousekeepingStatus,
  MaintenanceStatus,
  PaymentMethod,
  PaymentType,
  ReservationStatus,
  RoomStatus,
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
} from 'class-validator';

export class CreateReservationDto {
  @ApiProperty()
  @IsString()
  companyId!: string;

  @ApiProperty()
  @IsString()
  propertyId!: string;

  @ApiProperty()
  @IsString()
  guestId!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  roomIds!: string[];

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

  @ApiProperty({ enum: BookingSource })
  @IsEnum(BookingSource)
  bookingSource!: BookingSource;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  subtotal!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  tax!: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  discount?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;
}

export class AssignRoomDto {
  @ApiProperty()
  @IsString()
  roomId!: string;
}

export class ChangeRoomDto {
  @ApiProperty()
  @IsString()
  newRoomId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CheckInDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  roomId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  actualArrivalAt?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  guestDetailsConfirmed?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  identificationConfirmed?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CheckOutDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  actualDepartureAt?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  forceWithOutstandingBalance?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class NoShowDto {
  @ApiProperty()
  @IsString()
  reason!: string;
}

export class RecordPaymentDto {
  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amount!: number;

  @ApiProperty()
  @IsString()
  currency!: string;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiProperty({ enum: PaymentType })
  @IsEnum(PaymentType)
  type!: PaymentType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class GenerateInvoiceDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  allowDuplicate?: boolean;
}

export class CreateHousekeepingTaskDto {
  @ApiProperty()
  @IsString()
  propertyId!: string;

  @ApiProperty()
  @IsString()
  roomId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reservationId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  assignedToUserId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  priority?: number;

  @ApiProperty({ enum: HousekeepingStatus, required: false })
  @IsOptional()
  @IsEnum(HousekeepingStatus)
  status?: HousekeepingStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateMaintenanceIssueDto {
  @ApiProperty()
  @IsString()
  propertyId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  roomId?: string;

  @ApiProperty()
  @IsString()
  category!: string;

  @ApiProperty()
  @IsString()
  description!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  priority?: number;

  @ApiProperty({ enum: MaintenanceStatus, required: false })
  @IsOptional()
  @IsEnum(MaintenanceStatus)
  status?: MaintenanceStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  assignedToUserId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  estimatedCost?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  actualCost?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  blocksRoomFromSale?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateRoomStatusDto {
  @ApiProperty()
  @IsString()
  propertyId!: string;

  @ApiProperty()
  @IsString()
  roomId!: string;

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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
