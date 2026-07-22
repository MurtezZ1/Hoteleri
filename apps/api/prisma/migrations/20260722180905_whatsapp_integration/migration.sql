-- CreateEnum
CREATE TYPE "WhatsAppProviderType" AS ENUM ('MOCK', 'TWILIO', 'META');

-- CreateEnum
CREATE TYPE "WhatsAppConnectionStatus" AS ENUM ('DISCONNECTED', 'PENDING', 'CONNECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "WhatsAppTemplateStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'DISABLED');

-- CreateEnum
CREATE TYPE "WhatsAppMessageDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "WhatsAppMessageType" AS ENUM ('TEMPLATE', 'SESSION', 'INTERNAL_NOTIFICATION');

-- CreateEnum
CREATE TYPE "WhatsAppMessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'DEAD_LETTER');

-- AlterTable
ALTER TABLE "Guest" ADD COLUMN     "preferredCommunicationChannel" TEXT,
ADD COLUMN     "whatsappConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "whatsappConsentAt" TIMESTAMP(3),
ADD COLUMN     "whatsappConsentSource" TEXT,
ADD COLUMN     "whatsappOptedOut" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "WhatsAppConnection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" "WhatsAppProviderType" NOT NULL,
    "businessAccountId" TEXT,
    "phoneNumberId" TEXT,
    "senderPhoneNumber" TEXT NOT NULL,
    "encryptedAccessToken" TEXT,
    "encryptedRefreshToken" TEXT,
    "status" "WhatsAppConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppRecipient" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "notificationTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "providerTemplateId" TEXT,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "bodyPreview" TEXT NOT NULL,
    "status" "WhatsAppTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "propertyId" TEXT,
    "reservationId" TEXT,
    "guestId" TEXT,
    "direction" "WhatsAppMessageDirection" NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "senderPhone" TEXT,
    "messageType" "WhatsAppMessageType" NOT NULL,
    "templateId" TEXT,
    "body" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "WhatsAppMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" "WhatsAppProviderType" NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "companyId" TEXT,
    "payloadHash" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),
    "status" "BillingEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsAppConnection_senderPhoneNumber_status_idx" ON "WhatsAppConnection"("senderPhoneNumber", "status");

-- CreateIndex
CREATE INDEX "WhatsAppConnection_companyId_status_idx" ON "WhatsAppConnection"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConnection_companyId_provider_senderPhoneNumber_key" ON "WhatsAppConnection"("companyId", "provider", "senderPhoneNumber");

-- CreateIndex
CREATE INDEX "WhatsAppRecipient_companyId_isActive_idx" ON "WhatsAppRecipient"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppRecipient_companyId_phoneNumber_key" ON "WhatsAppRecipient"("companyId", "phoneNumber");

-- CreateIndex
CREATE INDEX "WhatsAppTemplate_companyId_eventType_isActive_idx" ON "WhatsAppTemplate"("companyId", "eventType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppTemplate_companyId_name_language_key" ON "WhatsAppTemplate"("companyId", "name", "language");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_companyId_status_queuedAt_idx" ON "WhatsAppMessage"("companyId", "status", "queuedAt");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_companyId_recipientPhone_createdAt_idx" ON "WhatsAppMessage"("companyId", "recipientPhone", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_reservationId_idx" ON "WhatsAppMessage"("reservationId");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_guestId_idx" ON "WhatsAppMessage"("guestId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMessage_companyId_idempotencyKey_key" ON "WhatsAppMessage"("companyId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMessage_providerMessageId_key" ON "WhatsAppMessage"("providerMessageId");

-- CreateIndex
CREATE INDEX "WhatsAppWebhookEvent_companyId_createdAt_idx" ON "WhatsAppWebhookEvent"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppWebhookEvent_payloadHash_idx" ON "WhatsAppWebhookEvent"("payloadHash");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppWebhookEvent_provider_providerEventId_key" ON "WhatsAppWebhookEvent"("provider", "providerEventId");

-- AddForeignKey
ALTER TABLE "WhatsAppConnection" ADD CONSTRAINT "WhatsAppConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppRecipient" ADD CONSTRAINT "WhatsAppRecipient_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppTemplate" ADD CONSTRAINT "WhatsAppTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WhatsAppTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppWebhookEvent" ADD CONSTRAINT "WhatsAppWebhookEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
