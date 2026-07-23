import {
  BookingSource,
  CalendarBlockType,
  PaymentStatus,
  PrismaClient,
  PropertyType,
  ReservationStatus,
  RoomStatus,
  SubscriptionLifecycleStatus,
  SystemRole,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import { getE2eDatabaseUrl } from './e2e-safety';

const prisma = new PrismaClient({
  datasources: { db: { url: getE2eDatabaseUrl() } },
});

const password = 'E2ePassword123!';
const companyId = '10000000-0000-4000-8000-000000000001';
const propertyId = '10000000-0000-4000-8000-000000000101';
const adminUserId = '10000000-0000-4000-8000-000000000201';
const readOnlyUserId = '10000000-0000-4000-8000-000000000202';
const crossTenantCompanyId = '20000000-0000-4000-8000-000000000001';
const crossTenantPropertyId = '20000000-0000-4000-8000-000000000101';
const crossTenantUserId = '20000000-0000-4000-8000-000000000201';
const disabledCompanyId = '30000000-0000-4000-8000-000000000001';
const disabledPropertyId = '30000000-0000-4000-8000-000000000101';
const disabledUserId = '30000000-0000-4000-8000-000000000201';

const deluxeRoomTypeId = '10000000-0000-4000-8000-000000000301';
const suiteRoomTypeId = '10000000-0000-4000-8000-000000000302';
const room101Id = '10000000-0000-4000-8000-000000000401';
const room102Id = '10000000-0000-4000-8000-000000000402';
const room103Id = '10000000-0000-4000-8000-000000000403';
const room104Id = '10000000-0000-4000-8000-000000000404';
const guestElenaId = '10000000-0000-4000-8000-000000000501';
const guestArbenId = '10000000-0000-4000-8000-000000000502';
const guestMiraId = '10000000-0000-4000-8000-000000000503';
const confirmedReservationId = '10000000-0000-4000-8000-000000000601';
const checkedInReservationId = '10000000-0000-4000-8000-000000000602';
const conflictingReservationId = '10000000-0000-4000-8000-000000000603';
const calendarBlockId = '10000000-0000-4000-8000-000000000701';
const crossTenantReservationId = '20000000-0000-4000-8000-000000000601';
const crossTenantBlockId = '20000000-0000-4000-8000-000000000701';

const permissions = [
  'reservations.view',
  'reservations.create',
  'reservations.update',
  'reservations.cancel',
  'frontdesk.view',
  'frontdesk.manage',
  'calendar.view',
  'calendar.manage',
  'reservations.checkin',
  'reservations.checkout',
  'reservations.force-checkout',
  'reservations.assign-room',
  'reservations.no-show',
  'guests.view',
  'guests.update',
  'payments.view',
  'payments.create',
  'payments.manage',
  'invoices.view',
  'invoices.manage',
  'housekeeping.manage',
  'maintenance.manage',
  'reports.view',
  'rooms.manage',
  'staff.manage',
  'settings.manage',
  'whatsapp.view',
  'whatsapp.manage',
  'whatsapp.send',
  'whatsapp.templates.manage',
];

const readOnlyPermissions = [
  'reservations.view',
  'frontdesk.view',
  'calendar.view',
  'guests.view',
  'payments.view',
  'invoices.view',
  'reports.view',
  'whatsapp.view',
];

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(password, 12);
  await seedPermissions();
  const proPlan = await seedPlan();
  await seedCompanyShell(
    companyId,
    'E2E Harbor Hotel',
    'e2e.admin@odeoniflow.test',
  );
  const ownerRoleId = await seedRole(
    companyId,
    'Owner',
    SystemRole.HOTEL_OWNER,
  );
  const readOnlyRoleId = await seedRole(companyId, 'Read Only', undefined);
  await grantPermissions(ownerRoleId, permissions);
  await grantPermissions(readOnlyRoleId, readOnlyPermissions);

  await seedTenant({
    companyId,
    propertyId,
    userId: adminUserId,
    roleId: ownerRoleId,
    email: 'e2e.admin@odeoniflow.test',
    fullName: 'E2E Admin',
    propertyName: 'E2E Harbor Hotel',
    propertySlug: 'e2e-harbor-hotel',
    planId: proPlan.id,
    lifecycleStatus: SubscriptionLifecycleStatus.ACTIVE,
    subscriptionStatus: 'active',
    passwordHash,
  });

  await seedUserMembership({
    companyId,
    propertyId,
    userId: readOnlyUserId,
    roleId: readOnlyRoleId,
    email: 'e2e.readonly@odeoniflow.test',
    fullName: 'E2E Read Only',
    passwordHash,
    isOwner: false,
  });

  await seedInventory();
  await seedReservations();
  await seedCalendarBlock();

  await seedCompanyShell(
    crossTenantCompanyId,
    'Cross Tenant Hotel',
    'e2e.cross@odeoniflow.test',
  );
  const crossRoleId = await seedRole(
    crossTenantCompanyId,
    'Owner',
    SystemRole.HOTEL_OWNER,
  );
  await grantPermissions(crossRoleId, permissions);
  await seedTenant({
    companyId: crossTenantCompanyId,
    propertyId: crossTenantPropertyId,
    userId: crossTenantUserId,
    roleId: crossRoleId,
    email: 'e2e.cross@odeoniflow.test',
    fullName: 'E2E Cross Tenant',
    propertyName: 'Cross Tenant Hotel',
    propertySlug: 'e2e-cross-tenant-hotel',
    planId: proPlan.id,
    lifecycleStatus: SubscriptionLifecycleStatus.ACTIVE,
    subscriptionStatus: 'active',
    passwordHash,
  });
  await seedCrossTenantData(crossRoleId);

  await seedCompanyShell(
    disabledCompanyId,
    'Disabled Tenant Hotel',
    'e2e.disabled@odeoniflow.test',
  );
  const disabledRoleId = await seedRole(
    disabledCompanyId,
    'Owner',
    SystemRole.HOTEL_OWNER,
  );
  await grantPermissions(disabledRoleId, permissions);
  await seedTenant({
    companyId: disabledCompanyId,
    propertyId: disabledPropertyId,
    userId: disabledUserId,
    roleId: disabledRoleId,
    email: 'e2e.disabled@odeoniflow.test',
    fullName: 'E2E Disabled Tenant',
    propertyName: 'Disabled Tenant Hotel',
    propertySlug: 'e2e-disabled-tenant-hotel',
    planId: proPlan.id,
    lifecycleStatus: SubscriptionLifecycleStatus.CANCELED,
    subscriptionStatus: 'canceled',
    passwordHash,
  });
}

