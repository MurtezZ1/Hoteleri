'use client';

import { useState } from 'react';

const views = ['Day', 'Week', 'Month'] as const;

export function CalendarViewToggle(): React.ReactElement {
  const [activeView, setActiveView] = useState<(typeof views)[number]>('Week');

  return (
    <div className="space-y-2">
      <div className="flex rounded-md border border-slate-200 bg-white p-1 shadow-sm">
        {views.map((view) => (
          <button
            key={view}
            className={`h-8 rounded-md px-3 text-sm font-semibold ${
              activeView === view ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
            onClick={() => setActiveView(view)}
            type="button"
          >
            {view}
          </button>
        ))}
      </div>
      <p className="text-right text-xs font-medium text-slate-500">{activeView} view selected</p>
    </div>
  );
}
