import { ApiProperty } from '@nestjs/swagger';
import { BookingSource, ReservationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

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
