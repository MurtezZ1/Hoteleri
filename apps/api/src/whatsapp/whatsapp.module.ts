import { Module } from '@nestjs/common';
import {
  WhatsAppController,
  WhatsAppWebhookController,
} from './whatsapp.controller';
import { WhatsAppProviderFactory } from './whatsapp-provider.factory';
import { WhatsAppQueueService } from './whatsapp-queue.service';
import { WhatsAppService } from './whatsapp.service';

@Module({
  controllers: [WhatsAppController, WhatsAppWebhookController],
  providers: [WhatsAppService, WhatsAppQueueService, WhatsAppProviderFactory],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
