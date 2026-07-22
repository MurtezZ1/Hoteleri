import { PrismaClient, BookingSource, PropertyType, ReservationStatus, RoomStatus, SystemRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const permissions = [
  'reservations.view',
  'reservations.create',
  'reservations.update',
  'reservations.cancel',
  'guests.view',
  'guests.update',
  'payments.view',
  'payments.create',
  'invoices.manage',
  'reports.view',
  'rooms.manage',
  'staff.manage',
  'settings.manage',
];

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash('OdeoniFlow123!', 12);
  const user = await prisma.user.upsert({
    where: { email: 'owner@odeoniflow.test' },
    update: {},
    create: {
      email: 'owner@odeoniflow.test',
      fullName: 'Mira Stone',
      passwordHash,
      emailVerifiedAt: new Date(),
    },
  });

  const company = await prisma.company.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Blue Harbor Hospitality',
      email: 'hello@blueharbor.test',
      currency: 'USD',
      timezone: 'Europe/Warsaw',
    },
  });

  await Promise.all(
    permissions.map((key) =>
      prisma.permission.upsert({
        where: { key },
        update: {},
        create: { key, description: key },
      }),
    ),
  );

  const ownerRole = await prisma.role.upsert({
    where: { companyId_name: { companyId: company.id, name: 'Owner' } },
    update: {},
    create: { companyId: company.id, name: 'Owner', systemRole: SystemRole.HOTEL_OWNER },
  });
  const rolePermissions = await prisma.permission.findMany({ where: { key: { in: permissions } } });
  await prisma.rolePermission.createMany({
    data: rolePermissions.map((permission) => ({ roleId: ownerRole.id, permissionId: permission.id })),
    skipDuplicates: true,
  });
  await prisma.companyUser.upsert({
    where: { companyId_userId: { companyId: company.id, userId: user.id } },
    update: {},
    create: { companyId: company.id, userId: user.id, roleId: ownerRole.id, isOwner: true },
  });

  const property = await prisma.property.upsert({
    where: { slug: 'blue-harbor-suites' },
    update: {},
    create: {
      companyId: company.id,
      name: 'Blue Harbor Suites',
      slug: 'blue-harbor-suites',
      description: 'A modern coastal boutique hotel with serviced apartment comfort.',
      address: '12 Marina Avenue',
      country: 'Poland',
      city: 'Gdansk',
      currency: 'USD',
      timezone: 'Europe/Warsaw',
      propertyType: PropertyType.HOTEL,
      taxRate: 8,
      cancellationPolicy: 'Free cancellation until 48 hours before arrival.',
    },
  });

  const deluxe = await prisma.roomType.create({
    data: {
      companyId: company.id,
      propertyId: property.id,
      name: 'Deluxe King',
      capacity: 2,
      adultsLimit: 2,
      childrenLimit: 1,
      basePrice: 145,
      weekendPrice: 175,
    },
  });
  const suite = await prisma.roomType.create({
    data: {
      companyId: company.id,
      propertyId: property.id,
      name: 'Family Suite',
      capacity: 4,
      adultsLimit: 3,
      childrenLimit: 2,
      basePrice: 245,
      weekendPrice: 295,
    },
  });

  const room101 = await prisma.room.create({
    data: { companyId: company.id, propertyId: property.id, roomTypeId: deluxe.id, name: '101', status: RoomStatus.RESERVED },
  });
  await prisma.room.createMany({
    data: [
      { companyId: company.id, propertyId: property.id, roomTypeId: deluxe.id, name: '102', status: RoomStatus.AVAILABLE },
      { companyId: company.id, propertyId: property.id, roomTypeId: suite.id, name: '201', status: RoomStatus.AVAILABLE },
      { companyId: company.id, propertyId: property.id, roomTypeId: suite.id, name: '202', status: RoomStatus.DIRTY },
    ],
    skipDuplicates: true,
  });

  const guest = await prisma.guest.create({
    data: {
      companyId: company.id,
      fullName: 'Elena Novak',
      email: 'elena@example.test',
      phone: '+48100100100',
      country: 'Czech Republic',
    },
  });

  await prisma.reservation.create({
    data: {
      companyId: company.id,
      propertyId: property.id,
      guestId: guest.id,
      reservationCode: 'SF-DEMO-001',
      status: ReservationStatus.CONFIRMED,
      bookingSource: BookingSource.DIRECT,
      checkInDate: new Date('2026-07-21T15:00:00.000Z'),
      checkOutDate: new Date('2026-07-24T11:00:00.000Z'),
      adults: 2,
      subtotal: 435,
      tax: 34.8,
      totalAmount: 469.8,
      rooms: { create: [{ roomId: room101.id, pricePerNight: 145 }] },
      history: [{ action: 'seeded', at: new Date().toISOString() }],
    },
  });

  await prisma.bookingPageSetting.upsert({
    where: { propertyId: property.id },
    update: {},
    create: {
      companyId: company.id,
      propertyId: property.id,
      heroTitle: 'Book Blue Harbor Suites directly',
      heroSubtitle: 'Best available rates with no platform commission.',
    },
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
