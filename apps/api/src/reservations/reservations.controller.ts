import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { CreateReservationDto } from './dto';
import { ReservationsService } from './reservations.service';

@ApiTags('reservations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Post()
  @RequirePermissions('reservations.create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReservationDto) {
    return this.reservations.create(user.sub, dto);
  }

  @Get(':propertyId')
  @RequirePermissions('reservations.view')
  list(@CurrentUser() user: AuthenticatedUser, @Param('propertyId') propertyId: string) {
    return this.reservations.list(user.sub, propertyId);
  }

  @Get(':propertyId/calendar')
  @RequirePermissions('reservations.view')
  calendar(@CurrentUser() user: AuthenticatedUser, @Param('propertyId') propertyId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reservations.calendar(user.sub, propertyId, from, to);
  }
}
