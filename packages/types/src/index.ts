export const userRoles = [
  'PLATFORM_SUPER_ADMIN',
  'HOTEL_OWNER',
  'PROPERTY_MANAGER',
  'RECEPTIONIST',
  'FINANCE_STAFF',
  'HOUSEKEEPING_STAFF',
] as const;

export type UserRole = (typeof userRoles)[number];

export const reservationStatuses = [
  'PENDING',
  'CONFIRMED',
  'CHECKED_IN',
  'CHECKED_OUT',
  'CANCELLED',
  'NO_SHOW',
] as const;

export type ReservationStatus = (typeof reservationStatuses)[number];

export const roomStatuses = [
  'AVAILABLE',
  'OCCUPIED',
  'RESERVED',
  'DIRTY',
  'CLEANING',
  'READY',
  'MAINTENANCE',
  'OUT_OF_SERVICE',
] as const;

export type RoomStatus = (typeof roomStatuses)[number];

export interface DashboardMetric {
  label: string;
  value: string;
  trend: string;
}
