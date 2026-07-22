'use client';

import { Send, Smartphone, Users } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import {
  apiGet,
  apiPost,
  CompanySummary,
  getAccessToken,
} from '../lib/client-api';

interface WhatsAppSettingsResponse {
  connections: Array<{
    id: string;
    provider: string;
    senderPhoneNumber: string;
    status: string;
    verifiedAt?: string;
    encryptedAccessToken?: string | null;
  }>;
  recipients: Array<{
    id: string;
    name: string;
    phoneNumber: string;
    notificationTypes: string[];
    isActive: boolean;
  }>;
  templates: Array<{
    id: string;
    name: string;
    language: string;
    eventType: string;
    status: string;
    bodyPreview: string;
    isActive: boolean;
  }>;
  queue: { waiting: number; delayed: number; failed: number; active: number };
}

export function WhatsAppSettings(): React.ReactElement {
  const [companyId, setCompanyId] = useState<string>();
  const [settings, setSettings] = useState<WhatsAppSettingsResponse>();
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    void load();
  }, []);

  async function load(): Promise<void> {
    const token = getAccessToken();
    if (!token) {
      setMessage('Please sign in again.');
      return;
    }
    const companies = await apiGet<CompanySummary[]>('/companies/mine', token);
    const company = companies[0];
    setCompanyId(company?.id);
    if (company) {
      setSettings(
        await apiGet<WhatsAppSettingsResponse>(
          `/whatsapp/settings/${company.id}`,
          token,
        ),
      );
    }
  }

  async function connect(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!companyId) return;
    const token = getAccessToken();
    const form = new FormData(event.currentTarget);
    await apiPost(
      '/whatsapp/connections',
      {
        companyId,
        provider: String(form.get('provider') ?? 'MOCK'),
        senderPhoneNumber: String(form.get('senderPhoneNumber') ?? ''),
        accessToken: String(form.get('accessToken') ?? ''),
      },
      token,
    );
    setMessage('WhatsApp connection saved.');
    await load();
  }

  async function addRecipient(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!companyId) return;
    const token = getAccessToken();
    const form = new FormData(event.currentTarget);
    await apiPost(
      '/whatsapp/recipients',
      {
        companyId,
        name: String(form.get('name') ?? ''),
        phoneNumber: String(form.get('phoneNumber') ?? ''),
        notificationTypes: [
          'new-reservation',
          'new-guest-message',
          'failed-automation',
        ],
        isActive: true,
      },
      token,
    );
    setMessage('Recipient saved.');
    await load();
  }

  async function sendTest(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!companyId) return;
    const token = getAccessToken();
    const form = new FormData(event.currentTarget);
    await apiPost(
      '/whatsapp/test-message',
      {
        companyId,
        to: String(form.get('to') ?? ''),
        body: String(form.get('body') ?? ''),
      },
      token,
    );
    setMessage('Test message queued.');
    await load();
  }

  return (
    <div className="space-y-5">
      <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
          WhatsApp integration
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-navy">
          Provider, templates, webhooks, and staff alerts
        </h2>
        {message ? (
          <p className="mt-4 rounded-md bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
            {message}
          </p>
        ) : null}
        {settings ? (
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <Metric label="Waiting" value={settings.queue.waiting} />
            <Metric label="Delayed" value={settings.queue.delayed} />
            <Metric label="Active" value={settings.queue.active} />
            <Metric label="Failed" value={settings.queue.failed} />
          </div>
        ) : null}
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        <form
          className="rounded-md border border-slate-200 bg-white p-5 shadow-sm"
          onSubmit={connect}
        >
          <Smartphone className="h-5 w-5 text-blue-600" />
          <h3 className="mt-3 text-lg font-semibold text-navy">Connection</h3>
          <select
            className="mt-4 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
            name="provider"
            defaultValue="MOCK"
          >
            <option value="MOCK">Mock</option>
            <option value="TWILIO">Twilio</option>
            <option value="META">Meta Cloud API</option>
          </select>
          <input
            className="mt-3 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
            name="senderPhoneNumber"
            placeholder="+15551234567"
            required
          />
          <input
            className="mt-3 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
            name="accessToken"
            placeholder="Access token (stored encrypted)"
            type="password"
          />
          <button
            className="mt-4 h-10 w-full rounded-md bg-blue-600 text-sm font-semibold text-white"
            type="submit"
          >
            Save connection
          </button>
        </form>

        <form
          className="rounded-md border border-slate-200 bg-white p-5 shadow-sm"
          onSubmit={addRecipient}
        >
          <Users className="h-5 w-5 text-blue-600" />
          <h3 className="mt-3 text-lg font-semibold text-navy">
            Staff recipients
          </h3>
          <input
            className="mt-4 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
            name="name"
            placeholder="Reception"
            required
          />
          <input
            className="mt-3 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
            name="phoneNumber"
            placeholder="+15551234567"
            required
          />
          <button
            className="mt-4 h-10 w-full rounded-md bg-blue-600 text-sm font-semibold text-white"
            type="submit"
          >
            Save recipient
          </button>
        </form>

        <form
          className="rounded-md border border-slate-200 bg-white p-5 shadow-sm"
          onSubmit={sendTest}
        >
          <Send className="h-5 w-5 text-blue-600" />
          <h3 className="mt-3 text-lg font-semibold text-navy">Test message</h3>
          <input
            className="mt-4 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
            name="to"
            placeholder="+15551234567"
            required
          />
          <input
            className="mt-3 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
            name="body"
            placeholder="Test from OdeoniFlow"
            required
          />
          <button
            className="mt-4 h-10 w-full rounded-md bg-blue-600 text-sm font-semibold text-white"
            type="submit"
          >
            Send test
          </button>
        </form>
      </div>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-navy">Templates</h3>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {settings?.templates.map((template) => (
            <div
              className="rounded-md border border-slate-100 bg-slate-50 p-3 text-sm"
              key={template.id}
            >
              <p className="font-semibold text-navy">
                {template.name} · {template.language}
              </p>
              <p className="mt-1 text-slate-500">
                {template.eventType} · {template.status}
              </p>
              <p className="mt-2 text-slate-600">{template.bodyPreview}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
}: Readonly<{ label: string; value: number }>): React.ReactElement {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-navy">{value}</p>
    </div>
  );
}