async function seedPermissions(): Promise<void> {
  await Promise.all(
    permissions.map((key) =>
      prisma.permission.upsert({
        where: { key },
        update: { description: key },
        create: { key, description: key },
      }),
    ),
  );
}

async function seedPlan() {
  const plan = await prisma.subscriptionPlan.upsert({
    where: { code: 'PRO' },
    update: {
      active: true,
      maxProperties: 10,
      maxRooms: 500,
      maxStaffUsers: 50,
      channelManager: true,
      bookingEngine: true,
      premiumAutomation: true,
      advancedReports: true,
    },
    create: {
      code: 'PRO',
      name: 'Pro',
      description: 'E2E Pro plan',
      monthlyPriceCents: 9900,
      yearlyPriceCents: 99000,
      maxProperties: 10,
      maxRooms: 500,
      maxStaffUsers: 50,
      channelManager: true,
      bookingEngine: true,
      premiumAutomation: true,
      advancedReports: true,
    },
  });
  await Promise.all(
    [
      'pms.frontdesk',
      'calendar.view',
      'calendar.manage',
      'reservations.payments',
      'reservations.invoices',
      'whatsapp.view',
      'whatsapp.connect',
      'whatsapp.send',
    ].map((feature) =>
      prisma.featureEntitlement.upsert({
        where: { planId_feature: { planId: plan.id, feature } },
        update: { enabled: true, limit: null },
        create: { planId: plan.id, feature, enabled: true },
      }),
    ),
  );
  return plan;
}

async function seedCompanyShell(
  id: string,
  name: string,
  email: string,
): Promise<void> {
  await prisma.company.upsert({
    where: { id },
    update: { name, email },
    create: {
      id,
      name,
      email,
      currency: 'EUR',
      timezone: 'Europe/Warsaw',
    },
  });
}

