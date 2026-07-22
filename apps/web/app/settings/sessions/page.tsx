'use client';

import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiGet, ensureDemoSession } from '../../../lib/client-api';

interface SessionDevice {
  id: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

export default function SessionsPage(): React.ReactElement {
  const [sessions, setSessions] = useState<SessionDevice[]>([]);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    void loadSessions();
  }, []);

  async function loadSessions(): Promise<void> {
    const token = await ensureDemoSession();
    setSessions(await apiGet<SessionDevice[]>('/auth/sessions', token));
  }

  async function revoke(id: string): Promise<void> {
    const token = await ensureDemoSession();
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'}/auth/sessions/${id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      setMessage('Session revoked.');
      await loadSessions();
    } else {
      setMessage('Could not revoke session.');
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 lg:pl-80">
      <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Security</p>
        <h1 className="mt-2 text-2xl font-semibold text-navy">Sessions and devices</h1>
        {message ? <p className="mt-4 rounded-md bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">{message}</p> : null}
        <div className="mt-6 divide-y divide-slate-100">
          {sessions.map((session) => (
            <div className="flex flex-wrap items-center justify-between gap-3 py-4" key={session.id}>
              <div>
                <p className="text-sm font-semibold text-navy">{session.current ? 'Current session' : 'Signed-in device'}</p>
                <p className="mt-1 text-xs text-slate-500">{session.userAgent ?? 'Unknown device'} · {session.ipAddress ?? 'Unknown IP'}</p>
                <p className="mt-1 text-xs text-slate-500">Last used {new Date(session.lastUsedAt).toLocaleString()}</p>
              </div>
              <button className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => revoke(session.id)} type="button">
                <Trash2 className="h-4 w-4" />
                Revoke
              </button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
