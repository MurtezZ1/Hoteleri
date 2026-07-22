import { ForbiddenException } from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PermissionsGuard } from '../src/common/permissions.guard';

function contextWithRequest(request: unknown) {
  return {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  };
}

describe('PermissionsGuard', () => {
  it('allows hotel owners without checking individual permission keys', async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(['guests.view']) };
    const prisma = {
      property: { findUnique: vi.fn() },
      moduleRecord: { findUnique: vi.fn() },
      companyUser: {
        findMany: vi.fn().mockResolvedValue([
          {
            role: {
              systemRole: SystemRole.HOTEL_OWNER,
              permissions: [],
            },
          },
        ]),
      },
    };
    const guard = new PermissionsGuard(reflector as never, prisma as never);

    await expect(
      guard.canActivate(contextWithRequest({ user: { sub: 'user-1' }, params: { companyId: 'company-1' } }) as never),
    ).resolves.toBe(true);
  });

  it('rejects users whose role does not include the required permission', async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(['rooms.manage']) };
    const prisma = {
      property: { findUnique: vi.fn().mockResolvedValue({ companyId: 'company-1' }) },
      moduleRecord: { findUnique: vi.fn() },
      companyUser: {
        findMany: vi.fn().mockResolvedValue([
          {
            role: {
              systemRole: SystemRole.RECEPTIONIST,
              permissions: [{ permission: { key: 'guests.view' } }],
            },
          },
        ]),
      },
    };
    const guard = new PermissionsGuard(reflector as never, prisma as never);

    await expect(
      guard.canActivate(contextWithRequest({ user: { sub: 'user-1' }, params: { propertyId: 'property-1' } }) as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
