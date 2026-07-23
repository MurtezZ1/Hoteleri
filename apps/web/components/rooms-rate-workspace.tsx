'use client';

import {
  BedDouble,
  CalendarDays,
  DollarSign,
  Plus,
  RefreshCw,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  apiGet,
  apiPatch,
  apiPost,
  CompanySummary,
  getAccessToken,
} from '../lib/client-api';

interface PropertySummary {
  id: string;
  name: string;
  companyId: string;
}

interface RoomType {
  id: string;
  name: string;
  capacity: number;
  adultsLimit: number;
  childrenLimit: number;
  basePrice: string;
  saleStatus: string;
  isActive: boolean;
  _count?: { rooms: number; ratePlans: number };
}

interface Room {
  id: string;
  name: string;
  floor?: string | null;
  status: string;
  cleaningStatus: string;
  maintenanceStatus: string;
  saleStatus: string;
  isActive: boolean;
  roomType: { id: string; name: string };
}

interface RatePlan {
  id: string;
  name: string;
  code: string;
  currency: string;
  basePrice: string;
  roomType: { id: string; name: string };
  dailyRates?: Array<{ date: string; price: string; closed: boolean }>;
  restrictions?: Array<{ date: string; type: string; value: number }>;
}

interface AvailabilityResponse {
  roomTypes: Array<{
    roomTypeId: string;
    name: string;
    days: Array<{
      date: string;
      physicalRooms: number;
      reserved: number;
      blocked: number;
      available: number;
      stopSell: boolean;
      minStay: number | null;
      maxStay: number | null;
      closedToArrival: boolean;
      closedToDeparture: boolean;
    }>;
  }>;
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export function RoomsRateWorkspace(): React.ReactElement {
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);
  const [availability, setAvailability] = useState<AvailabilityResponse>();
  const [startDate, setStartDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [state, setState] = useState<LoadState>('idle');
  const [message, setMessage] = useState<string>();
  const [roomTypeName, setRoomTypeName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [ratePlanName, setRatePlanName] = useState('');
  const [ratePrice, setRatePrice] = useState('120');
  const selectedProperty = properties.find(
    (property) => property.id === propertyId,
  );
  const selectedRoomType = roomTypes[0];
  const selectedRatePlan = ratePlans[0];
  const days = useMemo(
    () => Array.from({ length: 14 }, (_, index) => addDays(startDate, index)),
    [startDate],
  );

  useEffect(() => {
    void loadProperties();
  }, []);

  useEffect(() => {
    if (propertyId) void loadWorkspace();
  }, [propertyId, startDate]);

  async function loadProperties(): Promise<void> {
    const token = getAccessToken();
    if (!token) {
      setState('error');
      setMessage('Please sign in again.');
      return;
    }
    try {
      const companies = await apiGet<
        Array<
          CompanySummary & { properties?: Array<{ id: string; name: string }> }
        >
      >('/companies/mine', token);
      const propertyRows = companies.flatMap((company) =>
        (company.properties ?? []).map((property) => ({
          ...property,
          companyId: company.id,
        })),
      );
      setProperties(propertyRows);
      setPropertyId(propertyRows[0]?.id ?? '');
    } catch {
      setState('error');
      setMessage('Could not load properties.');
    }
  }

  async function loadWorkspace(): Promise<void> {
    const token = getAccessToken();
    if (!token || !propertyId) return;
    setState('loading');
    setMessage(undefined);
    try {
      const toDate = addDays(startDate, 14);
      const [typeRows, roomRows, rateRows, availabilityRows] =
        await Promise.all([
          apiGet<RoomType[]>(`/rooms/types/${propertyId}`, token),
          apiGet<Room[]>(`/rooms/property/${propertyId}`, token),
          apiGet<RatePlan[]>(
            `/rooms/rates/calendar/${propertyId}?from=${startDate}&to=${toDate}`,
            token,
          ),
          apiGet<AvailabilityResponse>(
            `/rooms/availability/search?propertyId=${propertyId}&from=${startDate}&to=${toDate}`,
            token,
          ),
        ]);
      setRoomTypes(typeRows);
      setRooms(roomRows);
      setRatePlans(rateRows);
      setAvailability(availabilityRows);
      setState('ready');
    } catch (error) {
      setState('error');
      setMessage(formatError(error));
    }
  }

  async function createRoomType(): Promise<void> {
    const token = getAccessToken();
    if (!token || !propertyId || !roomTypeName.trim()) return;
    await apiPost<unknown, Record<string, unknown>>(
      '/rooms/types',
      {
        propertyId,
        name: roomTypeName.trim(),
        capacity: 2,
        adultsLimit: 2,
        childrenLimit: 0,
        basePrice: Number(ratePrice),
        amenityNames: ['Wi-Fi'],
      },
      token,
    );
    setRoomTypeName('');
    setMessage('Room type created.');
    await loadWorkspace();
  }

  async function createRoom(): Promise<void> {
    const token = getAccessToken();
    if (!token || !propertyId || !selectedRoomType || !roomName.trim()) return;
    await apiPost<unknown, Record<string, unknown>>(
      '/rooms',
      {
        propertyId,
        roomTypeId: selectedRoomType.id,
        name: roomName.trim(),
        status: 'AVAILABLE',
      },
      token,
    );
    setRoomName('');
    setMessage('Room created.');
    await loadWorkspace();
  }

  async function createRatePlan(): Promise<void> {
    const token = getAccessToken();
    if (!token || !propertyId || !selectedRoomType || !ratePlanName.trim())
      return;
    await apiPost<unknown, Record<string, unknown>>(
      '/rooms/rate-plans',
      {
        propertyId,
        roomTypeId: selectedRoomType.id,
        name: ratePlanName.trim(),
        code: ratePlanName.trim().toUpperCase().replaceAll(' ', '_'),
        basePrice: Number(ratePrice),
      },
      token,
    );
    setRatePlanName('');
    setMessage('Rate plan created.');
    await loadWorkspace();
  }

  async function bulkUpdateRate(): Promise<void> {
    const token = getAccessToken();
    if (!token || !propertyId || !selectedRatePlan) return;
    await apiPatch<unknown, Record<string, unknown>>(
      '/rooms/rates/bulk',
      {
        propertyId,
        ratePlanId: selectedRatePlan.id,
        rates: days.map((date) => ({
          date,
          price: Number(ratePrice),
          closed: false,
        })),
      },
      token,
    );
    setMessage('Bulk rate update saved.');
    await loadWorkspace();
  }

  return (
    <div className="space-y-5">
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
              Rooms, Rates and Availability
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-navy">
              Rate Calendar
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Manage physical rooms, room types, rate plans, daily prices and
              future availability from real backend inventory rules.
            </p>
          </div>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700"
            onClick={() => void loadWorkspace()}
            type="button"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <select
            className="h-10 rounded-md border border-slate-200 px-3 text-sm"
            onChange={(event) => setPropertyId(event.target.value)}
            value={propertyId}
          >
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
          <input
            className="h-10 rounded-md border border-slate-200 px-3 text-sm"
            onChange={(event) => setStartDate(event.target.value)}
            type="date"
            value={startDate}
          />
          <input
            className="h-10 rounded-md border border-slate-200 px-3 text-sm"
            onChange={(event) => setRatePrice(event.target.value)}
            type="number"
            value={ratePrice}
          />
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white"
            disabled={!selectedRatePlan}
            onClick={() => void bulkUpdateRate()}
            type="button"
          >
            <DollarSign className="h-4 w-4" />
            Apply rate to 14 days
          </button>
        </div>
      </section>

      {message ? (
        <div
          className={`rounded-md border p-3 text-sm font-semibold ${
            state === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
          role={state === 'error' ? 'alert' : 'status'}
        >
          {message}
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-3">
        <QuickCreate
          icon={<BedDouble className="h-4 w-4" />}
          label="Create room type"
          onChange={setRoomTypeName}
          onSubmit={() => void createRoomType()}
          placeholder="Deluxe King"
          value={roomTypeName}
        />
        <QuickCreate
          icon={<Plus className="h-4 w-4" />}
          label="Create room"
          onChange={setRoomName}
          onSubmit={() => void createRoom()}
          placeholder="305"
          value={roomName}
        />
        <QuickCreate
          icon={<CalendarDays className="h-4 w-4" />}
          label="Create rate plan"
          onChange={setRatePlanName}
          onSubmit={() => void createRatePlan()}
          placeholder="Standard"
          value={ratePlanName}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Metric label="Room types" value={roomTypes.length} />
        <Metric label="Physical rooms" value={rooms.length} />
        <Metric label="Rate plans" value={ratePlans.length} />
      </section>

      <section className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Room type</th>
              {days.map((day) => (
                <th className="px-3 py-3" key={day}>
                  {formatDay(day)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {availability?.roomTypes.map((roomType) => (
              <tr key={roomType.roomTypeId}>
                <td className="px-4 py-3 font-semibold text-navy">
                  {roomType.name}
                </td>
                {roomType.days.map((day) => (
                  <td className="px-3 py-3" key={day.date}>
                    <span
                      className={`block rounded-md px-2 py-1 text-center text-xs font-semibold ${
                        day.stopSell || day.available === 0
                          ? 'bg-red-50 text-red-700'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {day.stopSell ? 'Stop sell' : `${day.available} avail`}
                    </span>
                    <span className="mt-1 block text-center text-[11px] text-slate-500">
                      {day.reserved} res / {day.blocked} block
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Room</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Ops</th>
              <th className="px-4 py-3">Cleaning</th>
              <th className="px-4 py-3">Sale</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rooms.map((room) => (
              <tr key={room.id}>
                <td className="px-4 py-3 font-semibold text-navy">
                  {room.name}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {room.roomType.name}
                </td>
                <td className="px-4 py-3 text-slate-600">{room.status}</td>
                <td className="px-4 py-3 text-slate-600">
                  {room.cleaningStatus}
                </td>
                <td className="px-4 py-3 text-slate-600">{room.saleStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-slate-500">
        Active property: {selectedProperty?.name ?? 'None'}.
      </p>
    </div>
  );
}

function QuickCreate({
  label,
  value,
  placeholder,
  onChange,
  onSubmit,
  icon,
}: Readonly<{
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  icon: React.ReactNode;
}>): React.ReactElement {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-2 text-sm font-semibold text-navy">
        {icon}
        {label}
      </p>
      <div className="mt-3 flex gap-2">
        <input
          className="h-10 min-w-0 flex-1 rounded-md border border-slate-200 px-3 text-sm"
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
        <button
          className="h-10 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white"
          onClick={onSubmit}
          type="button"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
}: Readonly<{ label: string; value: number }>): React.ReactElement {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-navy">{value}</p>
    </div>
  );
}

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function formatDay(date: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function formatError(error: unknown): string {
  if (!(error instanceof Error)) return 'Request failed.';
  try {
    const parsed = JSON.parse(error.message) as { message?: string };
    return parsed.message ?? error.message;
  } catch {
    return error.message;
  }
}
