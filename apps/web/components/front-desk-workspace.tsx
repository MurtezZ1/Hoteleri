'use client';

import {
  AlertTriangle,
  BedDouble,
  CheckCircle2,
  CreditCard,
  FileText,
  MessageSquare,
  Search,
  Wrench,
} from 'lucide-react';
import {
  type ComponentType,
  type ReactElement,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  apiGet,
  apiPost,
  CompanySummary,
  getAccessToken,
} from '../lib/client-api';

interface PropertySummary {
  id: string;
  name: string;
}

interface ReservationRow {
  id: string;
  reservationCode: string;
  status: string;
  paymentStatus: string;
  guestName: string;
  guestPhone?: string | null;
  checkInDate: string;
  checkOutDate: string;
  bookingSource: string;
  rooms: Array<{ id: string; name: string; status: string }>;
  totalAmount: string;
  paidAmount: string;
  balance: string;
}

interface RoomRow {
  id: string;
  name: string;
  floor?: string | null;
  status: string;
  cleaningStatus: string;
  maintenanceStatus: string;
  roomType: string;
}

interface FrontDeskOverview {
  date: string;
  propertyId: string;
  currency: string;
  metrics: Record<string, number | string>;
  arrivals: ReservationRow[];
  departures: ReservationRow[];
  inHouse: ReservationRow[];
  pendingCheckIns: ReservationRow[];
  pendingCheckOuts: ReservationRow[];
  newReservations: ReservationRow[];
  recentCancellations: ReservationRow[];
  noShows: ReservationRow[];
  outstandingBalances: ReservationRow[];
  rooms: RoomRow[];
  alerts: Array<{ severity: string; message: string }>;
}

type ActionKey =
  | 'assign-room'
  | 'change-room'
  | 'check-in'
  | 'check-out'
  | 'mark-no-show'
  | 'record-payment'
  | 'generate-invoice'
  | 'create-housekeeping-task'
  | 'create-maintenance-issue'
  | 'update-room-status';

interface ActionConfig {
  key: ActionKey;
  label: string;
  icon: ComponentType<{ className?: string }>;
  reservationStatuses?: string[];
  destructive?: boolean;
}

const metricLabels: Array<[keyof FrontDeskOverview['metrics'], string]> = [
  ['arrivals', "Today's arrivals"],
  ['departures', "Today's departures"],
  ['inHouse', 'In-house guests'],
  ['pendingCheckIns', 'Pending check-ins'],
  ['pendingCheckOuts', 'Pending check-outs'],
  ['roomsAvailable', 'Available rooms'],
  ['roomsOccupied', 'Occupied rooms'],
  ['dirtyRooms', 'Dirty rooms'],
  ['cleanRooms', 'Clean rooms'],
  ['maintenanceRooms', 'Maintenance'],
  ['blockedRooms', 'Blocked'],
  ['outstandingBalances', 'Outstanding balances'],
  ['newReservations', 'New reservations'],
  ['recentCancellations', 'Recent cancellations'],
  ['noShows', 'No-shows'],
  ['occupancyPercentage', 'Occupancy %'],
];

const actions: ActionConfig[] = [
  {
    key: 'assign-room',
    label: 'Assign room',
    icon: BedDouble,
    reservationStatuses: ['PENDING', 'CONFIRMED', 'CHECKED_IN'],
  },
  {
    key: 'change-room',
    label: 'Change room',
    icon: BedDouble,
    reservationStatuses: ['PENDING', 'CONFIRMED', 'CHECKED_IN'],
  },
  {
    key: 'check-in',
    label: 'Check in',
    icon: CheckCircle2,
    reservationStatuses: ['CONFIRMED'],
  },
  {
    key: 'check-out',
    label: 'Check out',
    icon: CheckCircle2,
    reservationStatuses: ['CHECKED_IN'],
  },
  {
    key: 'mark-no-show',
    label: 'Mark no-show',
    icon: AlertTriangle,
    reservationStatuses: ['PENDING', 'CONFIRMED'],
    destructive: true,
  },
  {
    key: 'record-payment',
    label: 'Record payment',
    icon: CreditCard,
    reservationStatuses: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'],
  },
  {
    key: 'generate-invoice',
    label: 'Generate invoice',
    icon: FileText,
    reservationStatuses: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'],
  },
  {
    key: 'create-housekeeping-task',
    label: 'Housekeeping task',
    icon: MessageSquare,
  },
  { key: 'create-maintenance-issue', label: 'Maintenance issue', icon: Wrench },
  { key: 'update-room-status', label: 'Update room status', icon: BedDouble },
];

