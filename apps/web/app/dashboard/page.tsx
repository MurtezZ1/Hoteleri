import { CalendarBoard } from '../../components/calendar-board';
import { AppShell } from '../../components/app-shell';
import { MetricCard } from '../../components/metric-card';
import { DashboardActions } from '../../components/dashboard-actions';
import { CalendarViewToggle } from '../../components/calendar-view-toggle';
import Link from 'next/link';

const metrics = [
  { label: "Today's check-ins", value: '7', trend: '+2' },
  { label: "Today's check-outs", value: '5', trend: 'On pace' },
  { label: 'Available rooms', value: '18', trend: '72%' },
  { label: 'Revenue', value: '$18.4k', trend: '+12%' },
  { label: 'Occupancy rate', value: '81%', trend: '+6%' },
  { label: 'Outstanding', value: '$2.1k', trend: '3 invoices' },
];

const sources = [
  ['Direct', '42%'],
  ['Booking.com', '31%'],
  ['Airbnb', '18%'],
  ['Phone', '9%'],
];

const activity = [
  ['09:20', 'Payment received from Elena Novak', '$469.80'],
  ['10:05', 'Room 202 moved to cleaning', 'Housekeeping'],
  ['11:40', 'New direct reservation created', 'Suite 201'],
  ['13:15', 'Invoice SF-1024 generated', 'Finance'],
];

export default function DashboardPage(): React.ReactElement {
  return (
    <AppShell>
      <section className="mb-6 rounded-md border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,31,61,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500">
              Wednesday, July 22, 2026
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-navy">
              Operations overview
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Track arrivals, room readiness, payments, and channel performance
              from one focused workspace.
            </p>
          </div>
          <DashboardActions />
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-6">
        {metrics.map((metric, index) => (
          <MetricCard
            key={metric.label}
            metric={metric}
            tone={
              index === 3
                ? 'green'
                : index === 5
                  ? 'amber'
                  : index === 2
                    ? 'slate'
                    : 'blue'
            }
          />
        ))}
      </div>

      <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-navy">
                Reservation calendar
              </h2>
              <p className="text-sm text-slate-500">
                Weekly room plan with payment and arrival status.
              </p>
            </div>
            <CalendarViewToggle />
          </div>
          <CalendarBoard />
        </div>

        <aside className="space-y-4">
          <section className="rounded-md border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,31,61,0.06)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-navy">
                  Subscription
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Manage plan limits, invoices, and upgrade options.
                </p>
              </div>
            </div>
            <Link
              className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700"
              href="/subscription"
            >
              Open subscription
            </Link>
          </section>

          <section className="rounded-md border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,31,61,0.06)]">
            <h2 className="text-lg font-semibold text-navy">Booking sources</h2>
            <p className="mt-1 text-sm text-slate-500">Last 30 days</p>
            <div className="mt-4 space-y-3">
              {sources.map(([label, value]) => (
                <div key={label}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium text-slate-600">{label}</span>
                    <span className="font-semibold text-navy">{value}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-blue-600"
                      style={{ width: value }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-md border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,31,61,0.06)]">
            <h2 className="text-lg font-semibold text-navy">
              Upcoming arrivals
            </h2>
            <div className="mt-4 space-y-3 text-sm">
              {[
                'Elena Novak - Room 101',
                'Jon Bell - Suite 201',
                'Amina Rossi - Room 102',
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 font-medium text-slate-700"
                >
                  {item}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-md border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,31,61,0.06)]">
            <h2 className="text-lg font-semibold text-navy">Recent activity</h2>
            <div className="mt-4 space-y-3">
              {activity.map(([time, label, meta]) => (
                <div
                  key={`${time}-${label}`}
                  className="grid grid-cols-[48px_1fr] gap-3 text-sm"
                >
                  <span className="text-xs font-semibold text-slate-400">
                    {time}
                  </span>
                  <span>
                    <span className="block font-medium text-slate-700">
                      {label}
                    </span>
                    <span className="block text-xs text-slate-500">{meta}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
