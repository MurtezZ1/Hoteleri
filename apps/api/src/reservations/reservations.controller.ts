import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import {
  AssignRoomDto,
  ChangeRoomDto,
  CheckInDto,
  CheckOutDto,
  CreateHousekeepingTaskDto,
  CreateMaintenanceIssueDto,
  CreateReservationDto,
  GenerateInvoiceDto,
  NoShowDto,
  RecordPaymentDto,
  UpdateRoomStatusDto,
} from './dto';
import { ReservationsService } from './reservations.service';

@ApiTags('reservations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Post()
  @RequirePermissions('reservations.create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReservationDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.reservations.create(user.sub, dto, idempotencyKey);
  }

  @Get(':propertyId')
  @RequirePermissions('reservations.view')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId') propertyId: string,
  ) {
    return this.reservations.list(user.sub, propertyId);
  }

  @Get(':propertyId/calendar')
  @RequirePermissions('reservations.view')
  calendar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId') propertyId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reservations.calendar(user.sub, propertyId, from, to);
  }

  @Post(':reservationId/assign-room')
  @RequirePermissions('reservations.assign-room')
  assignRoom(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reservationId') reservationId: string,
    @Body() dto: AssignRoomDto,
  ) {
    return this.reservations.assignRoom(user.sub, reservationId, dto);
  }

  @Post(':reservationId/change-room')
  @RequirePermissions('reservations.assign-room')
  changeRoom(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reservationId') reservationId: string,
    @Body() dto: ChangeRoomDto,
  ) {
    return this.reservations.changeRoom(user.sub, reservationId, dto);
  }

  @Post(':reservationId/check-in')
  @RequirePermissions('reservations.checkin')
  checkIn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reservationId') reservationId: string,
    @Body() dto: CheckInDto,
  ) {
    return this.reservations.checkIn(user.sub, reservationId, dto);
  }

  @Post(':reservationId/check-out')
  @RequirePermissions('reservations.checkout')
  checkOut(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reservationId') reservationId: string,
    @Body() dto: CheckOutDto,
  ) {
    return this.reservations.checkOut(user.sub, reservationId, dto);
  }

  @Post(':reservationId/no-show')
  @RequirePermissions('reservations.no-show')
  noShow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reservationId') reservationId: string,
    @Body() dto: NoShowDto,
  ) {
    return this.reservations.noShow(user.sub, reservationId, dto);
  }

  @Post(':reservationId/payments')
  @RequirePermissions('payments.manage')
  recordPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reservationId') reservationId: string,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.reservations.recordPayment(user.sub, reservationId, dto);
  }

  @Post(':reservationId/invoices')
  @RequirePermissions('invoices.manage')
  generateInvoice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reservationId') reservationId: string,
    @Body() dto: GenerateInvoiceDto,
  ) {
    return this.reservations.generateInvoice(user.sub, reservationId, dto);
  }
}

@ApiTags('housekeeping')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('housekeeping')
export class HousekeepingController {
  constructor(private readonly reservations: ReservationsService) {}

  @Post('tasks')
  @RequirePermissions('housekeeping.manage')
  createTask(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateHousekeepingTaskDto,
  ) {
    return this.reservations.createHousekeepingTask(user.sub, dto);
  }
}

@ApiTags('maintenance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly reservations: ReservationsService) {}

  @Post('issues')
  @RequirePermissions('maintenance.manage')
  createIssue(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMaintenanceIssueDto,
  ) {
    return this.reservations.createMaintenanceIssue(user.sub, dto);
  }

  @Post('rooms/status')
  @RequirePermissions('maintenance.manage')
  updateRoomStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateRoomStatusDto,
  ) {
    return this.reservations.updateRoomStatus(user.sub, dto);
  }
}

@ApiTags('invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get(':invoiceId/download')
  @RequirePermissions('invoices.view')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('invoiceId') invoiceId: string,
    @Res() response: Response,
  ) {
    const pdf = await this.reservations.downloadInvoicePdf(user.sub, invoiceId);
    response.setHeader('content-type', 'application/pdf');
    response.setHeader(
      'content-disposition',
      `attachment; filename="${pdf.fileName}"`,
    );
    response.send(pdf.buffer);
  }
}
