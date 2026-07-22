import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth/auth.service';

describe('AuthService', () => {
  it('returns a neutral forgot-password response', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(null) } };
    const jwt = {};
    const config = {};
    const service = new AuthService(prisma as never, jwt as never, config as never);

    await expect(service.forgotPassword('missing@example.test')).resolves.toEqual({
      message: 'If the account exists, a reset link will be sent.',
    });
  });
});
