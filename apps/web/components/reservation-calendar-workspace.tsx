'use client';

import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Move,
  Search,
  Wrench,
} from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import {
  apiDelete,
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

interface CalendarRoom {
  id: string;
  name: string;
  operationalStatus: string;
  occupancyStatus: string;
  housekeepingStatus: string;
  maintenanceStatus: string;
}

interface CalendarRoomType {
  id: string;
  name: string;
  rooms: CalendarRoom[];
}

interface CalendarReservation {
  id: string;
  confirmationNumber: string;
  guestName: string;
  roomId: string;
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  updatedAt: string;
  status: string;
  source: string;
  balance: string;
  isLocked: boolean;
}

interface CalendarBlock {
  id: string;
  roomId: string;
  roomTypeId: string;
  type: string;
  startDate: string;
  endDate: string;
  updatedAt: string;
  reason: string;
}

interface TimelineResponse {
  property: { id: string; name: string; timezone: string; currency: string };
  range: { start: string; end: string; maxDays: number };
  roomTypes: CalendarRoomType[];
  reservations: CalendarReservation[];
  blocks: CalendarBlock[];
}

type ModalMode =
  'details' | 'create' | 'edit' | 'block' | 'block-details' | 'block-edit';

export function ReservationCalendarWorkspace(): ReactElement {
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [view, setView] = useState<'day' | 'week' | 'multi'>('week');
  const [startDate, setStartDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [roomTypeId, setRoomTypeId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [search, setSearch] = useState('');
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [includeNoShow, setIncludeNoShow] = useState(false);
  const [timeline, setTimeline] = useState<TimelineResponse>();
  const [modalMode, setModalMode] = useState<ModalMode>();
  const [selectedReservation, setSelectedReservation] =
    useState<CalendarReservation>();
  const [selectedBlock, setSelectedBlock] = useState<CalendarBlock>();
  const [selectedSlot, setSelectedSlot] = useState<{
    roomId: string;
    date: string;
  }>();
  const [guestName, setGuestName] = useState('');
  const [adults, setAdults] = useState('2');
  const [children, setChildren] = useState('0');
  const [subtotal, setSubtotal] = useState('100');
  const [tax, setTax] = useState('0');
  const [editRoomId, setEditRoomId] = useState('');
  const [editCheckIn, setEditCheckIn] = useState('');
  const [editCheckOut, setEditCheckOut] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();

  const visibleDays = view === 'day' ? 1 : view === 'week' ? 7 : 14;
  const days = useMemo(
    () =>
      Array.from({ length: visibleDays }, (_, index) =>
        addDays(startDate, index),
      ),
    [startDate, visibleDays],
  );
  const rooms = useMemo(
    () =>
      timeline?.roomTypes.flatMap((roomType) =>
        roomType.rooms.map((room) => ({
          ...room,
          roomTypeName: roomType.name,
          roomTypeId: roomType.id,
        })),
      ) ?? [],
    [timeline],
  );

  useEffect(() => {
    void loadProperties();
  }, []);

  useEffect(() => {
    if (propertyId) {
      void loadTimeline();
    }
  }, [
    propertyId,
    startDate,
    view,
    roomTypeId,
    roomId,
    status,
    source,
    includeCancelled,
    includeNoShow,
  ]);

  async function loadProperties(): Promise<void> {
    const token = getAccessToken();
    if (!token) {
      setError('Please sign in again.');
      setLoading(false);
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
      setError('Could not load properties.');
      setLoading(false);
    }
  }

  async function loadTimeline(nextSearch = search): Promise<void> {
    const token = getAccessToken();
    if (!token || !propertyId) return;
    setLoading(true);
    setError(undefined);
    const params = new URLSearchParams({
      propertyId,
      startDate,
      endDate: addDays(startDate, visibleDays),
    });
    if (roomTypeId) params.set('roomTypeId', roomTypeId);
    if (roomId) params.set('roomId', roomId);
    if (status) params.set('status', status);
    if (source) params.set('source', source);
    if (nextSearch.trim()) params.set('search', nextSearch.trim());
    if (includeCancelled) params.set('includeCancelled', 'true');
    if (includeNoShow) params.set('includeNoShow', 'true');
    try {
      setTimeline(
        await apiGet<TimelineResponse>(
          `/calendar/timeline?${params.toString()}`,
          token,
        ),
      );
    } catch (requestError) {
      setError(formatApiError(requestError));
    } finally {
      setLoading(false);
    }
  }

  function openCreate(room: CalendarRoom, date: string): void {
    setSelectedSlot({ roomId: room.id, date });
    setGuestName('');
    setEditRoomId(room.id);
    setEditCheckIn(date);
    setEditCheckOut(addDays(date, 1));
    setModalMode('create');
  }

  function openDetails(reservation: CalendarReservation): void {
    setSelectedReservation(reservation);
    setEditRoomId(reservation.roomId);
    setEditCheckIn(reservation.checkIn.slice(0, 10));
    setEditCheckOut(reservation.checkOut.slice(0, 10));
    setReason('Calendar edit');
    setModalMode('details');
  }

  function openEdit(
    reservation: CalendarReservation,
    roomId = reservation.roomId,
    checkIn = reservation.checkIn.slice(0, 10),
    checkOut = reservation.checkOut.slice(0, 10),
  ): void {
    setSelectedReservation(reservation);
    setEditRoomId(roomId);
    setEditCheckIn(checkIn);
    setEditCheckOut(checkOut);
    setReason('Calendar move');
    setModalMode('edit');
  }

  async function createReservation(): Promise<void> {
    const token = getAccessToken();
    const property = properties.find((item) => item.id === propertyId);
    if (!token || !property || !guestName.trim()) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const guest = await apiPost<{ id: string }, Record<string, unknown>>(
        '/guests',
        { companyId: property.companyId, fullName: guestName.trim() },
        token,
      );
      await apiPost<unknown, Record<string, unknown>>(
        '/reservations',
        {
          companyId: property.companyId,
          propertyId,
          guestId: guest.id,
          roomIds: [editRoomId],
          checkInDate: new Date(`${editCheckIn}T15:00:00.000Z`).toISOString(),
          checkOutDate: new Date(`${editCheckOut}T11:00:00.000Z`).toISOString(),
          adults: Number(adults),
          children: Number(children),
          bookingSource: source || 'DIRECT',
          subtotal: Number(subtotal),
          tax: Number(tax),
          status: 'CONFIRMED',
        },
        token,
        {
          'idempotency-key': `calendar-${propertyId}-${editRoomId}-${editCheckIn}-${editCheckOut}-${Date.now()}`,
        },
      );
      setSuccess('Reservation created from calendar slot.');
      setModalMode(undefined);
      await loadTimeline();
    } catch (requestError) {
      setError(formatApiError(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function moveReservation(): Promise<void> {
    const token = getAccessToken();
    if (!token || !selectedReservation) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await apiPatch<unknown, Record<string, unknown>>(
        `/reservations/${selectedReservation.id}/calendar-move`,
        {
          roomId: editRoomId,
          checkIn: new Date(`${editCheckIn}T15:00:00.000Z`).toISOString(),
          checkOut: new Date(`${editCheckOut}T11:00:00.000Z`).toISOString(),
          expectedUpdatedAt: selectedReservation.updatedAt,
          reason,
        },
        token,
      );
      setSuccess('Reservation calendar position updated.');
      setModalMode(undefined);
      await loadTimeline();
    } catch (requestError) {
      setError(formatApiError(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function createBlock(): Promise<void> {
    const token = getAccessToken();
    if (!token || !selectedSlot) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await apiPost<unknown, Record<string, unknown>>(
        '/calendar/blocks',
        {
          propertyId,
          roomId: editRoomId,
          startDate: new Date(`${editCheckIn}T00:00:00.000Z`).toISOString(),
          endDate: new Date(`${editCheckOut}T00:00:00.000Z`).toISOString(),
          type: 'BLOCKED',
          reason: reason || 'Calendar block',
        },
        token,
      );
      setSuccess('Calendar block created.');
      setModalMode(undefined);
      await loadTimeline();
    } catch (requestError) {
      setError(formatApiError(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  function openBlock(block: CalendarBlock): void {
    setSelectedBlock(block);
    setEditRoomId(block.roomId);
    setEditCheckIn(block.startDate.slice(0, 10));
    setEditCheckOut(block.endDate.slice(0, 10));
    setReason(block.reason);
    setModalMode('block-details');
  }

  async function updateBlock(): Promise<void> {
    const token = getAccessToken();
    if (!token || !selectedBlock) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await apiPatch<unknown, Record<string, unknown>>(
        `/calendar/blocks/${selectedBlock.id}`,
        {
          roomId: editRoomId,
          startDate: new Date(`${editCheckIn}T00:00:00.000Z`).toISOString(),
          endDate: new Date(`${editCheckOut}T00:00:00.000Z`).toISOString(),
          type: selectedBlock.type,
          reason,
          expectedUpdatedAt: selectedBlock.updatedAt,
        },
        token,
      );
      setSuccess('Calendar block updated.');
      setModalMode(undefined);
      await loadTimeline();
    } catch (requestError) {
      setError(formatApiError(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteBlock(): Promise<void> {
    const token = getAccessToken();
    if (!token || !selectedBlock) return;
    if (!window.confirm('Delete this calendar block?')) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await apiDelete<unknown>(`/calendar/blocks/${selectedBlock.id}`, token);
      setSuccess('Calendar block deleted.');
      setModalMode(undefined);
      await loadTimeline();
    } catch (requestError) {
      setError(formatApiError(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !timeline) {
    return (
      <div className="rounded-md border border-blue-100 bg-blue-50 p-4 text-sm font-semibold text-blue-700">
        Loading reservation calendar...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
              Live Calendar
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-navy">
              {timeline?.property.name ?? 'Reservation timeline'}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Room-by-date reservation plan with safe move, resize, block, and
              create workflows.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700"
              onClick={() => setStartDate(addDays(startDate, -visibleDays))}
              type="button"
            >
              <ChevronLeft className="inline h-4 w-4" /> Previous
            </button>
            <button
              className="h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700"
              onClick={() =>
                setStartDate(new Date().toISOString().slice(0, 10))
              }
              type="button"
            >
              Today
            </button>
            <button
              className="h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700"
              onClick={() => setStartDate(addDays(startDate, visibleDays))}
              type="button"
            >
              Next <ChevronRight className="inline h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-4 xl:grid-cols-8">
          <select
            aria-label="Property"
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
            aria-label="Calendar start date"
            className="h-10 rounded-md border border-slate-200 px-3 text-sm"
            onChange={(event) => setStartDate(event.target.value)}
            type="date"
            value={startDate}
          />
          <select
            aria-label="Calendar view"
            className="h-10 rounded-md border border-slate-200 px-3 text-sm"
            onChange={(event) =>
              setView(event.target.value as 'day' | 'week' | 'multi')
            }
            value={view}
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="multi">14 days</option>
          </select>
          <select
            aria-label="Room type"
            className="h-10 rounded-md border border-slate-200 px-3 text-sm"
            onChange={(event) => setRoomTypeId(event.target.value)}
            value={roomTypeId}
          >
            <option value="">All room types</option>
            {timeline?.roomTypes.map((roomType) => (
              <option key={roomType.id} value={roomType.id}>
                {roomType.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Room"
            className="h-10 rounded-md border border-slate-200 px-3 text-sm"
            onChange={(event) => setRoomId(event.target.value)}
            value={roomId}
          >
            <option value="">All rooms</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Reservation status"
            className="h-10 rounded-md border border-slate-200 px-3 text-sm"
            onChange={(event) => setStatus(event.target.value)}
            value={status}
          >
            <option value="">All statuses</option>
            {[
              'PENDING',
              'CONFIRMED',
              'CHECKED_IN',
              'CHECKED_OUT',
              'CANCELLED',
              'NO_SHOW',
              'BLOCKED',
              'MAINTENANCE',
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            aria-label="Booking source"
            className="h-10 rounded-md border border-slate-200 px-3 text-sm"
            onChange={(event) => setSource(event.target.value)}
            value={source}
          >
            <option value="">All sources</option>
            {[
              'DIRECT',
              'WEBSITE',
              'AIRBNB',
              'BOOKING_COM',
              'EXPEDIA',
              'PHONE',
              'WALK_IN',
              'OTHER',
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <form
            className="flex h-10 rounded-md border border-slate-200"
            onSubmit={(event) => {
              event.preventDefault();
              void loadTimeline();
            }}
          >
            <input
              aria-label="Search guest or code"
              className="min-w-0 flex-1 px-3 text-sm"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Guest/code"
              value={search}
            />
            <button
              aria-label="Search calendar"
              className="px-3 text-slate-500"
              type="submit"
            >
              <Search className="h-4 w-4" />
            </button>
          </form>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600">
          <label className="flex items-center gap-2">
            <input
              checked={includeCancelled}
              onChange={(event) => setIncludeCancelled(event.target.checked)}
              type="checkbox"
            />{' '}
            Include cancelled
          </label>
          <label className="flex items-center gap-2">
            <input
              checked={includeNoShow}
              onChange={(event) => setIncludeNoShow(event.target.checked)}
              type="checkbox"
            />{' '}
            Include no-show
          </label>
        </div>
      </section>

      {success ? (
        <div
          className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"
          role="status"
        >
          {success}
        </div>
      ) : null}
      {error ? (
        <div
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <section className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="min-w-[980px]">
          <div
            className="grid border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"
            style={{
              gridTemplateColumns: `180px repeat(${days.length}, minmax(118px, 1fr))`,
            }}
          >
            <div className="sticky left-0 z-10 bg-slate-50 px-4 py-3">Room</div>
            {days.map((day) => (
              <div
                className={`border-l border-slate-200 px-3 py-3 ${isWeekend(day) ? 'bg-amber-50' : ''}`}
                key={day}
              >
                {formatDay(day)}
                {day === new Date().toISOString().slice(0, 10) ? (
                  <span className="ml-2 rounded bg-blue-100 px-1 text-blue-700">
                    Today
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          {timeline?.roomTypes.map((roomType) => (
            <div key={roomType.id}>
              <div className="border-b border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-navy">
                {roomType.name}
              </div>
              {roomType.rooms.map((room) => (
                <div
                  className="grid min-h-[86px] border-b border-slate-100"
                  key={room.id}
                  style={{
                    gridTemplateColumns: `180px repeat(${days.length}, minmax(118px, 1fr))`,
                  }}
                >
                  <div className="sticky left-0 z-10 bg-white px-4 py-3">
                    <p className="font-semibold text-navy">Room {room.name}</p>
                    <div className="mt-2 flex flex-wrap gap-1 text-[11px] font-semibold">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">
                        {room.operationalStatus}
                      </span>
                      <span className="rounded bg-blue-50 px-2 py-0.5 text-blue-700">
                        {room.housekeepingStatus}
                      </span>
                    </div>
                  </div>
                  {days.map((day) => (
                    <button
                      className={`border-l border-slate-100 p-2 text-left hover:bg-blue-50 ${isWeekend(day) ? 'bg-amber-50/40' : ''}`}
                      data-testid={`calendar-slot-${room.name}-${day}`}
                      key={`${room.id}-${day}`}
                      onClick={() => openCreate(room, day)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        const reservation = timeline.reservations.find(
                          (item) =>
                            item.id ===
                            event.dataTransfer.getData('reservation-id'),
                        );
                        if (reservation)
                          openEdit(
                            reservation,
                            room.id,
                            day,
                            addDays(day, reservationLength(reservation)),
                          );
                      }}
                      type="button"
                    />
                  ))}
                  {timeline.reservations
                    .filter((reservation) => reservation.roomId === room.id)
                    .map((reservation) => (
                      <button
                        className={`z-20 m-2 rounded-md px-3 py-2 text-left text-xs font-semibold shadow-sm ring-1 ${statusClass(reservation.status)}`}
                        data-testid={`reservation-bar-${reservation.confirmationNumber}`}
                        draggable={!reservation.isLocked}
                        key={reservation.id}
                        onClick={() => openDetails(reservation)}
                        onDragStart={(event) =>
                          event.dataTransfer.setData(
                            'reservation-id',
                            reservation.id,
                          )
                        }
                        style={{
                          gridColumn: `${spanStart(days, reservation.checkIn) + 2} / ${spanEnd(days, reservation.checkOut) + 2}`,
                          gridRow: 1,
                        }}
                        type="button"
                      >
                        <span className="block truncate">
                          {reservation.guestName}
                        </span>
                        <span className="block truncate opacity-85">
                          {reservation.confirmationNumber} -{' '}
                          {reservation.status}
                        </span>
                        {Number(reservation.balance) > 0 ? (
                          <span className="mt-1 inline-flex items-center gap-1 rounded bg-white/70 px-1 text-[11px]">
                            <AlertTriangle className="h-3 w-3" /> Balance{' '}
                            {reservation.balance}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  {timeline.blocks
                    .filter((block) => block.roomId === room.id)
                    .map((block) => (
                      <button
                        className="z-10 m-2 rounded-md bg-slate-800 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm"
                        data-testid={`calendar-block-${block.reason}`}
                        key={block.id}
                        onClick={() => openBlock(block)}
                        style={{
                          gridColumn: `${spanStart(days, block.startDate) + 2} / ${spanEnd(days, block.endDate) + 2}`,
                          gridRow: 1,
                        }}
                        type="button"
                      >
                        <Wrench className="mr-1 inline h-3 w-3" /> {block.type}:{' '}
                        {block.reason}
                      </button>
                    ))}
                </div>
              ))}
            </div>
          ))}
          {timeline?.roomTypes.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">
              No rooms found for these filters.
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm lg:hidden">
        <h3 className="font-semibold text-navy">Mobile reservation list</h3>
        <div className="mt-3 space-y-2">
          {timeline?.reservations.map((reservation) => (
            <button
              className="w-full rounded-md border border-slate-100 p-3 text-left text-sm"
              key={reservation.id}
              onClick={() => openDetails(reservation)}
              type="button"
            >
              <span className="block font-semibold">
                {reservation.guestName}
              </span>
              <span className="text-slate-500">
                {reservation.confirmationNumber} - {reservation.status}
              </span>
            </button>
          ))}
        </div>
      </section>

      {modalMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <section className="w-full max-w-2xl rounded-md bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-navy">
                  {modalTitle(modalMode)}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedReservation?.confirmationNumber ??
                    selectedSlot?.date ??
                    'Calendar operation'}
                </p>
              </div>
              <button
                className="text-sm font-semibold text-slate-500"
                onClick={() => setModalMode(undefined)}
                type="button"
              >
                Close
              </button>
            </div>

            {modalMode === 'details' && selectedReservation ? (
              <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                <Info label="Guest" value={selectedReservation.guestName} />
                <Info label="Status" value={selectedReservation.status} />
                <Info
                  label="Stay"
                  value={`${selectedReservation.checkIn.slice(0, 10)} to ${selectedReservation.checkOut.slice(0, 10)}`}
                />
                <Info
                  label="Balance"
                  value={`${selectedReservation.balance} ${timeline?.property.currency ?? ''}`}
                />
                <div className="md:col-span-2 flex flex-wrap gap-2">
                  <button
                    className="h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white"
                    disabled={selectedReservation.isLocked}
                    onClick={() => openEdit(selectedReservation)}
                    type="button"
                  >
                    <Move className="mr-2 inline h-4 w-4" /> Edit stay
                  </button>
                </div>
              </div>
            ) : null}

            {modalMode === 'create' ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Field
                  label="Guest name"
                  onChange={setGuestName}
                  value={guestName}
                />
                <SelectRoom
                  label="Room"
                  onChange={setEditRoomId}
                  rooms={rooms}
                  value={editRoomId}
                />
                <DateField
                  label="Check-in"
                  onChange={setEditCheckIn}
                  value={editCheckIn}
                />
                <DateField
                  label="Check-out"
                  onChange={setEditCheckOut}
                  value={editCheckOut}
                />
                <Field
                  label="Adults"
                  onChange={setAdults}
                  type="number"
                  value={adults}
                />
                <Field
                  label="Children"
                  onChange={setChildren}
                  type="number"
                  value={children}
                />
                <Field
                  label="Subtotal"
                  onChange={setSubtotal}
                  type="number"
                  value={subtotal}
                />
                <Field
                  label="Tax"
                  onChange={setTax}
                  type="number"
                  value={tax}
                />
              </div>
            ) : null}

            {modalMode === 'edit' ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <SelectRoom
                  label="Room"
                  onChange={setEditRoomId}
                  rooms={rooms}
                  value={editRoomId}
                />
                <Field label="Reason" onChange={setReason} value={reason} />
                <DateField
                  label="Check-in"
                  onChange={setEditCheckIn}
                  value={editCheckIn}
                />
                <DateField
                  label="Check-out"
                  onChange={setEditCheckOut}
                  value={editCheckOut}
                />
              </div>
            ) : null}

            {modalMode === 'block' ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <SelectRoom
                  label="Room"
                  onChange={setEditRoomId}
                  rooms={rooms}
                  value={editRoomId}
                />
                <Field label="Reason" onChange={setReason} value={reason} />
                <DateField
                  label="Start"
                  onChange={setEditCheckIn}
                  value={editCheckIn}
                />
                <DateField
                  label="End"
                  onChange={setEditCheckOut}
                  value={editCheckOut}
                />
              </div>
            ) : null}

            {modalMode === 'block-details' && selectedBlock ? (
              <div className="mt-4 space-y-3 text-sm">
                <Info label="Type" value={selectedBlock.type} />
                <Info
                  label="Dates"
                  value={`${selectedBlock.startDate.slice(0, 10)} to ${selectedBlock.endDate.slice(0, 10)}`}
                />
                <Info label="Reason" value={selectedBlock.reason} />
                <div className="flex flex-wrap gap-2">
                  <button
                    className="h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white"
                    onClick={() => setModalMode('block-edit')}
                    type="button"
                  >
                    Edit block
                  </button>
                  <button
                    className="h-10 rounded-md border border-red-200 px-4 text-sm font-semibold text-red-700"
                    disabled={submitting}
                    onClick={() => void deleteBlock()}
                    type="button"
                  >
                    Delete block
                  </button>
                </div>
              </div>
            ) : null}

            {modalMode === 'block-edit' ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <SelectRoom
                  label="Room"
                  onChange={setEditRoomId}
                  rooms={rooms}
                  value={editRoomId}
                />
                <Field label="Reason" onChange={setReason} value={reason} />
                <DateField
                  label="Start"
                  onChange={setEditCheckIn}
                  value={editCheckIn}
                />
                <DateField
                  label="End"
                  onChange={setEditCheckOut}
                  value={editCheckOut}
                />
              </div>
            ) : null}

            {modalMode !== 'details' && modalMode !== 'block-details' ? (
              <div className="mt-5 flex justify-between gap-2">
                {modalMode === 'create' ? (
                  <button
                    className="h-10 rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-700"
                    onClick={() => setModalMode('block')}
                    type="button"
                  >
                    Create block instead
                  </button>
                ) : (
                  <span />
                )}
                <button
                  className="h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={submitting}
                  onClick={() => {
                    if (modalMode === 'create') void createReservation();
                    if (modalMode === 'edit') void moveReservation();
                    if (modalMode === 'block') void createBlock();
                    if (modalMode === 'block-edit') void updateBlock();
                  }}
                  type="button"
                >
                  {submitting ? 'Saving...' : 'Confirm'}
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Info({
  label,
  value,
}: Readonly<{ label: string; value: string }>): ReactElement {
  return (
    <p>
      <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="font-semibold text-navy">{value}</span>
    </p>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}>): ReactElement {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <input
        className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function DateField({
  label,
  value,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
}>): ReactElement {
  return <Field label={label} onChange={onChange} type="date" value={value} />;
}

function SelectRoom({
  label,
  value,
  rooms,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  rooms: Array<CalendarRoom & { roomTypeName: string }>;
  onChange: (value: string) => void;
}>): ReactElement {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <select
        className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {rooms.map((room) => (
          <option key={room.id} value={room.id}>
            {room.name} - {room.roomTypeName} - {room.operationalStatus}
          </option>
        ))}
      </select>
    </label>
  );
}

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function formatDay(date: string): string {
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6;
}

function spanStart(days: string[], value: string): number {
  const date = value.slice(0, 10);
  const index = days.findIndex((day) => day >= date);
  return index === -1 ? 0 : index;
}

function spanEnd(days: string[], value: string): number {
  const date = value.slice(0, 10);
  const index = days.findIndex((day) => day >= date);
  return index === -1 ? days.length : Math.max(index, 1);
}

function reservationLength(reservation: CalendarReservation): number {
  return Math.max(
    1,
    Math.ceil(
      (new Date(reservation.checkOut).getTime() -
        new Date(reservation.checkIn).getTime()) /
        86_400_000,
    ),
  );
}

function statusClass(status: string): string {
  if (status === 'CHECKED_IN')
    return 'bg-emerald-600 text-white ring-emerald-700';
  if (status === 'CANCELLED' || status === 'NO_SHOW')
    return 'bg-slate-200 text-slate-700 ring-slate-300';
  if (status === 'BLOCKED' || status === 'MAINTENANCE')
    return 'bg-slate-800 text-white ring-slate-900';
  if (status === 'PENDING') return 'bg-amber-100 text-amber-900 ring-amber-200';
  return 'bg-blue-600 text-white ring-blue-700';
}

function modalTitle(mode: ModalMode): string {
  return mode === 'create'
    ? 'Create reservation'
    : mode === 'edit'
      ? 'Edit stay'
      : mode === 'block'
        ? 'Create calendar block'
        : 'Reservation details';
}

function formatApiError(error: unknown): string {
  if (!(error instanceof Error)) return 'Calendar action failed.';
  try {
    const parsed = JSON.parse(error.message) as {
      code?: string;
      message?: string;
    };
    return (
      [parsed.code, parsed.message].filter(Boolean).join(': ') || error.message
    );
  } catch {
    return error.message;
  }
}