async function seedRole(
  tenantCompanyId: string,
  name: string,
  systemRole: SystemRole | undefined,
): Promise<string> {
  const role = await prisma.role.upsert({
    where: { companyId_name: { companyId: tenantCompanyId, name } },
    update: { systemRole: systemRole ?? null },
    create: {
      companyId: tenantCompanyId,
      name,
      systemRole: systemRole ?? null,
    },
  });
  return role.id;
}

async function grantPermissions(
  roleId: string,
  permissionKeys: string[],
): Promise<void> {
  const rows = await prisma.permission.findMany({
    where: { key: { in: permissionKeys } },
  });
  await prisma.rolePermission.createMany({
    data: rows.map((permission) => ({
      roleId,
      permissionId: permission.id,
    })),
    skipDuplicates: true,
  });
}

async function seedTenant(input: {
  companyId: string;
  propertyId: string;
  userId: string;
  roleId: string;
  email: string;
  fullName: string;
  propertyName: string;
  propertySlug: string;
  planId: string;
  lifecycleStatus: SubscriptionLifecycleStatus;
  subscriptionStatus: string;
  passwordHash: string;
}): Promise<void> {
  await prisma.company.upsert({
    where: { id: input.companyId },
    update: { name: input.propertyName, timezone: 'Europe/Warsaw' },
    create: {
      id: input.companyId,
      name: input.propertyName,
      email: input.email,
      currency: 'EUR',
      timezone: 'Europe/Warsaw',
    },
  });
  await prisma.property.upsert({
    where: { id: input.propertyId },
    update: {},
    create: {
      id: input.propertyId,
      companyId: input.companyId,
      name: input.propertyName,
      slug: input.propertySlug,
      address: 'E2E Street 1',
      country: 'Poland',
      city: 'Warsaw',
      currency: 'EUR',
      timezone: 'Europe/Warsaw',
      propertyType: PropertyType.HOTEL,
    },
  });
  await seedUserMembership({ ...input, isOwner: true });
  await prisma.propertyUser.upsert({
    where: {
      propertyId_userId: {
        propertyId: input.propertyId,
        userId: input.userId,
      },
    },
    update: { roleId: input.roleId },
    create: {
      propertyId: input.propertyId,
      userId: input.userId,
      roleId: input.roleId,
    },
  });
  await prisma.subscription.upsert({
    where: { companyId: input.companyId },
    update: {
      plan: 'PRO',
      status: input.subscriptionStatus,
      planId: input.planId,
      lifecycleStatus: input.lifecycleStatus,
    },
    create: {
      companyId: input.companyId,
      plan: 'PRO',
      status: input.subscriptionStatus,
      planId: input.planId,
      lifecycleStatus: input.lifecycleStatus,
      currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
    },
  });
  await prisma.propertyOperationalPolicy.upsert({
    where: { propertyId: input.propertyId },
    update: {},
    create: {
      propertyId: input.propertyId,
      timezone: 'Europe/Warsaw',
      requireCleanRoomForCheckIn: true,
      requireGuestDetailsForCheckIn: true,
      requireIdentificationConfirmation: true,
      requireDepositBeforeCheckIn: false,
      requireFullPaymentBeforeCheckout: false,
      allowForceCheckout: true,
      autoGenerateInvoiceOnCheckout: true,
      createHousekeepingTaskOnCheckout: true,
    },
  });
}

async function seedUserMembership(input: {
  companyId: string;
  propertyId: string;
  userId: string;
  roleId: string;
  email: string;
  fullName: string;
  passwordHash: string;
  isOwner: boolean;
}): Promise<void> {
  await prisma.user.upsert({
    where: { id: input.userId },
    update: {
      email: input.email,
      fullName: input.fullName,
      passwordHash: input.passwordHash,
      emailVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
    },
    create: {
      id: input.userId,
      email: input.email,
      fullName: input.fullName,
      passwordHash: input.passwordHash,
      emailVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
    },
  });
  await prisma.companyUser.upsert({
    where: {
      companyId_userId: { companyId: input.companyId, userId: input.userId },
    },
    update: { roleId: input.roleId, isOwner: input.isOwner },
    create: {
      companyId: input.companyId,
      userId: input.userId,
      roleId: input.roleId,
      isOwner: input.isOwner,
    },
  });
  await prisma.propertyUser.upsert({
    where: {
      propertyId_userId: {
        propertyId: input.propertyId,
        userId: input.userId,
      },
    },
    update: { roleId: input.roleId },
    create: {
      propertyId: input.propertyId,
      userId: input.userId,
      roleId: input.roleId,
    },
  });
}

