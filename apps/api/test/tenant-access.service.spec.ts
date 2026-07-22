import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TenantAccessService } from '../src/common/tenant-access.service';

describe('TenantAccessService', () => {
  it('allows company access when a membership exists', async () => {
    const prisma = {
      companyUser: { findFirst: vi.fn().mockResolvedValue({ id: 'membership-1' }) },
    };
    const service = new TenantAccessService(prisma as never);

    await expect(service.assertCompanyAccess('user-1', 'company-1')).resolves.toBeUndefined();
  });

  it('rejects company access without membership', async () => {
    const prisma = {
      companyUser: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new TenantAccessService(prisma as never);

    await expect(service.assertCompanyAccess('user-1', 'company-2')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects missing properties before checking company membership', async () => {
    const prisma = {
      property: { findFirst: vi.fn().mockResolvedValue(null) },
      companyUser: { findFirst: vi.fn() },
    };
    const service = new TenantAccessService(prisma as never);

    await expect(service.assertPropertyAccess('user-1', 'property-404')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.companyUser.findFirst).not.toHaveBeenCalled();
  });
});
