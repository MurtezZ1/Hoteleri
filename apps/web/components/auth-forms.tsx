'use client';

import { Button } from '@odeoniflow/ui';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { apiGet, apiPost, AuthPayload, CompanySummary, getAccessToken, saveSession } from '../lib/client-api';

type Status = { kind: 'idle' | 'loading' | 'success' | 'error'; message?: string };

export function LoginForm(): React.ReactElement {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus({ kind: 'loading', message: 'Signing in...' });
    try {
      const payload = await apiPost<AuthPayload, Record<string, string>>('/auth/login', {
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
      });
      saveSession(payload);
      setStatus({ kind: 'success', message: 'Signed in. Opening dashboard...' });
      router.push('/');
    } catch {
      setStatus({ kind: 'error', message: 'Email or password is not correct.' });
    }
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={submit}>
      <input className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm" name="email" placeholder="Email" type="email" required />
      <input className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm" name="password" placeholder="Password" type="password" required />
      <Button className="w-full" disabled={status.kind === 'loading'} type="submit">
        {status.kind === 'loading' ? 'Signing in...' : 'Sign in'}
      </Button>
      <FormStatus status={status} />
    </form>
  );
}

export function RegisterForm(): React.ReactElement {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus({ kind: 'loading', message: 'Creating workspace...' });
    try {
      const payload = await apiPost<AuthPayload, Record<string, string>>('/auth/register', {
        fullName: String(form.get('fullName') ?? ''),
        companyName: String(form.get('companyName') ?? ''),
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
      });
      saveSession(payload);
      setStatus({ kind: 'success', message: 'Workspace created. Continue onboarding.' });
      router.push('/onboarding');
    } catch {
      setStatus({ kind: 'error', message: 'Could not create the workspace. Try another email.' });
    }
  }

  return (
    <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
      <input className="h-11 rounded-md border border-slate-200 px-3 text-sm" name="fullName" placeholder="Full name" required />
      <input className="h-11 rounded-md border border-slate-200 px-3 text-sm" name="companyName" placeholder="Company name" required />
      <input className="h-11 rounded-md border border-slate-200 px-3 text-sm sm:col-span-2" name="email" placeholder="Email" type="email" required />
      <input className="h-11 rounded-md border border-slate-200 px-3 text-sm sm:col-span-2" minLength={8} name="password" placeholder="Password" type="password" required />
      <Button className="sm:col-span-2" disabled={status.kind === 'loading'} type="submit">
        {status.kind === 'loading' ? 'Creating...' : 'Start onboarding'}
      </Button>
      <div className="sm:col-span-2">
        <FormStatus status={status} />
      </div>
    </form>
  );
}

export function ForgotPasswordForm(): React.ReactElement {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus({ kind: 'loading', message: 'Sending reset link...' });
    try {
      const response = await apiPost<{ message: string }, Record<string, string>>('/auth/forgot-password', {
        email: String(form.get('email') ?? ''),
      });
      setStatus({ kind: 'success', message: response.message });
    } catch {
      setStatus({ kind: 'error', message: 'Could not send reset instructions.' });
    }
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={submit}>
      <input className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm" name="email" placeholder="Email" type="email" required />
      <Button className="w-full" disabled={status.kind === 'loading'} type="submit">
        {status.kind === 'loading' ? 'Sending...' : 'Send reset link'}
      </Button>
      <FormStatus status={status} />
    </form>
  );
}

export function OnboardingForm(): React.ReactElement {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const token = getAccessToken();
    if (!token) {
      setStatus({ kind: 'error', message: 'Please sign in before creating a property.' });
      router.push('/login');
      return;
    }

    const form = new FormData(event.currentTarget);
    setStatus({ kind: 'loading', message: 'Creating property...' });
    try {
      const companies = await apiGet<CompanySummary[]>('/companies/mine', token);
      const company = companies[0];
      if (!company) {
        throw new Error('No company found.');
      }
      await apiPost<Record<string, unknown>, Record<string, string>>(
        '/properties',
        {
          companyId: company.id,
          name: String(form.get('name') ?? ''),
          propertyType: String(form.get('propertyType') ?? 'HOTEL'),
          address: String(form.get('address') ?? ''),
          city: String(form.get('city') ?? ''),
          country: String(form.get('country') ?? ''),
          currency: String(form.get('currency') ?? 'USD'),
          timezone: String(form.get('timezone') ?? 'Europe/Warsaw'),
          email: String(form.get('email') ?? ''),
        },
        token,
      );
      setStatus({ kind: 'success', message: 'Property created. Opening dashboard...' });
      router.push('/');
    } catch {
      setStatus({ kind: 'error', message: 'Could not create property. Check the fields and try again.' });
    }
  }

  return (
    <form className="mt-8 grid gap-4 md:grid-cols-2" onSubmit={submit}>
      <input className="h-11 rounded-md border border-slate-200 px-3 text-sm" name="name" placeholder="Property name" required />
      <select className="h-11 rounded-md border border-slate-200 px-3 text-sm" name="propertyType">
        <option value="HOTEL">Hotel</option>
        <option value="APARTMENT">Apartment</option>
        <option value="VILLA">Villa</option>
        <option value="GUESTHOUSE">Guesthouse</option>
        <option value="AIRBNB">Airbnb</option>
      </select>
      <input className="h-11 rounded-md border border-slate-200 px-3 text-sm" name="address" placeholder="Address" required />
      <input className="h-11 rounded-md border border-slate-200 px-3 text-sm" name="city" placeholder="City" required />
      <input className="h-11 rounded-md border border-slate-200 px-3 text-sm" name="country" placeholder="Country" required />
      <input className="h-11 rounded-md border border-slate-200 px-3 text-sm" name="email" placeholder="Property email" type="email" />
      <input className="h-11 rounded-md border border-slate-200 px-3 text-sm" name="currency" placeholder="Currency" defaultValue="USD" />
      <input className="h-11 rounded-md border border-slate-200 px-3 text-sm" name="timezone" placeholder="Timezone" defaultValue="Europe/Warsaw" />
      <Button className="md:col-span-2" disabled={status.kind === 'loading'} type="submit">
        {status.kind === 'loading' ? 'Creating property...' : 'Create property'}
      </Button>
      <div className="md:col-span-2">
        <FormStatus status={status} />
      </div>
    </form>
  );
}

function FormStatus({ status }: Readonly<{ status: Status }>): React.ReactElement | null {
  if (status.kind === 'idle' || !status.message) {
    return null;
  }
  const className =
    status.kind === 'error'
      ? 'border-red-100 bg-red-50 text-red-700'
      : status.kind === 'success'
        ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
        : 'border-blue-100 bg-blue-50 text-blue-700';
  return <p className={`rounded-md border px-3 py-2 text-sm font-medium ${className}`}>{status.message}</p>;
}