async function seedInventory(): Promise<void> {
  await prisma.roomType.createMany({
    data: [
      {
        id: deluxeRoomTypeId,
        companyId,
        propertyId,
        name: 'E2E Deluxe King',
        capacity: 2,
        adultsLimit: 2,
        childrenLimit: 1,
        basePrice: 150,
        weekendPrice: 180,
      },
      {
        id: suiteRoomTypeId,
        companyId,
        propertyId,
        name: 'E2E Family Suite',
        capacity: 4,
        adultsLimit: 4,
        childrenLimit: 2,
        basePrice: 260,
        weekendPrice: 310,
      },
    ],
    skipDuplicates: true,
  });
  await prisma.room.createMany({
    data: [
      {
        id: room101Id,
        companyId,
        propertyId,
        roomTypeId: deluxeRoomTypeId,
        name: '101',
        status: RoomStatus.RESERVED,
        cleaningStatus: RoomStatus.READY,
        maintenanceStatus: RoomStatus.AVAILABLE,
      },
      {
        id: room102Id,
        companyId,
        propertyId,
        roomTypeId: deluxeRoomTypeId,
        name: '102',
        status: RoomStatus.AVAILABLE,
        cleaningStatus: RoomStatus.READY,
        maintenanceStatus: RoomStatus.AVAILABLE,
      },
      {
        id: room103Id,
        companyId,
        propertyId,
        roomTypeId: deluxeRoomTypeId,
        name: '103',
        status: RoomStatus.MAINTENANCE,
        cleaningStatus: RoomStatus.READY,
        maintenanceStatus: RoomStatus.MAINTENANCE,
      },
      {
        id: room104Id,
        companyId,
        propertyId,
        roomTypeId: suiteRoomTypeId,
        name: '201',
        status: RoomStatus.OCCUPIED,
        cleaningStatus: RoomStatus.READY,
        maintenanceStatus: RoomStatus.AVAILABLE,
      },
    ],
    skipDuplicates: true,
  });
}

async function seedReservations(): Promise<void> {
  await prisma.guest.createMany({
    data: [
      {
        id: guestElenaId,
        companyId,
        fullName: 'Elena Novak',
        email: 'elena.e2e@example.test',
        phone: '+48100100100',
      },
      {
        id: guestArbenId,
        companyId,
        fullName: 'Arben Krasniqi',
        email: 'arben.e2e@example.test',
        phone: '+38344111222',
      },
      {
        id: guestMiraId,
        companyId,
        fullName: 'Mira Leka',
        email: 'mira.e2e@example.test',
        phone: '+35569111222',
      },
    ],
    skipDuplicates: true,
  });
  await createReservation({
    id: confirmedReservationId,
    guestId: guestElenaId,
    roomId: room101Id,
    code: 'E2E-CONF-001',
    status: ReservationStatus.CONFIRMED,
    checkIn: '2026-08-10T15:00:00.000Z',
    checkOut: '2026-08-12T11:00:00.000Z',
    total: 330,
    paid: 0,
  });
  await createReservation({
    id: checkedInReservationId,
    guestId: guestArbenId,
    roomId: room104Id,
    code: 'E2E-INHOUSE-001',
    status: ReservationStatus.CHECKED_IN,
    checkIn: '2026-08-09T15:00:00.000Z',
    checkOut: '2026-08-10T11:00:00.000Z',
    total: 260,
    paid: 260,
  });
  await createReservation({
    id: conflictingReservationId,
    guestId: guestMiraId,
    roomId: room102Id,
    code: 'E2E-CONFLICT-001',
    status: ReservationStatus.CONFIRMED,
    checkIn: '2026-08-13T15:00:00.000Z',
    checkOut: '2026-08-15T11:00:00.000Z',
    total: 360,
    paid: 0,
  });
}

