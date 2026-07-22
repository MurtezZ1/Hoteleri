-- CreateEnum
CREATE TYPE "CalendarBlockType" AS ENUM ('BLOCKED', 'MAINTENANCE');

-- CreateTable
CREATE TABLE "CalendarBlock" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "type" "CalendarBlockType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "maintenanceIssueId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarBlock_companyId_propertyId_roomId_startDate_endDate_idx" ON "CalendarBlock"("companyId", "propertyId", "roomId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "CalendarBlock_propertyId_type_startDate_endDate_idx" ON "CalendarBlock"("propertyId", "type", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "Reservation_propertyId_status_checkInDate_checkOutDate_idx" ON "Reservation"("propertyId", "status", "checkInDate", "checkOutDate");

-- CreateIndex
CREATE INDEX "Room_propertyId_status_cleaningStatus_maintenanceStatus_idx" ON "Room"("propertyId", "status", "cleaningStatus", "maintenanceStatus");

-- AddForeignKey
ALTER TABLE "CalendarBlock" ADD CONSTRAINT "CalendarBlock_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarBlock" ADD CONSTRAINT "CalendarBlock_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarBlock" ADD CONSTRAINT "CalendarBlock_maintenanceIssueId_fkey" FOREIGN KEY ("maintenanceIssueId") REFERENCES "MaintenanceIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
