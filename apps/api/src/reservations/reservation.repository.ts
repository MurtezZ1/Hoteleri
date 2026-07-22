import { Injectable } from '@nestjs/common';
import { Prisma, ReservationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReservationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findConflicts(roomIds: string[], checkInDate: Date, checkOutDate: Date) {
    return this.prisma.reservationRoom.findMany({
      where: {
        roomId: { in: roomIds },
        reservation: {
          deletedAt: null,
          status: { notIn: [ReservationStatus.CANCELLED, ReservationStatus.NO_SHOW] },
          checkInDate: { lt: checkOutDate },
          checkOutDate: { gt: checkInDate },
        },
      },
      include: { room: true, reservation: true },
    });
  }

  create(data: Prisma.ReservationCreateInput) {
    return this.prisma.reservation.create({
      data,
      include: { guest: true, rooms: { include: { room: true } } },
    });
  }
}
