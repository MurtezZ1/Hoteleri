'use client';

import { Download, Edit3, Plus, Search, Trash2, X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  apiGet,
  apiPost,
  CompanySummary,
  getAccessToken,
  isPreviewMode,
} from '../lib/client-api';

type FieldType = 'text' | 'email' | 'number' | 'date' | 'select';

interface ModuleField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
}

interface CrudRecord {
  id: string;
  name: string;
  status: string;
  owner: string;
  amount: string;
  date: string;
  channel: string;
  notes: string;
}

interface ApiCrudRecord extends Omit<CrudRecord, 'date'> {
  date: string | null;
}

interface ModuleConfig {
  title: string;
  description: string;
  primaryAction: string;
  fields: ModuleField[];
  seed: CrudRecord[];
}

const commonStatuses = ['Active', 'Pending', 'Completed', 'Disabled'];

const settingsConfig: ModuleConfig = {
  title: 'Settings',
  description:
    'Configure company, property, taxes, roles, invoice numbering, languages, and integrations.',
  primaryAction: 'Add setting',
  fields: baseFields(commonStatuses),
  seed: [
    seed(
      'Default currency',
      'Active',
      'Company settings',
      'USD',
      '2026-07-22',
      'Finance',
    ),
    seed(
      'Invoice numbering',
      'Active',
      'Property settings',
      'SF-{YYYY}-{0000}',
      '2026-07-22',
      'Invoices',
    ),
  ],
};

