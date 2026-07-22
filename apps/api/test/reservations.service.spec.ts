import { BadRequestException, ConflictException } from '@nestjs/common';
import { BookingSource } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReservationsService } from '../src/reservations/reservations.service';

const baseDto = {
  companyId: 'company-1',
  propertyId: 'property-1',
  guestId: 'guest-1',
  roomIds: ['room-1'],
  checkInDate: '2026-08-01T15:00:00.000Z',
  checkOutDate: '2026-08-03T11:00:00.000Z',
  adults: 2,
  children: 0,
  bookingSource: BookingSource.DIRECT,
  subtotal: 200,
  tax: 20,
};

const prisma = {
  guest: { findFirst: vi.fn().mockResolvedValue({ id: 'guest-1' }) },
  room: { findMany: vi.fn().mockResolvedValue([{ id: 'room-1' }]) },
  $transaction: vi.fn((callback: (tx: unknown) => unknown) =>
    callback({
      reservationIdempotencyRecord: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        update: vi.fn(),
      },
      reservationRoom: { findMany: vi.fn().mockResolvedValue([]) },
      reservation: {
        create: vi.fn().mockResolvedValue({ id: 'reservation-1' }),
      },
      inventoryOutboxEvent: { upsert: vi.fn() },
    }),
  ),
};

const tenants = {
  assertPropertyAccess: vi.fn().mockResolvedValue({ companyId: 'company-1' }),
};

const subscriptions = {
  assertCanMutate: vi.fn().mockResolvedValue(undefined),
};

const whatsapp = {
  enqueueReservationCreated: vi.fn().mockResolvedValue(undefined),
};

describe('ReservationsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a reservation when no room conflict exists', async () => {
    const service = new ReservationsService(
      prisma as never,
      tenants as never,
      subscriptions as never,
      whatsapp as never,
    );

    await expect(service.create('user-1', baseDto)).resolves.toEqual({
      id: 'reservation-1',
    });
    expect(subscriptions.assertCanMutate).toHaveBeenCalledWith(
      'company-1',
      'reservations.create',
    );
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('prevents double-booking overlapping active reservations', async () => {
    const conflictPrisma = {
      ...prisma,
      $transaction: vi.fn((callback: (tx: unknown) => unknown) =>
        callback({
          reservationIdempotencyRecord: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn(),
            update: vi.fn(),
          },
          reservationRoom: {
            findMany: vi.fn().mockResolvedValue([{ room: { name: '101' } }]),
          },
          reservation: { create: vi.fn() },
          inventoryOutboxEvent: { upsert: vi.fn() },
        }),
      ),
    };
    const service = new ReservationsService(
      conflictPrisma as never,
      tenants as never,
      subscriptions as never,
      whatsapp as never,
    );

    await expect(service.create('user-1', baseDto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects reservations when the supplied company does not own the property', async () => {
    const mismatchedTenants = {
      assertPropertyAccess: vi
        .fn()
        .mockResolvedValue({ companyId: 'company-2' }),
    };
    const service = new ReservationsService(
      prisma as never,
      mismatchedTenants as never,
      subscriptions as never,
      whatsapp as never,
    );

    await expect(service.create('user-1', baseDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns the original reservation for a repeated matching idempotency key', async () => {
    const existingReservation = { id: 'reservation-existing' };
    const idempotentPrisma = {
      ...prisma,
      $transaction: vi.fn((callback: (tx: unknown) => unknown) =>
        callback({
          reservationIdempotencyRecord: {
            findUnique: vi.fn().mockResolvedValue({
              requestHash:
                '57edfc1143e3c818681947fd22d319a8e07cf6ef2e47e078131b80a11599f892',
              reservation: existingReservation,
            }),
            create: vi.fn(),
            update: vi.fn(),
          },
          reservationRoom: { findMany: vi.fn() },
          reservation: { create: vi.fn() },
          inventoryOutboxEvent: { upsert: vi.fn() },
        }),
      ),
    };
    const service = new ReservationsService(
      idempotentPrisma as never,
      tenants as never,
      subscriptions as never,
      whatsapp as never,
    );

    await expect(
      service.create('user-1', baseDto, 'same-key'),
    ).resolves.toEqual(existingReservation);
  });

  it('uses serializable transactions for reservation creation', async () => {
    const service = new ReservationsService(
      prisma as never,
      tenants as never,
      subscriptions as never,
      whatsapp as never,
    );

    await service.create('user-1', baseDto);

    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'Serializable' }),
    );
  });
});
