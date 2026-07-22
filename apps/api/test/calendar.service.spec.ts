import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  BookingSource,
  CalendarBlockType,
  Prisma,
  ReservationStatus,
  RoomStatus,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarService } from '../src/calendar/calendar.service';

const property = {
  id: 'property-1',
  name: 'Blue Harbor',
  timezone: 'Europe/Warsaw',
  currency: 'USD',
};
const reservation = {
  id: 'reservation-1',
  companyId: 'company-1',
  propertyId: 'property-1',
  reservationCode: 'OF-1',
  status: ReservationStatus.CONFIRMED,
  bookingSource: BookingSource.DIRECT,
  checkInDate: new Date('2026-07-23T15:00:00.000Z'),
  checkOutDate: new Date('2026-07-25T11:00:00.000Z'),
  updatedAt: new Date('2026-07-22T10:00:00.000Z'),
  subtotal: new Prisma.Decimal(100),
  totalAmount: new Prisma.Decimal(120),
  guest: { fullName: 'Arta Krasniqi' },
  rooms: [
    {
      id: 'reservation-room-1',
      roomId: 'room-1',
      room: { id: 'room-1', name: '101', roomTypeId: 'type-1' },
    },
  ],
  payments: [{ amount: new Prisma.Decimal(20), type: null }],
};

const prisma = {
  property: { findFirstOrThrow: vi.fn().mockResolvedValue(property) },
  roomType: {
    findMany: vi.fn().mockResolvedValue([
      {
        id: 'type-1',
        name: 'Standard',
        rooms: [
          {
            id: 'room-1',
            name: '101',
            status: RoomStatus.AVAILABLE,
            cleaningStatus: RoomStatus.READY,
            maintenanceStatus: RoomStatus.AVAILABLE,
          },
        ],
      },
    ]),
  },
  reservation: {
    findMany: vi.fn().mockResolvedValue([reservation]),
    findFirst: vi.fn().mockResolvedValue(reservation),
    update: vi.fn(),
    findUniqueOrThrow: vi.fn().mockResolvedValue(reservation),
  },
  calendarBlock: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 'block-1' }),
    update: vi.fn().mockResolvedValue({
      id: 'block-1',
      roomId: 'room-1',
      startDate: new Date('2026-07-28T00:00:00.000Z'),
      endDate: new Date('2026-07-30T00:00:00.000Z'),
      type: CalendarBlockType.BLOCKED,
      reason: 'Updated',
      updatedAt: new Date('2026-07-22T12:00:00.000Z'),
    }),
  },
  inventoryOutboxEvent: { upsert: vi.fn() },
  room: {
    findFirst: vi.fn().mockResolvedValue({
      id: 'room-2',
      propertyId: 'property-1',
      companyId: 'company-1',
      status: RoomStatus.AVAILABLE,
      maintenanceStatus: RoomStatus.AVAILABLE,
    }),
  },
  reservationRoom: {
    findFirst: vi.fn().mockResolvedValue(null),
    update: vi.fn(),
    create: vi.fn(),
  },
  reservationRoomChange: { create: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn((callback: (tx: typeof prisma) => unknown) =>
    callback(prisma),
  ),
};

const tenants = {
  assertPropertyAccess: vi
    .fn()
    .mockResolvedValue({ companyId: 'company-1', currency: 'USD' }),
};
const subscriptions = { assertCanMutate: vi.fn().mockResolvedValue(undefined) };

