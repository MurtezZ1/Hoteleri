import { ApiProperty } from '@nestjs/swagger';
import {
  BookingSource,
  CalendarBlockType,
  ReservationStatus,
} from '@prisma/client';
import {
  IsBooleanString,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

export class CalendarTimelineQueryDto {
  @ApiProperty()
  @IsString()
  propertyId!: string;

  @ApiProperty()
  @IsDateString()
  startDate!: string;

  @ApiProperty()
  @IsDateString()
  endDate!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  roomTypeId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  roomId?: string;

  @ApiProperty({ enum: ReservationStatus, required: false })
  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;

  @ApiProperty({ enum: BookingSource, required: false })
  @IsOptional()
  @IsEnum(BookingSource)
  source?: BookingSource;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBooleanString()
  includeCancelled?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBooleanString()
  includeNoShow?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  timezone?: string;
}

export class CalendarMoveDto {
  @ApiProperty()
  @IsString()
  roomId!: string;

  @ApiProperty()
  @IsDateString()
  checkIn!: string;

  @ApiProperty()
  @IsDateString()
  checkOut!: string;

  @ApiProperty()
  @IsDateString()
  expectedUpdatedAt!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateCalendarBlockDto {
  @ApiProperty()
  @IsString()
  propertyId!: string;

  @ApiProperty()
  @IsString()
  roomId!: string;

  @ApiProperty()
  @IsDateString()
  startDate!: string;

  @ApiProperty()
  @IsDateString()
  endDate!: string;

  @ApiProperty({ enum: CalendarBlockType })
  @IsEnum(CalendarBlockType)
  type!: CalendarBlockType;

  @ApiProperty()
  @IsString()
  reason!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  maintenanceIssueId?: string;
}

export class UpdateCalendarBlockDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  roomId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({ enum: CalendarBlockType, required: false })
  @IsOptional()
  @IsEnum(CalendarBlockType)
  type?: CalendarBlockType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty()
  @IsDateString()
  expectedUpdatedAt!: string;
}