const configs: Record<string, ModuleConfig> = {
  calendar: {
    title: 'Reservation Calendar',
    description:
      'Create, update, move, and remove calendar blocks for property operations.',
    primaryAction: 'Create calendar item',
    fields: baseFields(['Confirmed', 'Checked in', 'Checked out', 'Cancelled']),
    seed: [
      seed(
        'Elena Novak stay',
        'Confirmed',
        'Reception',
        '$469.80',
        '2026-07-22',
        'Direct',
      ),
      seed(
        'Suite 201 arrival',
        'Pending',
        'Front desk',
        '$820.00',
        '2026-07-24',
        'Website',
      ),
    ],
  },
  reservations: {
    title: 'Reservations',
    description:
      'Manage bookings, room assignments, payment state, source, and internal notes.',
    primaryAction: 'Create reservation',
    fields: baseFields([
      'Pending',
      'Confirmed',
      'Checked in',
      'Checked out',
      'Cancelled',
      'No-show',
    ]),
    seed: [
      seed(
        'SF-DEMO-001 - Elena Novak',
        'Confirmed',
        'Room 101',
        '$469.80',
        '2026-07-21',
        'Direct',
      ),
      seed(
        'SF-DEMO-002 - Jon Bell',
        'Pending',
        'Suite 201',
        '$720.00',
        '2026-07-24',
        'Booking.com',
      ),
    ],
  },
  guests: {
    title: 'Guests',
    description:
      'Maintain guest profiles, contact details, country, balances, and visit notes.',
    primaryAction: 'Add guest',
    fields: baseFields(['Returning', 'New', 'VIP', 'Outstanding balance']),
    seed: [
      seed(
        'Elena Novak',
        'Returning',
        'Guest profile',
        '$1,240.00',
        '2026-07-22',
        'Czech Republic',
      ),
      seed(
        'Amina Rossi',
        'VIP',
        'Guest profile',
        '$2,850.00',
        '2026-07-25',
        'Italy',
      ),
    ],
  },
  rooms: {
    title: 'Rooms',
    description:
      'Manage rooms, room types, readiness, maintenance, pricing, and capacity.',
    primaryAction: 'Add room',
    fields: baseFields([
      'Available',
      'Reserved',
      'Dirty',
      'Cleaning',
      'Maintenance',
    ]),
    seed: [
      seed(
        'Room 101',
        'Reserved',
        'Deluxe King',
        '$145.00',
        '2026-07-22',
        'Floor 1',
      ),
      seed(
        'Suite 201',
        'Available',
        'Family Suite',
        '$245.00',
        '2026-07-22',
        'Floor 2',
      ),
    ],
  },
  housekeeping: {
    title: 'Housekeeping',
    description:
      'Assign cleaning tasks, priorities, due dates, and maintenance follow-up.',
    primaryAction: 'Create task',
    fields: baseFields(['Todo', 'In progress', 'Done', 'Blocked']),
    seed: [
      seed(
        'Clean Room 202',
        'In progress',
        'Housekeeping',
        '-',
        '2026-07-22',
        'High priority',
      ),
    ],
  },
  payments: {
    title: 'Payments',
    description:
      'Track cash, card, bank transfer, online payments, deposits, and refunds.',
    primaryAction: 'Record payment',
    fields: baseFields([
      'Unpaid',
      'Partially paid',
      'Paid',
      'Refunded',
      'Overdue',
    ]),
    seed: [
      seed(
        'Payment for SF-DEMO-001',
        'Paid',
        'Finance',
        '$469.80',
        '2026-07-22',
        'Card',
      ),
    ],
  },
  invoices: {
    title: 'Invoices',
    description:
      'Create invoices, track balances, due dates, taxes, and printable receipts.',
    primaryAction: 'Create invoice',
    fields: baseFields(['Draft', 'Sent', 'Paid', 'Overdue', 'Refunded']),
    seed: [
      seed(
        'INV-2026-001',
        'Paid',
        'Finance',
        '$469.80',
        '2026-07-22',
        'Elena Novak',
      ),
    ],
  },
  automations: {
    title: 'Automations',
    description:
      'Configure guest messages by trigger, channel, delay, language, and status.',
    primaryAction: 'Create automation',
    fields: baseFields(['Enabled', 'Disabled', 'Failed', 'Scheduled']),
    seed: [
      seed(
        'Before arrival message',
        'Enabled',
        'Automation',
        '-',
        '2026-07-22',
        'Email',
      ),
    ],
  },
  messages: {
    title: 'Messages',
    description:
      'Review outbound guest communication, delivery state, provider, and templates.',
    primaryAction: 'Compose message',
    fields: baseFields(['Queued', 'Sent', 'Delivered', 'Failed']),
    seed: [
      seed(
        'Welcome Elena Novak',
        'Delivered',
        'Mock provider',
        '-',
        '2026-07-22',
        'Email',
      ),
    ],
  },
  channels: {
    title: 'Channels',
    description:
      'Manage channel connections, sync health, retry logs, and imported reservations.',
    primaryAction: 'Connect channel',
    fields: baseFields(['Connected', 'Disconnected', 'Syncing', 'Error']),
    seed: [
      seed(
        'Booking.com mock',
        'Connected',
        'Channel manager',
        '-',
        '2026-07-22',
        'Booking.com',
      ),
    ],
  },
  'booking-engine': {
    title: 'Booking Engine',
    description:
      'Control direct booking pages, branding, shareable URLs, and payment mode.',
    primaryAction: 'Create booking page',
    fields: baseFields(['Published', 'Draft', 'Disabled', 'Review']),
    seed: [
      seed(
        'Blue Harbor direct page',
        'Published',
        'Marketing',
        '-',
        '2026-07-22',
        '/book/blue-harbor-suites',
      ),
    ],
  },
  reports: {
    title: 'Reports',
    description:
      'Build financial, occupancy, reservation, tax, source, and staff activity reports.',
    primaryAction: 'Create report',
    fields: baseFields(['Ready', 'Scheduled', 'Processing', 'Archived']),
    seed: [
      seed(
        'Monthly financial report',
        'Ready',
        'Finance',
        '$18.4k',
        '2026-07-22',
        'CSV',
      ),
    ],
  },
  staff: {
    title: 'Staff',
    description:
      'Invite users, assign roles, property access, permissions, and activity status.',
    primaryAction: 'Invite staff',
    fields: baseFields(['Active', 'Invited', 'Disabled', 'Pending']),
    seed: [
      seed(
        'Mira Stone',
        'Active',
        'Owner',
        '-',
        '2026-07-22',
        'All properties',
      ),
    ],
  },
  notifications: {
    title: 'Notifications',
    description:
      'Manage booking, payment, housekeeping, maintenance, and automation alerts.',
    primaryAction: 'Create notification',
    fields: baseFields(['Unread', 'Read', 'Archived', 'Important']),
    seed: [
      seed(
        'Upcoming check-in',
        'Unread',
        'Reception',
        '-',
        '2026-07-22',
        'Elena Novak',
      ),
    ],
  },
  settings: settingsConfig,
};

