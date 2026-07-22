import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

const e164Message =
  'Phone number must be E.164 formatted, for example +15551234567.';

export class ConnectWhatsAppDto {
  @ApiProperty()
  @IsString()
  companyId!: string;

  @ApiProperty({ enum: ['MOCK', 'TWILIO', 'META'] })
  @IsIn(['MOCK', 'TWILIO', 'META'])
  provider!: 'MOCK' | 'TWILIO' | 'META';

  @ApiProperty()
  @Matches(/^\+[1-9]\d{7,14}$/, { message: e164Message })
  senderPhoneNumber!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  businessAccountId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phoneNumberId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  accessToken?: string;
}

export class UpsertWhatsAppRecipientDto {
  @ApiProperty()
  @IsString()
  companyId!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @Matches(/^\+[1-9]\d{7,14}$/, { message: e164Message })
  phoneNumber!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  notificationTypes!: string[];

  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}

export class SendWhatsAppTestDto {
  @ApiProperty()
  @IsString()
  companyId!: string;

  @ApiProperty()
  @Matches(/^\+[1-9]\d{7,14}$/, { message: e164Message })
  to!: string;

  @ApiProperty()
  @IsString()
  body!: string;
}

export class ReplyWhatsAppDto {
  @ApiProperty()
  @IsString()
  companyId!: string;

  @ApiProperty()
  @Matches(/^\+[1-9]\d{7,14}$/, { message: e164Message })
  to!: string;

  @ApiProperty()
  @IsString()
  body!: string;
}
