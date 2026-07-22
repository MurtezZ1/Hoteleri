import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const fallbackPropertyLimits: Record<string, number> = {
  starter: 1,
  pro: 5,
  enterprise: Number.MAX_SAFE_INTEGER,
};

const activeStatuses = new Set(['trialing', 'active']);
const activeLifecycleStatuses = new Set(['TRIALING', 'ACTIVE', 'GRACE_PERIOD']);

@Injectable()
export class SubscriptionGuardService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanCreateProperty(companyId: string): Promise<void> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { companyId },
      include: { subscriptionPlan: true },
    });
    if (!subscription || (!activeStatuses.has(subscription.status) && !activeLifecycleStatuses.has(subscription.lifecycleStatus))) {
      throw new ForbiddenException('An active subscription or trial is required.');
    }

    const limit = subscription.subscriptionPlan?.maxProperties ?? fallbackPropertyLimits[subscription.plan.toLowerCase()] ?? 1;
    const propertyCount = await this.prisma.property.count({ where: { companyId, deletedAt: null } });
    if (propertyCount >= limit) {
      throw new ForbiddenException(`The ${subscription.plan} plan allows a maximum of ${limit} properties.`);
    }
  }

  async assertCanCreateRoom(companyId: string): Promise<void> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { companyId },
      include: { subscriptionPlan: true },
    });
    if (!subscription || (!activeStatuses.has(subscription.status) && !activeLifecycleStatuses.has(subscription.lifecycleStatus))) {
      throw new ForbiddenException('An active subscription or trial is required.');
    }

    const fallbackLimit = subscription.plan.toLowerCase() === 'enterprise' ? Number.MAX_SAFE_INTEGER : subscription.plan.toLowerCase() === 'pro' ? 100 : 10;
    const limit = subscription.subscriptionPlan?.maxRooms ?? fallbackLimit;
    const roomCount = await this.prisma.room.count({ where: { companyId, deletedAt: null } });
    if (roomCount >= limit) {
      throw new ForbiddenException(`The ${subscription.plan} plan allows a maximum of ${limit} rooms.`);
    }
  }
}
