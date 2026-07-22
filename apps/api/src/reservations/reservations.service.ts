import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  HousekeepingStatus,
  InventoryOutboxEventType,
  MaintenanceStatus,
  PaymentStatus,
  PaymentType,
  Prisma,
  ReservationStatus,
  RoomStatus,
} from '@prisma/client';
import { createHash } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { SubscriptionGuardService } from '../common/subscription-guard.service';
import { TenantAccessService } from '../common/tenant-access.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import {
  AssignRoomDto,
  ChangeRoomDto,
  CheckInDto,
  CheckOutDto,
  CreateHousekeepingTaskDto,
  CreateMaintenanceIssueDto,
  CreateReservationDto,
  GenerateInvoiceDto,
  NoShowDto,
  RecordPaymentDto,
  UpdateRoomStatusDto,
} from './dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertAssignableReservation,
  assertReservationTransition,
} from './reservation-transition';

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantAccessService,
    private readonly subscriptions: SubscriptionGuardService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  async create(
    userId: string,
    dto: CreateReservationDto,
    idempotencyKey?: string,
  ) {
    const property = await this.tenants.assertPropertyAccess(
      userId,
      dto.propertyId,
    );
    if (property.companyId !== dto.companyId) {
      throw new BadRequestException(
        'Reservation company does not match the property company.',
      );
    }
    await this.subscriptions.assertCanMutate(
      dto.companyId,
      'reservations.create',
    );
    await this.assertReservationResourcesBelongToTenant(dto);
    const checkInDate = new Date(dto.checkInDate);
    const checkOutDate = new Date(dto.checkOutDate);
    if (checkOutDate <= checkInDate) {
      throw new BadRequestException(
        'Check-out date must be after check-in date.',
      );
    }

    const reservation = await this.createWithConcurrencyProtection(
      dto,
      checkInDate,
      checkOutDate,
      idempotencyKey,
    );
    void this.whatsapp.enqueueReservationCreated(reservation.id);
    return reservation;
  }

  async list(userId: string, propertyId: string) {
    await this.tenants.assertPropertyAccess(userId, propertyId);
    return this.prisma.reservation.findMany({
      where: { propertyId, deletedAt: null },
      include: { guest: true, rooms: { include: { room: true } } },
      orderBy: { checkInDate: 'asc' },
      take: 100,
    });
  }

  async calendar(
    userId: string,
    propertyId: string,
    from?: string,
    to?: string,
  ) {
    await this.tenants.assertPropertyAccess(userId, propertyId);
    return this.prisma.reservation.findMany({
      where: {
        propertyId,
        deletedAt: null,
        ...(from ? { checkOutDate: { gte: new Date(from) } } : {}),
        ...(to ? { checkInDate: { lte: new Date(to) } } : {}),
      },
      include: { guest: true, rooms: { include: { room: true } } },
      orderBy: { checkInDate: 'asc' },
    });
  }

  async assignRoom(userId: string, reservationId: string, dto: AssignRoomDto) {
    const context = await this.getReservationContext(
      userId,
      reservationId,
      'pms.frontdesk',
    );
    assertAssignableReservation(context.reservation.status);
    return this.retrySerializable(() =>
      this.prisma.$transaction(
        async (tx) => {
          const room = await this.assertRoomAssignable(
            tx,
            context.reservation,
            dto.roomId,
          );
          await this.assertNoRoomOverlap(tx, context.reservation, dto.roomId);
          const existing = context.reservation.rooms[0];
          if (existing) {
            await tx.reservationRoom.update({
              where: { id: existing.id },
              data: { roomId: dto.roomId },
            });
          } else {
            await tx.reservationRoom.create({
              data: {
                reservationId,
                roomId: dto.roomId,
                pricePerNight: context.reservation.subtotal,
              },
            });
          }
          await this.writeAudit(
            tx,
            context.companyId,
            userId,
            'reservation.room_assigned',
            'Reservation',
            reservationId,
            { roomIds: context.reservation.rooms.map((row) => row.roomId) },
            { roomId: dto.roomId },
          );
          await this.createInventoryOutbox(
            tx,
            context.companyId,
            context.propertyId,
            InventoryOutboxEventType.ROOM_ASSIGNED,
            `room-assigned:${reservationId}:${dto.roomId}`,
            {
              roomId: dto.roomId,
              reservationId,
              payload: { reservationId, roomId: dto.roomId },
            },
          );
          return this.reservationSummary(tx, reservationId, room.id);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async changeRoom(userId: string, reservationId: string, dto: ChangeRoomDto) {
    const context = await this.getReservationContext(
      userId,
      reservationId,
      'pms.frontdesk',
    );
    assertAssignableReservation(context.reservation.status);
    return this.retrySerializable(() =>
      this.prisma.$transaction(
        async (tx) => {
          const oldAssignment = context.reservation.rooms[0];
          const newRoom = await this.assertRoomAssignable(
            tx,
            context.reservation,
            dto.newRoomId,
          );
          await this.assertNoRoomOverlap(
            tx,
            context.reservation,
            dto.newRoomId,
          );
          if (oldAssignment) {
            await tx.reservationRoom.update({
              where: { id: oldAssignment.id },
              data: { roomId: dto.newRoomId },
            });
            if (context.reservation.status === ReservationStatus.CHECKED_IN) {
              await tx.room.update({
                where: { id: oldAssignment.roomId },
                data: {
                  status: RoomStatus.AVAILABLE,
                  cleaningStatus: RoomStatus.DIRTY,
                },
              });
            }
          } else {
            await tx.reservationRoom.create({
              data: {
                reservationId,
                roomId: dto.newRoomId,
                pricePerNight: context.reservation.subtotal,
              },
            });
          }
          if (context.reservation.status === ReservationStatus.CHECKED_IN) {
            await tx.room.update({
              where: { id: dto.newRoomId },
              data: { status: RoomStatus.OCCUPIED },
            });
          }
          await tx.reservationRoomChange.create({
            data: {
              companyId: context.companyId,
              propertyId: context.propertyId,
              reservationId,
              oldRoomId: oldAssignment?.roomId ?? null,
              newRoomId: dto.newRoomId,
              reason: dto.reason ?? null,
              changedByUserId: userId,
            },
          });
          await this.writeAudit(
            tx,
            context.companyId,
            userId,
            'reservation.room_changed',
            'Reservation',
            reservationId,
            { oldRoomId: oldAssignment?.roomId },
            { newRoomId: dto.newRoomId, reason: dto.reason },
          );
          await this.createInventoryOutbox(
            tx,
            context.companyId,
            context.propertyId,
            InventoryOutboxEventType.ROOM_CHANGED,
            `room-changed:${reservationId}:${dto.newRoomId}:${new Date().toISOString()}`,
            {
              roomId: dto.newRoomId,
              reservationId,
              payload: {
                reservationId,
                oldRoomId: oldAssignment?.roomId ?? null,
                newRoomId: dto.newRoomId,
              },
            },
          );
          return this.reservationSummary(tx, reservationId, newRoom.id);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async checkIn(userId: string, reservationId: string, dto: CheckInDto) {
    const context = await this.getReservationContext(
      userId,
      reservationId,
      'pms.frontdesk',
    );
    const policy = await this.getOperationalPolicy(context.propertyId);
    assertReservationTransition(
      context.reservation.status,
      ReservationStatus.CHECKED_IN,
    );
    const roomId = dto.roomId ?? context.reservation.rooms[0]?.roomId;
    if (!roomId) {
      this.domainConflict(
        'ROOM_REQUIRED',
        'A room is required before check-in.',
      );
    }
    if (
      policy.requireGuestDetailsForCheckIn &&
      dto.guestDetailsConfirmed !== true
    ) {
      this.domainConflict(
        'GUEST_DETAILS_INCOMPLETE',
        'Guest details and identity confirmation are required for check-in.',
      );
    }
    if (
      policy.requireIdentificationConfirmation &&
      dto.identificationConfirmed !== true
    ) {
      this.domainConflict(
        'GUEST_DETAILS_INCOMPLETE',
        'Guest identification confirmation is required for check-in.',
      );
    }
    if (
      policy.requireDepositBeforeCheckIn &&
      calculatePaid(context.reservation).lt(policy.minimumDepositValue)
    ) {
      this.domainConflict(
        'DEPOSIT_REQUIRED',
        'A minimum deposit is required before check-in.',
        { minimumDepositValue: policy.minimumDepositValue.toString() },
      );
    }
    return this.retrySerializable(() =>
      this.prisma.$transaction(
        async (tx) => {
          await this.assertRoomAssignable(tx, context.reservation, roomId, {
            requireReady: policy.requireCleanRoomForCheckIn,
          });
          await this.assertNoRoomOverlap(tx, context.reservation, roomId);
          const existing = context.reservation.rooms[0];
          if (existing) {
            await tx.reservationRoom.update({
              where: { id: existing.id },
              data: { roomId },
            });
          } else {
            await tx.reservationRoom.create({
              data: {
                reservationId,
                roomId,
                pricePerNight: context.reservation.subtotal,
              },
            });
          }
          await tx.reservation.update({
            where: { id: reservationId },
            data: {
              status: ReservationStatus.CHECKED_IN,
              checkedInAt: dto.actualArrivalAt
                ? new Date(dto.actualArrivalAt)
                : new Date(),
              checkedInByUserId: userId,
              internalNotes: appendNote(
                context.reservation.internalNotes,
                dto.notes,
              ),
            },
          });
          await tx.room.update({
            where: { id: roomId },
            data: { status: RoomStatus.OCCUPIED },
          });
          await this.writeAudit(
            tx,
            context.companyId,
            userId,
            'reservation.checked_in',
            'Reservation',
            reservationId,
            { status: context.reservation.status },
            { status: ReservationStatus.CHECKED_IN, roomId },
          );
          await this.createInventoryOutbox(
            tx,
            context.companyId,
            context.propertyId,
            InventoryOutboxEventType.CHECKED_IN,
            `checked-in:${reservationId}`,
            {
              roomId,
              reservationId,
              payload: { reservationId, roomId },
            },
          );
          return this.reservationSummary(tx, reservationId, roomId);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async checkOut(userId: string, reservationId: string, dto: CheckOutDto) {
    const context = await this.getReservationContext(
      userId,
      reservationId,
      'pms.frontdesk',
    );
    const policy = await this.getOperationalPolicy(context.propertyId);
    if (context.reservation.status !== ReservationStatus.CHECKED_IN) {
      this.domainConflict(
        'RESERVATION_NOT_CHECKED_IN',
        'Only checked-in reservations can be checked out.',
        { currentStatus: context.reservation.status },
      );
    }
    const balance = calculateBalance(context.reservation);
    if (
      balance.gt(0) &&
      (policy.requireFullPaymentBeforeCheckout ||
        !dto.forceWithOutstandingBalance)
    ) {
      this.domainConflict(
        'OUTSTANDING_BALANCE',
        'Reservation has an outstanding balance.',
        { balance: balance.toString() },
      );
    }
    if (
      balance.gt(0) &&
      dto.forceWithOutstandingBalance &&
      !policy.allowForceCheckout
    ) {
      this.domainConflict(
        'CHECKOUT_NOT_ALLOWED',
        'Force checkout with outstanding balance is disabled for this property.',
      );
    }
    return this.retrySerializable(() =>
      this.prisma.$transaction(
        async (tx) => {
          const roomIds = context.reservation.rooms.map((row) => row.roomId);
          const invoice = policy.autoGenerateInvoiceOnCheckout
            ? await this.generateInvoiceInTransaction(tx, context, userId, {
                allowDuplicate: true,
              })
            : { id: null };
          await tx.reservation.update({
            where: { id: reservationId },
            data: {
              status: ReservationStatus.CHECKED_OUT,
              checkedOutAt: dto.actualDepartureAt
                ? new Date(dto.actualDepartureAt)
                : new Date(),
              checkedOutByUserId: userId,
              internalNotes: appendNote(
                context.reservation.internalNotes,
                dto.notes,
              ),
            },
          });
          await Promise.all(
            roomIds.map((roomId) =>
              tx.room.update({
                where: { id: roomId },
                data: {
                  status: RoomStatus.AVAILABLE,
                  cleaningStatus: RoomStatus.DIRTY,
                },
              }),
            ),
          );
          if (policy.createHousekeepingTaskOnCheckout) {
            await Promise.all(
              roomIds.map((roomId) =>
                tx.housekeepingTask.create({
                  data: {
                    companyId: context.companyId,
                    propertyId: context.propertyId,
                    roomId,
                    reservationId,
                    title: `Checkout cleaning for ${context.reservation.reservationCode}`,
                    status: HousekeepingStatus.PENDING,
                    priority: 2,
                    dueAt: new Date(),
                    dueDate: new Date(),
                    createdByUserId: userId,
                  },
                }),
              ),
            );
          }
          await this.writeAudit(
            tx,
            context.companyId,
            userId,
            'reservation.checked_out',
            'Reservation',
            reservationId,
            { status: context.reservation.status },
            { status: ReservationStatus.CHECKED_OUT, invoiceId: invoice.id },
          );
          await this.createInventoryOutbox(
            tx,
            context.companyId,
            context.propertyId,
            InventoryOutboxEventType.CHECKED_OUT,
            `checked-out:${reservationId}`,
            {
              ...(roomIds[0] ? { roomId: roomIds[0] } : {}),
              reservationId,
              payload: { reservationId, roomIds },
            },
          );
          return this.reservationSummary(tx, reservationId, roomIds[0]);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async noShow(userId: string, reservationId: string, dto: NoShowDto) {
    const context = await this.getReservationContext(
      userId,
      reservationId,
      'pms.frontdesk',
    );
    assertReservationTransition(
      context.reservation.status,
      ReservationStatus.NO_SHOW,
    );
    return this.prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id: reservationId },
        data: {
          status: ReservationStatus.NO_SHOW,
          noShowAt: new Date(),
          noShowByUserId: userId,
          internalNotes: appendNote(
            context.reservation.internalNotes,
            dto.reason,
          ),
        },
      });
      await this.writeAudit(
        tx,
        context.companyId,
        userId,
        'reservation.no_show',
        'Reservation',
        reservationId,
        { status: context.reservation.status },
        { status: ReservationStatus.NO_SHOW, reason: dto.reason },
      );
      await this.createInventoryOutbox(
        tx,
        context.companyId,
        context.propertyId,
        InventoryOutboxEventType.NO_SHOW,
        `no-show:${reservationId}`,
        {
          reservationId,
          payload: { reservationId, reason: dto.reason },
        },
      );
      return this.reservationSummary(tx, reservationId);
    });
  }

  async recordPayment(
    userId: string,
    reservationId: string,
    dto: RecordPaymentDto,
  ) {
    const context = await this.getReservationContext(
      userId,
      reservationId,
      'reservations.payments',
    );
    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lte(0)) {
      throw new BadRequestException({
        code: 'INVALID_PAYMENT_AMOUNT',
        message: 'Payment amount must be greater than zero.',
      });
    }
    if (dto.currency.toUpperCase() !== context.currency.toUpperCase()) {
      throw new BadRequestException({
        code: 'INVALID_CURRENCY',
        message: `Currency must be ${context.currency}.`,
      });
    }
    const paid = calculatePaid(context.reservation);
    if (dto.type === PaymentType.REFUND && amount.gt(paid)) {
      this.domainConflict(
        'INVALID_REFUND',
        'Refund cannot be greater than captured payment amount.',
        { paidAmount: paid.toString() },
      );
    }
    const normalizedIdempotencyKey = dto.idempotencyKey?.trim();
    const requestHash = hashPaymentRequest(reservationId, dto);

    return this.prisma.$transaction(async (tx) => {
      if (normalizedIdempotencyKey) {
        const existing = await tx.paymentIdempotencyRecord.findUnique({
          where: {
            companyId_idempotencyKey: {
              companyId: context.companyId,
              idempotencyKey: normalizedIdempotencyKey,
            },
          },
        });
        if (existing) {
          if (existing.requestHash !== requestHash) {
            throw new ConflictException({
              code: 'IDEMPOTENCY_KEY_REUSED',
              message:
                'Idempotency-Key was already used for a different payment request.',
            });
          }
          if (existing.status === 'COMPLETED') {
            return this.financialSummary(tx, reservationId);
          }
          throw new ConflictException({
            code: 'PAYMENT_IDEMPOTENCY_IN_PROGRESS',
            message:
              'A payment with this Idempotency-Key is already being processed.',
          });
        }
        await tx.paymentIdempotencyRecord.create({
          data: {
            companyId: context.companyId,
            reservationId,
            idempotencyKey: normalizedIdempotencyKey,
            requestHash,
            status: 'PROCESSING',
            expiresAt: addDays(new Date(), 7),
          },
        });
      }
      const payment = await tx.payment.create({
        data: {
          companyId: context.companyId,
          reservationId,
          amount,
          currency: dto.currency.toUpperCase(),
          method: dto.method,
          type: dto.type,
          status:
            dto.type === PaymentType.REFUND
              ? PaymentStatus.REFUNDED
              : PaymentStatus.PAID,
          provider: 'local',
          providerRef: dto.reference ?? null,
          idempotencyKey: normalizedIdempotencyKey ?? null,
          notes: dto.notes ?? null,
          recordedByUserId: userId,
          paidAt: new Date(),
        },
      });
      const summary = await this.financialSummary(tx, reservationId);
      await tx.reservation.update({
        where: { id: reservationId },
        data: { paymentStatus: summary.paymentStatus },
      });
      if (normalizedIdempotencyKey) {
        await tx.paymentIdempotencyRecord.update({
          where: {
            companyId_idempotencyKey: {
              companyId: context.companyId,
              idempotencyKey: normalizedIdempotencyKey,
            },
          },
          data: {
            paymentId: payment.id,
            responsePayload: summary,
            status: 'COMPLETED',
          },
        });
      }
      await this.writeAudit(
        tx,
        context.companyId,
        userId,
        dto.type === PaymentType.REFUND
          ? 'payment.refund_recorded'
          : 'payment.recorded',
        'Reservation',
        reservationId,
        undefined,
        { amount: amount.toString(), currency: dto.currency, type: dto.type },
      );
      return summary;
    });
  }

  async generateInvoice(
    userId: string,
    reservationId: string,
    dto: GenerateInvoiceDto,
  ) {
    const context = await this.getReservationContext(
      userId,
      reservationId,
      'reservations.invoices',
    );
    return this.retrySerializable(() =>
      this.prisma.$transaction(
        async (tx) => {
          const invoice = await this.generateInvoiceInTransaction(
            tx,
            context,
            userId,
            dto,
          );
          await this.writeAudit(
            tx,
            context.companyId,
            userId,
            'invoice.generated',
            'Invoice',
            invoice.id,
            undefined,
            { reservationId, invoiceNumber: invoice.invoiceNumber },
          );
          return invoice;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async downloadInvoicePdf(userId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId },
      include: {
        company: true,
        reservation: {
          include: {
            property: true,
            guest: true,
            rooms: { include: { room: true } },
            payments: true,
          },
        },
        items: true,
      },
    });
    if (!invoice) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        message: 'Invoice was not found.',
      });
    }
    await this.tenants.assertPropertyAccess(
      userId,
      invoice.reservation.propertyId,
    );
    await this.subscriptions.assertCanMutate(
      invoice.companyId,
      'reservations.invoices',
    );
    const pdf = buildInvoicePdf(invoice);
    const storageDir = join(
      process.cwd(),
      'storage',
      'invoices',
      invoice.companyId,
    );
    await mkdir(storageDir, { recursive: true });
    const fileName = `${invoice.id}.pdf`;
    await writeFile(join(storageDir, fileName), pdf);
    if (
      invoice.pdfPath !== `/storage/invoices/${invoice.companyId}/${fileName}`
    ) {
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { pdfPath: `/storage/invoices/${invoice.companyId}/${fileName}` },
      });
    }
    return {
      buffer: pdf,
      fileName: `${invoice.invoiceNumber}.pdf`,
    };
  }

  async createHousekeepingTask(userId: string, dto: CreateHousekeepingTaskDto) {
    const property = await this.tenants.assertPropertyAccess(
      userId,
      dto.propertyId,
    );
    await this.subscriptions.assertCanMutate(
      property.companyId,
      'pms.frontdesk',
    );
    return this.prisma.$transaction(async (tx) => {
      const room = await tx.room.findFirst({
        where: {
          id: dto.roomId,
          propertyId: dto.propertyId,
          companyId: property.companyId,
          deletedAt: null,
        },
      });
      if (!room) {
        throw new NotFoundException({
          code: 'ROOM_NOT_FOUND',
          message: 'Room was not found for this property.',
        });
      }
      const task = await tx.housekeepingTask.create({
        data: {
          companyId: property.companyId,
          propertyId: dto.propertyId,
          roomId: dto.roomId,
          reservationId: dto.reservationId ?? null,
          title: 'Front desk housekeeping task',
          status: dto.status ?? HousekeepingStatus.PENDING,
          priority: dto.priority ?? 2,
          assignedToUserId: dto.assignedToUserId ?? null,
          assignedTo: dto.assignedToUserId ?? null,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          dueDate: dto.dueAt ? new Date(dto.dueAt) : null,
          notes: dto.notes ?? null,
          createdByUserId: userId,
        },
      });
      if (task.status === HousekeepingStatus.IN_PROGRESS) {
        await tx.room.update({
          where: { id: dto.roomId },
          data: { cleaningStatus: RoomStatus.CLEANING },
        });
      }
      await this.writeAudit(
        tx,
        property.companyId,
        userId,
        'housekeeping.task_created',
        'HousekeepingTask',
        task.id,
        undefined,
        { roomId: dto.roomId, status: task.status },
      );
      return task;
    });
  }

  async createMaintenanceIssue(userId: string, dto: CreateMaintenanceIssueDto) {
    const property = await this.tenants.assertPropertyAccess(
      userId,
      dto.propertyId,
    );
    await this.subscriptions.assertCanMutate(
      property.companyId,
      'pms.frontdesk',
    );
    return this.prisma.$transaction(async (tx) => {
      if (dto.roomId) {
        const room = await tx.room.findFirst({
          where: {
            id: dto.roomId,
            propertyId: dto.propertyId,
            companyId: property.companyId,
            deletedAt: null,
          },
        });
        if (!room) {
          throw new NotFoundException({
            code: 'ROOM_NOT_FOUND',
            message: 'Room was not found for this property.',
          });
        }
      }
      const issue = await tx.maintenanceIssue.create({
        data: {
          companyId: property.companyId,
          propertyId: dto.propertyId,
          roomId: dto.roomId ?? null,
          title: dto.category,
          category: dto.category,
          description: dto.description,
          priority: dto.priority ?? 2,
          status: dto.status ?? MaintenanceStatus.OPEN,
          assignedToUserId: dto.assignedToUserId ?? null,
          estimatedCost: dto.estimatedCost ?? null,
          actualCost: dto.actualCost ?? null,
          blocksRoomFromSale: dto.blocksRoomFromSale ?? false,
          notes: dto.notes ?? null,
        },
      });
      if (dto.roomId && dto.blocksRoomFromSale) {
        await tx.room.update({
          where: { id: dto.roomId },
          data: {
            status: RoomStatus.OUT_OF_SERVICE,
            maintenanceStatus: RoomStatus.MAINTENANCE,
          },
        });
        await this.createInventoryOutbox(
          tx,
          property.companyId,
          dto.propertyId,
          InventoryOutboxEventType.ROOM_MAINTENANCE_STARTED,
          `maintenance-started:${issue.id}:${dto.roomId}`,
          {
            roomId: dto.roomId,
            payload: { issueId: issue.id, roomId: dto.roomId },
          },
        );
      }
      await this.writeAudit(
        tx,
        property.companyId,
        userId,
        'maintenance.issue_created',
        'MaintenanceIssue',
        issue.id,
        undefined,
        {
          roomId: dto.roomId,
          blocksRoomFromSale: dto.blocksRoomFromSale ?? false,
        },
      );
      return issue;
    });
  }

  async updateRoomStatus(userId: string, dto: UpdateRoomStatusDto) {
    const property = await this.tenants.assertPropertyAccess(
      userId,
      dto.propertyId,
    );
    await this.subscriptions.assertCanMutate(
      property.companyId,
      'pms.frontdesk',
    );
    return this.prisma.$transaction(async (tx) => {
      const room = await tx.room.findFirst({
        where: {
          id: dto.roomId,
          propertyId: dto.propertyId,
          companyId: property.companyId,
          deletedAt: null,
        },
      });
      if (!room) {
        throw new NotFoundException({
          code: 'ROOM_NOT_FOUND',
          message: 'Room was not found for this property.',
        });
      }
      const updated = await tx.room.update({
        where: { id: dto.roomId },
        data: {
          ...(dto.status ? { status: dto.status } : {}),
          ...(dto.cleaningStatus ? { cleaningStatus: dto.cleaningStatus } : {}),
          ...(dto.maintenanceStatus
            ? { maintenanceStatus: dto.maintenanceStatus }
            : {}),
        },
      });
      await this.writeAudit(
        tx,
        property.companyId,
        userId,
        'room.status_changed',
        'Room',
        dto.roomId,
        {
          status: room.status,
          cleaningStatus: room.cleaningStatus,
          maintenanceStatus: room.maintenanceStatus,
        },
        {
          status: updated.status,
          cleaningStatus: updated.cleaningStatus,
          maintenanceStatus: updated.maintenanceStatus,
          reason: dto.reason,
        },
      );
      return updated;
    });
  }

  private async assertReservationResourcesBelongToTenant(
    dto: CreateReservationDto,
  ): Promise<void> {
    const [guest, rooms] = await Promise.all([
      this.prisma.guest.findFirst({
        where: { id: dto.guestId, companyId: dto.companyId, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.room.findMany({
        where: {
          id: { in: dto.roomIds },
          companyId: dto.companyId,
          propertyId: dto.propertyId,
          deletedAt: null,
        },
        select: { id: true },
      }),
    ]);
    if (!guest) {
      throw new BadRequestException('Guest does not belong to this company.');
    }
    if (rooms.length !== new Set(dto.roomIds).size) {
      throw new BadRequestException(
        'One or more rooms do not belong to this property.',
      );
    }
  }

  private async getReservationContext(
    userId: string,
    reservationId: string,
    feature: string,
  ) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { id: reservationId, deletedAt: null },
      include: {
        company: true,
        property: true,
        guest: true,
        rooms: { include: { room: true } },
        payments: true,
        invoices: true,
        extras: true,
      },
    });
    if (!reservation) {
      throw new NotFoundException({
        code: 'RESERVATION_NOT_FOUND',
        message: 'Reservation was not found.',
      });
    }
    const property = await this.tenants.assertPropertyAccess(
      userId,
      reservation.propertyId,
    );
    if (property.companyId !== reservation.companyId) {
      throw new BadRequestException({
        code: 'TENANT_MISMATCH',
        message: 'Reservation company does not match property company.',
      });
    }
    await this.subscriptions.assertCanMutate(reservation.companyId, feature);
    return {
      reservation,
      companyId: reservation.companyId,
      propertyId: reservation.propertyId,
      currency:
        reservation.property.currency || reservation.company.currency || 'USD',
    };
  }

  private async getOperationalPolicy(propertyId: string) {
    const policy = await this.prisma.propertyOperationalPolicy.findUnique({
      where: { propertyId },
    });
    return {
      requireCleanRoomForCheckIn: policy?.requireCleanRoomForCheckIn ?? true,
      requireGuestDetailsForCheckIn:
        policy?.requireGuestDetailsForCheckIn ?? true,
      requireIdentificationConfirmation:
        policy?.requireIdentificationConfirmation ?? true,
      requireDepositBeforeCheckIn: policy?.requireDepositBeforeCheckIn ?? false,
      minimumDepositValue: policy?.minimumDepositValue ?? new Prisma.Decimal(0),
      requireFullPaymentBeforeCheckout:
        policy?.requireFullPaymentBeforeCheckout ?? false,
      allowForceCheckout: policy?.allowForceCheckout ?? true,
      autoGenerateInvoiceOnCheckout:
        policy?.autoGenerateInvoiceOnCheckout ?? true,
      createHousekeepingTaskOnCheckout:
        policy?.createHousekeepingTaskOnCheckout ?? true,
    };
  }

  private async assertRoomAssignable(
    tx: Prisma.TransactionClient,
    reservation: ReservationActionContext['reservation'],
    roomId: string,
    options: { requireReady?: boolean } = {},
  ) {
    const room = await tx.room.findFirst({
      where: { id: roomId, companyId: reservation.companyId, deletedAt: null },
      include: { roomType: true },
    });
    if (!room) {
      throw new NotFoundException({
        code: 'ROOM_NOT_FOUND',
        message: 'Room was not found.',
      });
    }
    if (room.propertyId !== reservation.propertyId) {
      throw new BadRequestException({
        code: 'ROOM_WRONG_PROPERTY',
        message: 'Room does not belong to the reservation property.',
      });
    }
    if (room.maintenanceStatus === RoomStatus.MAINTENANCE) {
      this.domainConflict(
        'ROOM_UNDER_MAINTENANCE',
        'Room is under maintenance.',
      );
    }
    if (room.status === RoomStatus.OUT_OF_SERVICE) {
      this.domainConflict('ROOM_OUT_OF_SERVICE', 'Room is out of service.');
    }
    const unavailableStatuses: RoomStatus[] = [
      RoomStatus.MAINTENANCE,
      RoomStatus.OUT_OF_SERVICE,
    ];
    if (unavailableStatuses.includes(room.status)) {
      this.domainConflict(
        'ROOM_UNAVAILABLE',
        'Room cannot be assigned in its current status.',
        { roomStatus: room.status },
      );
    }
    const readyStatuses: RoomStatus[] = [
      RoomStatus.READY,
      RoomStatus.AVAILABLE,
    ];
    if (options.requireReady && !readyStatuses.includes(room.cleaningStatus)) {
      this.domainConflict(
        'ROOM_NOT_READY',
        'Room housekeeping status is not ready for check-in.',
        { cleaningStatus: room.cleaningStatus },
      );
    }
    if (
      reservation.status !== ReservationStatus.CHECKED_IN &&
      room.status === RoomStatus.OCCUPIED
    ) {
      this.domainConflict('ROOM_UNAVAILABLE', 'Room is currently occupied.');
    }
    return room;
  }

  private async assertNoRoomOverlap(
    tx: Prisma.TransactionClient,
    reservation: ReservationActionContext['reservation'],
    roomId: string,
  ): Promise<void> {
    const conflicts = await tx.reservationRoom.findMany({
      where: {
        roomId,
        reservationId: { not: reservation.id },
        reservation: {
          deletedAt: null,
          status: {
            in: [
              ReservationStatus.PENDING,
              ReservationStatus.CONFIRMED,
              ReservationStatus.CHECKED_IN,
              ReservationStatus.BLOCKED,
              ReservationStatus.MAINTENANCE,
            ],
          },
          checkInDate: { lt: reservation.checkOutDate },
          checkOutDate: { gt: reservation.checkInDate },
        },
      },
      include: { reservation: true, room: true },
      take: 1,
    });
    if (conflicts.length > 0) {
      throw new ConflictException({
        code: 'ROOM_ASSIGNMENT_CONFLICT',
        message: `Room ${conflicts[0]?.room.name ?? 'selected'} is already assigned for overlapping dates.`,
        reservationId: conflicts[0]?.reservationId,
      });
    }
  }

  private async reservationSummary(
    tx: Prisma.TransactionClient,
    reservationId: string,
    roomId?: string,
  ) {
    return tx.reservation
      .findUniqueOrThrow({
        where: { id: reservationId },
        include: {
          guest: true,
          rooms: { include: { room: true } },
          payments: true,
          invoices: true,
        },
      })
      .then((reservation) => ({
        reservation,
        room: roomId
          ? reservation.rooms.find((row) => row.roomId === roomId)?.room
          : undefined,
        financials: buildFinancialSummary(reservation),
      }));
  }

  private async financialSummary(
    tx: Prisma.TransactionClient,
    reservationId: string,
  ) {
    const reservation = await tx.reservation.findUniqueOrThrow({
      where: { id: reservationId },
      include: { payments: true },
    });
    return buildFinancialSummary(reservation);
  }

  private async generateInvoiceInTransaction(
    tx: Prisma.TransactionClient,
    context: ReservationActionContext,
    userId: string,
    dto: GenerateInvoiceDto,
  ) {
    const existing = await tx.invoice.findFirst({
      where: {
        reservationId: context.reservation.id,
        companyId: context.companyId,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing && !dto.allowDuplicate) {
      throw new ConflictException({
        code: 'INVOICE_ALREADY_EXISTS',
        message: 'Invoice already exists for this reservation.',
        invoiceId: existing.id,
      });
    }
    const summary = buildFinancialSummary(context.reservation);
    const invoiceNumber = await this.nextInvoiceNumber(tx, context.companyId);
    return tx.invoice.create({
      data: {
        companyId: context.companyId,
        reservationId: context.reservation.id,
        invoiceNumber,
        subtotal: context.reservation.subtotal,
        tax: context.reservation.tax,
        discount: context.reservation.discount,
        total: context.reservation.totalAmount,
        paidAmount: summary.paidAmount,
        remainingAmount: summary.balance,
        status: summary.paymentStatus,
        currency: context.currency,
        generatedByUserId: userId,
        pdfPath: `/api/reservations/${context.reservation.id}/invoices/${invoiceNumber}/download`,
        items: {
          create: [
            {
              description: `Room nights for ${context.reservation.reservationCode}`,
              quantity: 1,
              unitPrice: context.reservation.subtotal,
              taxRate: context.reservation.tax,
              total: context.reservation.totalAmount,
            },
          ],
        },
      },
      include: { items: true },
    });
  }

  private async nextInvoiceNumber(
    tx: Prisma.TransactionClient,
    companyId: string,
  ): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const count = await tx.invoice.count({ where: { companyId } });
      const value = `INV-${new Date().getFullYear()}-${String(count + 1 + attempt).padStart(6, '0')}`;
      const existing = await tx.invoice.findUnique({
        where: { companyId_invoiceNumber: { companyId, invoiceNumber: value } },
      });
      if (!existing) {
        return value;
      }
    }
    return `INV-${Date.now().toString(36).toUpperCase()}`;
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    companyId: string,
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    previousValues?: Prisma.InputJsonValue,
    newValues?: Prisma.InputJsonValue,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        companyId,
        userId,
        action,
        entityType,
        entityId,
        ...(previousValues === undefined ? {} : { previousValues }),
        ...(newValues === undefined ? {} : { newValues }),
      },
    });
  }

  private async createInventoryOutbox(
    tx: Prisma.TransactionClient,
    companyId: string,
    propertyId: string,
    eventType: InventoryOutboxEventType,
    idempotencyKey: string,
    data: {
      roomId?: string;
      roomTypeId?: string;
      reservationId?: string;
      calendarBlockId?: string;
      payload: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await tx.inventoryOutboxEvent.upsert({
      where: { companyId_idempotencyKey: { companyId, idempotencyKey } },
      update: {},
      create: {
        companyId,
        propertyId,
        roomId: data.roomId ?? null,
        roomTypeId: data.roomTypeId ?? null,
        reservationId: data.reservationId ?? null,
        calendarBlockId: data.calendarBlockId ?? null,
        eventType,
        idempotencyKey,
        payload: data.payload,
      },
    });
  }

  private domainConflict(
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ): never {
    throw new HttpException({ code, message, ...details }, HttpStatus.CONFLICT);
  }

  private async createWithConcurrencyProtection(
    dto: CreateReservationDto,
    checkInDate: Date,
    checkOutDate: Date,
    idempotencyKey?: string,
  ) {
    const requestHash = hashReservationRequest(dto);
    const normalizedIdempotencyKey = idempotencyKey?.trim();

    return this.retrySerializable(async () =>
      this.prisma.$transaction(
        async (tx) => {
          if (normalizedIdempotencyKey) {
            const existing = await tx.reservationIdempotencyRecord.findUnique({
              where: {
                companyId_idempotencyKey: {
                  companyId: dto.companyId,
                  idempotencyKey: normalizedIdempotencyKey,
                },
              },
              include: {
                reservation: {
                  include: { guest: true, rooms: { include: { room: true } } },
                },
              },
            });
            if (existing) {
              if (existing.requestHash !== requestHash) {
                throw new ConflictException(
                  'Idempotency-Key was already used for a different reservation request.',
                );
              }
              if (existing.reservation) {
                return existing.reservation;
              }
              throw new ConflictException(
                'Reservation request with this Idempotency-Key is already processing.',
              );
            }
            await tx.reservationIdempotencyRecord.create({
              data: {
                companyId: dto.companyId,
                idempotencyKey: normalizedIdempotencyKey,
                requestHash,
                status: 'PROCESSING',
              },
            });
          }

          const conflicts = await tx.reservationRoom.findMany({
            where: {
              roomId: { in: dto.roomIds },
              reservation: {
                deletedAt: null,
                status: {
                  notIn: [
                    ReservationStatus.CANCELLED,
                    ReservationStatus.NO_SHOW,
                  ],
                },
                checkInDate: { lt: checkOutDate },
                checkOutDate: { gt: checkInDate },
              },
            },
            include: { room: true },
          });
          if (conflicts.length > 0) {
            throw new ConflictException(
              `Room ${conflicts[0]?.room.name ?? 'selected'} is already booked for the requested dates.`,
            );
          }

          const totalAmount = new Prisma.Decimal(dto.subtotal)
            .plus(dto.tax)
            .minus(dto.discount ?? 0);
          const reservationData: Prisma.ReservationCreateInput = {
            company: { connect: { id: dto.companyId } },
            property: { connect: { id: dto.propertyId } },
            guest: { connect: { id: dto.guestId } },
            reservationCode: `OF-${Date.now().toString(36).toUpperCase()}`,
            bookingSource: dto.bookingSource,
            checkInDate,
            checkOutDate,
            adults: dto.adults,
            children: dto.children,
            subtotal: dto.subtotal,
            tax: dto.tax,
            discount: dto.discount ?? 0,
            totalAmount,
            rooms: {
              create: dto.roomIds.map((roomId) => ({
                room: { connect: { id: roomId } },
                pricePerNight: dto.subtotal / Math.max(dto.roomIds.length, 1),
              })),
            },
            history: [{ action: 'created', at: new Date().toISOString() }],
          };
          if (dto.status) {
            reservationData.status = dto.status;
          }
          const reservation = await tx.reservation.create({
            data: reservationData,
            include: { guest: true, rooms: { include: { room: true } } },
          });
          await this.createInventoryOutbox(
            tx,
            dto.companyId,
            dto.propertyId,
            InventoryOutboxEventType.RESERVATION_CREATED,
            `reservation-created:${reservation.id}`,
            {
              ...(dto.roomIds[0] ? { roomId: dto.roomIds[0] } : {}),
              reservationId: reservation.id,
              payload: {
                reservationId: reservation.id,
                roomIds: dto.roomIds,
                checkInDate: checkInDate.toISOString(),
                checkOutDate: checkOutDate.toISOString(),
              },
            },
          );

          if (normalizedIdempotencyKey) {
            await tx.reservationIdempotencyRecord.update({
              where: {
                companyId_idempotencyKey: {
                  companyId: dto.companyId,
                  idempotencyKey: normalizedIdempotencyKey,
                },
              },
              data: {
                reservationId: reservation.id,
                status: 'COMPLETED',
                response: { reservationId: reservation.id },
              },
            });
          }
          return reservation;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  private async retrySerializable<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        ) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new ConflictException(
          'Reservation could not be created because of concurrent inventory changes.',
        );
  }
}

function hashReservationRequest(dto: CreateReservationDto): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        companyId: dto.companyId,
        propertyId: dto.propertyId,
        guestId: dto.guestId,
        roomIds: [...dto.roomIds].sort(),
        checkInDate: dto.checkInDate,
        checkOutDate: dto.checkOutDate,
        adults: dto.adults,
        children: dto.children,
        bookingSource: dto.bookingSource,
        subtotal: dto.subtotal,
        tax: dto.tax,
        discount: dto.discount ?? 0,
        status: dto.status ?? null,
      }),
    )
    .digest('hex');
}

function hashPaymentRequest(
  reservationId: string,
  dto: RecordPaymentDto,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        reservationId,
        amount: dto.amount,
        currency: dto.currency.toUpperCase(),
        method: dto.method,
        type: dto.type,
        reference: dto.reference ?? null,
        notes: dto.notes ?? null,
      }),
    )
    .digest('hex');
}

