-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('DEPOSIT', 'PARTIAL', 'FULL', 'REFUND');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "HousekeepingStatus" ADD VALUE 'PENDING';
ALTER TYPE "HousekeepingStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "HousekeepingStatus" ADD VALUE 'INSPECTED';
ALTER TYPE "HousekeepingStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MaintenanceStatus" ADD VALUE 'CLOSED';
ALTER TYPE "MaintenanceStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'CARD_AT_PROPERTY';
ALTER TYPE "PaymentMethod" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "HousekeepingTask" ADD COLUMN     "assignedToUserId" TEXT,
ADD COLUMN     "checklist" JSONB,
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "reservationId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "generatedByUserId" TEXT,
ADD COLUMN     "pdfPath" TEXT;

-- AlterTable
ALTER TABLE "MaintenanceIssue" ADD COLUMN     "actualCost" DECIMAL(65,30),
ADD COLUMN     "assignedToUserId" TEXT,
ADD COLUMN     "blocksRoomFromSale" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "estimatedCost" DECIMAL(65,30),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "recordedByUserId" TEXT,
ADD COLUMN     "type" "PaymentType" NOT NULL DEFAULT 'PARTIAL';

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "checkedInAt" TIMESTAMP(3),
ADD COLUMN     "checkedInByUserId" TEXT,
ADD COLUMN     "checkedOutAt" TIMESTAMP(3),
ADD COLUMN     "checkedOutByUserId" TEXT,
ADD COLUMN     "noShowAt" TIMESTAMP(3),
ADD COLUMN     "noShowByUserId" TEXT;

-- CreateTable
CREATE TABLE "ReservationRoomChange" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "oldRoomId" TEXT,
    "newRoomId" TEXT NOT NULL,
    "reason" TEXT,
    "changedByUserId" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReservationRoomChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReservationRoomChange_companyId_propertyId_reservationId_idx" ON "ReservationRoomChange"("companyId", "propertyId", "reservationId");

-- CreateIndex
CREATE INDEX "ReservationRoomChange_oldRoomId_idx" ON "ReservationRoomChange"("oldRoomId");

-- CreateIndex
CREATE INDEX "ReservationRoomChange_newRoomId_idx" ON "ReservationRoomChange"("newRoomId");

-- CreateIndex
CREATE INDEX "Invoice_companyId_reservationId_idx" ON "Invoice"("companyId", "reservationId");

-- CreateIndex
CREATE INDEX "Payment_companyId_idempotencyKey_idx" ON "Payment"("companyId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_companyId_reservationId_idx" ON "Payment"("companyId", "reservationId");

-- AddForeignKey
ALTER TABLE "ReservationRoomChange" ADD CONSTRAINT "ReservationRoomChange_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationRoomChange" ADD CONSTRAINT "ReservationRoomChange_oldRoomId_fkey" FOREIGN KEY ("oldRoomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationRoomChange" ADD CONSTRAINT "ReservationRoomChange_newRoomId_fkey" FOREIGN KEY ("newRoomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
