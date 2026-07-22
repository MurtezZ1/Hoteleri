import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BillingEventStatus,
  Prisma,
  WhatsAppConnectionStatus,
  WhatsAppMessageDirection,
  WhatsAppMessageStatus,
  WhatsAppMessageType,
  WhatsAppProviderType,
  WhatsAppTemplateStatus,
} from '@prisma/client';
import { SubscriptionGuardService } from '../common/subscription-guard.service';
import { TenantAccessService } from '../common/tenant-access.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConnectWhatsAppDto,
  ReplyWhatsAppDto,
  SendWhatsAppTestDto,
  UpsertWhatsAppRecipientDto,
} from './dto';
import {
  encryptSecret,
  hashPayload,
  isE164,
  maskSecret,
} from './whatsapp-security';
import { WhatsAppProviderFactory } from './whatsapp-provider.factory';
import { ParsedWhatsAppEvent, WebhookRequest } from './whatsapp-provider';
import {
  WhatsAppJobPayload,
  WhatsAppQueueService,
} from './whatsapp-queue.service';

type ReservationWhatsAppContext = Prisma.ReservationGetPayload<{
  include: { guest: true; property: true; rooms: { include: { room: true } } };
}>;

const defaultTemplates = [
  {
    name: 'reservation_confirmation',
    language: 'en',
    category: 'TRANSACTIONAL',
    eventType: 'reservation.confirmed',
    bodyPreview:
      'Your reservation at {{propertyName}} is confirmed for {{checkIn}}.',
    status: WhatsAppTemplateStatus.APPROVED,
  },
  {
    name: 'staff_new_reservation',
    language: 'en',
    category: 'TRANSACTIONAL',
    eventType: 'staff.new-reservation',
    bodyPreview: 'New reservation: {{guestName}} at {{propertyName}}.',
    status: WhatsAppTemplateStatus.APPROVED,
  },
];

