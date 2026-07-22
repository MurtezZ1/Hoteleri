'use client';

import { FormEvent, useState } from 'react';
import { apiPost } from '../../lib/client-api';

export default function ResetPasswordPage(): React.ReactElement {
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(undefined);
    const form = new FormData(event.currentTarget);
    try {
      const response = await apiPost<{ message: string }, Record<string, string>>('/auth/reset-password', {
        token: String(form.get('token') ?? ''),
        password: String(form.get('password') ?? ''),
      });
      setMessage(response.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed.');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form className="w-full max-w-md rounded-md border border-slate-200 bg-white p-6 shadow-sm" onSubmit={submit}>
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">OdeoniFlow PMS</p>
        <h1 className="mt-2 text-2xl font-semibold text-navy">Reset password</h1>
        <label className="mt-6 block text-sm font-medium text-slate-700">
          Reset token
          <input className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" name="token" required />
        </label>
        <label className="mt-4 block text-sm font-medium text-slate-700">
          New password
          <input className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" minLength={12} name="password" required type="password" />
        </label>
        <button className="mt-5 h-10 w-full rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" type="submit">
          Reset password
        </button>
        {message ? <p className="mt-4 text-sm font-semibold text-emerald-700">{message}</p> : null}
        {error ? <p className="mt-4 text-sm font-semibold text-red-700">{error}</p> : null}
      </form>
    </main>
  );
}