type ReservationActionContext = Awaited<
  ReturnType<ReservationsService['getReservationContext']>
>;

type ReservationWithPayments = {
  totalAmount: Prisma.Decimal;
  payments: Array<{ amount: Prisma.Decimal; type?: PaymentType | null }>;
};

function calculatePaid(reservation: ReservationWithPayments): Prisma.Decimal {
  return reservation.payments.reduce((sum, payment) => {
    if (payment.type === PaymentType.REFUND) {
      return sum.minus(payment.amount);
    }
    return sum.plus(payment.amount);
  }, new Prisma.Decimal(0));
}

function calculateBalance(
  reservation: ReservationWithPayments,
): Prisma.Decimal {
  const balance = reservation.totalAmount.minus(calculatePaid(reservation));
  return balance.gt(0) ? balance : new Prisma.Decimal(0);
}

function buildFinancialSummary(reservation: ReservationWithPayments) {
  const paidAmount = calculatePaid(reservation);
  const balance = calculateBalance(reservation);
  const paymentStatus = balance.lte(0)
    ? PaymentStatus.PAID
    : paidAmount.gt(0)
      ? PaymentStatus.PARTIALLY_PAID
      : PaymentStatus.UNPAID;
  return {
    totalAmount: reservation.totalAmount.toString(),
    paidAmount: paidAmount.toString(),
    balance: balance.toString(),
    paymentStatus,
  };
}

