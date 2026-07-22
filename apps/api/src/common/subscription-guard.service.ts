import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const fallbackPropertyLimits: Record<string, number> = {
  starter: 1,
  pro: 5,
  enterprise: Number.MAX_SAFE_INTEGER,
};

const activeStatuses = new Set(['trialing', 'active']);
const activeLifecycleStatuses = new Set(['TRIALING', 'ACTIVE', 'GRACE_PERIOD']);
const featurePlanRank: Record<string, number> = {
  STARTER: 1,
  PRO: 2,
  ENTERPRISE: 3,
};

const featureMinimumPlan: Record<string, keyof typeof featurePlanRank> = {
  'pms.frontdesk': 'STARTER',
  'calendar.view': 'STARTER',
  'calendar.manage': 'STARTER',
  'reservations.payments': 'STARTER',
  'reservations.invoices': 'STARTER',
  'automations.manage': 'PRO',
  'booking-engine.manage': 'PRO',
  'channels.manage': 'PRO',
  'reports.advanced': 'PRO',
  'whatsapp.view': 'PRO',
  'whatsapp.connect': 'PRO',
  'whatsapp.send': 'PRO',
  'whatsapp.automations': 'PRO',
  'whatsapp.staff-notifications': 'PRO',
  'whatsapp.multiple-senders': 'ENTERPRISE',
};

@Injectable()
export class SubscriptionGuardService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanCreateProperty(companyId: string): Promise<void> {
    const subscription = await this.getActiveSubscription(companyId);

    const limit =
      subscription.subscriptionPlan?.maxProperties ??
      fallbackPropertyLimits[subscription.plan.toLowerCase()] ??
      1;
    const propertyCount = await this.prisma.property.count({
      where: { companyId, deletedAt: null },
    });
    if (propertyCount >= limit) {
      this.throwPlanLimitReached(
        `The ${subscription.plan} plan allows a maximum of ${limit} properties.`,
        {
          feature: 'properties.create',
          limit,
          plan: subscription.plan,
        },
      );
    }
  }

  async assertCanCreateRoom(companyId: string): Promise<void> {
    const subscription = await this.getActiveSubscription(companyId);

    const fallbackLimit =
      subscription.plan.toLowerCase() === 'enterprise'
        ? Number.MAX_SAFE_INTEGER
        : subscription.plan.toLowerCase() === 'pro'
          ? 100
          : 10;
    const limit = subscription.subscriptionPlan?.maxRooms ?? fallbackLimit;
    const roomCount = await this.prisma.room.count({
      where: { companyId, deletedAt: null },
    });
    if (roomCount >= limit) {
      this.throwPlanLimitReached(
        `The ${subscription.plan} plan allows a maximum of ${limit} rooms.`,
        {
          feature: 'rooms.create',
          limit,
          plan: subscription.plan,
        },
      );
    }
  }

  async assertCanMutate(companyId: string, feature: string): Promise<void> {
    const subscription = await this.getActiveSubscription(companyId);
    const currentPlan = (
      subscription.subscriptionPlan?.code ?? subscription.plan
    ).toUpperCase();
    const requiredPlan = featureMinimumPlan[feature];
    if (!requiredPlan) {
      return;
    }
    if (
      (featurePlanRank[currentPlan] ?? 0) <
      (featurePlanRank[requiredPlan] ?? Number.MAX_SAFE_INTEGER)
    ) {
      this.throwPlanLimitReached(
        `${feature} requires the ${requiredPlan} plan or higher.`,
        {
          feature,
          plan: currentPlan,
          requiredPlan,
        },
      );
    }
  }

  private async getActiveSubscription(companyId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { companyId },
      include: { subscriptionPlan: true },
    });
    if (
      !subscription ||
      (!activeStatuses.has(subscription.status) &&
        !activeLifecycleStatuses.has(subscription.lifecycleStatus))
    ) {
      throw new HttpException(
        {
          code: 'SUBSCRIPTION_REQUIRED',
          message:
            'An active subscription or trial is required to change business data.',
          companyId,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return subscription;
  }

  private throwPlanLimitReached(
    message: string,
    details: Record<string, unknown>,
  ): never {
    throw new HttpException(
      {
        code: 'PLAN_LIMIT_REACHED',
        message,
        ...details,
      },
      HttpStatus.FORBIDDEN,
    );
  }
}
