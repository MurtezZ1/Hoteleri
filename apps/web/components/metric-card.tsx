import type { DashboardMetric } from '@odeoniflow/types';
import { ArrowUpRight } from 'lucide-react';

type MetricCardProps = Readonly<{
  metric: DashboardMetric;
  tone?: 'blue' | 'green' | 'amber' | 'slate';
}>;

const tones: Record<NonNullable<MetricCardProps['tone']>, string> = {
  blue: 'bg-blue-50 text-blue-700 ring-blue-100',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  slate: 'bg-slate-50 text-slate-700 ring-slate-100',
};

export function MetricCard({ metric, tone = 'blue' }: MetricCardProps): React.ReactElement {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,31,61,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{metric.label}</p>
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md ring-1 ${tones[tone]}`}>
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <strong className="text-3xl font-semibold tracking-normal text-navy">{metric.value}</strong>
        <span className="rounded-md bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
          {metric.trend}
        </span>
      </div>
    </section>
  );
}
