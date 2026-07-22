import { ConflictException } from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';

const allowedTransitions: Record<ReservationStatus, ReservationStatus[]> = {
  PENDING: [
    ReservationStatus.CONFIRMED,
    ReservationStatus.CANCELLED,
    ReservationStatus.NO_SHOW,
  ],
  CONFIRMED: [
    ReservationStatus.CHECKED_IN,
    ReservationStatus.CANCELLED,
    ReservationStatus.NO_SHOW,
  ],
  CHECKED_IN: [ReservationStatus.CHECKED_OUT],
  CHECKED_OUT: [],
  CANCELLED: [],
  NO_SHOW: [],
  BLOCKED: [],
  MAINTENANCE: [],
};

export function assertReservationTransition(
  currentStatus: ReservationStatus,
  requestedStatus: ReservationStatus,
): void {
  if (currentStatus === requestedStatus) {
    return;
  }
  if (!allowedTransitions[currentStatus].includes(requestedStatus)) {
    throw new ConflictException({
      code: 'INVALID_RESERVATION_TRANSITION',
      message: `Reservation cannot move from ${currentStatus} to ${requestedStatus}.`,
      currentStatus,
      requestedStatus,
    });
  }
}

export function assertAssignableReservation(status: ReservationStatus): void {
  const assignableStatuses: ReservationStatus[] = [
    ReservationStatus.PENDING,
    ReservationStatus.CONFIRMED,
    ReservationStatus.CHECKED_IN,
  ];
  if (!assignableStatuses.includes(status)) {
    throw new ConflictException({
      code: 'RESERVATION_NOT_ASSIGNABLE',
      message: `Reservation in ${status} status cannot be assigned a room.`,
      currentStatus: status,
    });
  }
}
