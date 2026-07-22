-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReservationStatus" ADD VALUE 'BLOCKED';
ALTER TYPE "ReservationStatus" ADD VALUE 'MAINTENANCE';

-- CreateTable
CREATE TABLE "ReservationIdempotencyRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "reservationId" TEXT,
    "status" TEXT NOT NULL,
    "response" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservationIdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReservationIdempotencyRecord_companyId_status_createdAt_idx" ON "ReservationIdempotencyRecord"("companyId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationIdempotencyRecord_companyId_idempotencyKey_key" ON "ReservationIdempotencyRecord"("companyId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "ReservationIdempotencyRecord" ADD CONSTRAINT "ReservationIdempotencyRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationIdempotencyRecord" ADD CONSTRAINT "ReservationIdempotencyRecord_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
