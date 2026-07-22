import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const propertyLimits: Record<string, number> = {
  starter: 1,
  pro: 5,
  enterprise: Number.MAX_SAFE_INTEGER,
};

const activeStatuses = new Set(['trialing', 'active']);

@Injectable()
export class SubscriptionGuardService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanCreateProperty(companyId: string): Promise<void> {
    const subscription = await this.prisma.subscription.findUnique({ where: { companyId } });
    if (!subscription || !activeStatuses.has(subscription.status)) {
      throw new ForbiddenException('An active subscription or trial is required.');
    }

    const limit = propertyLimits[subscription.plan.toLowerCase()] ?? 1;
    const propertyCount = await this.prisma.property.count({ where: { companyId, deletedAt: null } });
    if (propertyCount >= limit) {
      throw new ForbiddenException(`The ${subscription.plan} plan allows a maximum of ${limit} properties.`);
    }
  }
}
