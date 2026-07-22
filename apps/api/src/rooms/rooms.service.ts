import { Injectable } from '@nestjs/common';
import { SubscriptionGuardService } from '../common/subscription-guard.service';
import { TenantAccessService } from '../common/tenant-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto, CreateRoomTypeDto } from './dto';

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantAccessService,
    private readonly subscriptions: SubscriptionGuardService,
  ) {}

  async createRoomType(userId: string, dto: CreateRoomTypeDto) {
    await this.tenants.assertPropertyAccess(userId, dto.propertyId);
    return this.prisma.roomType.create({ data: dto });
  }

  async createRoom(userId: string, dto: CreateRoomDto) {
    await this.tenants.assertPropertyAccess(userId, dto.propertyId);
    await this.subscriptions.assertCanCreateRoom(dto.companyId);
    return this.prisma.room.create({ data: dto });
  }

  async list(userId: string, propertyId: string) {
    await this.tenants.assertPropertyAccess(userId, propertyId);
    return this.prisma.room.findMany({
      where: { propertyId, deletedAt: null },
      include: { roomType: true },
      orderBy: { name: 'asc' },
    });
  }
}
