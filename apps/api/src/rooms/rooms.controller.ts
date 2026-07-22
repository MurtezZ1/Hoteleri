import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { CreateRoomDto, CreateRoomTypeDto } from './dto';
import { RoomsService } from './rooms.service';

@ApiTags('rooms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Post('types')
  @RequirePermissions('rooms.manage')
  createType(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRoomTypeDto,
  ) {
    return this.rooms.createRoomType(user.sub, dto);
  }

  @Post()
  @RequirePermissions('rooms.manage')
  createRoom(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRoomDto,
  ) {
    return this.rooms.createRoom(user.sub, dto);
  }

  @Get(':propertyId')
  @RequirePermissions('rooms.manage')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId') propertyId: string,
  ) {
    return this.rooms.list(user.sub, propertyId);
  }
}