describe('CalendarService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenants.assertPropertyAccess.mockResolvedValue({
      companyId: 'company-1',
      currency: 'USD',
    });
    prisma.reservation.findFirst.mockResolvedValue(reservation);
    prisma.reservationRoom.findFirst.mockResolvedValue(null);
    prisma.calendarBlock.findFirst.mockResolvedValue(null);
    prisma.room.findFirst.mockResolvedValue({
      id: 'room-2',
      propertyId: 'property-1',
      companyId: 'company-1',
      status: RoomStatus.AVAILABLE,
      maintenanceStatus: RoomStatus.AVAILABLE,
    });
  });

  it('returns a tenant-scoped timeline with compact reservation data', async () => {
    const service = new CalendarService(
      prisma as never,
      tenants as never,
      subscriptions as never,
    );

    const result = await service.timeline('user-1', {
      propertyId: 'property-1',
      startDate: '2026-07-23',
      endDate: '2026-07-30',
    });

    expect(tenants.assertPropertyAccess).toHaveBeenCalledWith(
      'user-1',
      'property-1',
    );
    expect(subscriptions.assertCanMutate).toHaveBeenCalledWith(
      'company-1',
      'calendar.view',
    );
    expect(result.reservations[0]).toMatchObject({
      confirmationNumber: 'OF-1',
      guestName: 'Arta Krasniqi',
      balance: '100',
    });
  });

  it('denies cross-tenant timeline access before returning data', async () => {
    tenants.assertPropertyAccess.mockRejectedValueOnce(
      new ForbiddenException('No access'),
    );
    const service = new CalendarService(
      prisma as never,
      tenants as never,
      subscriptions as never,
    );

    await expect(
      service.timeline('user-2', {
        propertyId: 'property-2',
        startDate: '2026-07-23',
        endDate: '2026-07-30',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects excessive timeline ranges', async () => {
    const service = new CalendarService(
      prisma as never,
      tenants as never,
      subscriptions as never,
    );

    await expect(
      service.timeline('user-1', {
        propertyId: 'property-1',
        startDate: '2026-07-01',
        endDate: '2026-10-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('moves a reservation with optimistic concurrency and audit logging', async () => {
    const service = new CalendarService(
      prisma as never,
      tenants as never,
      subscriptions as never,
    );

    await service.moveReservation('user-1', 'reservation-1', {
      roomId: 'room-2',
      checkIn: '2026-07-24T15:00:00.000Z',
      checkOut: '2026-07-26T11:00:00.000Z',
      expectedUpdatedAt: '2026-07-22T10:00:00.000Z',
      reason: 'Calendar drag',
    });

    expect(prisma.reservationRoom.update).toHaveBeenCalledWith({
      where: { id: 'reservation-room-1' },
      data: { roomId: 'room-2' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'calendar.reservation_moved' }),
      }),
    );
  });

  it('rejects stale calendar moves', async () => {
    const service = new CalendarService(
      prisma as never,
      tenants as never,
      subscriptions as never,
    );

    await expect(
      service.moveReservation('user-1', 'reservation-1', {
        roomId: 'room-2',
        checkIn: '2026-07-24T15:00:00.000Z',
        checkOut: '2026-07-26T11:00:00.000Z',
        expectedUpdatedAt: '2026-07-22T11:00:00.000Z',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'STALE_RESERVATION_VERSION' }),
    });
  });

  it('rejects moves into overlapping room reservations', async () => {
    prisma.reservationRoom.findFirst.mockResolvedValueOnce({
      room: { name: '102' },
    });
    const service = new CalendarService(
      prisma as never,
      tenants as never,
      subscriptions as never,
    );

    await expect(
      service.moveReservation('user-1', 'reservation-1', {
        roomId: 'room-2',
        checkIn: '2026-07-24T15:00:00.000Z',
        checkOut: '2026-07-26T11:00:00.000Z',
        expectedUpdatedAt: '2026-07-22T10:00:00.000Z',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ROOM_ASSIGNMENT_CONFLICT' }),
    });
  });

  it('creates blocks that appear on the calendar and audit the operation', async () => {
    const service = new CalendarService(
      prisma as never,
      tenants as never,
      subscriptions as never,
    );

    await service.createBlock('user-1', {
      propertyId: 'property-1',
      roomId: 'room-1',
      startDate: '2026-07-28T00:00:00.000Z',
      endDate: '2026-07-29T00:00:00.000Z',
      type: CalendarBlockType.BLOCKED,
      reason: 'Private hold',
    });

    expect(prisma.calendarBlock.create).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'calendar.block_created' }),
      }),
    );
  });

  it('updates a calendar block with stale-version protection and outbox event', async () => {
    const block = {
      id: 'block-1',
      companyId: 'company-1',
      propertyId: 'property-1',
      roomId: 'room-1',
      type: CalendarBlockType.BLOCKED,
      startDate: new Date('2026-07-28T00:00:00.000Z'),
      endDate: new Date('2026-07-29T00:00:00.000Z'),
      reason: 'Old',
      updatedAt: new Date('2026-07-22T12:00:00.000Z'),
      room: { id: 'room-1' },
    };
    prisma.calendarBlock.findFirst
      .mockResolvedValueOnce(block)
      .mockResolvedValueOnce(null);
    const service = new CalendarService(
      prisma as never,
      tenants as never,
      subscriptions as never,
    );

    await service.updateBlock('user-1', 'block-1', {
      roomId: 'room-1',
      startDate: '2026-07-28T00:00:00.000Z',
      endDate: '2026-07-30T00:00:00.000Z',
      reason: 'Updated',
      expectedUpdatedAt: '2026-07-22T12:00:00.000Z',
    });

    expect(prisma.calendarBlock.update).toHaveBeenCalled();
    expect(prisma.inventoryOutboxEvent.upsert).toHaveBeenCalled();
  });

  it('soft deletes a calendar block and writes an outbox event', async () => {
    prisma.calendarBlock.findFirst.mockResolvedValueOnce({
      id: 'block-1',
      companyId: 'company-1',
      propertyId: 'property-1',
      roomId: 'room-1',
      type: CalendarBlockType.BLOCKED,
      startDate: new Date('2026-07-28T00:00:00.000Z'),
      endDate: new Date('2026-07-29T00:00:00.000Z'),
      reason: 'Hold',
      maintenanceIssueId: null,
      room: {
        id: 'room-1',
        status: RoomStatus.AVAILABLE,
        maintenanceStatus: RoomStatus.AVAILABLE,
      },
      maintenanceIssue: null,
    });
    const service = new CalendarService(
      prisma as never,
      tenants as never,
      subscriptions as never,
    );

    await service.deleteBlock('user-1', 'block-1');

    expect(prisma.calendarBlock.update).toHaveBeenCalledWith({
      where: { id: 'block-1' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(prisma.inventoryOutboxEvent.upsert).toHaveBeenCalled();
  });
});
