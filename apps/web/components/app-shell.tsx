'use client';

import {
  BarChart3,
  BedDouble,
  Bell,
  CalendarDays,
  CreditCard,
  FileText,
  Gauge,
  Home,
  Hotel,
  Inbox,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Sparkles,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

const navigation = [
  ['Dashboard', Gauge],
  ['Calendar', CalendarDays],
  ['Reservations', Hotel],
  ['Guests', Users],
  ['Rooms', BedDouble],
  ['Housekeeping', Wrench],
  ['Payments', CreditCard],
  ['Invoices', FileText],
  ['Automations', Sparkles],
  ['Messages', MessageSquare],
  ['Channels', Inbox],
  ['Booking Engine', Home],
  ['Reports', BarChart3],
  ['Staff', Users],
  ['Notifications', Bell],
  ['Settings', Settings],
] as const;

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState('');

  function navigationHref(label: string): string {
    return label === 'Dashboard' ? '/' : `/${label.toLowerCase().replaceAll(' ', '-')}`;
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (search.trim()) {
      router.push(`/reservations?search=${encodeURIComponent(search.trim())}`);
      setSearch('');
    }
  }

  const sidebar = (
    <>
      <Link href="/" className="flex items-center gap-3 rounded-md px-2 py-2" onClick={() => setMobileOpen(false)}>
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-lg font-bold text-white shadow-sm">
          S
        </span>
        <span>
          <span className="block text-base font-bold text-navy">OdeoniFlow PMS</span>
          <span className="block text-xs font-medium text-slate-500">Multi-property command center</span>
        </span>
      </Link>
      <div className="mt-5 rounded-md border border-blue-100 bg-blue-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Active property</p>
        <p className="mt-1 text-sm font-bold text-navy">Blue Harbor Suites</p>
        <p className="mt-1 text-xs text-slate-500">Gdansk, Poland</p>
      </div>
      <nav className="mt-5 space-y-1">
        {navigation.map(([label, Icon]) => {
          const href = navigationHref(label);
          const active = pathname === href;
          return (
            <Link
              key={label}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition ${
                active ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-navy'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-slate-200 bg-white px-4 py-5 lg:block">
        {sidebar}
      </aside>
      {mobileOpen ? (
        <div className="fixed inset-0 z-30 lg:hidden">
          <button className="absolute inset-0 bg-navy/30" onClick={() => setMobileOpen(false)} type="button" />
          <aside className="relative h-full w-80 max-w-[88vw] overflow-y-auto border-r border-slate-200 bg-white px-4 py-5 shadow-2xl">
            <button
              aria-label="Open navigation"
              className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600"
              onClick={() => setMobileOpen(false)}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
            {sidebar}
          </aside>
        </div>
      ) : null}
      <main className="min-w-0 lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                aria-label="Open navigation"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 lg:hidden"
                onClick={() => setMobileOpen(true)}
                type="button"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Property dashboard</p>
                <h1 className="text-2xl font-semibold tracking-normal text-navy">Blue Harbor Suites</h1>
              </div>
            </div>
            <div className="flex w-full min-w-0 flex-1 items-center justify-end gap-2 sm:w-auto sm:gap-3">
              <form
                className="hidden h-10 min-w-72 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 xl:flex"
                onSubmit={submitSearch}
              >
                <Search className="h-4 w-4" />
                <input
                  className="w-full border-0 bg-transparent p-0 text-sm shadow-none focus:shadow-none"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search guests, reservations, rooms"
                  value={search}
                />
              </form>
              <select
                className="hidden h-10 min-w-0 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm sm:block"
                onChange={(event) => {
                  if (event.target.value) {
                    router.push('/');
                  }
                }}
              >
                <option>Blue Harbor Suites</option>
                <option>Marina Villa Collection</option>
              </select>
              <button
                aria-label="Create reservation"
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 sm:px-4"
                onClick={() => router.push('/reservations')}
                type="button"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Reservation</span>
              </button>
              <button
                aria-label="Open notifications"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm"
                onClick={() => router.push('/notifications')}
                type="button"
              >
                <Bell className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>
        <div className="min-w-0 px-4 py-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
