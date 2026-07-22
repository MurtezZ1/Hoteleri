'use client';

import { Download, Filter, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const reportRows = [
  ['Metric', 'Value'],
  ["Today's check-ins", '7'],
  ["Today's check-outs", '5'],
  ['Available rooms', '18'],
  ['Revenue', '$18.4k'],
  ['Occupancy rate', '81%'],
];

export function DashboardActions(): React.ReactElement {
  const router = useRouter();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [message, setMessage] = useState<string | undefined>();

  function exportCsv(): void {
    const csv = reportRows.map((row) => row.map((value) => `"${value}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'odeoniflow-dashboard-summary.csv';
    link.click();
    URL.revokeObjectURL(url);
    setMessage('CSV exported.');
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          onClick={() => setFiltersOpen((current) => !current)}
          type="button"
        >
          <Filter className="h-4 w-4" />
          Filters
        </button>
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
          onClick={() => router.push('/reservations')}
          type="button"
        >
          <Plus className="h-4 w-4" />
          New booking
        </button>
      </div>
      {filtersOpen ? (
        <div className="grid gap-3 rounded-md border border-blue-100 bg-blue-50 p-3 sm:grid-cols-3">
          <select className="h-10 rounded-md border border-blue-100 bg-white px-3 text-sm text-slate-700">
            <option>This week</option>
            <option>This month</option>
            <option>Custom period</option>
          </select>
          <select className="h-10 rounded-md border border-blue-100 bg-white px-3 text-sm text-slate-700">
            <option>All sources</option>
            <option>Direct</option>
            <option>Booking.com</option>
            <option>Airbnb</option>
          </select>
          <select className="h-10 rounded-md border border-blue-100 bg-white px-3 text-sm text-slate-700">
            <option>All payment statuses</option>
            <option>Paid</option>
            <option>Partially paid</option>
            <option>Unpaid</option>
          </select>
        </div>
      ) : null}
      {message ? <p className="text-sm font-semibold text-emerald-700">{message}</p> : null}
    </div>
  );
}
