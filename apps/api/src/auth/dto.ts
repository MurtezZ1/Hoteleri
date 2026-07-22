import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

const strongPasswordMessage =
  'Password must be at least 12 characters and include uppercase, lowercase, number, and symbol characters.';

export class RegisterDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(12, { message: strongPasswordMessage })
  password!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  companyName!: string;
}

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty()
  @IsString()
  @MinLength(12, { message: strongPasswordMessage })
  password!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}

export class VerifyEmailDto {
  @ApiProperty()
  @IsString()
  token!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword!: string;

  @ApiProperty()
  @IsString()
  @MinLength(12, { message: strongPasswordMessage })
  newPassword!: string;
}

export class ChangeEmailDto {
  @ApiProperty()
  @IsEmail()
  newEmail!: string;

  @ApiProperty()
  @IsString()
  password!: string;
}

export class InviteStaffDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  roleName!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  propertyId?: string;
}
