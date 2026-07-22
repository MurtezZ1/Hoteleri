import { ConflictException } from '@nestjs/common';
import {
  BookingSource,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  Prisma,
  ReservationStatus,
  RoomStatus,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReservationsService } from '../src/reservations/reservations.service';

const reservation = {
  id: 'reservation-1',
  companyId: 'company-1',
  propertyId: 'property-1',
  guestId: 'guest-1',
  reservationCode: 'OF-1',
  status: ReservationStatus.CONFIRMED,
  bookingSource: BookingSource.DIRECT,
  checkInDate: new Date('2026-07-22T15:00:00.000Z'),
  checkOutDate: new Date('2026-07-24T11:00:00.000Z'),
  adults: 2,
  children: 0,
  subtotal: new Prisma.Decimal(100),
  tax: new Prisma.Decimal(20),
  discount: new Prisma.Decimal(0),
  totalAmount: new Prisma.Decimal(120),
  paymentStatus: PaymentStatus.UNPAID,
  internalNotes: null,
  company: { id: 'company-1', currency: 'USD' },
  property: { id: 'property-1', companyId: 'company-1', currency: 'USD' },
  guest: { id: 'guest-1', fullName: 'Test Guest' },
  rooms: [
    {
      id: 'reservation-room-1',
      reservationId: 'reservation-1',
      roomId: 'room-1',
      pricePerNight: new Prisma.Decimal(100),
      room: { id: 'room-1', name: '101' },
    },
  ],
  payments: [],
  invoices: [],
  extras: [],
};

