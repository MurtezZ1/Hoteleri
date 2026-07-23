import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryOutboxEventType,
  Prisma,
  RatePlanType,
  RateRestrictionType,
  ReservationStatus,
  RoomStatus,
  SaleStatus,
} from '@prisma/client';
import { SubscriptionGuardService } from '../common/subscription-guard.service';
import { TenantAccessService } from '../common/tenant-access.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AvailabilityQueryDto,
  BulkCreateRoomsDto,
  BulkDailyRateDto,
  BulkRoomStatusDto,
  CreateCancellationPolicyDto,
  CreateFeeRuleDto,
  CreatePromotionDto,
  CreateRatePlanDto,
  CreateRoomDto,
  CreateRoomTypeDto,
  CreateTaxProfileDto,
  PriceQuoteDto,
  UpdateRoomDto,
  UpdateRoomTypeDto,
  UpsertInventoryOverrideDto,
  UpsertRestrictionDto,
} from './dto';

const blockingReservationStatuses = [
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
  ReservationStatus.CHECKED_IN,
  ReservationStatus.BLOCKED,
  ReservationStatus.MAINTENANCE,
];

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantAccessService,
    private readonly subscriptions: SubscriptionGuardService,
  ) {}

  async createRoomType(userId: string, dto: CreateRoomTypeDto) {
    const property = await this.assertPropertyMutation(userId, dto.propertyId);
    return this.prisma.$transaction(async (tx) => {
      const roomType = await tx.roomType.create({
        data: {
          companyId: property.companyId,
          propertyId: dto.propertyId,
          name: dto.name,
          description: dto.description ?? null,
          capacity: dto.capacity,
          adultsLimit: dto.adultsLimit,
          childrenLimit: dto.childrenLimit,
          basePrice: new Prisma.Decimal(dto.basePrice),
          saleStatus: dto.saleStatus ?? SaleStatus.OPEN,
          ...(dto.amenityNames?.length
            ? {
                amenities: {
                  create: dto.amenityNames.map((name) => ({
                    amenity: {
                      connectOrCreate: {
                        where: { name },
                        create: { name },
                      },
                    },
                  })),
                },
              }
            : {}),
          ...(dto.photoUrls?.length
            ? {
                photos: {
                  create: dto.photoUrls.map((url, index) => ({
                    companyId: property.companyId,
                    propertyId: dto.propertyId,
                    url,
                    sortOrder: index,
                  })),
                },
              }
            : {}),
        },
        include: roomTypeInclude,
      });
      await this.writeAudit(
        tx,
        property.companyId,
        userId,
        'room_type.created',
        'RoomType',
        roomType.id,
        undefined,
        { roomTypeId: roomType.id, name: roomType.name },
      );
      return roomType;
    });
  }

  async listRoomTypes(userId: string, propertyId: string) {
    await this.tenants.assertPropertyAccess(userId, propertyId);
    return this.prisma.roomType.findMany({
      where: { propertyId, deletedAt: null },
      include: roomTypeInclude,
      orderBy: { name: 'asc' },
    });
  }

  async updateRoomType(
    userId: string,
    roomTypeId: string,
    dto: UpdateRoomTypeDto,
  ) {
    const existing = await this.getRoomTypeForUser(userId, roomTypeId);
    await this.subscriptions.assertCanMutate(
      existing.companyId,
      'rooms.manage',
    );
    return this.prisma.roomType.update({
      where: { id: roomTypeId },
      data: {
        ...definedOnly({
          name: dto.name,
          description: dto.description,
          capacity: dto.capacity,
          adultsLimit: dto.adultsLimit,
          childrenLimit: dto.childrenLimit,
          saleStatus: dto.saleStatus,
          isActive: dto.isActive,
        }),
        ...(dto.basePrice === undefined
          ? {}
          : { basePrice: new Prisma.Decimal(dto.basePrice) }),
      },
      include: roomTypeInclude,
    });
  }

  async deleteRoomType(userId: string, roomTypeId: string) {
    const existing = await this.getRoomTypeForUser(userId, roomTypeId);
    await this.subscriptions.assertCanMutate(
      existing.companyId,
      'rooms.manage',
    );
    const activeRooms = await this.prisma.room.count({
      where: { roomTypeId, deletedAt: null },
    });
    if (activeRooms > 0) {
      throw new ConflictException({
        code: 'ROOM_TYPE_HAS_ROOMS',
        message: 'Room type cannot be deleted while active rooms exist.',
      });
    }
    return this.prisma.roomType.update({
      where: { id: roomTypeId },
      data: {
        deletedAt: new Date(),
        isActive: false,
        saleStatus: SaleStatus.CLOSED,
      },
    });
  }

  async createRoom(userId: string, dto: CreateRoomDto) {
    const property = await this.assertPropertyMutation(userId, dto.propertyId);
    await this.assertRoomTypeBelongsToProperty(dto.roomTypeId, dto.propertyId);
    await this.subscriptions.assertCanCreateRoom(property.companyId);
    return this.prisma.room.create({
      data: {
        companyId: property.companyId,
        propertyId: dto.propertyId,
        roomTypeId: dto.roomTypeId,
        name: dto.name,
        floor: dto.floor ?? null,
        status: dto.status ?? RoomStatus.AVAILABLE,
        saleStatus: dto.saleStatus ?? SaleStatus.OPEN,
      },
      include: { roomType: true },
    });
  }

  async bulkCreateRooms(userId: string, dto: BulkCreateRoomsDto) {
    const property = await this.assertPropertyMutation(userId, dto.propertyId);
    await this.assertRoomTypeBelongsToProperty(dto.roomTypeId, dto.propertyId);
    const uniqueNames = [
      ...new Set(dto.names.map((name) => name.trim()).filter(Boolean)),
    ];
    if (uniqueNames.length === 0) {
      throw new BadRequestException('At least one room name is required.');
    }
    const roomCount = await this.prisma.room.count({
      where: { companyId: property.companyId, deletedAt: null },
    });
    for (let index = 0; index < uniqueNames.length; index += 1) {
      await this.subscriptions.assertCanCreateRoom(property.companyId);
      if (roomCount + index >= Number.MAX_SAFE_INTEGER) break;
    }
    await this.prisma.room.createMany({
      data: uniqueNames.map((name) => ({
        companyId: property.companyId,
        propertyId: dto.propertyId,
        roomTypeId: dto.roomTypeId,
        name,
        floor: dto.floor ?? null,
      })),
      skipDuplicates: true,
    });
    return this.list(userId, dto.propertyId);
  }

  async updateRoom(userId: string, roomId: string, dto: UpdateRoomDto) {
    const existing = await this.getRoomForUser(userId, roomId);
    await this.subscriptions.assertCanMutate(
      existing.companyId,
      'rooms.manage',
    );
    if (dto.roomTypeId) {
      await this.assertRoomTypeBelongsToProperty(
        dto.roomTypeId,
        existing.propertyId,
      );
    }
    return this.prisma.room.update({
      where: { id: roomId },
      data: definedOnly({
        roomTypeId: dto.roomTypeId,
        name: dto.name,
        floor: dto.floor,
        status: dto.status,
        cleaningStatus: dto.cleaningStatus,
        maintenanceStatus: dto.maintenanceStatus,
        saleStatus: dto.saleStatus,
        isActive: dto.isActive,
      }),
      include: { roomType: true },
    });
  }

  async bulkUpdateRoomStatus(userId: string, dto: BulkRoomStatusDto) {
    const property = await this.assertPropertyMutation(userId, dto.propertyId);
    const rooms = await this.prisma.room.findMany({
      where: {
        id: { in: dto.roomIds },
        propertyId: dto.propertyId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (rooms.length !== dto.roomIds.length) {
      throw new BadRequestException(
        'All rooms must belong to the selected property.',
      );
    }
    await this.prisma.room.updateMany({
      where: { id: { in: dto.roomIds }, propertyId: dto.propertyId },
      data: definedOnly({
        status: dto.status,
        cleaningStatus: dto.cleaningStatus,
        maintenanceStatus: dto.maintenanceStatus,
        saleStatus: dto.saleStatus,
      }),
    });
    await this.createInventoryOutbox(
      property.companyId,
      dto.propertyId,
      InventoryOutboxEventType.INVENTORY_OVERRIDE_UPDATED,
      `bulk-room-status:${dto.propertyId}:${Date.now()}`,
      { roomIds: dto.roomIds, status: dto.status ?? null },
    );
    return this.list(userId, dto.propertyId);
  }

  async deleteRoom(userId: string, roomId: string) {
    const existing = await this.getRoomForUser(userId, roomId);
    await this.subscriptions.assertCanMutate(
      existing.companyId,
      'rooms.manage',
    );
    return this.prisma.room.update({
      where: { id: roomId },
      data: {
        deletedAt: new Date(),
        isActive: false,
        saleStatus: SaleStatus.CLOSED,
      },
    });
  }

  async list(userId: string, propertyId: string) {
    await this.tenants.assertPropertyAccess(userId, propertyId);
    return this.prisma.room.findMany({
      where: { propertyId, deletedAt: null },
      include: { roomType: true },
      orderBy: [{ floor: 'asc' }, { name: 'asc' }],
    });
  }

  async createRatePlan(userId: string, dto: CreateRatePlanDto) {
    const property = await this.assertPropertyMutation(userId, dto.propertyId);
    const roomType = await this.assertRoomTypeBelongsToProperty(
      dto.roomTypeId,
      dto.propertyId,
    );
    return this.prisma.ratePlan.create({
      data: {
        companyId: property.companyId,
        propertyId: dto.propertyId,
        roomTypeId: dto.roomTypeId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        type: dto.type ?? RatePlanType.STANDARD,
        currency: property.currency,
        basePrice: new Prisma.Decimal(dto.basePrice),
        includedOccupancy: roomType.adultsLimit,
      },
    });
  }

  async listRatePlans(userId: string, propertyId: string) {
    await this.tenants.assertPropertyAccess(userId, propertyId);
    return this.prisma.ratePlan.findMany({
      where: { propertyId, deletedAt: null },
      include: { roomType: true, cancellationPolicy: true },
      orderBy: { code: 'asc' },
    });
  }

  async bulkUpdateRates(userId: string, dto: BulkDailyRateDto) {
    const property = await this.assertPropertyMutation(userId, dto.propertyId);
    const ratePlan = await this.prisma.ratePlan.findFirst({
      where: {
        id: dto.ratePlanId,
        propertyId: dto.propertyId,
        deletedAt: null,
      },
    });
    if (!ratePlan) {
      throw new NotFoundException('Rate plan not found.');
    }
    await this.prisma.$transaction(
      dto.rates.map((rate) =>
        this.prisma.dailyRate.upsert({
          where: {
            ratePlanId_date: {
              ratePlanId: dto.ratePlanId,
              date: atUtcDate(rate.date),
            },
          },
          update: {
            price: new Prisma.Decimal(rate.price),
            closed: rate.closed ?? false,
            currency: property.currency,
          },
          create: {
            companyId: property.companyId,
            propertyId: dto.propertyId,
            roomTypeId: ratePlan.roomTypeId,
            ratePlanId: dto.ratePlanId,
            date: atUtcDate(rate.date),
            price: new Prisma.Decimal(rate.price),
            closed: rate.closed ?? false,
            currency: property.currency,
          },
        }),
      ),
    );
    await this.createInventoryOutbox(
      property.companyId,
      dto.propertyId,
      InventoryOutboxEventType.RATE_UPDATED,
      `rate-updated:${dto.ratePlanId}:${Date.now()}`,
      { ratePlanId: dto.ratePlanId, dates: dto.rates.map((rate) => rate.date) },
    );
    return this.getRateCalendar(
      userId,
      dto.propertyId,
      dto.rates[0]?.date,
      dto.rates.at(-1)?.date,
    );
  }

  async upsertRestriction(userId: string, dto: UpsertRestrictionDto) {
    const property = await this.assertPropertyMutation(userId, dto.propertyId);
    await this.assertRoomTypeBelongsToProperty(dto.roomTypeId, dto.propertyId);
    const existing = await this.prisma.rateRestriction.findFirst({
      where: {
        propertyId: dto.propertyId,
        roomTypeId: dto.roomTypeId,
        ratePlanId: dto.ratePlanId ?? null,
        date: atUtcDate(dto.date),
        type: dto.type,
      },
    });
    const restriction = existing
      ? await this.prisma.rateRestriction.update({
          where: { id: existing.id },
          data: { value: dto.value, active: dto.active ?? true },
        })
      : await this.prisma.rateRestriction.create({
          data: {
            companyId: property.companyId,
            propertyId: dto.propertyId,
            roomTypeId: dto.roomTypeId,
            ratePlanId: dto.ratePlanId ?? null,
            date: atUtcDate(dto.date),
            type: dto.type,
            value: dto.value,
            active: dto.active ?? true,
          },
        });
    await this.createInventoryOutbox(
      property.companyId,
      dto.propertyId,
      InventoryOutboxEventType.RESTRICTION_UPDATED,
      `restriction-updated:${restriction.id}:${Date.now()}`,
      { restrictionId: restriction.id },
    );
    return restriction;
  }

  async upsertInventoryOverride(
    userId: string,
    dto: UpsertInventoryOverrideDto,
  ) {
    const property = await this.assertPropertyMutation(userId, dto.propertyId);
    await this.assertRoomTypeBelongsToProperty(dto.roomTypeId, dto.propertyId);
    if (dto.roomId) {
      await this.getRoomForUser(userId, dto.roomId);
    }
    const existing = await this.prisma.inventoryOverride.findFirst({
      where: {
        propertyId: dto.propertyId,
        roomTypeId: dto.roomTypeId,
        roomId: dto.roomId ?? null,
        date: atUtcDate(dto.date),
      },
    });
    const override = existing
      ? await this.prisma.inventoryOverride.update({
          where: { id: existing.id },
          data: {
            quantity: dto.quantity,
            stopSell: dto.stopSell ?? false,
            reason: dto.reason ?? null,
          },
        })
      : await this.prisma.inventoryOverride.create({
          data: {
            companyId: property.companyId,
            propertyId: dto.propertyId,
            roomTypeId: dto.roomTypeId,
            roomId: dto.roomId ?? null,
            date: atUtcDate(dto.date),
            quantity: dto.quantity,
            stopSell: dto.stopSell ?? false,
            reason: dto.reason ?? null,
          },
        });
    await this.createInventoryOutbox(
      property.companyId,
      dto.propertyId,
      InventoryOutboxEventType.INVENTORY_OVERRIDE_UPDATED,
      `inventory-override:${override.id}:${Date.now()}`,
      { overrideId: override.id },
    );
    return override;
  }

  async getAvailability(userId: string, query: AvailabilityQueryDto) {
    const property = await this.tenants.assertPropertyAccess(
      userId,
      query.propertyId,
    );
    const dates = dateRange(query.from, query.to);
    const roomTypes = await this.prisma.roomType.findMany({
      where: {
        propertyId: query.propertyId,
        deletedAt: null,
        isActive: true,
        ...(query.roomTypeId ? { id: query.roomTypeId } : {}),
      },
      include: { rooms: { where: { deletedAt: null, isActive: true } } },
      orderBy: { name: 'asc' },
    });
    const [reservations, blocks, overrides, restrictions] = await Promise.all([
      this.prisma.reservationRoom.findMany({
        where: {
          room: { propertyId: query.propertyId },
          reservation: {
            companyId: property.companyId,
            deletedAt: null,
            status: { in: blockingReservationStatuses },
            checkInDate: { lt: atUtcDate(query.to) },
            checkOutDate: { gt: atUtcDate(query.from) },
          },
        },
        include: { reservation: true, room: true },
      }),
      this.prisma.calendarBlock.findMany({
        where: {
          propertyId: query.propertyId,
          deletedAt: null,
          startDate: { lt: atUtcDate(query.to) },
          endDate: { gt: atUtcDate(query.from) },
        },
        include: { room: true },
      }),
      this.prisma.inventoryOverride.findMany({
        where: {
          propertyId: query.propertyId,
          date: { gte: atUtcDate(query.from), lt: atUtcDate(query.to) },
        },
      }),
      this.prisma.rateRestriction.findMany({
        where: {
          propertyId: query.propertyId,
          active: true,
          date: { gte: atUtcDate(query.from), lt: atUtcDate(query.to) },
        },
      }),
    ]);

    return {
      propertyId: query.propertyId,
      from: query.from,
      to: query.to,
      roomTypes: roomTypes.map((roomType) => ({
        roomTypeId: roomType.id,
        name: roomType.name,
        days: dates.map((date) => {
          const physicalRooms = roomType.rooms.filter(
            (room) =>
              room.status !== RoomStatus.OUT_OF_SERVICE &&
              room.status !== RoomStatus.MAINTENANCE &&
              room.maintenanceStatus !== RoomStatus.MAINTENANCE &&
              room.saleStatus === SaleStatus.OPEN,
          );
          const reservedRoomIds = new Set(
            reservations
              .filter((row) => row.room.roomTypeId === roomType.id)
              .filter((row) =>
                overlapsNight(
                  date,
                  row.reservation.checkInDate,
                  row.reservation.checkOutDate,
                ),
              )
              .map((row) => row.roomId),
          );
          const blockedRoomIds = new Set(
            blocks
              .filter((block) => block.room.roomTypeId === roomType.id)
              .filter((block) =>
                overlapsNight(date, block.startDate, block.endDate),
              )
              .map((block) => block.roomId),
          );
          const override = overrides.find(
            (row) =>
              row.roomTypeId === roomType.id &&
              sameDate(row.date, date) &&
              row.roomId === null,
          );
          const dayRestrictions = restrictions.filter(
            (row) => row.roomTypeId === roomType.id && sameDate(row.date, date),
          );
          const stopSell =
            roomType.saleStatus !== SaleStatus.OPEN ||
            override?.stopSell ||
            dayRestrictions.some(
              (row) => row.type === RateRestrictionType.STOP_SELL,
            );
          const calculatedAvailable =
            physicalRooms.length - unionSize(reservedRoomIds, blockedRoomIds);
          const available = stopSell
            ? 0
            : Math.max(0, override?.quantity ?? calculatedAvailable);
          return {
            date: toDateKey(date),
            physicalRooms: physicalRooms.length,
            reserved: reservedRoomIds.size,
            blocked: blockedRoomIds.size,
            available,
            stopSell,
            minStay: restrictionValue(
              dayRestrictions,
              RateRestrictionType.MIN_STAY,
            ),
            maxStay: restrictionValue(
              dayRestrictions,
              RateRestrictionType.MAX_STAY,
            ),
            closedToArrival: dayRestrictions.some(
              (row) => row.type === RateRestrictionType.CTA,
            ),
            closedToDeparture: dayRestrictions.some(
              (row) => row.type === RateRestrictionType.CTD,
            ),
          };
        }),
      })),
    };
  }

  async getRateCalendar(
    userId: string,
    propertyId: string,
    from?: string,
    to?: string,
  ) {
    await this.tenants.assertPropertyAccess(userId, propertyId);
    const start = atUtcDate(from ?? new Date().toISOString());
    const end = atUtcDate(to ?? addDays(start, 30).toISOString());
    return this.prisma.ratePlan.findMany({
      where: { propertyId, deletedAt: null },
      include: {
        roomType: true,
        dailyRates: {
          where: { date: { gte: start, lte: end } },
          orderBy: { date: 'asc' },
        },
        restrictions: {
          where: { date: { gte: start, lte: end }, active: true },
          orderBy: { date: 'asc' },
        },
      },
      orderBy: [{ roomType: { name: 'asc' } }, { code: 'asc' }],
    });
  }

  async priceQuote(userId: string, dto: PriceQuoteDto) {
    await this.tenants.assertPropertyAccess(userId, dto.propertyId);
    const ratePlan = await this.prisma.ratePlan.findFirst({
      where: {
        id: dto.ratePlanId,
        propertyId: dto.propertyId,
        active: true,
        deletedAt: null,
      },
      include: {
        dailyRates: {
          where: {
            date: {
              gte: atUtcDate(dto.checkInDate),
              lt: atUtcDate(dto.checkOutDate),
            },
          },
        },
        promotions: {
          where: {
            active: true,
            ...(dto.promotionCode
              ? { code: dto.promotionCode.toUpperCase() }
              : {}),
            startsAt: { lte: atUtcDate(dto.checkInDate) },
            endsAt: { gte: atUtcDate(dto.checkOutDate) },
          },
        },
      },
    });
    if (!ratePlan) {
      throw new NotFoundException('Rate plan not found.');
    }
    const nights = dateRange(dto.checkInDate, dto.checkOutDate);
    if (nights.length === 0) {
      throw new BadRequestException('Stay must include at least one night.');
    }
    const subtotal = nights.reduce((sum, date) => {
      const daily = ratePlan.dailyRates.find((rate) =>
        sameDate(rate.date, date),
      );
      if (daily?.closed) {
        throw new ConflictException({
          code: 'RATE_CLOSED',
          message: `Rate is closed on ${toDateKey(date)}.`,
        });
      }
      return sum.plus(daily?.price ?? ratePlan.basePrice);
    }, new Prisma.Decimal(0));
    const extraAdults = Math.max(0, dto.adults - ratePlan.includedOccupancy);
    const extraGuestTotal = new Prisma.Decimal(extraAdults)
      .mul(ratePlan.extraAdultPrice)
      .plus(new Prisma.Decimal(dto.children).mul(ratePlan.extraChildPrice))
      .mul(nights.length);
    const beforeDiscount = subtotal.plus(extraGuestTotal);
    const promotion = ratePlan.promotions[0];
    const discount = promotion
      ? promotion.type === 'PERCENTAGE'
        ? beforeDiscount.mul(promotion.value).div(100)
        : promotion.value
      : new Prisma.Decimal(0);
    const total = beforeDiscount.minus(discount);
    return {
      currency: ratePlan.currency,
      nights: nights.length,
      subtotal: subtotal.toString(),
      extraGuestTotal: extraGuestTotal.toString(),
      discount: discount.toString(),
      total: total.gt(0) ? total.toString() : '0',
      promotionCode: promotion?.code ?? null,
    };
  }

  async createCancellationPolicy(
    userId: string,
    dto: CreateCancellationPolicyDto,
  ) {
    const property = await this.assertPropertyMutation(userId, dto.propertyId);
    return this.prisma.cancellationPolicy.create({
      data: {
        companyId: property.companyId,
        propertyId: dto.propertyId,
        name: dto.name,
        description: dto.description ?? null,
        refundableUntilHoursBeforeCheckIn:
          dto.refundableUntilHoursBeforeCheckIn ?? null,
        penaltyPercent: new Prisma.Decimal(dto.penaltyPercent ?? 0),
      },
    });
  }

  async createTaxProfile(userId: string, dto: CreateTaxProfileDto) {
    const property = await this.assertPropertyMutation(userId, dto.propertyId);
    return this.prisma.taxProfile.create({
      data: {
        companyId: property.companyId,
        propertyId: dto.propertyId,
        name: dto.name,
        rules: {
          create: {
            name: dto.ruleName,
            rate: new Prisma.Decimal(dto.rate),
          },
        },
      },
      include: { rules: true },
    });
  }

  async createFeeRule(userId: string, dto: CreateFeeRuleDto) {
    const property = await this.assertPropertyMutation(userId, dto.propertyId);
    return this.prisma.feeRule.create({
      data: {
        companyId: property.companyId,
        propertyId: dto.propertyId,
        name: dto.name,
        type: dto.type,
        value: new Prisma.Decimal(dto.value),
      },
    });
  }

  async createPromotion(userId: string, dto: CreatePromotionDto) {
    const property = await this.assertPropertyMutation(userId, dto.propertyId);
    return this.prisma.promotion.create({
      data: {
        companyId: property.companyId,
        propertyId: dto.propertyId,
        ratePlanId: dto.ratePlanId ?? null,
        code: dto.code.toUpperCase(),
        name: dto.name,
        type: dto.type,
        value: new Prisma.Decimal(dto.value),
        startsAt: atUtcDate(dto.startsAt),
        endsAt: atUtcDate(dto.endsAt),
      },
    });
  }

  private async assertPropertyMutation(userId: string, propertyId: string) {
    const property = await this.tenants.assertPropertyAccess(
      userId,
      propertyId,
    );
    await this.subscriptions.assertCanMutate(
      property.companyId,
      'rooms.manage',
    );
    return property;
  }

  private async getRoomTypeForUser(userId: string, roomTypeId: string) {
    const roomType = await this.prisma.roomType.findFirst({
      where: { id: roomTypeId, deletedAt: null },
    });
    if (!roomType) throw new NotFoundException('Room type not found.');
    await this.tenants.assertPropertyAccess(userId, roomType.propertyId);
    return roomType;
  }

  private async getRoomForUser(userId: string, roomId: string) {
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, deletedAt: null },
    });
    if (!room) throw new NotFoundException('Room not found.');
    await this.tenants.assertPropertyAccess(userId, room.propertyId);
    return room;
  }

  private async assertRoomTypeBelongsToProperty(
    roomTypeId: string,
    propertyId: string,
  ) {
    const roomType = await this.prisma.roomType.findFirst({
      where: { id: roomTypeId, propertyId, deletedAt: null },
    });
    if (!roomType) {
      throw new BadRequestException(
        'Room type does not belong to the property.',
      );
    }
    return roomType;
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
    companyId: string,
    propertyId: string,
    eventType: InventoryOutboxEventType,
    idempotencyKey: string,
    payload: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.inventoryOutboxEvent.upsert({
      where: { companyId_idempotencyKey: { companyId, idempotencyKey } },
      update: {},
      create: {
        companyId,
        propertyId,
        eventType,
        idempotencyKey,
        payload,
      },
    });
  }
}

const roomTypeInclude = {
  amenities: { include: { amenity: true } },
  photos: { orderBy: { sortOrder: 'asc' as const } },
  _count: { select: { rooms: true, ratePlans: true } },
};

function definedOnly<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

function atUtcDate(value: string): Date {
  const date = new Date(value);
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function dateRange(from: string, to: string): Date[] {
  const dates: Date[] = [];
  const current = atUtcDate(from);
  const end = atUtcDate(to);
  while (current < end) {
    dates.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function sameDate(left: Date, right: Date): boolean {
  return toDateKey(left) === toDateKey(right);
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function overlapsNight(night: Date, start: Date, end: Date): boolean {
  const next = addDays(night, 1);
  return start < next && end > night;
}

function unionSize<T>(left: Set<T>, right: Set<T>): number {
  return new Set([...left, ...right]).size;
}

function restrictionValue(
  restrictions: Array<{ type: RateRestrictionType; value: number }>,
  type: RateRestrictionType,
): number | null {
  return (
    restrictions.find((restriction) => restriction.type === type)?.value ?? null
  );
}
