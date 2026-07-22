import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantAccessService } from '../common/tenant-access.service';
import { CreateReservationDto } from './dto';
import { ReservationRepository } from './reservation.repository';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: ReservationRepository,
    private readonly tenants: TenantAccessService,
  ) {}

  async create(userId: string, dto: CreateReservationDto) {
    const property = await this.tenants.assertPropertyAccess(userId, dto.propertyId);
    if (property.companyId !== dto.companyId) {
      throw new BadRequestException('Reservation company does not match the property company.');
    }
    await this.assertReservationResourcesBelongToTenant(dto);
    const checkInDate = new Date(dto.checkInDate);
    const checkOutDate = new Date(dto.checkOutDate);
    if (checkOutDate <= checkInDate) {
      throw new BadRequestException('Check-out date must be after check-in date.');
    }

    const conflicts = await this.reservations.findConflicts(dto.roomIds, checkInDate, checkOutDate);
    if (conflicts.length > 0) {
      throw new BadRequestException(`Room ${conflicts[0]?.room.name ?? 'selected'} is already booked.`);
    }

    const totalAmount = new Prisma.Decimal(dto.subtotal).plus(dto.tax).minus(dto.discount ?? 0);
    const reservationData: Prisma.ReservationCreateInput = {
      company: { connect: { id: dto.companyId } },
      property: { connect: { id: dto.propertyId } },
      guest: { connect: { id: dto.guestId } },
      reservationCode: `SF-${Date.now().toString(36).toUpperCase()}`,
      bookingSource: dto.bookingSource,
      checkInDate,
      checkOutDate,
      adults: dto.adults,
      children: dto.children,
      subtotal: dto.subtotal,
      tax: dto.tax,
      discount: dto.discount ?? 0,
      totalAmount,
      rooms: {
        create: dto.roomIds.map((roomId) => ({
          room: { connect: { id: roomId } },
          pricePerNight: dto.subtotal / Math.max(dto.roomIds.length, 1),
        })),
      },
      history: [{ action: 'created', at: new Date().toISOString() }],
    };
    if (dto.status) {
      reservationData.status = dto.status;
    }
    return this.reservations.create(reservationData);
  }

  async list(userId: string, propertyId: string) {
    await this.tenants.assertPropertyAccess(userId, propertyId);
    return this.prisma.reservation.findMany({
      where: { propertyId, deletedAt: null },
      include: { guest: true, rooms: { include: { room: true } } },
      orderBy: { checkInDate: 'asc' },
      take: 100,
    });
  }

  async calendar(userId: string, propertyId: string, from?: string, to?: string) {
    await this.tenants.assertPropertyAccess(userId, propertyId);
    return this.prisma.reservation.findMany({
      where: {
        propertyId,
        deletedAt: null,
        ...(from ? { checkOutDate: { gte: new Date(from) } } : {}),
        ...(to ? { checkInDate: { lte: new Date(to) } } : {}),
      },
      include: { guest: true, rooms: { include: { room: true } } },
      orderBy: { checkInDate: 'asc' },
    });
  }

  private async assertReservationResourcesBelongToTenant(dto: CreateReservationDto): Promise<void> {
    const [guest, rooms] = await Promise.all([
      this.prisma.guest.findFirst({ where: { id: dto.guestId, companyId: dto.companyId, deletedAt: null }, select: { id: true } }),
      this.prisma.room.findMany({
        where: { id: { in: dto.roomIds }, companyId: dto.companyId, propertyId: dto.propertyId, deletedAt: null },
        select: { id: true },
      }),
    ]);
    if (!guest) {
      throw new BadRequestException('Guest does not belong to this company.');
    }
    if (rooms.length !== new Set(dto.roomIds).size) {
      throw new BadRequestException('One or more rooms do not belong to this property.');
    }
  }
}
