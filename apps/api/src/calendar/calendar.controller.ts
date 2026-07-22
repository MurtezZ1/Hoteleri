import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { CalendarService } from './calendar.service';
import {
  CalendarMoveDto,
  CalendarTimelineQueryDto,
  CreateCalendarBlockDto,
  UpdateCalendarBlockDto,
} from './dto';

@ApiTags('calendar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get('calendar/timeline')
  @RequirePermissions('calendar.view')
  timeline(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CalendarTimelineQueryDto,
  ) {
    return this.calendar.timeline(user.sub, query);
  }

  @Patch('reservations/:reservationId/calendar-move')
  @RequirePermissions('calendar.manage')
  move(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reservationId') reservationId: string,
    @Body() dto: CalendarMoveDto,
  ) {
    return this.calendar.moveReservation(user.sub, reservationId, dto);
  }

  @Patch('reservations/:reservationId/calendar-resize')
  @RequirePermissions('calendar.manage')
  resize(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reservationId') reservationId: string,
    @Body() dto: CalendarMoveDto,
  ) {
    return this.calendar.moveReservation(user.sub, reservationId, dto);
  }

  @Post('calendar/blocks')
  @RequirePermissions('calendar.manage')
  createBlock(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCalendarBlockDto,
  ) {
    return this.calendar.createBlock(user.sub, dto);
  }

  @Patch('calendar/blocks/:blockId')
  @RequirePermissions('calendar.manage')
  updateBlock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('blockId') blockId: string,
    @Body() dto: UpdateCalendarBlockDto,
  ) {
    return this.calendar.updateBlock(user.sub, blockId, dto);
  }

  @Delete('calendar/blocks/:blockId')
  @RequirePermissions('calendar.manage')
  deleteBlock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('blockId') blockId: string,
  ) {
    return this.calendar.deleteBlock(user.sub, blockId);
  }
}
