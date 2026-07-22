import { BillingInterval } from '@prisma/client';

export interface CheckoutResult {
  provider: string;
  providerSubscriptionId: string;
  providerCustomerId: string;
}

export interface BillingProvider {
  createOrUpdateSubscription(input: {
    companyId: string;
    planCode: string;
    interval: BillingInterval;
  }): Promise<CheckoutResult>;
  cancelSubscription(input: {
    providerSubscriptionId?: string;
    atPeriodEnd: boolean;
  }): Promise<void>;
  verifyWebhookSignature(input: {
    payload: unknown;
    signature?: string;
  }): boolean;
}

export class MockBillingProvider implements BillingProvider {
  async createOrUpdateSubscription(input: {
    companyId: string;
    planCode: string;
    interval: BillingInterval;
  }): Promise<CheckoutResult> {
    return {
      provider: 'mock',
      providerCustomerId: `mock_customer_${input.companyId}`,
      providerSubscriptionId: `mock_subscription_${input.companyId}_${input.planCode.toLowerCase()}_${input.interval.toLowerCase()}`,
    };
  }

  async cancelSubscription(): Promise<void> {
    return Promise.resolve();
  }

  verifyWebhookSignature(): boolean {
    return true;
  }
}

export class StripeBillingProvider implements BillingProvider {
  async createOrUpdateSubscription(): Promise<CheckoutResult> {
    throw new Error(
      'Stripe billing provider requires live Stripe credentials and is not enabled for local tests.',
    );
  }

  async cancelSubscription(): Promise<void> {
    throw new Error(
      'Stripe billing provider requires live Stripe credentials and is not enabled for local tests.',
    );
  }

  verifyWebhookSignature(): boolean {
    return false;
  }
}
