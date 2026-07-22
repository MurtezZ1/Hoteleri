import { Injectable } from '@nestjs/common';
import { SubscriptionGuardService } from '../common/subscription-guard.service';
import { TenantAccessService } from '../common/tenant-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePropertyDto } from './dto';

@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantAccessService,
    private readonly subscriptions: SubscriptionGuardService,
  ) {}

  async create(userId: string, dto: CreatePropertyDto) {
    await this.tenants.assertCompanyAccess(userId, dto.companyId);
    await this.subscriptions.assertCanCreateProperty(dto.companyId);
    const slug = dto.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return this.prisma.property.create({
      data: {
        ...dto,
        slug: `${slug}-${Date.now().toString(36)}`,
        language: 'en',
      },
    });
  }

  async list(userId: string, companyId: string) {
    await this.tenants.assertCompanyAccess(userId, companyId);
    return this.prisma.property.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }
}