@Injectable()
export class WhatsAppService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantAccessService,
    private readonly subscriptions: SubscriptionGuardService,
    private readonly queue: WhatsAppQueueService,
    private readonly providers: WhatsAppProviderFactory,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.providers.assertConfigured();
    this.queue.registerProcessor(
      (payload) => this.deliverQueuedMessage(payload),
      (payload, error) => this.markDeadLetter(payload.messageId, error.message),
    );
  }

  async settings(userId: string, companyId: string) {
    await this.tenants.assertCompanyAccess(userId, companyId);
    await this.seedDefaultTemplates(companyId);
    const [connections, recipients, templates, queueHealth] = await Promise.all(
      [
        this.prisma.whatsAppConnection.findMany({
          where: { companyId },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.whatsAppRecipient.findMany({
          where: { companyId },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.whatsAppTemplate.findMany({
          where: { companyId },
          orderBy: [{ eventType: 'asc' }, { language: 'asc' }],
        }),
        this.queue
          .health()
          .catch(() => ({ waiting: 0, delayed: 0, failed: 0, active: 0 })),
      ],
    );
    return {
      connections: connections.map((connection) => ({
        id: connection.id,
        provider: connection.provider,
        senderPhoneNumber: connection.senderPhoneNumber,
        businessAccountId: connection.businessAccountId,
        phoneNumberId: connection.phoneNumberId,
        status: connection.status,
        verifiedAt: connection.verifiedAt,
        encryptedAccessToken: maskSecret(connection.encryptedAccessToken),
        encryptedRefreshToken: maskSecret(connection.encryptedRefreshToken),
      })),
      recipients,
      templates,
      queue: queueHealth,
    };
  }

  async connect(userId: string, dto: ConnectWhatsAppDto) {
    await this.tenants.assertCompanyAccess(userId, dto.companyId);
    await this.subscriptions.assertCanMutate(dto.companyId, 'whatsapp.connect');
    const encryptionKey = this.encryptionKey();
    const encryptedAccessToken = dto.accessToken
      ? encryptSecret(dto.accessToken, encryptionKey)
      : null;
    return this.prisma.whatsAppConnection.upsert({
      where: {
        companyId_provider_senderPhoneNumber: {
          companyId: dto.companyId,
          provider: dto.provider as WhatsAppProviderType,
          senderPhoneNumber: dto.senderPhoneNumber,
        },
      },
      update: {
        businessAccountId: dto.businessAccountId ?? null,
        phoneNumberId: dto.phoneNumberId ?? null,
        ...(encryptedAccessToken ? { encryptedAccessToken } : {}),
        status: WhatsAppConnectionStatus.CONNECTED,
        verifiedAt: new Date(),
      },
      create: {
        companyId: dto.companyId,
        provider: dto.provider as WhatsAppProviderType,
        businessAccountId: dto.businessAccountId ?? null,
        phoneNumberId: dto.phoneNumberId ?? null,
        senderPhoneNumber: dto.senderPhoneNumber,
        encryptedAccessToken,
        status: WhatsAppConnectionStatus.CONNECTED,
        verifiedAt: new Date(),
      },
    });
  }

  async disconnect(userId: string, companyId: string, connectionId: string) {
    await this.tenants.assertCompanyAccess(userId, companyId);
    await this.subscriptions.assertCanMutate(companyId, 'whatsapp.connect');
    return this.prisma.whatsAppConnection.update({
      where: { id: connectionId },
      data: {
        status: WhatsAppConnectionStatus.DISCONNECTED,
        encryptedAccessToken: null,
        encryptedRefreshToken: null,
      },
    });
  }

  async upsertRecipient(userId: string, dto: UpsertWhatsAppRecipientDto) {
    await this.tenants.assertCompanyAccess(userId, dto.companyId);
    await this.subscriptions.assertCanMutate(
      dto.companyId,
      'whatsapp.staff-notifications',
    );
    return this.prisma.whatsAppRecipient.upsert({
      where: {
        companyId_phoneNumber: {
          companyId: dto.companyId,
          phoneNumber: dto.phoneNumber,
        },
      },
      update: {
        name: dto.name,
        notificationTypes: dto.notificationTypes,
        isActive: dto.isActive,
      },
      create: dto,
    });
  }

  async sendTest(userId: string, dto: SendWhatsAppTestDto) {
    await this.tenants.assertCompanyAccess(userId, dto.companyId);
    await this.assertWhatsAppUsage(dto.companyId, 'whatsapp.send');
    const message = await this.createOutboundMessage({
      companyId: dto.companyId,
      recipientPhone: dto.to,
      body: dto.body,
      messageType: WhatsAppMessageType.SESSION,
      idempotencyKey: `test:${dto.companyId}:${dto.to}:${hashPayload(dto.body)}`,
    });
    await this.queue.enqueue({
      companyId: dto.companyId,
      messageId: message.id,
      idempotencyKey: message.idempotencyKey,
    });
    return message;
  }

  async reply(userId: string, dto: ReplyWhatsAppDto) {
    await this.tenants.assertCompanyAccess(userId, dto.companyId);
    await this.assertWhatsAppUsage(dto.companyId, 'whatsapp.send');
    const message = await this.createOutboundMessage({
      companyId: dto.companyId,
      recipientPhone: dto.to,
      body: dto.body,
      messageType: WhatsAppMessageType.SESSION,
      idempotencyKey: `reply:${dto.companyId}:${dto.to}:${hashPayload(dto.body)}:${new Date().toISOString().slice(0, 13)}`,
    });
    await this.queue.enqueue({
      companyId: dto.companyId,
      messageId: message.id,
      idempotencyKey: message.idempotencyKey,
    });
    return message;
  }

  async enqueueReservationCreated(reservationId: string): Promise<void> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        guest: true,
        property: true,
        rooms: { include: { room: true } },
      },
    });
    if (!reservation) {
      return;
    }

    await this.enqueueGuestReservationConfirmation(reservation);
    await this.enqueueStaffNotification(
      reservation.companyId,
      'new-reservation',
      this.renderStaffReservationBody(reservation),
    );
  }

  async inbox(userId: string, companyId: string, q?: string) {
    await this.tenants.assertCompanyAccess(userId, companyId);
    await this.subscriptions.assertCanMutate(companyId, 'whatsapp.view');
    return this.prisma.whatsAppMessage.findMany({
      where: {
        companyId,
        ...(q
          ? {
              OR: [
                { body: { contains: q, mode: 'insensitive' } },
                { recipientPhone: { contains: q } },
              ],
            }
          : {}),
      },
      include: { guest: true, reservation: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async processWebhook(
    providerName: 'mock' | 'twilio' | 'meta',
    request: WebhookRequest,
  ) {
    const provider = this.providers.create(providerName);
    if (!provider.verifyWebhook(request)) {
      throw new UnauthorizedException('Invalid WhatsApp webhook signature.');
    }
    const events = provider.parseWebhook(request);
    const results = [];
    for (const event of events) {
      results.push(
        await this.processWebhookEvent(
          providerName.toUpperCase() as WhatsAppProviderType,
          event,
          request.body,
        ),
      );
    }
    return { processed: results.length, results };
  }

  async metaChallenge(request: WebhookRequest): Promise<string> {
    const provider = this.providers.create('meta');
    if (!provider.verifyWebhook(request)) {
      throw new UnauthorizedException('Invalid WhatsApp verification token.');
    }
    return request.query?.['hub.challenge'] ?? '';
  }

  async deliverQueuedMessage(payload: WhatsAppJobPayload): Promise<void> {
    const message = await this.prisma.whatsAppMessage.findFirst({
      where: { id: payload.messageId, companyId: payload.companyId },
    });
    if (!message || message.status !== WhatsAppMessageStatus.QUEUED) {
      return;
    }
    const connection = await this.activeConnection(payload.companyId);
    if (!connection) {
      await this.markFailed(
        message.id,
        'NO_CONNECTION',
        'No connected WhatsApp sender is configured.',
      );
      throw new Error('No connected WhatsApp sender is configured.');
    }
    const provider = this.providers.create(connection.provider);
    try {
      const result =
        message.messageType === WhatsAppMessageType.TEMPLATE
          ? await provider.sendTemplateMessage({
              to: message.recipientPhone,
              from: connection.senderPhoneNumber,
              templateName: 'reservation_confirmation',
              language: 'en',
              variables: {},
              idempotencyKey: message.idempotencyKey,
            })
          : await provider.sendSessionMessage({
              to: message.recipientPhone,
              from: connection.senderPhoneNumber,
              body: message.body,
              idempotencyKey: message.idempotencyKey,
            });
      await this.prisma.whatsAppMessage.update({
        where: { id: message.id },
        data: {
          senderPhone: connection.senderPhoneNumber,
          providerMessageId: result.providerMessageId,
          status: WhatsAppMessageStatus.SENT,
          sentAt: new Date(),
        },
      });
      await this.recordUsage(message.companyId, message.id);
    } catch (error) {
      await this.markFailed(
        message.id,
        'SEND_FAILED',
        error instanceof Error ? error.message : 'WhatsApp send failed.',
      );
      throw error;
    }
  }

  private async enqueueGuestReservationConfirmation(
    reservation: ReservationWhatsAppContext,
  ) {
    try {
      await this.assertWhatsAppUsage(
        reservation.companyId,
        'whatsapp.automations',
      );
      if (
        !reservation.guest.phone ||
        !isE164(reservation.guest.phone) ||
        reservation.guest.whatsappOptedOut
      ) {
        return;
      }
      await this.seedDefaultTemplates(reservation.companyId);
      const template = await this.prisma.whatsAppTemplate.findFirst({
        where: {
          companyId: reservation.companyId,
          eventType: 'reservation.confirmed',
          isActive: true,
          status: WhatsAppTemplateStatus.APPROVED,
        },
      });
      if (!template) {
        return;
      }
      if (
        template.category.toUpperCase() === 'MARKETING' &&
        !reservation.guest.whatsappConsent
      ) {
        return;
      }
      const body = template.bodyPreview
        .replace('{{propertyName}}', reservation.property.name)
        .replace(
          '{{checkIn}}',
          reservation.checkInDate.toISOString().slice(0, 10),
        );
      const message = await this.createOutboundMessage({
        companyId: reservation.companyId,
        propertyId: reservation.propertyId,
        reservationId: reservation.id,
        guestId: reservation.guestId,
        recipientPhone: reservation.guest.phone,
        body,
        templateId: template.id,
        messageType: WhatsAppMessageType.TEMPLATE,
        idempotencyKey: `reservation.confirmed:${reservation.id}`,
      });
      await this.queue.enqueue({
        companyId: reservation.companyId,
        messageId: message.id,
        idempotencyKey: message.idempotencyKey,
      });
    } catch {
      return;
    }
  }

  private async enqueueStaffNotification(
    companyId: string,
    type: string,
    body: string,
  ): Promise<void> {
    try {
      await this.assertWhatsAppUsage(companyId, 'whatsapp.staff-notifications');
      const recipients = await this.prisma.whatsAppRecipient.findMany({
        where: {
          companyId,
          isActive: true,
          OR: [
            { notificationTypes: { isEmpty: true } },
            { notificationTypes: { has: type } },
          ],
        },
      });
      await Promise.all(
        recipients.map(async (recipient) => {
          const message = await this.createOutboundMessage({
            companyId,
            recipientPhone: recipient.phoneNumber,
            body,
            messageType: WhatsAppMessageType.INTERNAL_NOTIFICATION,
            idempotencyKey: `staff.${type}:${companyId}:${recipient.phoneNumber}:${hashPayload(body)}`,
          });
          await this.queue.enqueue({
            companyId,
            messageId: message.id,
            idempotencyKey: message.idempotencyKey,
          });
        }),
      );
    } catch {
      return;
    }
  }

  private async createOutboundMessage(input: {
    companyId: string;
    propertyId?: string;
    reservationId?: string;
    guestId?: string;
    recipientPhone: string;
    body: string;
    templateId?: string;
    messageType: WhatsAppMessageType;
    idempotencyKey: string;
  }) {
    try {
      return await this.prisma.whatsAppMessage.create({
        data: {
          companyId: input.companyId,
          propertyId: input.propertyId ?? null,
          reservationId: input.reservationId ?? null,
          guestId: input.guestId ?? null,
          direction: WhatsAppMessageDirection.OUTBOUND,
          recipientPhone: input.recipientPhone,
          messageType: input.messageType,
          templateId: input.templateId ?? null,
          body: input.body,
          idempotencyKey: input.idempotencyKey,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.whatsAppMessage.findFirst({
          where: {
            companyId: input.companyId,
            idempotencyKey: input.idempotencyKey,
          },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  private async processWebhookEvent(
    provider: WhatsAppProviderType,
    event: ParsedWhatsAppEvent,
    payload: unknown,
  ) {
    const existing = await this.prisma.whatsAppWebhookEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider,
          providerEventId: event.providerEventId,
        },
      },
    });
    if (existing) {
      return { duplicate: true, providerEventId: event.providerEventId };
    }
    const connection = await this.resolveConnection(provider, event);
    const webhookEvent = await this.prisma.whatsAppWebhookEvent.create({
      data: {
        provider,
        providerEventId: event.providerEventId,
        companyId: connection?.companyId ?? null,
        payloadHash: hashPayload(payload),
        status: BillingEventStatus.RECEIVED,
      },
    });
    try {
      if (event.eventType === 'incoming') {
        await this.storeIncomingMessage(connection?.companyId, event);
      } else if (event.providerMessageId) {
        await this.updateDeliveryStatus(event);
      }
      await this.prisma.whatsAppWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: { status: BillingEventStatus.PROCESSED, processedAt: new Date() },
      });
      return { duplicate: false, providerEventId: event.providerEventId };
    } catch (error) {
      await this.prisma.whatsAppWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          status: BillingEventStatus.FAILED,
          errorMessage:
            error instanceof Error
              ? error.message
              : 'Webhook processing failed.',
        },
      });
      throw error;
    }
  }

  private async storeIncomingMessage(
    companyId: string | undefined,
    event: ParsedWhatsAppEvent,
  ): Promise<void> {
    if (!companyId || !event.senderPhone) {
      throw new NotFoundException('Could not resolve WhatsApp tenant.');
    }
    const guest = await this.prisma.guest.findFirst({
      where: { companyId, phone: event.senderPhone, deletedAt: null },
    });
    await this.prisma.whatsAppMessage.create({
      data: {
        companyId,
        guestId: guest?.id ?? null,
        direction: WhatsAppMessageDirection.INBOUND,
        recipientPhone: event.senderPhone,
        senderPhone: event.recipientPhone ?? null,
        messageType: WhatsAppMessageType.SESSION,
        body: event.body ?? '',
        providerMessageId: event.providerMessageId ?? null,
        idempotencyKey: `incoming:${event.providerEventId}`,
        status: WhatsAppMessageStatus.DELIVERED,
        deliveredAt: event.occurredAt,
      },
    });
    await this.enqueueStaffNotification(
      companyId,
      'new-guest-message',
      `New guest WhatsApp message from ${guest?.fullName ?? event.senderPhone}: ${event.body ?? ''}`,
    );
  }

  private async updateDeliveryStatus(
    event: ParsedWhatsAppEvent,
  ): Promise<void> {
    if (!event.providerMessageId) {
      return;
    }
    const status =
      event.eventType === 'delivered'
        ? WhatsAppMessageStatus.DELIVERED
        : event.eventType === 'read'
          ? WhatsAppMessageStatus.READ
          : event.eventType === 'failed'
            ? WhatsAppMessageStatus.FAILED
            : WhatsAppMessageStatus.SENT;
    const data: Prisma.WhatsAppMessageUpdateManyMutationInput = { status };
    if (status === WhatsAppMessageStatus.DELIVERED) {
      data.deliveredAt = event.occurredAt;
    }
    if (status === WhatsAppMessageStatus.READ) {
      data.readAt = event.occurredAt;
    }
    if (status === WhatsAppMessageStatus.FAILED) {
      data.failedAt = event.occurredAt;
      data.errorCode = event.errorCode ?? null;
      data.errorMessage = event.errorMessage ?? null;
    }
    await this.prisma.whatsAppMessage.updateMany({
      where: { providerMessageId: event.providerMessageId },
      data,
    });
  }

  private async resolveConnection(
    provider: WhatsAppProviderType,
    event: ParsedWhatsAppEvent,
  ) {
    const phones = [event.recipientPhone, event.senderPhone].filter(
      Boolean,
    ) as string[];
    if (!phones.length) return null;
    return this.prisma.whatsAppConnection.findFirst({
      where: {
        provider,
        senderPhoneNumber: { in: phones },
        status: WhatsAppConnectionStatus.CONNECTED,
      },
    });
  }

  private async activeConnection(companyId: string) {
    return this.prisma.whatsAppConnection.findFirst({
      where: { companyId, status: WhatsAppConnectionStatus.CONNECTED },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async assertWhatsAppUsage(
    companyId: string,
    feature: string,
  ): Promise<void> {
    await this.subscriptions.assertCanMutate(companyId, feature);
    const subscription = await this.prisma.subscription.findUnique({
      where: { companyId },
      include: { subscriptionPlan: true },
    });
    const plan = (
      subscription?.subscriptionPlan?.code ??
      subscription?.plan ??
      ''
    ).toUpperCase();
    const limit =
      plan === 'ENTERPRISE'
        ? 100_000
        : plan === 'PRO'
          ? Number(this.config.get<string>('WHATSAPP_PRO_MONTHLY_LIMIT') ?? 500)
          : 0;
    if (limit <= 0) {
      throw new ForbiddenException({
        code: 'PLAN_LIMIT_REACHED',
        feature,
        message: 'WhatsApp automation requires the PRO plan or higher.',
      });
    }
    const periodStart = new Date();
    periodStart.setUTCDate(1);
    periodStart.setUTCHours(0, 0, 0, 0);
    const count = await this.prisma.whatsAppMessage.count({
      where: {
        companyId,
        direction: WhatsAppMessageDirection.OUTBOUND,
        createdAt: { gte: periodStart },
      },
    });
    if (count >= limit) {
      throw new ForbiddenException({
        code: 'PLAN_LIMIT_REACHED',
        feature,
        limit,
        message: 'Monthly WhatsApp usage limit reached.',
      });
    }
  }

  private async recordUsage(
    companyId: string,
    messageId: string,
  ): Promise<void> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { companyId },
    });
    const periodStart = new Date();
    periodStart.setUTCDate(1);
    periodStart.setUTCHours(0, 0, 0, 0);
    const periodEnd = new Date(periodStart);
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
    await this.prisma.usageRecord.create({
      data: {
        companyId,
        subscriptionId: subscription?.id ?? null,
        metric: 'whatsapp.messages.sent',
        quantity: 1,
        periodStart,
        periodEnd,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        companyId,
        action: 'whatsapp.message.sent',
        entityType: 'WhatsAppMessage',
        entityId: messageId,
        newValues: Prisma.JsonNull,
      },
    });
  }

  private async markFailed(
    messageId: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<void> {
    await this.prisma.whatsAppMessage.update({
      where: { id: messageId },
      data: {
        status: WhatsAppMessageStatus.FAILED,
        errorCode,
        errorMessage,
        failedAt: new Date(),
      },
    });
  }

  private async markDeadLetter(
    messageId: string,
    errorMessage: string,
  ): Promise<void> {
    await this.prisma.whatsAppMessage.update({
      where: { id: messageId },
      data: {
        status: WhatsAppMessageStatus.DEAD_LETTER,
        errorCode: 'RETRIES_EXHAUSTED',
        errorMessage,
        failedAt: new Date(),
      },
    });
  }

  private async seedDefaultTemplates(companyId: string): Promise<void> {
    await Promise.all(
      defaultTemplates.map((template) =>
        this.prisma.whatsAppTemplate.upsert({
          where: {
            companyId_name_language: {
              companyId,
              name: template.name,
              language: template.language,
            },
          },
          update: {},
          create: { companyId, ...template },
        }),
      ),
    );
  }

  private renderStaffReservationBody(
    reservation: ReservationWhatsAppContext,
  ): string {
    const roomName =
      reservation.rooms.map((row) => row.room.name).join(', ') || 'Unassigned';
    return [
      'New reservation',
      `Guest: ${reservation.guest.fullName}`,
      `Property: ${reservation.property.name}`,
      `Room: ${roomName}`,
      `Check-in: ${reservation.checkInDate.toISOString().slice(0, 10)}`,
      `Check-out: ${reservation.checkOutDate.toISOString().slice(0, 10)}`,
      `Total: ${reservation.totalAmount.toString()}`,
      `Source: ${reservation.bookingSource}`,
    ].join('\n');
  }

  private encryptionKey(): string {
    return (
      this.config.get<string>('WHATSAPP_CREDENTIAL_ENCRYPTION_KEY') ??
      this.config.get<string>('JWT_REFRESH_SECRET') ??
      'local-dev-whatsapp-key'
    );
  }
}
