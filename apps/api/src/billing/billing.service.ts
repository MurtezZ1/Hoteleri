import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { BillingEventStatus, BillingInterval, SubscriptionLifecycleStatus } from '@prisma/client';
import { TenantAccessService } from '../common/tenant-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingProvider, MockBillingProvider } from './billing-provider';

const planCatalog = [
  {
    code: 'STARTER',
    name: 'Starter',
    description: 'Small property operations with basic reports.',
    monthlyPriceCents: 4900,
    yearlyPriceCents: 49000,
    maxProperties: 1,
    maxRooms: 10,
    maxStaffUsers: 3,
    advancedReports: false,
    premiumAutomation: false,
    bookingEngine: false,
    channelManager: false,
  },
  {
    code: 'PRO',
    name: 'Pro',
    description: 'Growing hotel teams with automations and channel architecture.',
    monthlyPriceCents: 14900,
    yearlyPriceCents: 149000,
    maxProperties: 5,
    maxRooms: 100,
    maxStaffUsers: 20,
    advancedReports: true,
    premiumAutomation: true,
    bookingEngine: true,
    channelManager: true,
  },
  {
    code: 'ENTERPRISE',
    name: 'Enterprise',
    description: 'Custom limits and pricing for multi-brand operators.',
    monthlyPriceCents: 0,
    yearlyPriceCents: 0,
    maxProperties: 2147483647,
    maxRooms: 2147483647,
    maxStaffUsers: 2147483647,
    advancedReports: true,
    premiumAutomation: true,
    bookingEngine: true,
    channelManager: true,
  },
] as const;

@Injectable()
export class BillingService {
  private readonly provider: BillingProvider = new MockBillingProvider();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantAccessService,
  ) {}

  async ensureDefaultPlans() {
    return Promise.all(
      planCatalog.map((plan) =>
        this.prisma.subscriptionPlan.upsert({
          where: { code: plan.code },
          update: plan,
          create: plan,
        }),
      ),
    );
  }

  async plans() {
    await this.ensureDefaultPlans();
    return this.prisma.subscriptionPlan.findMany({ where: { active: true }, orderBy: { monthlyPriceCents: 'asc' } });
  }

  async subscription(userId: string, companyId: string) {
    await this.tenants.assertCompanyAccess(userId, companyId);
    await this.ensureDefaultPlans();
    return this.prisma.subscription.findUnique({
      where: { companyId },
      include: { subscriptionPlan: true, invoices: { orderBy: { createdAt: 'desc' }, take: 12 } },
    });
  }

  async changePlan(userId: string, companyId: string, planCode: string, interval: BillingInterval) {
    await this.tenants.assertCompanyAccess(userId, companyId);
    await this.ensureDefaultPlans();
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { code: planCode.toUpperCase() } });
    if (!plan) {
      throw new BadRequestException('Unknown subscription plan.');
    }

    const providerResult = await this.provider.createOrUpdateSubscription({ companyId, planCode: plan.code, interval });
    const billingCustomer = await this.prisma.billingCustomer.upsert({
      where: { companyId },
      update: { provider: providerResult.provider, providerCustomerId: providerResult.providerCustomerId },
      create: { companyId, provider: providerResult.provider, providerCustomerId: providerResult.providerCustomerId },
    });
    const now = new Date();
    const currentPeriodEnd = interval === BillingInterval.YEARLY ? addYears(now, 1) : addMonths(now, 1);
    const subscription = await this.prisma.subscription.upsert({
      where: { companyId },
      update: {
        plan: plan.code.toLowerCase(),
        status: 'active',
        seats: plan.maxStaffUsers,
        planId: plan.id,
        billingCustomerId: billingCustomer.id,
        interval,
        lifecycleStatus: SubscriptionLifecycleStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        suspendedAt: null,
      },
      create: {
        companyId,
        plan: plan.code.toLowerCase(),
        status: 'active',
        seats: plan.maxStaffUsers,
        planId: plan.id,
        billingCustomerId: billingCustomer.id,
        interval,
        lifecycleStatus: SubscriptionLifecycleStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd,
      },
      include: { subscriptionPlan: true },
    });
    await this.createInvoice(companyId, subscription.id, plan, interval);
    return subscription;
  }

  async cancel(userId: string, companyId: string, atPeriodEnd: boolean) {
    await this.tenants.assertCompanyAccess(userId, companyId);
    const subscription = await this.prisma.subscription.findUnique({ where: { companyId } });
    if (!subscription) {
      throw new BadRequestException('Subscription not found.');
    }
    await this.provider.cancelSubscription({ atPeriodEnd });
    return this.prisma.subscription.update({
      where: { companyId },
      data: atPeriodEnd
        ? { cancelAtPeriodEnd: true }
        : { lifecycleStatus: SubscriptionLifecycleStatus.CANCELED, status: 'canceled', canceledAt: new Date() },
    });
  }

  async recordMockWebhook(input: { providerEventId: string; companyId: string; type: string; signature?: string }) {
    const signatureOk = this.provider.verifyWebhookSignature({
      payload: input,
      ...(input.signature ? { signature: input.signature } : {}),
    });
    if (!signatureOk) {
      throw new BadRequestException('Invalid webhook signature.');
    }
    const existing = await this.prisma.webhookEvent.findUnique({
      where: { provider_providerEventId: { provider: 'mock', providerEventId: input.providerEventId } },
    });
    if (existing) {
      await this.prisma.billingEvent.create({
        data: {
          companyId: input.companyId,
          provider: 'mock',
          providerEventId: `${input.providerEventId}:duplicate:${Date.now()}`,
          type: input.type,
          status: BillingEventStatus.DUPLICATE,
          payload: input,
        },
      });
      throw new ConflictException('Duplicate webhook event.');
    }

    await this.prisma.webhookEvent.create({
      data: {
        companyId: input.companyId,
        provider: 'mock',
        providerEventId: input.providerEventId,
        status: BillingEventStatus.PROCESSED,
        payload: input,
        processedAt: new Date(),
      },
    });
    return this.prisma.billingEvent.create({
      data: {
        companyId: input.companyId,
        provider: 'mock',
        providerEventId: input.providerEventId,
        type: input.type,
        status: BillingEventStatus.PROCESSED,
        payload: input,
        processedAt: new Date(),
      },
    });
  }

  private async createInvoice(companyId: string, subscriptionId: string, plan: { code: string; monthlyPriceCents: number; yearlyPriceCents: number; currency: string }, interval: BillingInterval) {
    const totalCents = interval === BillingInterval.YEARLY ? plan.yearlyPriceCents : plan.monthlyPriceCents;
    return this.prisma.subscriptionInvoice.create({
      data: {
        companyId,
        subscriptionId,
        invoiceNumber: `SUB-${Date.now().toString(36).toUpperCase()}`,
        status: totalCents === 0 ? 'custom_pricing' : 'paid',
        currency: plan.currency,
        subtotalCents: totalCents,
        totalCents,
        paidAt: totalCents === 0 ? null : new Date(),
      },
    });
  }
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function addYears(date: Date, years: number): Date {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
}
