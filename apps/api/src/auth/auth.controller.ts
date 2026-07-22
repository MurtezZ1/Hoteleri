import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuthService, AuthResponse } from './auth.service';
import { ChangeEmailDto, ChangePasswordDto, ForgotPasswordDto, LoginDto, RefreshDto, RegisterDto, ResetPasswordDto, VerifyEmailDto } from './dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto, @Req() request: Request): Promise<AuthResponse> {
    return this.authService.register(dto, requestMetadata(request));
  }

  @Post('login')
  login(@Body() dto: LoginDto, @Req() request: Request): Promise<AuthResponse> {
    return this.authService.login(dto, requestMetadata(request));
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() request: Request): Promise<{ message: string }> {
    return this.authService.forgotPassword(dto.email, requestMetadata(request));
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto, @Req() request: Request): Promise<{ message: string }> {
    return this.authService.resetPassword(dto.token, dto.password, requestMetadata(request));
  }

  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto, @Req() request: Request): Promise<{ message: string }> {
    return this.authService.verifyEmail(dto.token, requestMetadata(request));
  }

  @Post('resend-verification')
  resendVerification(@Body() dto: ForgotPasswordDto, @Req() request: Request): Promise<{ message: string }> {
    return this.authService.resendVerification(dto.email, requestMetadata(request));
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() request: Request): Promise<AuthResponse> {
    return this.authService.refresh(dto.refreshToken, requestMetadata(request));
  }

  @Post('logout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  logout(@CurrentUser() user: AuthenticatedUser): Promise<{ message: string }> {
    return this.authService.logout(user.sub, user.sid);
  }

  @Post('logout-all')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  logoutAll(@CurrentUser() user: AuthenticatedUser): Promise<{ message: string }> {
    return this.authService.logoutAll(user.sub);
  }

  @Get('sessions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.listSessions(user.sub, user.sid);
  }

  @Delete('sessions/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  revokeSession(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<{ message: string }> {
    return this.authService.revokeSession(user.sub, id);
  }

  @Post('change-password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto, @Req() request: Request): Promise<{ message: string }> {
    return this.authService.changePassword(user.sub, dto, user.sid, requestMetadata(request));
  }

  @Post('change-email')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  changeEmail(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangeEmailDto, @Req() request: Request): Promise<{ message: string }> {
    return this.authService.changeEmail(user.sub, dto, requestMetadata(request));
  }
}

function requestMetadata(request: Request) {
  const metadata: { ipAddress?: string; userAgent?: string } = {};
  if (request.ip) {
    metadata.ipAddress = request.ip;
  }
  const userAgent = request.get('user-agent');
  if (userAgent) {
    metadata.userAgent = userAgent;
  }
  return metadata;
}
