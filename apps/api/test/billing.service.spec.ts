import { ConflictException, ForbiddenException } from '@nestjs/common';
import { BillingInterval } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { BillingService } from '../src/billing/billing.service';
import { SubscriptionGuardService } from '../src/common/subscription-guard.service';

function createBillingService() {
  const prisma = {
    subscriptionPlan: {
      upsert: vi.fn((input) => Promise.resolve({ id: `${input.where.code.toLowerCase()}-plan`, ...input.create })),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({
        id: 'pro-plan',
        code: 'PRO',
        maxStaffUsers: 20,
        monthlyPriceCents: 14900,
        yearlyPriceCents: 149000,
        currency: 'USD',
      }),
    },
    billingCustomer: {
      upsert: vi.fn().mockResolvedValue({ id: 'customer-1' }),
    },
    subscription: {
      upsert: vi.fn().mockResolvedValue({ id: 'subscription-1', plan: 'pro' }),
      findUnique: vi.fn(),
    },
    subscriptionInvoice: {
      create: vi.fn().mockResolvedValue({ id: 'invoice-1' }),
    },
    webhookEvent: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'webhook-1' }),
    },
    billingEvent: {
      create: vi.fn().mockResolvedValue({ id: 'billing-event-1' }),
    },
  };
  const tenants = { assertCompanyAccess: vi.fn().mockResolvedValue(undefined) };
  return { service: new BillingService(prisma as never, tenants as never), prisma, tenants };
}

describe('BillingService', () => {
  it('creates default SaaS plans', async () => {
    const { service, prisma } = createBillingService();

    await service.ensureDefaultPlans();

    expect(prisma.subscriptionPlan.upsert).toHaveBeenCalledTimes(3);
    expect(prisma.subscriptionPlan.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { code: 'STARTER' } }));
    expect(prisma.subscriptionPlan.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { code: 'PRO' } }));
  });

  it('updates subscription plan through the mock provider and creates an invoice', async () => {
    const { service, prisma } = createBillingService();

    await service.changePlan('user-1', 'company-1', 'PRO', BillingInterval.MONTHLY);

    expect(prisma.billingCustomer.upsert).toHaveBeenCalledOnce();
    expect(prisma.subscription.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 'company-1' } }));
    expect(prisma.subscriptionInvoice.create).toHaveBeenCalledOnce();
  });

  it('rejects duplicate webhook events', async () => {
    const { service, prisma } = createBillingService();
    prisma.webhookEvent.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(service.recordMockWebhook({ companyId: 'company-1', providerEventId: 'evt-1', type: 'invoice.paid' })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.billingEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'DUPLICATE' }) }));
  });
});

describe('SubscriptionGuardService', () => {
  it('blocks property creation beyond the plan limit', async () => {
    const prisma = {
      subscription: {
        findUnique: vi.fn().mockResolvedValue({
          plan: 'starter',
          status: 'active',
          lifecycleStatus: 'ACTIVE',
          subscriptionPlan: { maxProperties: 1 },
        }),
      },
      property: { count: vi.fn().mockResolvedValue(1) },
      room: { count: vi.fn() },
    };
    const service = new SubscriptionGuardService(prisma as never);

    await expect(service.assertCanCreateProperty('company-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks room creation beyond the plan limit', async () => {
    const prisma = {
      subscription: {
        findUnique: vi.fn().mockResolvedValue({
          plan: 'starter',
          status: 'active',
          lifecycleStatus: 'ACTIVE',
          subscriptionPlan: { maxRooms: 10 },
        }),
      },
      property: { count: vi.fn() },
      room: { count: vi.fn().mockResolvedValue(10) },
    };
    const service = new SubscriptionGuardService(prisma as never);

    await expect(service.assertCanCreateRoom('company-1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
