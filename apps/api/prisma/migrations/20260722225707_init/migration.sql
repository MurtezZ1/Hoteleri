-- CreateEnum
CREATE TYPE "InventoryOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "InventoryOutboxEventType" AS ENUM ('RESERVATION_CREATED', 'RESERVATION_UPDATED', 'RESERVATION_CANCELLED', 'ROOM_ASSIGNED', 'ROOM_CHANGED', 'CHECKED_IN', 'CHECKED_OUT', 'NO_SHOW', 'CALENDAR_BLOCK_CREATED', 'CALENDAR_BLOCK_UPDATED', 'CALENDAR_BLOCK_DELETED', 'ROOM_BLOCKED', 'ROOM_UNBLOCKED', 'ROOM_MAINTENANCE_STARTED', 'ROOM_MAINTENANCE_ENDED', 'RATE_UPDATED', 'RESTRICTION_UPDATED', 'INVENTORY_OVERRIDE_UPDATED');

-- CreateEnum
CREATE TYPE "PaymentIdempotencyStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "CalendarBlock" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "InventoryOutboxEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "roomId" TEXT,
    "roomTypeId" TEXT,
    "reservationId" TEXT,
    "calendarBlockId" TEXT,
    "eventType" "InventoryOutboxEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "InventoryOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryOutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentIdempotencyRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "paymentId" TEXT,
    "responsePayload" JSONB,
    "status" "PaymentIdempotencyStatus" NOT NULL DEFAULT 'PROCESSING',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentIdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyOperationalPolicy" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "standardCheckInTime" TEXT NOT NULL DEFAULT '15:00',
    "standardCheckOutTime" TEXT NOT NULL DEFAULT '11:00',
    "allowEarlyCheckIn" BOOLEAN NOT NULL DEFAULT false,
    "earliestEarlyCheckInTime" TEXT,
    "allowLateCheckOut" BOOLEAN NOT NULL DEFAULT false,
    "latestLateCheckOutTime" TEXT,
    "requireCleanRoomForCheckIn" BOOLEAN NOT NULL DEFAULT true,
    "requireGuestDetailsForCheckIn" BOOLEAN NOT NULL DEFAULT true,
    "requireIdentificationConfirmation" BOOLEAN NOT NULL DEFAULT true,
    "requireDepositBeforeCheckIn" BOOLEAN NOT NULL DEFAULT false,
    "minimumDepositType" TEXT NOT NULL DEFAULT 'NONE',
    "minimumDepositValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "requireFullPaymentBeforeCheckout" BOOLEAN NOT NULL DEFAULT false,
    "allowForceCheckout" BOOLEAN NOT NULL DEFAULT true,
    "autoGenerateInvoiceOnCheckout" BOOLEAN NOT NULL DEFAULT true,
    "createHousekeepingTaskOnCheckout" BOOLEAN NOT NULL DEFAULT true,
    "noShowCutoffTime" TEXT NOT NULL DEFAULT '23:59',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyOperationalPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryOutboxEvent_status_availableAt_idx" ON "InventoryOutboxEvent"("status", "availableAt");

-- CreateIndex
CREATE INDEX "InventoryOutboxEvent_companyId_propertyId_status_createdAt_idx" ON "InventoryOutboxEvent"("companyId", "propertyId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryOutboxEvent_companyId_idempotencyKey_key" ON "InventoryOutboxEvent"("companyId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentIdempotencyRecord_reservationId_status_idx" ON "PaymentIdempotencyRecord"("reservationId", "status");

-- CreateIndex
CREATE INDEX "PaymentIdempotencyRecord_expiresAt_idx" ON "PaymentIdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIdempotencyRecord_companyId_idempotencyKey_key" ON "PaymentIdempotencyRecord"("companyId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyOperationalPolicy_propertyId_key" ON "PropertyOperationalPolicy"("propertyId");
