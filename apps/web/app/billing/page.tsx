'use client';

import { CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiGet, apiPost, CompanySummary, ensureDemoSession } from '../../lib/client-api';

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

export default function BillingPage(): React.ReactElement {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [companyId, setCompanyId] = useState<string>();
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    void loadBilling();
  }, []);

  async function loadBilling(): Promise<void> {
    const token = await ensureDemoSession();
    const [planRows, companies] = await Promise.all([apiGet<Plan[]>('/billing/plans', token), apiGet<CompanySummary[]>('/companies/mine', token)]);
    setPlans(planRows);
    setCompanyId(companies[0]?.id);
  }

  async function changePlan(planCode: string): Promise<void> {
    if (!companyId) {
      setMessage('Company context is not ready.');
      return;
    }
    const token = await ensureDemoSession();
    await apiPost('/billing/change-plan', { companyId, planCode, interval: 'MONTHLY' }, token);
    setMessage(`${planCode} plan activated with the mock billing provider.`);
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 lg:pl-80">
      <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Billing</p>
        <h1 className="mt-2 text-2xl font-semibold text-navy">Plans and subscription</h1>
        {message ? <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{message}</p> : null}
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <article className="rounded-md border border-slate-200 p-5" key={plan.code}>
              <h2 className="text-lg font-semibold text-navy">{plan.name}</h2>
              <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">{plan.description}</p>
              <p className="mt-4 text-2xl font-bold text-navy">{plan.monthlyPriceCents === 0 ? 'Custom' : `$${plan.monthlyPriceCents / 100}`}</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> {plan.maxProperties >= 100000 ? 'Unlimited' : plan.maxProperties} properties</li>
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> {plan.maxRooms >= 100000 ? 'Unlimited' : plan.maxRooms} rooms</li>
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> {plan.maxStaffUsers >= 100000 ? 'Unlimited' : plan.maxStaffUsers} staff users</li>
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> {plan.channelManager ? 'Channel manager architecture' : 'No channel manager'}</li>
              </ul>
              <button className="mt-5 h-10 w-full rounded-md bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700" onClick={() => changePlan(plan.code)} type="button">
                Select {plan.name}
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