export function ModuleCrudWorkspace({
  moduleKey,
}: Readonly<{ moduleKey: string }>): React.ReactElement {
  const config = configs[moduleKey] ?? settingsConfig;
  const storageKey = `odeoniflow.module.${moduleKey}`;
  const legacyStorageKey = `stayflow.module.${moduleKey}`;
  const [records, setRecords] = useState<CrudRecord[]>(config.seed);
  const [companyId, setCompanyId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [editing, setEditing] = useState<CrudRecord | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [toast, setToast] = useState<string | undefined>();
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadRecords(): Promise<void> {
      setLoading(true);
      setPreviewMode(isPreviewMode());
      try {
        const token = getAccessToken();
        if (!token) {
          throw new Error('Authentication required.');
        }
        const companies = await apiGet<CompanySummary[]>(
          '/companies/mine',
          token,
        );
        const company = companies[0];
        if (!company) {
          throw new Error('No company found.');
        }
        setCompanyId(company.id);
        let apiRecords = await apiGet<ApiCrudRecord[]>(
          `/module-records/${moduleKey}?companyId=${company.id}`,
          token,
        );
        if (apiRecords.length === 0) {
          await Promise.all(
            config.seed.map((record) =>
              apiPost<ApiCrudRecord, Record<string, unknown>>(
                `/module-records/${moduleKey}`,
                toApiBody(record, company.id),
                token,
              ),
            ),
          );
          apiRecords = await apiGet<ApiCrudRecord[]>(
            `/module-records/${moduleKey}?companyId=${company.id}`,
            token,
          );
        }
        if (active) {
          setRecords(apiRecords.map(fromApiRecord));
        }
      } catch {
        const stored =
          window.localStorage.getItem(storageKey) ??
          window.localStorage.getItem(legacyStorageKey);
        if (active && stored) {
          setRecords(JSON.parse(stored) as CrudRecord[]);
        }
        if (active) {
          setToast('Backend unavailable. Showing local fallback data.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadRecords();
    return () => {
      active = false;
    };
  }, [config.seed, legacyStorageKey, moduleKey, storageKey]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(records));
  }, [records, storageKey]);

  const filtered = useMemo(() => {
    return records.filter((record) => {
      const matchesQuery = Object.values(record)
        .join(' ')
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesStatus = status === 'All' || record.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [query, records, status]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextRecord: CrudRecord = {
      id: editing?.id ?? crypto.randomUUID(),
      name: String(form.get('name') ?? ''),
      status: String(
        form.get('status') ??
          config.fields.find((field) => field.key === 'status')?.options?.[0] ??
          'Active',
      ),
      owner: String(form.get('owner') ?? ''),
      amount: String(form.get('amount') ?? ''),
      date: String(form.get('date') ?? ''),
      channel: String(form.get('channel') ?? ''),
      notes: String(form.get('notes') ?? ''),
    };

    if (!companyId) {
      setToast('Company context is not ready yet.');
      return;
    }
    if (previewMode) {
      setToast(
        'Preview mode is active. Choose a subscription before creating or editing records.',
      );
      return;
    }

    try {
      const token = getAccessToken();
      if (!token) {
        throw new Error('Authentication required.');
      }
      const saved = editing
        ? await apiPatch<ApiCrudRecord, Record<string, unknown>>(
            `/module-records/${moduleKey}/${editing.id}`,
            toApiBody(nextRecord, companyId),
            token,
          )
        : await apiPost<ApiCrudRecord, Record<string, unknown>>(
            `/module-records/${moduleKey}`,
            toApiBody(nextRecord, companyId),
            token,
          );

      const savedRecord = fromApiRecord(saved);
      setRecords((current) =>
        editing
          ? current.map((record) =>
              record.id === editing.id ? savedRecord : record,
            )
          : [savedRecord, ...current],
      );
      setToast(
        editing ? 'Record updated in database.' : 'Record created in database.',
      );
      setEditing(undefined);
      setFormOpen(false);
    } catch {
      setToast('Could not save record. Please check the API connection.');
    }
  }

  async function remove(recordId: string): Promise<void> {
    if (previewMode) {
      setToast(
        'Preview mode is active. Choose a subscription before deleting records.',
      );
      return;
    }
    try {
      const token = getAccessToken();
      if (!token) {
        throw new Error('Authentication required.');
      }
      await apiDelete(`/module-records/${moduleKey}/${recordId}`, token);
      setRecords((current) =>
        current.filter((record) => record.id !== recordId),
      );
      setToast('Record deleted from database.');
    } catch {
      setToast('Could not delete record. Please check the API connection.');
    }
  }

  function exportCsv(): void {
    const rows = [
      ['Name', 'Status', 'Owner', 'Amount', 'Date', 'Channel', 'Notes'],
      ...filtered.map((record) => [
        record.name,
        record.status,
        record.owner,
        record.amount,
        record.date,
        record.channel,
        record.notes,
      ]),
    ];
    const csv = rows
      .map((row) =>
        row.map((value) => `"${value.replaceAll('"', '""')}"`).join(','),
      )
      .join('\n');
    const url = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `odeoniflow-${moduleKey}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setToast('CSV exported.');
  }

  return (
    <div className="space-y-5">
      <section className="rounded-md border border-slate-200 bg-white p-6 shadow-[0_10px_28px_rgba(15,31,61,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
              OdeoniFlow PMS
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-normal text-navy">
              {config.title}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              {config.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              onClick={exportCsv}
              type="button"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
              onClick={() => {
                if (previewMode) {
                  setToast(
                    'Preview mode is active. Choose a subscription before creating records.',
                  );
                  return;
                }
                setEditing(undefined);
                setFormOpen(true);
              }}
              type="button"
            >
              <Plus className="h-4 w-4" />
              {config.primaryAction}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,31,61,0.06)]">
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <label className="flex h-10 min-w-64 flex-1 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">
            <Search className="h-4 w-4" />
            <input
              className="w-full border-0 bg-transparent p-0 text-sm shadow-none focus:shadow-none"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${config.title.toLowerCase()}`}
              value={query}
            />
          </label>
          <select
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm"
            onChange={(event) => setStatus(event.target.value)}
            value={status}
          >
            <option>All</option>
            {config.fields
              .find((field) => field.key === 'status')
              ?.options?.map((option) => (
                <option key={option}>{option}</option>
              ))}
          </select>
        </div>

        {toast ? (
          <p className="border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
            {toast}
          </p>
        ) : null}
        {loading ? (
          <p className="border-b border-blue-100 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
            Loading records from database...
          </p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((record) => (
                <tr key={record.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-navy">
                    {record.name}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                      {record.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{record.owner}</td>
                  <td className="px-4 py-3 text-slate-600">{record.amount}</td>
                  <td className="px-4 py-3 text-slate-600">{record.date}</td>
                  <td className="px-4 py-3 text-slate-600">{record.channel}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        aria-label={`Edit ${record.name}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        onClick={() => {
                          if (previewMode) {
                            setToast(
                              'Preview mode is active. Choose a subscription before editing records.',
                            );
                            return;
                          }
                          setEditing(record);
                          setFormOpen(true);
                        }}
                        type="button"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        aria-label={`Delete ${record.name}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-100 bg-white text-red-600 hover:bg-red-50"
                        onClick={() => void remove(record.id)}
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-10 text-center text-slate-500"
                    colSpan={7}
                  >
                    No records match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {formOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-navy/30 px-4">
          <form
            className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-md border border-slate-200 bg-white p-6 shadow-2xl"
            onSubmit={submit}
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                  {config.title}
                </p>
                <h3 className="text-xl font-semibold text-navy">
                  {editing ? 'Edit record' : config.primaryAction}
                </h3>
              </div>
              <button
                aria-label="Close form"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600"
                onClick={() => setFormOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {config.fields.map((field) => (
                <FieldInput
                  key={field.key}
                  defaultValue={editing?.[field.key as keyof CrudRecord] ?? ''}
                  field={field}
                />
              ))}
            </div>
            <div className="sticky bottom-0 -mx-6 mt-6 flex justify-end gap-2 border-t border-slate-100 bg-white px-6 pb-1 pt-4">
              <button
                aria-label="Cancel form"
                className="h-10 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700"
                onClick={() => setFormOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                aria-label={editing ? 'Save record changes' : 'Create record'}
                className="h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                type="submit"
              >
                {editing ? 'Save changes' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function FieldInput({
  field,
  defaultValue,
}: Readonly<{ field: ModuleField; defaultValue: string }>): React.ReactElement {
  if (field.type === 'select') {
    return (
      <label className="space-y-1 text-sm font-medium text-slate-700">
        <span>{field.label}</span>
        <select
          className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
          defaultValue={defaultValue}
          name={field.key}
        >
          {field.options?.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="space-y-1 text-sm font-medium text-slate-700">
      <span>{field.label}</span>
      <input
        className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm"
        defaultValue={defaultValue}
        name={field.key}
        required={field.key === 'name'}
        type={field.type}
      />
    </label>
  );
}

function baseFields(statuses: string[]): ModuleField[] {
  return [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'status', label: 'Status', type: 'select', options: statuses },
    { key: 'owner', label: 'Owner / Role', type: 'text' },
    { key: 'amount', label: 'Amount / Value', type: 'text' },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'channel', label: 'Channel / Source', type: 'text' },
    { key: 'notes', label: 'Notes', type: 'text' },
  ];
}

function seed(
  name: string,
  status: string,
  owner: string,
  amount: string,
  date: string,
  channel: string,
): CrudRecord {
  return {
    id: crypto.randomUUID(),
    name,
    status,
    owner,
    amount,
    date,
    channel,
    notes: '',
  };
}

async function apiPatch<TResponse, TBody extends Record<string, unknown>>(
  path: string,
  body: TBody,
  token: string,
): Promise<TResponse> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'}${path}`,
    {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<TResponse>;
}

async function apiDelete(path: string, token: string): Promise<void> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'}${path}`,
    {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
    },
  );
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

function toApiBody(
  record: CrudRecord,
  companyId: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    companyId,
    name: record.name,
    status: record.status,
    owner: record.owner,
    amount: record.amount,
    channel: record.channel,
    notes: record.notes,
  };
  if (record.date) {
    body.date = record.date;
  }
  return body;
}

function fromApiRecord(record: ApiCrudRecord): CrudRecord {
  return {
    ...record,
    date: record.date ? record.date.slice(0, 10) : '',
    notes: record.notes ?? '',
  };
}
