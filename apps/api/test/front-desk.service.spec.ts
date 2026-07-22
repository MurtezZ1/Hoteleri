import { ForbiddenException } from '@nestjs/common';
import {
  PaymentStatus,
  Prisma,
  ReservationStatus,
  RoomStatus,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FrontDeskService } from '../src/front-desk/front-desk.service';

const reservation = {
  id: 'reservation-1',
  reservationCode: 'ODE-1001',
  status: ReservationStatus.CONFIRMED,
  paymentStatus: PaymentStatus.PARTIALLY_PAID,
  guest: {
    fullName: 'Arta Krasniqi',
    phone: '+38344111222',
    email: 'arta@example.com',
  },
  checkInDate: new Date('2026-07-22T14:00:00.000Z'),
  checkOutDate: new Date('2026-07-24T10:00:00.000Z'),
  bookingSource: 'DIRECT',
  rooms: [
    { room: { id: 'room-1', name: '101', status: RoomStatus.AVAILABLE } },
  ],
  totalAmount: new Prisma.Decimal(120),
  payments: [{ amount: new Prisma.Decimal(40) }],
  createdAt: new Date('2026-07-22T09:00:00.000Z'),
  updatedAt: new Date('2026-07-22T09:00:00.000Z'),
};

const prisma = {
  room: {
    findMany: vi.fn().mockResolvedValue([
      {
        id: 'room-1',
        name: '101',
        floor: '1',
        status: RoomStatus.AVAILABLE,
        cleaningStatus: RoomStatus.READY,
        maintenanceStatus: RoomStatus.AVAILABLE,
        roomType: { name: 'Standard' },
      },
    ]),
  },
  reservation: {
    findMany: vi.fn().mockResolvedValue([reservation]),
    aggregate: vi
      .fn()
      .mockResolvedValue({ _sum: { totalAmount: new Prisma.Decimal(120) } }),
  },
  auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
};

const tenants = {
  assertPropertyAccess: vi.fn().mockResolvedValue({ companyId: 'company-1' }),
};

const subscriptions = {
  assertCanMutate: vi.fn().mockResolvedValue(undefined),
};

describe('FrontDeskService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.reservation.findMany.mockResolvedValue([reservation]);
    prisma.reservation.aggregate.mockResolvedValue({
      _sum: { totalAmount: new Prisma.Decimal(120) },
    });
    tenants.assertPropertyAccess.mockResolvedValue({ companyId: 'company-1' });
    subscriptions.assertCanMutate.mockResolvedValue(undefined);
  });

  it('returns a tenant-scoped overview and writes an audit log', async () => {
    const service = new FrontDeskService(
      prisma as never,
      tenants as never,
      subscriptions as never,
    );

    const overview = await service.overview('user-1', 'property-1', {
      date: '2026-07-22',
    });

    expect(tenants.assertPropertyAccess).toHaveBeenCalledWith(
      'user-1',
      'property-1',
    );
    expect(subscriptions.assertCanMutate).toHaveBeenCalledWith(
      'company-1',
      'pms.frontdesk',
    );
    expect(overview.metrics.arrivals).toBe(1);
    expect(overview.outstandingBalances[0]?.balance).toBe('80');
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 'company-1',
          userId: 'user-1',
          action: 'frontdesk.view',
          entityId: 'property-1',
        }),
      }),
    );
  });

  it('rejects cross-tenant property access before reading front desk data', async () => {
    tenants.assertPropertyAccess.mockRejectedValueOnce(
      new ForbiddenException('No access to this property'),
    );
    const service = new FrontDeskService(
      prisma as never,
      tenants as never,
      subscriptions as never,
    );

    await expect(
      service.overview('user-2', 'property-2', { date: '2026-07-22' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.room.findMany).not.toHaveBeenCalled();
    expect(prisma.reservation.findMany).not.toHaveBeenCalled();
  });

  it('rejects users without an active front desk entitlement', async () => {
    subscriptions.assertCanMutate.mockRejectedValueOnce(
      new ForbiddenException('Subscription inactive'),
    );
    const service = new FrontDeskService(
      prisma as never,
      tenants as never,
      subscriptions as never,
    );

    await expect(
      service.overview('user-1', 'property-1', { date: '2026-07-22' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.room.findMany).not.toHaveBeenCalled();
    expect(prisma.reservation.findMany).not.toHaveBeenCalled();
  });
});
