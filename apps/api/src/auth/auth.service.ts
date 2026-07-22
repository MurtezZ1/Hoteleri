import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import {
  Prisma,
  SecurityEventSeverity,
  SystemRole,
  User,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  ChangeEmailDto,
  ChangePasswordDto,
  LoginDto,
  RegisterDto,
} from './dto';

export interface RequestMetadata {
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    emailVerified: boolean;
  };
}

export interface ActiveSessionResponse {
  id: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  current: boolean;
}

const ownerPermissions = [
  'reservations.view',
  'reservations.create',
  'reservations.update',
  'reservations.cancel',
  'frontdesk.view',
  'frontdesk.manage',
  'calendar.view',
  'calendar.manage',
  'reservations.checkin',
  'reservations.checkout',
  'reservations.force-checkout',
  'reservations.assign-room',
  'reservations.no-show',
  'guests.view',
  'guests.update',
  'payments.view',
  'payments.create',
  'payments.manage',
  'invoices.view',
  'invoices.manage',
  'housekeeping.manage',
  'maintenance.manage',
  'reports.view',
  'rooms.manage',
  'staff.manage',
  'settings.manage',
  'whatsapp.view',
  'whatsapp.manage',
  'whatsapp.send',
  'whatsapp.templates.manage',
];

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(
    dto: RegisterDto,
    metadata: RequestMetadata = {},
  ): Promise<AuthResponse> {
    this.assertStrongPassword(dto.password);
    const email = this.normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email is already registered.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { email, passwordHash, fullName: dto.fullName },
      });
      const company = await tx.company.create({
        data: { name: dto.companyName, email },
      });
      const role = await tx.role.create({
        data: {
          companyId: company.id,
          name: 'Owner',
          systemRole: SystemRole.HOTEL_OWNER,
        },
      });
      await Promise.all(
        ownerPermissions.map((permission) =>
          tx.permission.upsert({
            where: { key: permission },
            create: { key: permission, description: permission },
            update: {},
          }),
        ),
      );
      const permissions = await tx.permission.findMany({
        where: { key: { in: ownerPermissions } },
      });
      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id,
        })),
        skipDuplicates: true,
      });
      await tx.companyUser.create({
        data: {
          companyId: company.id,
          userId: createdUser.id,
          roleId: role.id,
          isOwner: true,
        },
      });
      return createdUser;
    });

    await this.createEmailVerificationToken(user.id, user.email);
    await this.logSecurityEvent(
      user.id,
      'auth.registered',
      SecurityEventSeverity.INFO,
      metadata,
    );
    return this.issueSession(user, metadata);
  }

  async login(
    dto: LoginDto,
    metadata: RequestMetadata = {},
  ): Promise<AuthResponse> {
    const email = this.normalizeEmail(dto.email);
    await this.assertLoginAllowed(email, metadata);

    const user = await this.prisma.user.findUnique({ where: { email } });
    const validPassword = user
      ? await bcrypt.compare(dto.password, user.passwordHash)
      : false;
    if (
      !user ||
      !validPassword ||
      user.deletedAt ||
      user.status === 'DISABLED'
    ) {
      await this.recordLoginAttempt(
        email,
        user?.id,
        false,
        metadata,
        'invalid_credentials',
      );
      throw new UnauthorizedException('Invalid email or password.');
    }

    await this.recordLoginAttempt(email, user.id, true, metadata);
    await this.logSecurityEvent(
      user.id,
      'auth.login.success',
      SecurityEventSeverity.INFO,
      metadata,
    );
    return this.issueSession(user, metadata);
  }

  async forgotPassword(
    emailInput: string,
    metadata: RequestMetadata = {},
  ): Promise<{ message: string }> {
    const email = this.normalizeEmail(emailInput);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && !user.deletedAt) {
      await this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await this.createPasswordResetToken(user.id);
      await this.logSecurityEvent(
        user.id,
        'auth.password_reset.requested',
        SecurityEventSeverity.INFO,
        metadata,
      );
    }
    return { message: 'If the account exists, a reset link will be sent.' };
  }

  async resetPassword(
    token: string,
    password: string,
    metadata: RequestMetadata = {},
  ): Promise<{ message: string }> {
    this.assertStrongPassword(password);
    const tokenHash = this.hashToken(token);
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (
      !resetToken ||
      resetToken.usedAt ||
      resetToken.expiresAt <= new Date() ||
      resetToken.user.deletedAt
    ) {
      throw new BadRequestException('Invalid or expired reset token.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: resetToken.userId },
        data: {
          passwordHash: await bcrypt.hash(password, 12),
          refreshTokenHash: null,
        },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: resetToken.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.authSession.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revokedReason: 'password_reset',
        },
      });
    });
    await this.logSecurityEvent(
      resetToken.userId,
      'auth.password_reset.completed',
      SecurityEventSeverity.WARNING,
      metadata,
    );
    return { message: 'Password has been reset.' };
  }

  async verifyEmail(
    token: string,
    metadata: RequestMetadata = {},
  ): Promise<{ message: string }> {
    const tokenHash = this.hashToken(token);
    const verificationToken =
      await this.prisma.emailVerificationToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
    if (
      !verificationToken ||
      verificationToken.usedAt ||
      verificationToken.expiresAt <= new Date() ||
      verificationToken.user.deletedAt
    ) {
      throw new BadRequestException('Invalid or expired verification token.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: verificationToken.userId },
        data: { emailVerifiedAt: new Date(), email: verificationToken.email },
      });
      await tx.emailVerificationToken.update({
        where: { id: verificationToken.id },
        data: { usedAt: new Date() },
      });
    });
    await this.logSecurityEvent(
      verificationToken.userId,
      'auth.email.verified',
      SecurityEventSeverity.INFO,
      metadata,
    );
    return { message: 'Email verified.' };
  }

  async resendVerification(
    emailInput: string,
    metadata: RequestMetadata = {},
  ): Promise<{ message: string }> {
    const email = this.normalizeEmail(emailInput);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && !user.deletedAt && !user.emailVerifiedAt) {
      await this.createEmailVerificationToken(user.id, user.email);
      await this.logSecurityEvent(
        user.id,
        'auth.email_verification.resent',
        SecurityEventSeverity.INFO,
        metadata,
      );
    }
    return {
      message:
        'If the account exists and requires verification, a verification link will be sent.',
    };
  }

  async refresh(
    refreshToken: string,
    metadata: RequestMetadata = {},
  ): Promise<AuthResponse> {
    const { sessionId } = this.parseRefreshToken(refreshToken);
    const session = await this.prisma.authSession.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });
    if (
      !session ||
      session.expiresAt <= new Date() ||
      session.revokedAt ||
      session.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    if (session.refreshTokenHash !== this.hashToken(refreshToken)) {
      await this.revokeTokenFamily(
        session.tokenFamilyId,
        'refresh_token_reuse',
      );
      await this.logSecurityEvent(
        session.userId,
        'auth.refresh.reuse_detected',
        SecurityEventSeverity.CRITICAL,
        metadata,
        {
          sessionId: session.id,
          tokenFamilyId: session.tokenFamilyId,
        },
      );
      throw new UnauthorizedException('Refresh token reuse detected.');
    }

    return this.rotateSession(
      session.user,
      session.id,
      session.tokenFamilyId,
      metadata,
    );
  }

  async logout(
    userId: string,
    sessionId?: string,
  ): Promise<{ message: string }> {
    if (!sessionId) {
      throw new BadRequestException('Current session id is required.');
    }
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedReason: 'logout',
      },
    });
    return { message: 'Logged out.' };
  }

  async logoutAll(userId: string): Promise<{ message: string }> {
    await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedReason: 'logout_all',
      },
    });
    return { message: 'All sessions revoked.' };
  }

  async listSessions(
    userId: string,
    currentSessionId?: string,
  ): Promise<ActiveSessionResponse[]> {
    const sessions = await this.prisma.authSession.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        status: 'ACTIVE',
      },
      orderBy: { lastUsedAt: 'desc' },
    });
    return sessions.map((session) => ({
      id: session.id,
      ...(session.ipAddress ? { ipAddress: session.ipAddress } : {}),
      ...(session.userAgent ? { userAgent: session.userAgent } : {}),
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
      current: session.id === currentSessionId,
    }));
  }

  async revokeSession(
    userId: string,
    sessionId: string,
  ): Promise<{ message: string }> {
    const result = await this.prisma.authSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedReason: 'manual_revoke',
      },
    });
    if (result.count === 0) {
      throw new NotFoundException('Session not found.');
    }
    return { message: 'Session revoked.' };
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    currentSessionId?: string,
    metadata: RequestMetadata = {},
  ): Promise<{ message: string }> {
    this.assertStrongPassword(dto.newPassword);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (
      !user ||
      !(await bcrypt.compare(dto.currentPassword, user.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid current password.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: await bcrypt.hash(dto.newPassword, 12) },
      });
      await tx.authSession.updateMany({
        where: {
          userId,
          ...(currentSessionId ? { id: { not: currentSessionId } } : {}),
          revokedAt: null,
        },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revokedReason: 'password_changed',
        },
      });
    });
    await this.logSecurityEvent(
      userId,
      'auth.password.changed',
      SecurityEventSeverity.WARNING,
      metadata,
    );
    return { message: 'Password changed.' };
  }

  async changeEmail(
    userId: string,
    dto: ChangeEmailDto,
    metadata: RequestMetadata = {},
  ): Promise<{ message: string }> {
    const newEmail = this.normalizeEmail(dto.newEmail);
    const [user, existing] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.user.findUnique({ where: { email: newEmail } }),
    ]);
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid password.');
    }
    if (existing && existing.id !== userId) {
      throw new ConflictException('Email is already registered.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { email: newEmail, emailVerifiedAt: null },
      });
      await tx.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revokedReason: 'email_changed',
        },
      });
    });
    await this.createEmailVerificationToken(userId, newEmail);
    await this.logSecurityEvent(
      userId,
      'auth.email.changed',
      SecurityEventSeverity.WARNING,
      metadata,
    );
    return { message: 'Email changed. Please verify the new address.' };
  }

  private async issueSession(
    user: User,
    metadata: RequestMetadata,
  ): Promise<AuthResponse> {
    const sessionId = randomUUID();
    const tokenFamilyId = randomUUID();
    const refreshToken = this.createRefreshToken(sessionId);
    const expiresAt = this.addDays(new Date(), this.refreshTokenDays());
    await this.prisma.authSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        tokenFamilyId,
        refreshTokenHash: this.hashToken(refreshToken),
        expiresAt,
        ipAddress: metadata.ipAddress ?? null,
        userAgent: metadata.userAgent ?? null,
      },
    });
    const accessToken = await this.signAccessToken(user, sessionId);
    return this.authResponse(user, accessToken, refreshToken);
  }

  private async rotateSession(
    user: User,
    sessionId: string,
    tokenFamilyId: string,
    metadata: RequestMetadata,
  ): Promise<AuthResponse> {
    const refreshToken = this.createRefreshToken(sessionId);
    await this.prisma.authSession.update({
      where: { id: sessionId },
      data: {
        tokenFamilyId,
        refreshTokenHash: this.hashToken(refreshToken),
        lastUsedAt: new Date(),
        ipAddress: metadata.ipAddress ?? null,
        userAgent: metadata.userAgent ?? null,
      },
    });
    const accessToken = await this.signAccessToken(user, sessionId);
    return this.authResponse(user, accessToken, refreshToken);
  }

  private async signAccessToken(
    user: User,
    sessionId: string,
  ): Promise<string> {
    return this.jwt.signAsync(
      { sub: user.id, email: user.email, sid: sessionId },
      {
        secret:
          this.config.get<string>('JWT_ACCESS_SECRET') ??
          'local-dev-access-secret',
        expiresIn: this.jwtExpiresIn('JWT_ACCESS_EXPIRES_IN', '15m'),
      },
    );
  }

  private authResponse(
    user: User,
    accessToken: string,
    refreshToken: string,
  ): AuthResponse {
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        emailVerified: Boolean(user.emailVerifiedAt),
      },
    };
  }

  private async assertLoginAllowed(
    email: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    const since = new Date(
      Date.now() - this.lockoutWindowMinutes() * 60 * 1000,
    );
    const failures = await this.prisma.loginAttempt.count({
      where: { email, success: false, createdAt: { gte: since } },
    });
    if (failures >= this.lockoutThreshold()) {
      await this.logSecurityEvent(
        undefined,
        'auth.login.locked',
        SecurityEventSeverity.WARNING,
        metadata,
        { email },
      );
      throw new ForbiddenException(
        'Too many failed login attempts. Please try again later.',
      );
    }
  }

  private async recordLoginAttempt(
    email: string,
    userId: string | undefined,
    success: boolean,
    metadata: RequestMetadata,
    reason?: string,
  ): Promise<void> {
    await this.prisma.loginAttempt.create({
      data: {
        email,
        userId: userId ?? null,
        success,
        reason: reason ?? null,
        ipAddress: metadata.ipAddress ?? null,
        userAgent: metadata.userAgent ?? null,
      },
    });
  }

  private async createEmailVerificationToken(
    userId: string,
    email: string,
  ): Promise<string> {
    const token = this.randomToken();
    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        email,
        tokenHash: this.hashToken(token),
        expiresAt: this.addHours(new Date(), 24),
      },
    });
    return token;
  }

  private async createPasswordResetToken(userId: string): Promise<string> {
    const token = this.randomToken();
    await this.prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(token),
        expiresAt: this.addMinutes(new Date(), 30),
      },
    });
    return token;
  }

  private async revokeTokenFamily(
    tokenFamilyId: string,
    reason: string,
  ): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { tokenFamilyId, revokedAt: null },
      data: { status: 'REVOKED', revokedAt: new Date(), revokedReason: reason },
    });
  }

  private async logSecurityEvent(
    userId: string | undefined,
    type: string,
    severity: SecurityEventSeverity,
    metadata: RequestMetadata,
    eventMetadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.securityEvent.create({
      data: {
        ...(userId ? { userId } : {}),
        type,
        severity,
        ipAddress: metadata.ipAddress ?? null,
        userAgent: metadata.userAgent ?? null,
        metadata: eventMetadata
          ? (eventMetadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  }

  private assertStrongPassword(password: string): void {
    if (
      !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/.test(password)
    ) {
      throw new BadRequestException(
        'Password must be at least 12 characters and include uppercase, lowercase, number, and symbol characters.',
      );
    }
  }

  private parseRefreshToken(token: string): { sessionId: string } {
    const [sessionId, secret] = token.split('.');
    if (!sessionId || !secret) {
      throw new UnauthorizedException('Invalid refresh token.');
    }
    return { sessionId };
  }

  private createRefreshToken(sessionId: string): string {
    return `${sessionId}.${this.randomToken()}`;
  }

  private randomToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private lockoutThreshold(): number {
    return Number(this.config.get<string>('AUTH_LOCKOUT_THRESHOLD') ?? 5);
  }

  private lockoutWindowMinutes(): number {
    return Number(this.config.get<string>('AUTH_LOCKOUT_WINDOW_MINUTES') ?? 15);
  }

  private refreshTokenDays(): number {
    return Number(this.config.get<string>('JWT_REFRESH_EXPIRES_DAYS') ?? 7);
  }

  private addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60 * 1000);
  }

  private addHours(date: Date, hours: number): Date {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
  }

  private addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private jwtExpiresIn(
    key: string,
    fallback: string,
  ): NonNullable<JwtSignOptions['expiresIn']> {
    return (this.config.get<string>(key) ?? fallback) as NonNullable<
      JwtSignOptions['expiresIn']
    >;
  }
}
