'use client';

import { CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../components/app-shell';
import {
  apiGet,
  apiPost,
  CompanySummary,
  disablePreviewMode,
  enablePreviewMode,
  getAccessToken,
  safeReturnTo,
  SubscriptionSummary,
} from '../../lib/client-api';

interface Plan {
  code: string;
  name: string;
  description?: string;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  maxProperties: number;
  maxRooms: number;
  maxStaffUsers: number;
  advancedReports: boolean;
  premiumAutomation: boolean;
  bookingEngine: boolean;
  channelManager: boolean;
}

const fallbackPlans: Plan[] = [
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
    description:
      'Growing hotel teams with automations and channel architecture.',
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
];

export default function SubscriptionPage(): React.ReactElement {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [companyId, setCompanyId] = useState<string>();
  const [currentSubscription, setCurrentSubscription] =
    useState<SubscriptionSummary>();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    void loadSubscription();
  }, []);

  async function loadSubscription(): Promise<void> {
    setLoading(true);
    try {
      const planRows = await apiGet<Plan[]>('/billing/plans');
      setPlans(planRows.length > 0 ? planRows : fallbackPlans);
    } catch {
      setPlans(fallbackPlans);
      setMessage('Backend is not reachable, showing local subscription plans.');
    }

    try {
      const token = getAccessToken();
      if (!token) {
        router.push('/login?returnTo=/subscription');
        return;
      }
      const companies = await apiGet<CompanySummary[]>(
        '/companies/mine',
        token,
      );
      const company = companies[0];
      setCompanyId(company?.id);
      if (company) {
        try {
          setCurrentSubscription(
            await apiGet<SubscriptionSummary>(
              `/billing/subscription/${company.id}`,
              token,
            ),
          );
        } catch {
          setCurrentSubscription(undefined);
        }
      }
    } catch {
      setCompanyId(undefined);
    } finally {
      setLoading(false);
    }
  }

  async function changePlan(planCode: string): Promise<void> {
    if (!companyId) {
      setMessage('Company context is not ready.');
      return;
    }
    try {
      const token = getAccessToken();
      if (!token) {
        router.push('/login?returnTo=/subscription');
        return;
      }
      await apiPost(
        '/billing/change-plan',
        { companyId, planCode, interval: 'MONTHLY' },
        token,
      );
      disablePreviewMode();
      setMessage(
        `${planCode} subscription activated with the mock billing provider.`,
      );
      router.push(
        safeReturnTo(
          new URLSearchParams(window.location.search).get('returnTo'),
          '/dashboard',
        ),
      );
    } catch {
      setMessage(
        'Could not update subscription because the API is not reachable.',
      );
    }
  }

  function skipPlanSelection(): void {
    enablePreviewMode();
    router.push(
      safeReturnTo(
        new URLSearchParams(window.location.search).get('returnTo'),
        '/dashboard',
      ),
    );
  }

  return (
    <AppShell>
      <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
          Subscription
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-navy">
          Plans and subscription
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {currentSubscription
            ? `Current plan: ${currentSubscription.subscriptionPlan?.name ?? currentSubscription.plan ?? 'Active plan'} (${currentSubscription.lifecycleStatus ?? currentSubscription.status}).`
            : 'Choose a plan to unlock create, update, and delete actions. You can also preview the interface first.'}
        </p>
        {message ? (
          <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            {message}
          </p>
        ) : null}
        {loading ? (
          <p className="mt-4 rounded-md bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
            Loading subscription plans...
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            className="h-10 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            onClick={skipPlanSelection}
            type="button"
          >
            Skip and preview
          </button>
          <button
            className="h-10 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            onClick={() => router.push('/dashboard')}
            type="button"
          >
            Back to dashboard
          </button>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <article
              className="rounded-md border border-slate-200 p-5"
              key={plan.code}
            >
              <h2 className="text-lg font-semibold text-navy">{plan.name}</h2>
              <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">
                {plan.description}
              </p>
              <p className="mt-4 text-2xl font-bold text-navy">
                {plan.monthlyPriceCents === 0
                  ? 'Custom'
                  : `$${plan.monthlyPriceCents / 100}`}
              </p>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                <li className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />{' '}
                  {plan.maxProperties >= 100000
                    ? 'Unlimited'
                    : plan.maxProperties}{' '}
                  properties
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />{' '}
                  {plan.maxRooms >= 100000 ? 'Unlimited' : plan.maxRooms} rooms
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />{' '}
                  {plan.maxStaffUsers >= 100000
                    ? 'Unlimited'
                    : plan.maxStaffUsers}{' '}
                  staff users
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />{' '}
                  {plan.channelManager
                    ? 'Channel manager architecture'
                    : 'No channel manager'}
                </li>
              </ul>
              <button
                className="mt-5 h-10 w-full rounded-md bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
                onClick={() => changePlan(plan.code)}
                type="button"
              >
                Select {plan.name}
              </button>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
