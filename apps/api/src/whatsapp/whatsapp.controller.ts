import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import {
  ConnectWhatsAppDto,
  ReplyWhatsAppDto,
  SendWhatsAppTestDto,
  UpsertWhatsAppRecipientDto,
} from './dto';
import { WhatsAppService } from './whatsapp.service';

@ApiTags('whatsapp')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsapp: WhatsAppService) {}

  @Get('settings/:companyId')
  @RequirePermissions('whatsapp.view')
  settings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId') companyId: string,
  ) {
    return this.whatsapp.settings(user.sub, companyId);
  }

  @Post('connections')
  @RequirePermissions('whatsapp.manage')
  connect(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConnectWhatsAppDto,
  ) {
    return this.whatsapp.connect(user.sub, dto);
  }

  @Delete('connections/:companyId/:connectionId')
  @RequirePermissions('whatsapp.manage')
  disconnect(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId') companyId: string,
    @Param('connectionId') connectionId: string,
  ) {
    return this.whatsapp.disconnect(user.sub, companyId, connectionId);
  }

  @Post('recipients')
  @RequirePermissions('whatsapp.manage')
  upsertRecipient(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertWhatsAppRecipientDto,
  ) {
    return this.whatsapp.upsertRecipient(user.sub, dto);
  }

  @Post('test-message')
  @RequirePermissions('whatsapp.send')
  sendTest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendWhatsAppTestDto,
  ) {
    return this.whatsapp.sendTest(user.sub, dto);
  }

  @Post('reply')
  @RequirePermissions('whatsapp.send')
  reply(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReplyWhatsAppDto) {
    return this.whatsapp.reply(user.sub, dto);
  }

  @Get('inbox/:companyId')
  @RequirePermissions('whatsapp.view')
  inbox(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId') companyId: string,
    @Query('q') q?: string,
  ) {
    return this.whatsapp.inbox(user.sub, companyId, q);
  }
}

@ApiTags('whatsapp-webhooks')
@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  constructor(private readonly whatsapp: WhatsAppService) {}

  @Post('mock')
  mock(
    @Req() request: Request,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.whatsapp.processWebhook('mock', {
      headers,
      body: request.body,
    });
  }

  @Post('twilio')
  twilio(
    @Req() request: Request,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.whatsapp.processWebhook('twilio', {
      headers,
      body: request.body,
      url: `${request.protocol}://${request.get('host')}${request.originalUrl}`,
    });
  }

  @Get('meta')
  metaChallenge(
    @Query() query: Record<string, string | undefined>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.whatsapp.metaChallenge({ headers, body: {}, query });
  }

  @Post('meta')
  meta(
    @Req() request: Request,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.whatsapp.processWebhook('meta', {
      headers,
      body: request.body,
      rawBody: JSON.stringify(request.body),
    });
  }
}
