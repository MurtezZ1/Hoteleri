import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { CreateGuestDto } from './dto';
import { GuestsService } from './guests.service';

@ApiTags('guests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('guests')
export class GuestsController {
  constructor(private readonly guests: GuestsService) {}

  @Post()
  @RequirePermissions('guests.update')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateGuestDto) {
    return this.guests.create(user.sub, dto);
  }

  @Get(':companyId')
  @RequirePermissions('guests.view')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId') companyId: string,
    @Query('q') q?: string,
  ) {
    return this.guests.list(user.sub, companyId, q);
  }
}
