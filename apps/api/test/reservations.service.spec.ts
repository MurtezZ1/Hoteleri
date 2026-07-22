import { BadRequestException } from '@nestjs/common';
import { BookingSource } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
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
};

const tenants = {
  assertPropertyAccess: vi.fn().mockResolvedValue({ companyId: 'company-1' }),
};

describe('ReservationsService', () => {
  it('creates a reservation when no room conflict exists', async () => {
    const repository = {
      findConflicts: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'reservation-1' }),
    };
    const service = new ReservationsService(prisma as never, repository as never, tenants as never);

    await expect(service.create('user-1', baseDto)).resolves.toEqual({ id: 'reservation-1' });
    expect(repository.create).toHaveBeenCalledOnce();
  });

  it('prevents double-booking overlapping active reservations', async () => {
    const repository = {
      findConflicts: vi.fn().mockResolvedValue([{ room: { name: '101' } }]),
      create: vi.fn(),
    };
    const service = new ReservationsService(prisma as never, repository as never, tenants as never);

    await expect(service.create('user-1', baseDto)).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects reservations when the supplied company does not own the property', async () => {
    const repository = {
      findConflicts: vi.fn(),
      create: vi.fn(),
    };
    const mismatchedTenants = {
      assertPropertyAccess: vi.fn().mockResolvedValue({ companyId: 'company-2' }),
    };
    const service = new ReservationsService(prisma as never, repository as never, mismatchedTenants as never);

    await expect(service.create('user-1', baseDto)).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });
});
