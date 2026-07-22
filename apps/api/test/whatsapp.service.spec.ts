import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { WhatsAppMessageStatus, WhatsAppMessageType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { MetaCloudWhatsAppProvider } from '../src/whatsapp/whatsapp-provider';
import { WhatsAppProviderFactory } from '../src/whatsapp/whatsapp-provider.factory';
import { WhatsAppService } from '../src/whatsapp/whatsapp.service';

function createService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    whatsAppConnection: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'connection-1',
          provider: 'MOCK',
          senderPhoneNumber: '+15559990000',
          status: 'CONNECTED',
          encryptedAccessToken: 'encrypted-secret',
        },
      ]),
      findFirst: vi.fn().mockResolvedValue({
        id: 'connection-1',
        companyId: 'company-1',
        provider: 'MOCK',
        senderPhoneNumber: '+15559990000',
        status: 'CONNECTED',
      }),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    whatsAppRecipient: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
    },
    whatsAppTemplate: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({
        id: 'template-1',
        category: 'TRANSACTIONAL',
        bodyPreview:
          'Your reservation at {{propertyName}} is confirmed for {{checkIn}}.',
      }),
      upsert: vi.fn().mockResolvedValue({}),
    },
    whatsAppMessage: {
      create: vi.fn().mockResolvedValue({
        id: 'message-1',
        companyId: 'company-1',
        idempotencyKey: 'reservation.confirmed:reservation-1',
        status: WhatsAppMessageStatus.QUEUED,
        messageType: WhatsAppMessageType.TEMPLATE,
        recipientPhone: '+15550001111',
        body: 'Hello',
      }),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    whatsAppWebhookEvent: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'webhook-1' }),
      update: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'subscription-1',
        plan: 'pro',
        lifecycleStatus: 'ACTIVE',
        subscriptionPlan: { code: 'PRO' },
      }),
    },
    usageRecord: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    reservation: { findUnique: vi.fn() },
    guest: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: 'guest-1', fullName: 'Ada Guest' }),
    },
    ...overrides,
  };
  const tenants = { assertCompanyAccess: vi.fn().mockResolvedValue(undefined) };
  const subscriptions = {
    assertCanMutate: vi.fn().mockResolvedValue(undefined),
  };
  const queue = {
    enqueue: vi.fn().mockResolvedValue(undefined),
    health: vi
      .fn()
      .mockResolvedValue({ waiting: 0, delayed: 0, failed: 0, active: 0 }),
    registerProcessor: vi.fn(),
  };
  const providers = new WhatsAppProviderFactory({
    get: vi.fn((key: string) =>
      key === 'WHATSAPP_PROVIDER' ? 'mock' : undefined,
    ),
  } as never);
  const config = {
    get: vi.fn((key: string) =>
      key === 'WHATSAPP_PRO_MONTHLY_LIMIT' ? '500' : undefined,
    ),
  };
  return {
    service: new WhatsAppService(
      prisma as never,
      tenants as never,
      subscriptions as never,
      queue as never,
      providers,
      config as never,
    ),
    prisma,
    tenants,
    subscriptions,
    queue,
  };
}

describe('WhatsApp integration', () => {
  it('queues guest confirmation and staff notification after reservation creation', async () => {
    const reservation = {
      id: 'reservation-1',
      companyId: 'company-1',
      propertyId: 'property-1',
      guestId: 'guest-1',
      guest: {
        id: 'guest-1',
        fullName: 'Ada Guest',
        phone: '+15550001111',
        whatsappOptedOut: false,
        whatsappConsent: false,
      },
      property: { name: 'Blue Harbor' },
      rooms: [{ room: { name: '101' } }],
      checkInDate: new Date('2026-08-01T15:00:00Z'),
      checkOutDate: new Date('2026-08-03T11:00:00Z'),
      totalAmount: { toString: () => '240' },
      bookingSource: 'DIRECT',
    };
    const { service, prisma, queue } = createService({
      reservation: { findUnique: vi.fn().mockResolvedValue(reservation) },
      whatsAppRecipient: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { name: 'Reception', phoneNumber: '+15550002222' },
          ]),
        upsert: vi.fn(),
      },
    });

    await service.enqueueReservationCreated('reservation-1');

    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: 'reservation.confirmed:reservation-1',
        }),
      }),
    );
    expect(queue.enqueue).toHaveBeenCalledTimes(2);
  });

  it('does not send duplicate webhook events twice', async () => {
    const { service, prisma } = createService({
      whatsAppWebhookEvent: {
        findUnique: vi.fn().mockResolvedValue({ id: 'existing' }),
        create: vi.fn(),
        update: vi.fn(),
      },
    });

    const result = await service.processWebhook('mock', {
      headers: {},
      body: {
        eventId: 'evt-1',
        type: 'delivered',
        messageId: 'mock-1',
        to: '+15559990000',
      },
    });

    expect(result.results[0]).toEqual({
      duplicate: true,
      providerEventId: 'evt-1',
    });
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
  });

  it('stores incoming messages under the tenant resolved from sender number', async () => {
    const { service, prisma } = createService();

    await service.processWebhook('mock', {
      headers: {},
      body: {
        eventId: 'evt-2',
        type: 'incoming',
        from: '+15550001111',
        to: '+15559990000',
        body: 'Hello',
      },
    });

    expect(prisma.whatsAppConnection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          senderPhoneNumber: { in: ['+15559990000', '+15550001111'] },
        }),
      }),
    );
    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 'company-1',
          direction: 'INBOUND',
        }),
      }),
    );
  });

  it('blocks STARTER from sending WhatsApp messages', async () => {
    const { service } = createService({
      subscription: {
        findUnique: vi.fn().mockResolvedValue({
          plan: 'starter',
          lifecycleStatus: 'ACTIVE',
          subscriptionPlan: { code: 'STARTER' },
        }),
      },
    });

    await expect(
      service.sendTest('user-1', {
        companyId: 'company-1',
        to: '+15550001111',
        body: 'Test',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not expose stored credential plaintext in settings', async () => {
    const { service } = createService();

    const settings = await service.settings('user-1', 'company-1');

    expect(settings.connections[0]?.encryptedAccessToken).toBe('enc...ret');
  });

  it('rejects invalid Meta webhook signatures', () => {
    const provider = new MetaCloudWhatsAppProvider(
      'app-secret',
      'verify-token',
    );

    expect(
      provider.verifyWebhook({
        headers: { 'x-hub-signature-256': 'sha256=bad' },
        body: {},
        rawBody: '{}',
      }),
    ).toBe(false);
  });

  it('surfaces invalid webhook verification through the service', async () => {
    const providers = {
      create: vi.fn(
        () => new MetaCloudWhatsAppProvider('app-secret', 'expected-token'),
      ),
      assertConfigured: vi.fn(),
    };
    const { service } = createService();
    (service as unknown as { providers: typeof providers }).providers =
      providers;

    await expect(
      service.metaChallenge({
        headers: {},
        body: {},
        query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong' },
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
