import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantAccessService } from '../common/tenant-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertModuleRecordDto } from './dto';

@Injectable()
export class ModuleRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantAccessService,
  ) {}

  async list(userId: string, moduleKey: string, companyId: string, q?: string, status?: string) {
    await this.tenants.assertCompanyAccess(userId, companyId);
    return this.prisma.moduleRecord.findMany({
      where: {
        moduleKey,
        companyId,
        deletedAt: null,
        ...(status && status !== 'All' ? { status } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { owner: { contains: q, mode: 'insensitive' } },
                { channel: { contains: q, mode: 'insensitive' } },
                { notes: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  async create(userId: string, moduleKey: string, dto: UpsertModuleRecordDto) {
    await this.tenants.assertCompanyAccess(userId, dto.companyId);
    return this.prisma.moduleRecord.create({
      data: {
        ...this.toData(dto),
        moduleKey,
        company: { connect: { id: dto.companyId } },
      },
    });
  }

  async update(userId: string, moduleKey: string, id: string, dto: UpsertModuleRecordDto) {
    await this.tenants.assertCompanyAccess(userId, dto.companyId);
    const existing = await this.prisma.moduleRecord.findFirst({ where: { id, moduleKey, companyId: dto.companyId, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException('Record not found.');
    }
    return this.prisma.moduleRecord.update({
      where: { id },
      data: this.toData(dto),
    });
  }

  async remove(userId: string, moduleKey: string, id: string) {
    const existing = await this.prisma.moduleRecord.findFirst({ where: { id, moduleKey, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException('Record not found.');
    }
    await this.tenants.assertCompanyAccess(userId, existing.companyId);
    await this.prisma.moduleRecord.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id, deleted: true };
  }

  private toData(dto: UpsertModuleRecordDto) {
    return {
      name: dto.name,
      status: dto.status,
      owner: dto.owner,
      amount: dto.amount,
      date: dto.date ? new Date(dto.date) : null,
      channel: dto.channel,
      notes: dto.notes ?? null,
    };
  }
}