export function FrontDeskWorkspace(): ReactElement {
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [propertyId, setPropertyId] = useState<string>();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [overview, setOverview] = useState<FrontDeskOverview>();
  const [activeAction, setActiveAction] = useState<ActionConfig>();
  const [selectedReservationId, setSelectedReservationId] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();

  useEffect(() => {
    void loadProperties();
  }, []);

  useEffect(() => {
    if (propertyId) {
      void loadOverview();
    }
  }, [propertyId, date, status]);

  const reservations = useMemo(() => {
    const rows = [
      ...(overview?.arrivals ?? []),
      ...(overview?.departures ?? []),
      ...(overview?.inHouse ?? []),
      ...(overview?.pendingCheckIns ?? []),
      ...(overview?.pendingCheckOuts ?? []),
      ...(overview?.outstandingBalances ?? []),
      ...(overview?.newReservations ?? []),
    ];
    return [...new Map(rows.map((row) => [row.id, row])).values()];
  }, [overview]);

  const selectedReservation = reservations.find(
    (reservation) => reservation.id === selectedReservationId,
  );
  const selectedRoom = overview?.rooms.find(
    (room) => room.id === selectedRoomId,
  );
  const selectedProperty = useMemo(
    () => properties.find((property) => property.id === propertyId),
    [properties, propertyId],
  );

  async function loadProperties(): Promise<void> {
    const token = getAccessToken();
    if (!token) {
      setError('Please sign in again.');
      setLoading(false);
      return;
    }
    try {
      const companies = await apiGet<
        Array<CompanySummary & { properties?: PropertySummary[] }>
      >('/companies/mine', token);
      const propertyRows = companies.flatMap(
        (company) => company.properties ?? [],
      );
      setProperties(propertyRows);
      setPropertyId(propertyRows[0]?.id);
    } catch {
      setError('Could not load your properties.');
      setLoading(false);
    }
  }

  async function loadOverview(nextSearch = search): Promise<void> {
    if (!propertyId) return;
    const token = getAccessToken();
    if (!token) return;
    setLoading(true);
    setError(undefined);
    try {
      const params = new URLSearchParams({ date });
      if (status) params.set('status', status);
      if (nextSearch.trim()) params.set('search', nextSearch.trim());
      setOverview(
        await apiGet<FrontDeskOverview>(
          `/front-desk/${propertyId}?${params.toString()}`,
          token,
        ),
      );
    } catch {
      setError('Front Desk data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  function openAction(
    action: ActionConfig,
    reservation?: ReservationRow,
  ): void {
    setActiveAction(action);
    setSuccess(undefined);
    setError(undefined);
    setAmount(
      reservation?.balance && Number(reservation.balance) > 0
        ? reservation.balance
        : '',
    );
    setReason('');
    setNotes('');
    setSelectedReservationId(
      reservation?.id ??
        reservations.find(
          (row) =>
            !action.reservationStatuses ||
            action.reservationStatuses.includes(row.status),
        )?.id ??
        '',
    );
    setSelectedRoomId(
      overview?.rooms.find(
        (room) =>
          room.status === 'AVAILABLE' &&
          ['READY', 'AVAILABLE'].includes(room.cleaningStatus),
      )?.id ??
        overview?.rooms[0]?.id ??
        '',
    );
  }

  async function submitAction(): Promise<void> {
    if (!activeAction || !propertyId) return;
    const token = getAccessToken();
    if (!token) {
      setError('Please sign in again.');
      return;
    }
    setSubmitting(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      await apiPost<unknown, Record<string, unknown>>(
        actionPath(activeAction.key, selectedReservationId),
        actionPayload(activeAction.key),
        token,
      );
      setSuccess(`${activeAction.label} completed.`);
      setActiveAction(undefined);
      await loadOverview();
    } catch (requestError) {
      setError(formatApiError(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  function actionPayload(action: ActionKey): Record<string, unknown> {
    switch (action) {
      case 'assign-room':
        return { roomId: selectedRoomId };
      case 'change-room':
        return { newRoomId: selectedRoomId, reason };
      case 'check-in':
        return {
          roomId: selectedRoomId,
          guestDetailsConfirmed: true,
          identificationConfirmed: true,
          notes,
        };
      case 'check-out':
        return { forceWithOutstandingBalance: false, notes };
      case 'mark-no-show':
        return { reason: reason || 'Guest did not arrive' };
      case 'record-payment':
        return {
          amount: Number(amount),
          currency: overview?.currency ?? 'USD',
          method: 'CASH',
          type: 'PARTIAL',
          notes,
          idempotencyKey: `fd-${selectedReservationId}-${Date.now()}`,
        };
      case 'generate-invoice':
        return { allowDuplicate: false };
      case 'create-housekeeping-task':
        return {
          propertyId,
          roomId: selectedRoomId,
          reservationId: selectedReservationId || undefined,
          notes,
          status: 'PENDING',
          priority: 2,
        };
      case 'create-maintenance-issue':
        return {
          propertyId,
          roomId: selectedRoomId || undefined,
          category: reason || 'Front desk issue',
          description: notes || 'Maintenance issue created from Front Desk.',
          blocksRoomFromSale: true,
          priority: 2,
        };
      case 'update-room-status':
        return {
          propertyId,
          roomId: selectedRoomId,
          cleaningStatus: 'READY',
          reason: reason || 'Updated from Front Desk',
        };
    }
  }

  if (loading && !overview) {
    return (
      <div className="rounded-md border border-blue-100 bg-blue-50 p-4 text-sm font-semibold text-blue-700">
        Loading Front Desk...
      </div>
    );
  }

  if (error && !overview) {
    return (
      <div className="rounded-md border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
              Front Desk
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-navy">
              {selectedProperty?.name ?? 'Property operations'}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Arrivals, departures, room readiness, balances, and operational
              alerts.
            </p>
          </div>
          <div className="grid w-full gap-2 md:w-auto md:grid-cols-4">
            <select
              className="h-10 rounded-md border border-slate-200 px-3 text-sm"
              onChange={(event) => setPropertyId(event.target.value)}
              value={propertyId ?? ''}
            >
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
            <input
              className="h-10 rounded-md border border-slate-200 px-3 text-sm"
              onChange={(event) => setDate(event.target.value)}
              type="date"
              value={date}
            />
            <select
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
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <form
              className="flex h-10 rounded-md border border-slate-200 bg-white"
              onSubmit={(event) => {
                event.preventDefault();
                void loadOverview();
              }}
            >
              <input
                className="min-w-0 flex-1 border-0 px-3 text-sm"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Guest or code"
                value={search}
              />
              <button className="px-3 text-slate-500" type="submit">
                <Search className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </section>

      {success ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
          {success}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
          {error}
        </div>
      ) : null}

      {overview?.alerts.length ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {overview.alerts.map((alert) => (
            <div
              className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900"
              key={alert.message}
            >
              {alert.message}
            </div>
          ))}
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
        {overview
          ? metricLabels.map(([key, label]) => (
              <div
                className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"
                key={String(key)}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {label}
                </p>
                <p className="mt-2 text-2xl font-semibold text-navy">
                  {String(overview.metrics[key] ?? 0)}
                </p>
              </div>
            ))
          : null}
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-navy">Quick actions</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {actions.map((action) => {
            const Icon = action.icon;
            const disabled = Boolean(
              action.reservationStatuses &&
              !reservations.some((reservation) =>
                action.reservationStatuses?.includes(reservation.status),
              ),
            );
            return (
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={disabled}
                key={action.key}
                onClick={() => openAction(action)}
                type="button"
              >
                <Icon className="h-4 w-4" />
                <span>{action.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <ReservationTable
          onAction={openAction}
          rows={overview?.arrivals ?? []}
          title="Today's arrivals"
        />
        <ReservationTable
          onAction={openAction}
          rows={overview?.departures ?? []}
          title="Today's departures"
        />
        <ReservationTable
          onAction={openAction}
          rows={overview?.inHouse ?? []}
          title="Currently in-house"
        />
        <ReservationTable
          onAction={openAction}
          rows={overview?.outstandingBalances ?? []}
          title="Outstanding balances"
        />
      </div>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-navy">Room readiness</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          {overview?.rooms.map((room) => (
            <div
              className="rounded-md border border-slate-100 bg-slate-50 p-3 text-sm"
              key={room.id}
            >
              <p className="font-semibold text-navy">{room.name}</p>
              <p className="mt-1 text-xs text-slate-500">
                {room.roomType}
                {room.floor ? ` - Floor ${room.floor}` : ''}
              </p>
              <div className="mt-3 flex flex-wrap gap-1">
                {[room.status, room.cleaningStatus, room.maintenanceStatus].map(
                  (value) => (
                    <span
                      className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200"
                      key={value}
                    >
                      {value}
                    </span>
                  ),
                )}
              </div>
            </div>
          ))}
          {overview?.rooms.length === 0 ? (
            <p className="text-sm text-slate-500">
              No rooms found for this property.
            </p>
          ) : null}
        </div>
      </section>

      {activeAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <section className="w-full max-w-2xl rounded-md bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-navy">
                  {activeAction.label}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Execute this Front Desk action against the backend domain
                  workflow.
                </p>
              </div>
              <button
                className="text-sm font-semibold text-slate-500"
                onClick={() => setActiveAction(undefined)}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {needsReservation(activeAction.key) ? (
                <label className="text-sm font-semibold text-slate-700">
                  Reservation
                  <select
                    className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
                    onChange={(event) =>
                      setSelectedReservationId(event.target.value)
                    }
                    value={selectedReservationId}
                  >
                    <option value="">Select reservation</option>
                    {reservations
                      .filter(
                        (reservation) =>
                          !activeAction.reservationStatuses ||
                          activeAction.reservationStatuses.includes(
                            reservation.status,
                          ),
                      )
                      .map((reservation) => (
                        <option key={reservation.id} value={reservation.id}>
                          {reservation.reservationCode} -{' '}
                          {reservation.guestName} - {reservation.status}
                        </option>
                      ))}
                  </select>
                </label>
              ) : null}

              {needsRoom(activeAction.key) ? (
                <label className="text-sm font-semibold text-slate-700">
                  Room
                  <select
                    className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
                    onChange={(event) => setSelectedRoomId(event.target.value)}
                    value={selectedRoomId}
                  >
                    <option value="">Select room</option>
                    {overview?.rooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.name} - {room.status} / {room.cleaningStatus}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {activeAction.key === 'record-payment' ? (
                <label className="text-sm font-semibold text-slate-700">
                  Amount
                  <input
                    className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
                    min="0.01"
                    onChange={(event) => setAmount(event.target.value)}
                    step="0.01"
                    type="number"
                    value={amount}
                  />
                </label>
              ) : null}

              {[
                'change-room',
                'mark-no-show',
                'create-maintenance-issue',
                'update-room-status',
              ].includes(activeAction.key) ? (
                <label className="text-sm font-semibold text-slate-700">
                  Reason/category
                  <input
                    className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
                    onChange={(event) => setReason(event.target.value)}
                    value={reason}
                  />
                </label>
              ) : null}

              {[
                'check-in',
                'check-out',
                'record-payment',
                'create-housekeeping-task',
                'create-maintenance-issue',
              ].includes(activeAction.key) ? (
                <label className="text-sm font-semibold text-slate-700 md:col-span-2">
                  Notes
                  <textarea
                    className="mt-1 min-h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    onChange={(event) => setNotes(event.target.value)}
                    value={notes}
                  />
                </label>
              ) : null}
            </div>

            <div className="mt-4 rounded-md border border-slate-100 bg-slate-50 p-3 text-sm text-slate-600">
              {selectedReservation ? (
                <p>
                  {selectedReservation.guestName} -{' '}
                  {selectedReservation.reservationCode} - balance{' '}
                  {selectedReservation.balance}
                </p>
              ) : null}
              {selectedRoom ? (
                <p className="mt-1">
                  Room {selectedRoom.name} is {selectedRoom.status} /{' '}
                  {selectedRoom.cleaningStatus}.
                </p>
              ) : null}
              {activeAction.destructive ? (
                <p className="mt-2 font-semibold text-red-700">
                  This action changes reservation state and cannot be casually
                  undone.
                </p>
              ) : null}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                className="h-10 rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-700"
                onClick={() => setActiveAction(undefined)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={
                  submitting ||
                  !canSubmit(
                    activeAction.key,
                    selectedReservationId,
                    selectedRoomId,
                    amount,
                  )
                }
                onClick={() => void submitAction()}
                type="button"
              >
                {submitting ? 'Working...' : 'Confirm'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function ReservationTable({
  title,
  rows,
  onAction,
}: Readonly<{
  title: string;
  rows: ReservationRow[];
  onAction: (action: ActionConfig, reservation: ReservationRow) => void;
}>): ReactElement {
  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4">
        <h3 className="text-lg font-semibold text-navy">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">Nothing to handle here.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Guest</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Balance</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-semibold text-navy">
                    {row.guestName}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.reservationCode}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.rooms.map((room) => room.name).join(', ') ||
                      'Unassigned'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.status}</td>
                  <td className="px-4 py-3 font-semibold text-slate-700">
                    {row.balance}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {actions
                        .filter((action) =>
                          action.reservationStatuses?.includes(row.status),
                        )
                        .slice(0, 3)
                        .map((action) => (
                          <button
                            className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                            key={action.key}
                            onClick={() => onAction(action, row)}
                            type="button"
                          >
                            {action.label}
                          </button>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function needsReservation(action: ActionKey): boolean {
  return ![
    'create-housekeeping-task',
    'create-maintenance-issue',
    'update-room-status',
  ].includes(action);
}

function needsRoom(action: ActionKey): boolean {
  return [
    'assign-room',
    'change-room',
    'check-in',
    'create-housekeeping-task',
    'create-maintenance-issue',
    'update-room-status',
  ].includes(action);
}

function canSubmit(
  action: ActionKey,
  reservationId: string,
  roomId: string,
  amount: string,
): boolean {
  if (needsReservation(action) && !reservationId) return false;
  if (needsRoom(action) && !roomId) return false;
  if (action === 'record-payment' && (!amount || Number(amount) <= 0))
    return false;
  return true;
}

function actionPath(action: ActionKey, reservationId: string): string {
  switch (action) {
    case 'assign-room':
      return `/reservations/${reservationId}/assign-room`;
    case 'change-room':
      return `/reservations/${reservationId}/change-room`;
    case 'check-in':
      return `/reservations/${reservationId}/check-in`;
    case 'check-out':
      return `/reservations/${reservationId}/check-out`;
    case 'mark-no-show':
      return `/reservations/${reservationId}/no-show`;
    case 'record-payment':
      return `/reservations/${reservationId}/payments`;
    case 'generate-invoice':
      return `/reservations/${reservationId}/invoices`;
    case 'create-housekeeping-task':
      return '/housekeeping/tasks';
    case 'create-maintenance-issue':
      return '/maintenance/issues';
    case 'update-room-status':
      return '/maintenance/rooms/status';
  }
}

function formatApiError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Action failed.';
  }
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
