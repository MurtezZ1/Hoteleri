import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

export interface SendTemplateMessageInput {
  to: string;
  from?: string;
  templateName: string;
  language: string;
  variables: Record<string, string>;
  idempotencyKey: string;
}

export interface SendSessionMessageInput {
  to: string;
  from?: string;
  body: string;
  idempotencyKey: string;
}

export interface MessageResult {
  providerMessageId: string;
  status: 'sent' | 'queued';
}

export interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  rawBody?: string;
  query?: Record<string, string | undefined>;
  url?: string;
}

export interface ParsedWhatsAppEvent {
  providerEventId: string;
  providerMessageId?: string | undefined;
  eventType: 'sent' | 'delivered' | 'read' | 'failed' | 'incoming';
  senderPhone?: string | undefined;
  recipientPhone?: string | undefined;
  body?: string | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  occurredAt: Date;
}

export interface WhatsAppProvider {
  sendTemplateMessage(input: SendTemplateMessageInput): Promise<MessageResult>;
  sendSessionMessage(input: SendSessionMessageInput): Promise<MessageResult>;
  verifyWebhook(request: WebhookRequest): boolean;
  parseWebhook(request: WebhookRequest): ParsedWhatsAppEvent[];
}

export class MockWhatsAppProvider implements WhatsAppProvider {
  async sendTemplateMessage(
    input: SendTemplateMessageInput,
  ): Promise<MessageResult> {
    return {
      providerMessageId: `mock:${input.idempotencyKey}`,
      status: 'sent',
    };
  }

  async sendSessionMessage(
    input: SendSessionMessageInput,
  ): Promise<MessageResult> {
    return {
      providerMessageId: `mock:${input.idempotencyKey}`,
      status: 'sent',
    };
  }

  verifyWebhook(): boolean {
    return true;
  }

  parseWebhook(request: WebhookRequest): ParsedWhatsAppEvent[] {
    const body = request.body as Record<string, unknown>;
    return [
      {
        providerEventId: String(body.eventId ?? randomUUID()),
        providerMessageId:
          typeof body.messageId === 'string' ? body.messageId : undefined,
        eventType: parseEventType(body.type),
        senderPhone: typeof body.from === 'string' ? body.from : undefined,
        recipientPhone: typeof body.to === 'string' ? body.to : undefined,
        body: typeof body.body === 'string' ? body.body : undefined,
        occurredAt: new Date(),
      },
    ];
  }
}

export class TwilioWhatsAppProvider implements WhatsAppProvider {
  constructor(private readonly authToken: string) {}

  async sendTemplateMessage(
    input: SendTemplateMessageInput,
  ): Promise<MessageResult> {
    return {
      providerMessageId: `twilio:queued:${input.idempotencyKey}`,
      status: 'queued',
    };
  }

  async sendSessionMessage(
    input: SendSessionMessageInput,
  ): Promise<MessageResult> {
    return {
      providerMessageId: `twilio:queued:${input.idempotencyKey}`,
      status: 'queued',
    };
  }

  verifyWebhook(request: WebhookRequest): boolean {
    const signature = singleHeader(request.headers['x-twilio-signature']);
    if (!signature || !request.url || !this.authToken) {
      return false;
    }
    const body =
      typeof request.body === 'object' && request.body
        ? flatten(request.body as Record<string, unknown>)
        : '';
    const expected = createHmac('sha1', this.authToken)
      .update(`${request.url}${body}`)
      .digest('base64');
    return safeEqual(signature, expected);
  }

  parseWebhook(request: WebhookRequest): ParsedWhatsAppEvent[] {
    const body = request.body as Record<string, unknown>;
    return [
      {
        providerEventId: String(body.SmsSid ?? body.MessageSid ?? randomUUID()),
        providerMessageId:
          typeof body.MessageSid === 'string' ? body.MessageSid : undefined,
        eventType: twilioStatus(body.MessageStatus),
        senderPhone: cleanWhatsAppAddress(body.From),
        recipientPhone: cleanWhatsAppAddress(body.To),
        body: typeof body.Body === 'string' ? body.Body : undefined,
        occurredAt: new Date(),
      },
    ];
  }
}

