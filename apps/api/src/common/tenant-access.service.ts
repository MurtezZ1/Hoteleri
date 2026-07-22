import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCompanyAccess(userId: string, companyId: string): Promise<void> {
    const membership = await this.prisma.companyUser.findFirst({
      where: {
        userId,
        companyId,
        company: { deletedAt: null },
        user: { deletedAt: null },
      },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException('You do not have access to this company.');
    }
  }

  async assertPropertyAccess(userId: string, propertyId: string): Promise<{ companyId: string }> {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, deletedAt: null },
      select: { companyId: true },
    });
    if (!property) {
      throw new NotFoundException('Property not found.');
    }
    await this.assertCompanyAccess(userId, property.companyId);
    return property;
  }

  async assertPlatformAdmin(userId: string): Promise<void> {
    const admin = await this.prisma.companyUser.findFirst({
      where: {
        userId,
        role: { systemRole: SystemRole.PLATFORM_SUPER_ADMIN },
        user: { deletedAt: null },
      },
      select: { id: true },
    });
    if (!admin) {
      throw new ForbiddenException('Platform admin access is required.');
    }
  }
}