function appendNote(
  existing: string | null,
  note: string | undefined,
): string | null {
  if (!note?.trim()) {
    return existing;
  }
  return [existing, `[${new Date().toISOString()}] ${note.trim()}`]
    .filter(Boolean)
    .join('\n');
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildInvoicePdf(invoice: {
  invoiceNumber: string;
  createdAt: Date;
  dueDate: Date | null;
  currency: string;
  subtotal: Prisma.Decimal;
  tax: Prisma.Decimal;
  discount: Prisma.Decimal;
  total: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  remainingAmount: Prisma.Decimal;
  company: {
    name: string;
    legalName: string | null;
    email: string | null;
    phone: string | null;
  };
  reservation: {
    reservationCode: string;
    checkInDate: Date;
    checkOutDate: Date;
    guest: { fullName: string; email: string | null; phone: string | null };
    property: {
      name: string;
      address: string;
      city: string;
      country: string;
      email: string | null;
      phone: string | null;
    };
    rooms: Array<{ room: { name: string } }>;
  };
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
    total: Prisma.Decimal;
  }>;
}): Buffer {
  const lines = [
    'OdeoniFlow Invoice',
    `Invoice: ${invoice.invoiceNumber}`,
    `Issued: ${invoice.createdAt.toISOString().slice(0, 10)}`,
    `Due: ${invoice.dueDate?.toISOString().slice(0, 10) ?? 'On receipt'}`,
    '',
    `Company: ${invoice.company.legalName ?? invoice.company.name}`,
    `Property: ${invoice.reservation.property.name}`,
    `${invoice.reservation.property.address}, ${invoice.reservation.property.city}, ${invoice.reservation.property.country}`,
    '',
    `Guest: ${invoice.reservation.guest.fullName}`,
    `Reservation: ${invoice.reservation.reservationCode}`,
    `Stay: ${invoice.reservation.checkInDate.toISOString().slice(0, 10)} to ${invoice.reservation.checkOutDate.toISOString().slice(0, 10)}`,
    `Rooms: ${invoice.reservation.rooms.map((row) => row.room.name).join(', ') || 'Unassigned'}`,
    '',
    ...invoice.items.map(
      (item) =>
        `${item.description} x${item.quantity} - ${item.total.toString()} ${invoice.currency}`,
    ),
    '',
    `Subtotal: ${invoice.subtotal.toString()} ${invoice.currency}`,
    `Tax: ${invoice.tax.toString()} ${invoice.currency}`,
    `Discount: ${invoice.discount.toString()} ${invoice.currency}`,
    `Total: ${invoice.total.toString()} ${invoice.currency}`,
    `Paid: ${invoice.paidAmount.toString()} ${invoice.currency}`,
    `Outstanding: ${invoice.remainingAmount.toString()} ${invoice.currency}`,
    '',
    'Generated by OdeoniFlow. This document is not a certified fiscal invoice unless country-specific fiscalization is configured and verified.',
  ];
  const text = lines.map(escapePdfText).join(') Tj\n0 -14 Td\n(');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
  ];
  const stream = `BT /F1 11 Tf 50 742 Td (${text}) Tj ET`;
  objects.push(
    `5 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj`,
  );
  const chunks = ['%PDF-1.4\n'];
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(chunks.join('')));
    chunks.push(`${object}\n`);
  }
  const xrefOffset = Buffer.byteLength(chunks.join(''));
  chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets.slice(1)) {
    chunks.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
  }
  chunks.push(
    `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );
  return Buffer.from(chunks.join(''));
}

function escapePdfText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)')
    .replace(/[^\x20-\x7E]/g, '?');
}
