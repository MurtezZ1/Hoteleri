-- CreateTable
CREATE TABLE "ModuleRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "channel" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ModuleRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModuleRecord_companyId_moduleKey_status_idx" ON "ModuleRecord"("companyId", "moduleKey", "status");

-- CreateIndex
CREATE INDEX "ModuleRecord_companyId_moduleKey_name_idx" ON "ModuleRecord"("companyId", "moduleKey", "name");

-- AddForeignKey
ALTER TABLE "ModuleRecord" ADD CONSTRAINT "ModuleRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
