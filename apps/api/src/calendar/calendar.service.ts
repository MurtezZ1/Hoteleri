import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CalendarBlockType,
  InventoryOutboxEventType,
  PaymentType,
  Prisma,
  ReservationStatus,
  RoomStatus,
} from '@prisma/client';
import { SubscriptionGuardService } from '../common/subscription-guard.service';
import { TenantAccessService } from '../common/tenant-access.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CalendarMoveDto,
  CalendarTimelineQueryDto,
  CreateCalendarBlockDto,
  UpdateCalendarBlockDto,
} from './dto';

const timelineMaxDays = 62;
const blockingReservationStatuses = [
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
  ReservationStatus.CHECKED_IN,
  ReservationStatus.BLOCKED,
  ReservationStatus.MAINTENANCE,
];
const terminalStatuses: ReservationStatus[] = [
  ReservationStatus.CHECKED_OUT,
  ReservationStatus.CANCELLED,
  ReservationStatus.NO_SHOW,
];

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantAccessService,
    private readonly subscriptions: SubscriptionGuardService,
  ) {}

  async timeline(userId: string, query: CalendarTimelineQueryDto) {
    const propertyAccess = await this.tenants.assertPropertyAccess(
      userId,
      query.propertyId,
    );
    await this.subscriptions.assertCanMutate(
      propertyAccess.companyId,
      'calendar.view',
    );
    const { start, end } = validateRange(query.startDate, query.endDate);
    const property = await this.prisma.property.findFirstOrThrow({
      where: {
        id: query.propertyId,
        companyId: propertyAccess.companyId,
        deletedAt: null,
      },
      select: { id: true, name: true, timezone: true, currency: true },
    });
    const search = query.search?.trim();
    const includeCancelled = query.includeCancelled === 'true';
    const includeNoShow = query.includeNoShow === 'true';

    const roomTypeWhere: Prisma.RoomTypeWhereInput = {
      propertyId: query.propertyId,
      companyId: propertyAccess.companyId,
      deletedAt: null,
      ...(query.roomTypeId ? { id: query.roomTypeId } : {}),
      ...(query.roomId
        ? { rooms: { some: { id: query.roomId, deletedAt: null } } }
        : {}),
    };
    const roomTypes = await this.prisma.roomType.findMany({
      where: roomTypeWhere,
      include: {
        rooms: {
          where: {
            deletedAt: null,
            ...(query.roomId ? { id: query.roomId } : {}),
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    const reservationWhere: Prisma.ReservationWhereInput = {
      propertyId: query.propertyId,
      companyId: propertyAccess.companyId,
      deletedAt: null,
      checkInDate: { lt: end },
      checkOutDate: { gt: start },
      ...(query.status ? { status: query.status } : {}),
      ...(query.source ? { bookingSource: query.source } : {}),
      ...(!query.status && !includeNoShow
        ? {
            status: {
              notIn: [ReservationStatus.CANCELLED, ReservationStatus.NO_SHOW],
            },
          }
        : {}),
      ...(!query.status && includeNoShow && !includeCancelled
        ? { status: { not: ReservationStatus.CANCELLED } }
        : {}),
      ...(search
        ? {
            OR: [
              { reservationCode: { contains: search, mode: 'insensitive' } },
              {
                guest: { fullName: { contains: search, mode: 'insensitive' } },
              },
            ],
          }
        : {}),
      ...(query.roomId ? { rooms: { some: { roomId: query.roomId } } } : {}),
      ...(!query.roomId && query.roomTypeId
        ? { rooms: { some: { room: { roomTypeId: query.roomTypeId } } } }
        : {}),
    };
    const reservations = await this.prisma.reservation.findMany({
      where: reservationWhere,
      include: {
        guest: true,
        rooms: { include: { room: true } },
        payments: true,
      },
      orderBy: [{ checkInDate: 'asc' }, { reservationCode: 'asc' }],
    });

    const blocks = await this.prisma.calendarBlock.findMany({
      where: {
        propertyId: query.propertyId,
        companyId: propertyAccess.companyId,
        deletedAt: null,
        startDate: { lt: end },
        endDate: { gt: start },
        ...(query.roomId ? { roomId: query.roomId } : {}),
        ...(query.roomTypeId ? { room: { roomTypeId: query.roomTypeId } } : {}),
      },
      include: { room: true },
      orderBy: [{ startDate: 'asc' }],
    });

    return {
      property: { ...property, timezone: query.timezone ?? property.timezone },
      range: {
        start: start.toISOString(),
        end: end.toISOString(),
        maxDays: timelineMaxDays,
      },
      roomTypes: roomTypes.map((roomType) => ({
        id: roomType.id,
        name: roomType.name,
        rooms: roomType.rooms.map((room) => ({
          id: room.id,
          name: room.name,
          operationalStatus: room.status,
          occupancyStatus: room.status,
          housekeepingStatus: room.cleaningStatus,
          maintenanceStatus: room.maintenanceStatus,
        })),
      })),
      reservations: reservations.flatMap((reservation) =>
        reservation.rooms.map((assignment) => {
          const paid = reservation.payments.reduce(
            (sum, payment) =>
              payment.type === PaymentType.REFUND
                ? sum.minus(payment.amount)
                : sum.plus(payment.amount),
            new Prisma.Decimal(0),
          );
          const balance = reservation.totalAmount.minus(paid);
          return {
            id: reservation.id,
            confirmationNumber: reservation.reservationCode,
            guestName: reservation.guest.fullName,
            roomId: assignment.roomId,
            roomTypeId: assignment.room.roomTypeId,
            checkIn: reservation.checkInDate.toISOString(),
            checkOut: reservation.checkOutDate.toISOString(),
            updatedAt: reservation.updatedAt.toISOString(),
            status: reservation.status,
            source: reservation.bookingSource,
            balance: balance.gt(0) ? balance.toString() : '0',
            isLocked: terminalStatuses.includes(reservation.status),
          };
        }),
      ),
      blocks: blocks.map((block) => ({
        id: block.id,
        roomId: block.roomId,
        roomTypeId: block.room.roomTypeId,
        type: block.type,
        startDate: block.startDate.toISOString(),
        endDate: block.endDate.toISOString(),
        updatedAt: block.updatedAt.toISOString(),
        reason: block.reason,
      })),
    };
  }

  async moveReservation(
    userId: string,
    reservationId: string,
    dto: CalendarMoveDto,
  ) {
    const checkIn = new Date(dto.checkIn);
    const checkOut = new Date(dto.checkOut);
    if (checkOut <= checkIn) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'Check-out must be after check-in.',
      });
    }
    return this.retrySerializable(() =>
      this.prisma.$transaction(
        async (tx) => {
          const reservation = await tx.reservation.findFirst({
            where: { id: reservationId, deletedAt: null },
            include: { rooms: true },
          });
          if (!reservation) {
            throw new NotFoundException({
              code: 'RESERVATION_NOT_FOUND',
              message: 'Reservation was not found.',
            });
          }
          const propertyAccess = await this.tenants.assertPropertyAccess(
            userId,
            reservation.propertyId,
          );
          await this.subscriptions.assertCanMutate(
            propertyAccess.companyId,
            'calendar.manage',
          );
          if (
            new Date(dto.expectedUpdatedAt).getTime() !==
            reservation.updatedAt.getTime()
          ) {
            this.conflict(
              'STALE_RESERVATION_VERSION',
              'Reservation has changed since the calendar was loaded.',
            );
          }
          if (
            terminalStatuses.includes(reservation.status) ||
            reservation.status === ReservationStatus.CHECKED_IN
          ) {
            this.conflict(
              'RESERVATION_MOVE_NOT_ALLOWED',
              `Reservation in ${reservation.status} status cannot be moved from calendar.`,
            );
          }
          const room = await tx.room.findFirst({
            where: {
              id: dto.roomId,
              companyId: reservation.companyId,
              deletedAt: null,
            },
          });
          if (!room) {
            throw new NotFoundException({
              code: 'ROOM_NOT_FOUND',
              message: 'Room was not found.',
            });
          }
          if (room.propertyId !== reservation.propertyId) {
            throw new BadRequestException({
              code: 'ROOM_WRONG_PROPERTY',
              message: 'Room does not belong to reservation property.',
            });
          }
          assertRoomAvailable(room);
          await this.assertMoveConflicts(
            tx,
            reservationId,
            dto.roomId,
            checkIn,
            checkOut,
          );
          const oldAssignment = reservation.rooms[0];
          if (oldAssignment) {
            await tx.reservationRoom.update({
              where: { id: oldAssignment.id },
              data: { roomId: dto.roomId },
            });
          } else {
            await tx.reservationRoom.create({
              data: {
                reservationId,
                roomId: dto.roomId,
                pricePerNight: reservation.subtotal,
              },
            });
          }
          await tx.reservation.update({
            where: { id: reservationId },
            data: { checkInDate: checkIn, checkOutDate: checkOut },
          });
          if (oldAssignment?.roomId !== dto.roomId) {
            await tx.reservationRoomChange.create({
              data: {
                companyId: reservation.companyId,
                propertyId: reservation.propertyId,
                reservationId,
                oldRoomId: oldAssignment?.roomId ?? null,
                newRoomId: dto.roomId,
                reason: dto.reason ?? 'Calendar move',
                changedByUserId: userId,
              },
            });
          }
          await tx.auditLog.create({
            data: {
              companyId: reservation.companyId,
              userId,
              action: 'calendar.reservation_moved',
              entityType: 'Reservation',
              entityId: reservationId,
              previousValues: {
                roomId: oldAssignment?.roomId,
                checkIn: reservation.checkInDate.toISOString(),
                checkOut: reservation.checkOutDate.toISOString(),
              },
              newValues: {
                roomId: dto.roomId,
                checkIn: checkIn.toISOString(),
                checkOut: checkOut.toISOString(),
                reason: dto.reason ?? null,
              },
            },
          });
          await this.createOutboxEvent(tx, {
            companyId: reservation.companyId,
            propertyId: reservation.propertyId,
            roomId: dto.roomId,
            reservationId,
            eventType: InventoryOutboxEventType.RESERVATION_UPDATED,
            idempotencyKey: `calendar-move:${reservationId}:${dto.expectedUpdatedAt}:${dto.roomId}:${checkIn.toISOString()}:${checkOut.toISOString()}`,
            payload: {
              reservationId,
              roomId: dto.roomId,
              checkIn: checkIn.toISOString(),
              checkOut: checkOut.toISOString(),
            },
          });
          return tx.reservation.findUniqueOrThrow({
            where: { id: reservationId },
            include: { rooms: { include: { room: true } }, guest: true },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async createBlock(userId: string, dto: CreateCalendarBlockDto) {
    const propertyAccess = await this.tenants.assertPropertyAccess(
      userId,
      dto.propertyId,
    );
    await this.subscriptions.assertCanMutate(
      propertyAccess.companyId,
      'calendar.manage',
    );
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end <= start) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'Block end must be after start.',
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const room = await tx.room.findFirst({
        where: {
          id: dto.roomId,
          propertyId: dto.propertyId,
          companyId: propertyAccess.companyId,
          deletedAt: null,
        },
      });
      if (!room) {
        throw new NotFoundException({
          code: 'ROOM_NOT_FOUND',
          message: 'Room was not found for this property.',
        });
      }
      await this.assertMoveConflicts(tx, undefined, dto.roomId, start, end);
      const block = await tx.calendarBlock.create({
        data: {
          companyId: propertyAccess.companyId,
          propertyId: dto.propertyId,
          roomId: dto.roomId,
          startDate: start,
          endDate: end,
          type: dto.type,
          reason: dto.reason,
          maintenanceIssueId: dto.maintenanceIssueId ?? null,
          createdByUserId: userId,
        },
      });
      if (dto.type === CalendarBlockType.MAINTENANCE) {
        await tx.room.update({
          where: { id: dto.roomId },
          data: { maintenanceStatus: RoomStatus.MAINTENANCE },
        });
      }
      await tx.auditLog.create({
        data: {
          companyId: propertyAccess.companyId,
          userId,
          action: 'calendar.block_created',
          entityType: 'CalendarBlock',
          entityId: block.id,
          newValues: {
            roomId: dto.roomId,
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            type: dto.type,
            reason: dto.reason,
          },
        },
      });
      await this.createOutboxEvent(tx, {
        companyId: propertyAccess.companyId,
        propertyId: dto.propertyId,
        roomId: dto.roomId,
        calendarBlockId: block.id,
        eventType: InventoryOutboxEventType.CALENDAR_BLOCK_CREATED,
        idempotencyKey: `calendar-block-created:${block.id}`,
        payload: {
          blockId: block.id,
          roomId: dto.roomId,
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          type: dto.type,
        },
      });
      return block;
    });
  }

  async updateBlock(
    userId: string,
    blockId: string,
    dto: UpdateCalendarBlockDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const block = await tx.calendarBlock.findFirst({
        where: { id: blockId, deletedAt: null },
        include: { room: true },
      });
      if (!block) {
        throw new NotFoundException({
          code: 'CALENDAR_BLOCK_NOT_FOUND',
          message: 'Calendar block was not found.',
        });
      }
      const propertyAccess = await this.tenants.assertPropertyAccess(
        userId,
        block.propertyId,
      );
      await this.subscriptions.assertCanMutate(
        propertyAccess.companyId,
        'calendar.manage',
      );
      if (propertyAccess.companyId !== block.companyId) {
        throw new BadRequestException({
          code: 'PERMISSION_DENIED',
          message: 'Calendar block tenant mismatch.',
        });
      }
      if (
        new Date(dto.expectedUpdatedAt).getTime() !== block.updatedAt.getTime()
      ) {
        this.conflict(
          'CALENDAR_BLOCK_STALE_VERSION',
          'Calendar block has changed since it was loaded.',
        );
      }
      const nextRoomId = dto.roomId ?? block.roomId;
      const nextStart = dto.startDate
        ? new Date(dto.startDate)
        : block.startDate;
      const nextEnd = dto.endDate ? new Date(dto.endDate) : block.endDate;
      if (nextEnd <= nextStart) {
        throw new BadRequestException({
          code: 'INVALID_DATE_RANGE',
          message: 'Block end must be after start.',
        });
      }
      const room = await tx.room.findFirst({
        where: {
          id: nextRoomId,
          propertyId: block.propertyId,
          companyId: block.companyId,
          deletedAt: null,
        },
      });
      if (!room) {
        throw new BadRequestException({
          code: 'ROOM_WRONG_PROPERTY',
          message: 'Room does not belong to block property.',
        });
      }
      await this.assertMoveConflicts(
        tx,
        undefined,
        nextRoomId,
        nextStart,
        nextEnd,
        block.id,
      );
      const updated = await tx.calendarBlock.update({
        where: { id: blockId },
        data: {
          roomId: nextRoomId,
          startDate: nextStart,
          endDate: nextEnd,
          type: dto.type ?? block.type,
          reason: dto.reason ?? block.reason,
        },
      });
      await tx.auditLog.create({
        data: {
          companyId: block.companyId,
          userId,
          action: 'calendar.block_updated',
          entityType: 'CalendarBlock',
          entityId: blockId,
          previousValues: {
            roomId: block.roomId,
            startDate: block.startDate.toISOString(),
            endDate: block.endDate.toISOString(),
            type: block.type,
            reason: block.reason,
          },
          newValues: {
            roomId: updated.roomId,
            startDate: updated.startDate.toISOString(),
            endDate: updated.endDate.toISOString(),
            type: updated.type,
            reason: updated.reason,
          },
        },
      });
      await this.createOutboxEvent(tx, {
        companyId: block.companyId,
        propertyId: block.propertyId,
        roomId: updated.roomId,
        calendarBlockId: blockId,
        eventType: InventoryOutboxEventType.CALENDAR_BLOCK_UPDATED,
        idempotencyKey: `calendar-block-updated:${blockId}:${updated.updatedAt.toISOString()}`,
        payload: {
          blockId,
          roomId: updated.roomId,
          startDate: updated.startDate.toISOString(),
          endDate: updated.endDate.toISOString(),
          type: updated.type,
        },
      });
      return updated;
    });
  }

  async deleteBlock(userId: string, blockId: string) {
    return this.prisma.$transaction(async (tx) => {
      const block = await tx.calendarBlock.findFirst({
        where: { id: blockId, deletedAt: null },
        include: { room: true, maintenanceIssue: true },
      });
      if (!block) {
        throw new NotFoundException({
          code: 'CALENDAR_BLOCK_NOT_FOUND',
          message: 'Calendar block was not found.',
        });
      }
      const propertyAccess = await this.tenants.assertPropertyAccess(
        userId,
        block.propertyId,
      );
      await this.subscriptions.assertCanMutate(
        propertyAccess.companyId,
        'calendar.manage',
      );
      if (
        block.maintenanceIssueId &&
        block.maintenanceIssue?.status !== 'RESOLVED' &&
        block.maintenanceIssue?.status !== 'CLOSED'
      ) {
        this.conflict(
          'CALENDAR_BLOCK_LINKED_TO_MAINTENANCE',
          'Resolve or close the linked maintenance issue before deleting this block.',
        );
      }
      const deleted = await tx.calendarBlock.update({
        where: { id: blockId },
        data: { deletedAt: new Date() },
      });
      if (
        block.type === CalendarBlockType.MAINTENANCE &&
        block.room.maintenanceStatus === RoomStatus.MAINTENANCE &&
        block.room.status !== RoomStatus.OUT_OF_SERVICE
      ) {
        await tx.room.update({
          where: { id: block.roomId },
          data: { maintenanceStatus: RoomStatus.AVAILABLE },
        });
      }
      await tx.auditLog.create({
        data: {
          companyId: block.companyId,
          userId,
          action: 'calendar.block_deleted',
          entityType: 'CalendarBlock',
          entityId: blockId,
          previousValues: {
            roomId: block.roomId,
            startDate: block.startDate.toISOString(),
            endDate: block.endDate.toISOString(),
            type: block.type,
            reason: block.reason,
          },
        },
      });
      await this.createOutboxEvent(tx, {
        companyId: block.companyId,
        propertyId: block.propertyId,
        roomId: block.roomId,
        calendarBlockId: blockId,
        eventType: InventoryOutboxEventType.CALENDAR_BLOCK_DELETED,
        idempotencyKey: `calendar-block-deleted:${blockId}`,
        payload: {
          blockId,
          roomId: block.roomId,
          deletedAt: deleted.deletedAt?.toISOString(),
        },
      });
      return { id: blockId, deleted: true };
    });
  }

  private async assertMoveConflicts(
    tx: Prisma.TransactionClient,
    reservationId: string | undefined,
    roomId: string,
    checkIn: Date,
    checkOut: Date,
    ignoreBlockId?: string,
  ): Promise<void> {
    const reservationConflict = await tx.reservationRoom.findFirst({
      where: {
        roomId,
        ...(reservationId ? { reservationId: { not: reservationId } } : {}),
        reservation: {
          deletedAt: null,
          status: { in: blockingReservationStatuses },
          checkInDate: { lt: checkOut },
          checkOutDate: { gt: checkIn },
        },
      },
      include: { room: true },
    });
    if (reservationConflict) {
      this.conflict(
        'ROOM_ASSIGNMENT_CONFLICT',
        `Room ${reservationConflict.room.name} is already booked for the selected dates.`,
      );
    }
    const blockConflict = await tx.calendarBlock.findFirst({
      where: {
        roomId,
        deletedAt: null,
        ...(ignoreBlockId ? { id: { not: ignoreBlockId } } : {}),
        startDate: { lt: checkOut },
        endDate: { gt: checkIn },
      },
      include: { room: true },
    });
    if (blockConflict) {
      this.conflict(
        'RESERVATION_DATE_CONFLICT',
        `Room ${blockConflict.room.name} is blocked for the selected dates.`,
      );
    }
  }

  private async createOutboxEvent(
    tx: Prisma.TransactionClient,
    data: {
      companyId: string;
      propertyId: string;
      roomId?: string;
      roomTypeId?: string;
      reservationId?: string;
      calendarBlockId?: string;
      eventType: InventoryOutboxEventType;
      idempotencyKey: string;
      payload: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await tx.inventoryOutboxEvent.upsert({
      where: {
        companyId_idempotencyKey: {
          companyId: data.companyId,
          idempotencyKey: data.idempotencyKey,
        },
      },
      update: {},
      create: {
        companyId: data.companyId,
        propertyId: data.propertyId,
        roomId: data.roomId ?? null,
        roomTypeId: data.roomTypeId ?? null,
        reservationId: data.reservationId ?? null,
        calendarBlockId: data.calendarBlockId ?? null,
        eventType: data.eventType,
        idempotencyKey: data.idempotencyKey,
        payload: data.payload,
      },
    });
  }

  private async retrySerializable<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        ) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new ConflictException(
          'Calendar operation could not be completed because of concurrent inventory changes.',
        );
  }

  private conflict(code: string, message: string): never {
    throw new HttpException({ code, message }, HttpStatus.CONFLICT);
  }
}

function validateRange(
  startDate: string,
  endDate: string,
): { start: Date; end: Date } {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end <= start
  ) {
    throw new BadRequestException({
      code: 'INVALID_DATE_RANGE',
      message: 'Calendar end date must be after start date.',
    });
  }
  const dayCount = Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
  if (dayCount > timelineMaxDays) {
    throw new BadRequestException({
      code: 'CALENDAR_RANGE_TOO_LARGE',
      message: `Calendar range cannot exceed ${timelineMaxDays} days.`,
    });
  }
  return { start, end };
}

function assertRoomAvailable(room: {
  status: RoomStatus;
  maintenanceStatus: RoomStatus;
}): void {
  if (room.maintenanceStatus === RoomStatus.MAINTENANCE) {
    throw new HttpException(
      { code: 'ROOM_UNDER_MAINTENANCE', message: 'Room is under maintenance.' },
      HttpStatus.CONFLICT,
    );
  }
  const unavailableStatuses: RoomStatus[] = [
    RoomStatus.MAINTENANCE,
    RoomStatus.OUT_OF_SERVICE,
    RoomStatus.OCCUPIED,
  ];
  if (unavailableStatuses.includes(room.status)) {
    throw new HttpException(
      {
        code: 'ROOM_UNAVAILABLE',
        message: 'Room is not available for calendar movement.',
      },
      HttpStatus.CONFLICT,
    );
  }
}
