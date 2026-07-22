import { ApiProperty } from '@nestjs/swagger';
import { ReservationStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export class FrontDeskQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiProperty({ enum: ReservationStatus, required: false })
  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;
}
