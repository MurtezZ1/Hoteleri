import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth/auth.service';

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function createService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    loginAttempt: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({}),
    },
    securityEvent: { create: vi.fn().mockResolvedValue({}) },
    user: { findUnique: vi.fn(), update: vi.fn() },
    passwordResetToken: { findUnique: vi.fn(), updateMany: vi.fn() },
    emailVerificationToken: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    authSession: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(async (callback: (tx: typeof prisma) => unknown) =>
      callback(prisma),
    ),
    ...overrides,
  };
  const jwt = { signAsync: vi.fn().mockResolvedValue('access.jwt') };
  const config = {
    get: vi.fn((key: string) => {
      const values: Record<string, string> = {
        JWT_ACCESS_SECRET: 'test-access-secret-with-enough-length',
        JWT_ACCESS_EXPIRES_IN: '15m',
        AUTH_LOCKOUT_THRESHOLD: '5',
        AUTH_LOCKOUT_WINDOW_MINUTES: '15',
        JWT_REFRESH_EXPIRES_DAYS: '7',
      };
      return values[key];
    }),
  };
  return {
    service: new AuthService(prisma as never, jwt as never, config as never),
    prisma,
    jwt,
  };
}

describe('AuthService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a neutral forgot-password response for missing accounts', async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.forgotPassword('missing@example.test'),
    ).resolves.toEqual({
      message: 'If the account exists, a reset link will be sent.',
    });
  });

  it('locks login after repeated failed attempts', async () => {
    const { service, prisma } = createService();
    prisma.loginAttempt.count.mockResolvedValue(5);

    await expect(
      service.login({
        email: 'owner@example.test',
        password: 'WrongPassword123!',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.securityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'auth.login.locked' }),
      }),
    );
  });

  it('accepts an email verification token once', async () => {
    const { service, prisma } = createService();
    prisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 'verify-1',
      userId: 'user-1',
      email: 'new@example.test',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { deletedAt: null },
    });

    await expect(service.verifyEmail('verify-token')).resolves.toEqual({
      message: 'Email verified.',
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' } }),
    );
    expect(prisma.emailVerificationToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'verify-1' } }),
    );
  });

  it('rejects expired verification tokens', async () => {
    const { service, prisma } = createService();
    prisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 'verify-1',
      userId: 'user-1',
      email: 'new@example.test',
      usedAt: null,
      expiresAt: new Date(Date.now() - 60_000),
      user: { deletedAt: null },
    });

    await expect(service.verifyEmail('verify-token')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('uses password reset tokens once and revokes sessions', async () => {
    const { service, prisma } = createService();
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { deletedAt: null },
    });

    await expect(
      service.resetPassword('reset-token', 'NewPassword123!'),
    ).resolves.toEqual({ message: 'Password has been reset.' });
    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', usedAt: null } }),
    );
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ revokedReason: 'password_reset' }),
      }),
    );
  });

  it('rejects expired password reset tokens', async () => {
    const { service, prisma } = createService();
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() - 60_000),
      user: { deletedAt: null },
    });

    await expect(
      service.resetPassword('reset-token', 'NewPassword123!'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rotates refresh tokens', async () => {
    const { service, prisma } = createService();
    const refreshToken = 'session-1.secret';
    prisma.authSession.findUnique.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      tokenFamilyId: 'family-1',
      refreshTokenHash: tokenHash(refreshToken),
      status: 'ACTIVE',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: 'user-1',
        email: 'owner@example.test',
        fullName: 'Owner',
        emailVerifiedAt: null,
      },
    });

    const response = await service.refresh(refreshToken);

    expect(response.accessToken).toBe('access.jwt');
    expect(response.refreshToken).toMatch(/^session-1\./);
    expect(response.refreshToken).not.toBe(refreshToken);
    expect(prisma.authSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'session-1' } }),
    );
  });

  it('revokes a refresh-token family when reuse is detected', async () => {
    const { service, prisma } = createService();
    prisma.authSession.findUnique.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      tokenFamilyId: 'family-1',
      refreshTokenHash: tokenHash('session-1.other-secret'),
      status: 'ACTIVE',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: 'user-1',
        email: 'owner@example.test',
        fullName: 'Owner',
        emailVerifiedAt: null,
      },
    });

    await expect(
      service.refresh('session-1.reused-secret'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tokenFamilyId: 'family-1', revokedAt: null },
      }),
    );
  });

  it('logs out the current session', async () => {
    const { service, prisma } = createService();

    await expect(service.logout('user-1', 'session-1')).resolves.toEqual({
      message: 'Logged out.',
    });
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'session-1', userId: 'user-1', revokedAt: null },
      }),
    );
  });

  it('rejects cross-user session deletion', async () => {
    const { service, prisma } = createService();
    prisma.authSession.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.revokeSession('user-1', 'other-user-session'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
