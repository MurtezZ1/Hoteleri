'use client';

import { Send } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import {
  apiGet,
  apiPost,
  CompanySummary,
  getAccessToken,
} from '../lib/client-api';

interface WhatsAppMessage {
  id: string;
  recipientPhone: string;
  senderPhone?: string;
  body: string;
  direction: 'INBOUND' | 'OUTBOUND';
  status: string;
  createdAt: string;
  guest?: { fullName: string } | null;
  reservation?: { reservationCode: string } | null;
}

export function WhatsAppInbox(): React.ReactElement {
  const [companyId, setCompanyId] = useState<string>();
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string>();
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    void load();
  }, []);

  async function load(nextQuery = query): Promise<void> {
    const token = getAccessToken();
    if (!token) return;
    const companies = await apiGet<CompanySummary[]>('/companies/mine', token);
    const company = companies[0];
    setCompanyId(company?.id);
    if (company) {
      const rows = await apiGet<WhatsAppMessage[]>(
        `/whatsapp/inbox/${company.id}${nextQuery ? `?q=${encodeURIComponent(nextQuery)}` : ''}`,
        token,
      );
      setMessages(rows);
      setSelectedPhone((current) => current ?? rows[0]?.recipientPhone);
    }
  }

  async function reply(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!companyId || !selectedPhone) return;
    const token = getAccessToken();
    const form = new FormData(event.currentTarget);
    await apiPost(
      '/whatsapp/reply',
      { companyId, to: selectedPhone, body: String(form.get('body') ?? '') },
      token,
    );
    setNotice('Reply queued.');
    event.currentTarget.reset();
    await load();
  }

  const conversations = [
    ...new Map(
      messages.map((message) => [message.recipientPhone, message]),
    ).values(),
  ];
  const history = messages.filter(
    (message) => message.recipientPhone === selectedPhone,
  );

  return (
    <div className="grid min-h-[calc(100vh-150px)] gap-5 xl:grid-cols-[340px_1fr]">
      <section className="rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
            WhatsApp inbox
          </p>
          <h2 className="mt-1 text-xl font-semibold text-navy">
            Conversations
          </h2>
          <input
            className="mt-4 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
            onChange={(event) => {
              setQuery(event.target.value);
              void load(event.target.value);
            }}
            placeholder="Search messages"
            value={query}
          />
        </div>
        <div className="divide-y divide-slate-100">
          {conversations.map((conversation) => (
            <button
              className={`block w-full px-4 py-3 text-left text-sm hover:bg-slate-50 ${selectedPhone === conversation.recipientPhone ? 'bg-blue-50' : ''}`}
              key={conversation.recipientPhone}
              onClick={() => setSelectedPhone(conversation.recipientPhone)}
              type="button"
            >
              <span className="block font-semibold text-navy">
                {conversation.guest?.fullName ?? conversation.recipientPhone}
              </span>
              <span className="mt-1 block truncate text-slate-500">
                {conversation.body}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="flex min-h-0 flex-col rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <h2 className="text-xl font-semibold text-navy">
            {selectedPhone ?? 'No conversation selected'}
          </h2>
          {notice ? (
            <p className="mt-2 text-sm font-semibold text-blue-700">{notice}</p>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {history.map((message) => (
            <div
              className={`max-w-2xl rounded-md p-3 text-sm ${message.direction === 'OUTBOUND' ? 'ml-auto bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}
              key={message.id}
            >
              <p>{message.body}</p>
              <p
                className={`mt-2 text-xs ${message.direction === 'OUTBOUND' ? 'text-blue-100' : 'text-slate-500'}`}
              >
                {message.status} ·{' '}
                {new Date(message.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
        <form
          className="flex gap-2 border-t border-slate-100 p-4"
          onSubmit={reply}
        >
          <input
            className="h-11 min-w-0 flex-1 rounded-md border border-slate-200 px-3 text-sm"
            name="body"
            placeholder="Reply inside the active WhatsApp session"
            required
          />
          <button
            className="inline-flex h-11 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white"
            type="submit"
          >
            <Send className="h-4 w-4" />
            Send
          </button>
        </form>
      </section>
    </div>
  );
}