export class MetaCloudWhatsAppProvider implements WhatsAppProvider {
  constructor(
    private readonly appSecret: string,
    private readonly verifyToken: string,
  ) {}

  async sendTemplateMessage(
    input: SendTemplateMessageInput,
  ): Promise<MessageResult> {
    return {
      providerMessageId: `meta:queued:${input.idempotencyKey}`,
      status: 'queued',
    };
  }

  async sendSessionMessage(
    input: SendSessionMessageInput,
  ): Promise<MessageResult> {
    return {
      providerMessageId: `meta:queued:${input.idempotencyKey}`,
      status: 'queued',
    };
  }

  verifyWebhook(request: WebhookRequest): boolean {
    const mode = request.query?.['hub.mode'];
    const token = request.query?.['hub.verify_token'];
    if (mode === 'subscribe') {
      return token === this.verifyToken;
    }
    const signature = singleHeader(request.headers['x-hub-signature-256']);
    if (!signature || !this.appSecret || !request.rawBody) {
      return false;
    }
    const expected = `sha256=${createHmac('sha256', this.appSecret).update(request.rawBody).digest('hex')}`;
    return safeEqual(signature, expected);
  }

  parseWebhook(request: WebhookRequest): ParsedWhatsAppEvent[] {
    const payload = request.body as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            messages?: unknown[];
            statuses?: unknown[];
            metadata?: { display_phone_number?: string };
          };
        }>;
      }>;
    };
    const events: ParsedWhatsAppEvent[] = [];
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        for (const status of value?.statuses ?? []) {
          const row = status as Record<string, unknown>;
          events.push({
            providerEventId: String(row.id ?? randomUUID()),
            providerMessageId: typeof row.id === 'string' ? row.id : undefined,
            eventType: parseEventType(row.status),
            recipientPhone: value?.metadata?.display_phone_number,
            occurredAt: new Date(Number(row.timestamp ?? Date.now()) * 1000),
          });
        }
        for (const message of value?.messages ?? []) {
          const row = message as Record<string, unknown>;
          events.push({
            providerEventId: String(row.id ?? randomUUID()),
            providerMessageId: typeof row.id === 'string' ? row.id : undefined,
            eventType: 'incoming',
            senderPhone: typeof row.from === 'string' ? row.from : undefined,
            recipientPhone: value?.metadata?.display_phone_number,
            body:
              typeof (row.text as Record<string, unknown> | undefined)?.body ===
              'string'
                ? String((row.text as Record<string, unknown>).body)
                : undefined,
            occurredAt: new Date(Number(row.timestamp ?? Date.now()) * 1000),
          });
        }
      }
    }
    return events;
  }
}

function parseEventType(value: unknown): ParsedWhatsAppEvent['eventType'] {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'delivered') return 'delivered';
  if (normalized === 'read') return 'read';
  if (normalized === 'failed' || normalized === 'undelivered') return 'failed';
  if (normalized === 'incoming' || normalized === 'message') return 'incoming';
  return 'sent';
}

function twilioStatus(value: unknown): ParsedWhatsAppEvent['eventType'] {
  const status = String(value ?? '').toLowerCase();
  if (status === 'delivered') return 'delivered';
  if (status === 'read') return 'read';
  if (status === 'failed' || status === 'undelivered') return 'failed';
  return 'sent';
}

function flatten(body: Record<string, unknown>): string {
  return Object.keys(body)
    .sort()
    .map((key) => `${key}${String(body[key])}`)
    .join('');
}

function cleanWhatsAppAddress(value: unknown): string | undefined {
  return typeof value === 'string'
    ? value.replace(/^whatsapp:/, '')
    : undefined;
}

function singleHeader(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
