import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MetaCloudWhatsAppProvider,
  MockWhatsAppProvider,
  TwilioWhatsAppProvider,
  WhatsAppProvider,
} from './whatsapp-provider';

@Injectable()
export class WhatsAppProviderFactory {
  constructor(private readonly config: ConfigService) {}

  create(provider?: string): WhatsAppProvider {
    const selected = (
      provider ??
      this.config.get<string>('WHATSAPP_PROVIDER') ??
      'mock'
    ).toLowerCase();
    if (selected === 'twilio') {
      return new TwilioWhatsAppProvider(
        this.config.get<string>('TWILIO_AUTH_TOKEN') ?? '',
      );
    }
    if (selected === 'meta') {
      return new MetaCloudWhatsAppProvider(
        this.config.get<string>('META_WHATSAPP_APP_SECRET') ?? '',
        this.config.get<string>('META_WHATSAPP_VERIFY_TOKEN') ?? '',
      );
    }
    return new MockWhatsAppProvider();
  }

  assertConfigured(): void {
    const selected = (
      this.config.get<string>('WHATSAPP_PROVIDER') ?? 'mock'
    ).toLowerCase();
    const required =
      selected === 'twilio'
        ? ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_SENDER']
        : selected === 'meta'
          ? [
              'META_WHATSAPP_ACCESS_TOKEN',
              'META_WHATSAPP_PHONE_NUMBER_ID',
              'META_WHATSAPP_VERIFY_TOKEN',
              'META_WHATSAPP_APP_SECRET',
            ]
          : [];
    const missing = required.filter((key) => !this.config.get<string>(key));
    if (missing.length > 0) {
      throw new Error(
        `Missing WhatsApp ${selected} environment variables: ${missing.join(', ')}`,
      );
    }
  }
}