const prisma = {
  reservation: {
    findFirst: vi.fn().mockResolvedValue(reservation),
    findUniqueOrThrow: vi.fn().mockResolvedValue(reservation),
    update: vi.fn().mockResolvedValue(reservation),
  },
  room: {
    findFirst: vi.fn().mockResolvedValue({
      id: 'room-2',
      propertyId: 'property-1',
      companyId: 'company-1',
      name: '102',
      status: RoomStatus.AVAILABLE,
      cleaningStatus: RoomStatus.READY,
      maintenanceStatus: RoomStatus.AVAILABLE,
      roomType: { name: 'Standard' },
    }),
    update: vi.fn(),
  },
  reservationRoom: {
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    create: vi.fn(),
  },
  reservationRoomChange: { create: vi.fn() },
  payment: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
  paymentIdempotencyRecord: {
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
  },
  propertyOperationalPolicy: { findUnique: vi.fn().mockResolvedValue(null) },
  inventoryOutboxEvent: { upsert: vi.fn() },
  invoice: {
    findFirst: vi.fn().mockResolvedValue(null),
    count: vi.fn().mockResolvedValue(0),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi
      .fn()
      .mockResolvedValue({ id: 'invoice-1', invoiceNumber: 'INV-2026-000001' }),
  },
  housekeepingTask: { create: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn((callback: (tx: typeof prisma) => unknown) =>
    callback(prisma),
  ),
};

const tenants = {
  assertPropertyAccess: vi.fn().mockResolvedValue({ companyId: 'company-1' }),
};

const subscriptions = {
  assertCanMutate: vi.fn().mockResolvedValue(undefined),
};

const whatsapp = {
  enqueueReservationCreated: vi.fn(),
};

describe('Front Desk reservation actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.reservation.findFirst.mockResolvedValue({
      ...reservation,
      status: ReservationStatus.CONFIRMED,
      payments: [],
    });
    prisma.reservation.findUniqueOrThrow.mockResolvedValue({
      ...reservation,
      payments: [],
    });
    prisma.room.findFirst.mockResolvedValue({
      id: 'room-2',
      propertyId: 'property-1',
      companyId: 'company-1',
      name: '102',
      status: RoomStatus.AVAILABLE,
      cleaningStatus: RoomStatus.READY,
      maintenanceStatus: RoomStatus.AVAILABLE,
      roomType: { name: 'Standard' },
    });
    prisma.reservationRoom.findMany.mockResolvedValue([]);
    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.paymentIdempotencyRecord.findUnique.mockResolvedValue(null);
    prisma.propertyOperationalPolicy.findUnique.mockResolvedValue(null);
  });

  it('assigns an available room and audits the change', async () => {
    const service = new ReservationsService(
      prisma as never,
      tenants as never,
      subscriptions as never,
      whatsapp as never,
    );

    await service.assignRoom('user-1', 'reservation-1', { roomId: 'room-2' });

    expect(prisma.reservationRoom.update).toHaveBeenCalledWith({
      where: { id: 'reservation-room-1' },
      data: { roomId: 'room-2' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'reservation.room_assigned' }),
      }),
    );
  });

  it('rejects maintenance rooms before assignment', async () => {
    prisma.room.findFirst.mockResolvedValueOnce({
      id: 'room-2',
      propertyId: 'property-1',
      companyId: 'company-1',
      status: RoomStatus.MAINTENANCE,
      cleaningStatus: RoomStatus.READY,
      maintenanceStatus: RoomStatus.MAINTENANCE,
    });
    const service = new ReservationsService(
      prisma as never,
      tenants as never,
      subscriptions as never,
      whatsapp as never,
    );

    await expect(
      service.assignRoom('user-1', 'reservation-1', { roomId: 'room-2' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ROOM_UNDER_MAINTENANCE' }),
    });
  });

  it('rejects overlapping room assignment with a structured conflict', async () => {
    prisma.reservationRoom.findMany.mockResolvedValueOnce([
      { reservationId: 'reservation-2', room: { name: '102' } },
    ]);
    const service = new ReservationsService(
      prisma as never,
      tenants as never,
      subscriptions as never,
      whatsapp as never,
    );

    await expect(
      service.assignRoom('user-1', 'reservation-1', { roomId: 'room-2' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ROOM_ASSIGNMENT_CONFLICT' }),
    });
  });

  it('rejects cancelled reservation check-in through the state machine', async () => {
    prisma.reservation.findFirst.mockResolvedValueOnce({
      ...reservation,
      status: ReservationStatus.CANCELLED,
    });
    const service = new ReservationsService(
      prisma as never,
      tenants as never,
      subscriptions as never,
      whatsapp as never,
    );

    await expect(
      service.checkIn('user-1', 'reservation-1', {
        guestDetailsConfirmed: true,
        identificationConfirmed: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('records idempotent payments without duplicating captured payment rows', async () => {
    prisma.paymentIdempotencyRecord.findUnique.mockResolvedValueOnce({
      requestHash:
        '9da4ce9cb4dd6f3989546b4a5a4c26db43a5f068c2455a5db6a555c279ff4559',
      status: 'COMPLETED',
    });
    const service = new ReservationsService(
      prisma as never,
      tenants as never,
      subscriptions as never,
      whatsapp as never,
    );

    await service.recordPayment('user-1', 'reservation-1', {
      amount: 50,
      currency: 'USD',
      method: PaymentMethod.CASH,
      type: PaymentType.PARTIAL,
      idempotencyKey: 'same-key',
    });

    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('checks out a paid checked-in reservation and creates housekeeping work', async () => {
    prisma.reservation.findFirst.mockResolvedValueOnce({
      ...reservation,
      status: ReservationStatus.CHECKED_IN,
      payments: [{ amount: new Prisma.Decimal(120), type: PaymentType.FULL }],
    });
    const service = new ReservationsService(
      prisma as never,
      tenants as never,
      subscriptions as never,
      whatsapp as never,
    );

    await service.checkOut('user-1', 'reservation-1', {});

    expect(prisma.housekeepingTask.create).toHaveBeenCalled();
    expect(prisma.room.update).toHaveBeenCalledWith({
      where: { id: 'room-1' },
      data: { status: RoomStatus.AVAILABLE, cleaningStatus: RoomStatus.DIRTY },
    });
  });
});