async function createReservation(input: {
  id: string;
  guestId: string;
  roomId: string;
  code: string;
  status: ReservationStatus;
  checkIn: string;
  checkOut: string;
  total: number;
  paid: number;
}): Promise<void> {
  await prisma.reservation.create({
    data: {
      id: input.id,
      companyId,
      propertyId,
      guestId: input.guestId,
      reservationCode: input.code,
      status: input.status,
      bookingSource: BookingSource.DIRECT,
      checkInDate: new Date(input.checkIn),
      checkOutDate: new Date(input.checkOut),
      adults: 2,
      subtotal: input.total,
      tax: 0,
      totalAmount: input.total,
      paymentStatus:
        input.paid >= input.total ? PaymentStatus.PAID : PaymentStatus.UNPAID,
      checkedInAt:
        input.status === ReservationStatus.CHECKED_IN
          ? new Date('2026-08-09T15:05:00.000Z')
          : null,
      rooms: { create: [{ roomId: input.roomId, pricePerNight: input.total }] },
      ...(input.paid > 0
        ? {
            payments: {
              create: [
                {
                  companyId,
                  method: 'CASH',
                  type: 'FULL',
                  status: 'PAID',
                  amount: input.paid,
                  currency: 'EUR',
                  provider: 'mock',
                  paidAt: new Date('2026-08-09T15:06:00.000Z'),
                },
              ],
            },
          }
        : {}),
      history: [{ action: 'e2e_seeded', at: '2026-08-01T00:00:00.000Z' }],
    },
  });
}

async function seedCalendarBlock(): Promise<void> {
  await prisma.calendarBlock.create({
    data: {
      id: calendarBlockId,
      companyId,
      propertyId,
      roomId: room103Id,
      type: CalendarBlockType.MAINTENANCE,
      startDate: new Date('2026-08-10T00:00:00.000Z'),
      endDate: new Date('2026-08-12T00:00:00.000Z'),
      reason: 'E2E maintenance block',
      createdByUserId: adminUserId,
    },
  });
}

async function seedCrossTenantData(roleId: string): Promise<void> {
  const roomType = await prisma.roomType.create({
    data: {
      id: '20000000-0000-4000-8000-000000000301',
      companyId: crossTenantCompanyId,
      propertyId: crossTenantPropertyId,
      name: 'Cross Deluxe',
      capacity: 2,
      adultsLimit: 2,
      basePrice: 120,
    },
  });
  const room = await prisma.room.create({
    data: {
      id: '20000000-0000-4000-8000-000000000401',
      companyId: crossTenantCompanyId,
      propertyId: crossTenantPropertyId,
      roomTypeId: roomType.id,
      name: 'C101',
      status: RoomStatus.AVAILABLE,
    },
  });
  const guest = await prisma.guest.create({
    data: {
      id: '20000000-0000-4000-8000-000000000501',
      companyId: crossTenantCompanyId,
      fullName: 'Cross Tenant Guest',
    },
  });
  await prisma.reservation.create({
    data: {
      id: crossTenantReservationId,
      companyId: crossTenantCompanyId,
      propertyId: crossTenantPropertyId,
      guestId: guest.id,
      reservationCode: 'E2E-CROSS-001',
      status: ReservationStatus.CONFIRMED,
      bookingSource: BookingSource.DIRECT,
      checkInDate: new Date('2026-08-10T15:00:00.000Z'),
      checkOutDate: new Date('2026-08-11T11:00:00.000Z'),
      adults: 1,
      subtotal: 120,
      tax: 0,
      totalAmount: 120,
      rooms: { create: [{ roomId: room.id, pricePerNight: 120 }] },
    },
  });
  await prisma.calendarBlock.create({
    data: {
      id: crossTenantBlockId,
      companyId: crossTenantCompanyId,
      propertyId: crossTenantPropertyId,
      roomId: room.id,
      type: CalendarBlockType.BLOCKED,
      startDate: new Date('2026-08-12T00:00:00.000Z'),
      endDate: new Date('2026-08-13T00:00:00.000Z'),
      reason: 'Cross tenant block',
      createdByUserId: crossTenantUserId,
    },
  });
  await prisma.propertyUser.upsert({
    where: {
      propertyId_userId: {
        propertyId: crossTenantPropertyId,
        userId: crossTenantUserId,
      },
    },
    update: { roleId },
    create: {
      propertyId: crossTenantPropertyId,
      userId: crossTenantUserId,
      roleId,
    },
  });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
