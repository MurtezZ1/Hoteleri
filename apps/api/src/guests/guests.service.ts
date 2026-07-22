import { Injectable } from '@nestjs/common';
import { TenantAccessService } from '../common/tenant-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGuestDto } from './dto';

@Injectable()
export class GuestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantAccessService,
  ) {}

  async create(userId: string, dto: CreateGuestDto) {
    await this.tenants.assertCompanyAccess(userId, dto.companyId);
    return this.prisma.guest.create({ data: dto });
  }

  async list(userId: string, companyId: string, q?: string) {
    await this.tenants.assertCompanyAccess(userId, companyId);
    return this.prisma.guest.findMany({
      where: {
        companyId,
        deletedAt: null,
        ...(q
          ? {
              OR: [
                { fullName: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
