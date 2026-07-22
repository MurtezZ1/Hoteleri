import { Injectable } from '@nestjs/common';
import {
  PaymentStatus,
  Prisma,
  ReservationStatus,
  RoomStatus,
} from '@prisma/client';
import { SubscriptionGuardService } from '../common/subscription-guard.service';
import { TenantAccessService } from '../common/tenant-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { FrontDeskQueryDto } from './dto';

const activeReservationStatuses = [
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
  ReservationStatus.CHECKED_IN,
];

@Injectable()
export class FrontDeskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantAccessService,
    private readonly subscriptions: SubscriptionGuardService,
  ) {}

  async overview(userId: string, propertyId: string, query: FrontDeskQueryDto) {
    const property = await this.tenants.assertPropertyAccess(
      userId,
      propertyId,
    );
    await this.subscriptions.assertCanMutate(
      property.companyId,
      'pms.frontdesk',
    );

    const selectedDate = query.date ? new Date(query.date) : new Date();
    const start = startOfDay(selectedDate);
    const end = endOfDay(selectedDate);
    const search = query.search?.trim();

    const reservationWhere: Prisma.ReservationWhereInput = {
      propertyId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { reservationCode: { contains: search, mode: 'insensitive' } },
              {
                guest: { fullName: { contains: search, mode: 'insensitive' } },
              },
              { guest: { email: { contains: search, mode: 'insensitive' } } },
              { guest: { phone: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [
      rooms,
      arrivals,
      departures,
      inHouse,
      pendingCheckIns,
      pendingCheckOuts,
      newReservations,
      recentCancellations,
      noShows,
      outstandingReservations,
    ] = await Promise.all([
      this.prisma.room.findMany({
        where: { propertyId, deletedAt: null },
        include: { roomType: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.reservation.findMany({
        where: {
          ...reservationWhere,
          checkInDate: { gte: start, lte: end },
          status: {
            in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
          },
        },
        include: reservationInclude,
        orderBy: { checkInDate: 'asc' },
      }),
      this.prisma.reservation.findMany({
        where: {
          ...reservationWhere,
          checkOutDate: { gte: start, lte: end },
          status: {
            in: [ReservationStatus.CONFIRMED, ReservationStatus.CHECKED_IN],
          },
        },
        include: reservationInclude,
        orderBy: { checkOutDate: 'asc' },
      }),
      this.prisma.reservation.findMany({
        where: { ...reservationWhere, status: ReservationStatus.CHECKED_IN },
        include: reservationInclude,
        orderBy: { checkOutDate: 'asc' },
      }),
      this.prisma.reservation.findMany({
        where: {
          ...reservationWhere,
          checkInDate: { lte: end },
          status: {
            in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
          },
        },
        include: reservationInclude,
        orderBy: { checkInDate: 'asc' },
        take: 25,
      }),
      this.prisma.reservation.findMany({
        where: {
          ...reservationWhere,
          checkOutDate: { lte: end },
          status: ReservationStatus.CHECKED_IN,
        },
        include: reservationInclude,
        orderBy: { checkOutDate: 'asc' },
        take: 25,
      }),
      this.prisma.reservation.findMany({
        where: { ...reservationWhere, createdAt: { gte: start, lte: end } },
        include: reservationInclude,
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.reservation.findMany({
        where: {
          ...reservationWhere,
          status: ReservationStatus.CANCELLED,
          updatedAt: { gte: addDays(start, -7), lte: end },
        },
        include: reservationInclude,
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }),
      this.prisma.reservation.findMany({
        where: {
          ...reservationWhere,
          status: ReservationStatus.NO_SHOW,
          updatedAt: { gte: addDays(start, -7), lte: end },
        },
        include: reservationInclude,
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }),
      this.prisma.reservation.findMany({
        where: {
          ...reservationWhere,
          status: { in: activeReservationStatuses },
          paymentStatus: { not: PaymentStatus.PAID },
        },
        include: reservationInclude,
        orderBy: { checkOutDate: 'asc' },
        take: 50,
      }),
    ]);

    const roomCounts = countRooms(rooms);
    const revenueToday = sumReservations(newReservations);
    const revenueMonth = await this.prisma.reservation.aggregate({
      where: {
        propertyId,
        deletedAt: null,
        status: {
          notIn: [ReservationStatus.CANCELLED, ReservationStatus.NO_SHOW],
        },
        createdAt: {
          gte: startOfMonth(selectedDate),
          lte: endOfMonth(selectedDate),
        },
      },
      _sum: { totalAmount: true },
    });
    const outstanding = outstandingReservations
      .map(toReservationRow)
      .filter((reservation) => Number(reservation.balance) > 0);

    await this.prisma.auditLog.create({
      data: {
        companyId: property.companyId,
        userId,
        action: 'frontdesk.view',
        entityType: 'Property',
        entityId: propertyId,
        newValues: {
          date: selectedDate.toISOString().slice(0, 10),
          status: query.status ?? null,
          search: search ?? null,
        },
      },
    });

    return {
      propertyId,
      companyId: property.companyId,
      currency: property.currency,
      date: selectedDate.toISOString().slice(0, 10),
      metrics: {
        arrivals: arrivals.length,
        departures: departures.length,
        inHouse: inHouse.length,
        pendingCheckIns: pendingCheckIns.length,
        pendingCheckOuts: pendingCheckOuts.length,
        roomsAvailable: roomCounts.available,
        roomsOccupied: roomCounts.occupied,
        dirtyRooms: roomCounts.dirty,
        cleanRooms: roomCounts.clean,
        maintenanceRooms: roomCounts.maintenance,
        blockedRooms: roomCounts.blocked,
        outstandingBalances: outstanding.length,
        newReservations: newReservations.length,
        recentCancellations: recentCancellations.length,
        noShows: noShows.length,
        revenueToday: revenueToday.toString(),
        revenueMonth: (
          revenueMonth._sum.totalAmount ?? new Prisma.Decimal(0)
        ).toString(),
        occupancyPercentage:
          rooms.length === 0
            ? 0
            : Math.round((roomCounts.occupied / rooms.length) * 100),
      },
      arrivals: arrivals.map(toReservationRow),
      departures: departures.map(toReservationRow),
      inHouse: inHouse.map(toReservationRow),
      pendingCheckIns: pendingCheckIns.map(toReservationRow),
      pendingCheckOuts: pendingCheckOuts.map(toReservationRow),
      newReservations: newReservations.map(toReservationRow),
      recentCancellations: recentCancellations.map(toReservationRow),
      noShows: noShows.map(toReservationRow),
      outstandingBalances: outstanding,
      rooms: rooms.map((room) => ({
        id: room.id,
        name: room.name,
        floor: room.floor,
        status: room.status,
        cleaningStatus: room.cleaningStatus,
        maintenanceStatus: room.maintenanceStatus,
        roomType: room.roomType.name,
      })),
      alerts: buildAlerts(
        roomCounts,
        pendingCheckIns.length,
        pendingCheckOuts.length,
        outstanding.length,
      ),
      actions: [
        'create-reservation',
        'walk-in',
        'open-reservation',
        'assign-room',
        'change-room',
        'check-in',
        'check-out',
        'mark-no-show',
        'record-payment',
        'add-guest-charge',
        'generate-invoice',
        'send-guest-message',
        'mark-room-clean',
        'create-maintenance-issue',
      ],
    };
  }
}

const reservationInclude = {
  guest: true,
  rooms: { include: { room: true } },
  payments: true,
} satisfies Prisma.ReservationInclude;

type ReservationWithFrontDeskRelations = Prisma.ReservationGetPayload<{
  include: typeof reservationInclude;
}>;

function toReservationRow(reservation: ReservationWithFrontDeskRelations) {
  const paid = reservation.payments.reduce(
    (sum, payment) => sum.plus(payment.amount),
    new Prisma.Decimal(0),
  );
  const balance = new Prisma.Decimal(reservation.totalAmount).minus(paid);
  return {
    id: reservation.id,
    reservationCode: reservation.reservationCode,
    status: reservation.status,
    paymentStatus: reservation.paymentStatus,
    guestName: reservation.guest.fullName,
    guestPhone: reservation.guest.phone,
    guestEmail: reservation.guest.email,
    checkInDate: reservation.checkInDate.toISOString(),
    checkOutDate: reservation.checkOutDate.toISOString(),
    bookingSource: reservation.bookingSource,
    rooms: reservation.rooms.map((row) => ({
      id: row.room.id,
      name: row.room.name,
      status: row.room.status,
    })),
    totalAmount: reservation.totalAmount.toString(),
    paidAmount: paid.toString(),
    balance: balance.gt(0) ? balance.toString() : '0',
  };
}

function countRooms(
  rooms: Array<{
    status: RoomStatus;
    cleaningStatus: RoomStatus;
    maintenanceStatus: RoomStatus;
  }>,
) {
  return {
    available: rooms.filter((room) => room.status === RoomStatus.AVAILABLE)
      .length,
    occupied: rooms.filter((room) => room.status === RoomStatus.OCCUPIED)
      .length,
    dirty: rooms.filter(
      (room) =>
        room.cleaningStatus === RoomStatus.DIRTY ||
        room.status === RoomStatus.DIRTY,
    ).length,
    clean: rooms.filter(
      (room) =>
        room.cleaningStatus === RoomStatus.READY ||
        room.status === RoomStatus.READY ||
        room.status === RoomStatus.AVAILABLE,
    ).length,
    maintenance: rooms.filter(
      (room) =>
        room.maintenanceStatus === RoomStatus.MAINTENANCE ||
        room.status === RoomStatus.MAINTENANCE,
    ).length,
    blocked: rooms.filter((room) => room.status === RoomStatus.OUT_OF_SERVICE)
      .length,
  };
}

function buildAlerts(
  roomCounts: ReturnType<typeof countRooms>,
  pendingCheckIns: number,
  pendingCheckOuts: number,
  outstandingBalances: number,
) {
  const alerts = [];
  if (roomCounts.dirty > 0)
    alerts.push({
      severity: 'warning',
      message: `${roomCounts.dirty} rooms need housekeeping.`,
    });
  if (roomCounts.maintenance > 0)
    alerts.push({
      severity: 'critical',
      message: `${roomCounts.maintenance} rooms are under maintenance.`,
    });
  if (pendingCheckIns > 0)
    alerts.push({
      severity: 'info',
      message: `${pendingCheckIns} check-ins need front desk attention.`,
    });
  if (pendingCheckOuts > 0)
    alerts.push({
      severity: 'info',
      message: `${pendingCheckOuts} check-outs are due.`,
    });
  if (outstandingBalances > 0)
    alerts.push({
      severity: 'warning',
      message: `${outstandingBalances} reservations have outstanding balances.`,
    });
  return alerts;
}

function sumReservations(
  reservations: ReservationWithFrontDeskRelations[],
): Prisma.Decimal {
  return reservations.reduce(
    (sum, reservation) => sum.plus(reservation.totalAmount),
    new Prisma.Decimal(0),
  );
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
