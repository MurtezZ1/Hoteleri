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
import {
  AvailabilityQueryDto,
  BulkCreateRoomsDto,
  BulkDailyRateDto,
  BulkRoomStatusDto,
  CreateCancellationPolicyDto,
  CreateFeeRuleDto,
  CreatePromotionDto,
  CreateRatePlanDto,
  CreateRoomDto,
  CreateRoomTypeDto,
  CreateTaxProfileDto,
  PriceQuoteDto,
  UpdateRoomDto,
  UpdateRoomTypeDto,
  UpsertInventoryOverrideDto,
  UpsertRestrictionDto,
} from './dto';
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

  @Get('types/:propertyId')
  @RequirePermissions('rooms.manage')
  listTypes(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId') propertyId: string,
  ) {
    return this.rooms.listRoomTypes(user.sub, propertyId);
  }

  @Patch('types/:roomTypeId')
  @RequirePermissions('rooms.manage')
  updateType(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roomTypeId') roomTypeId: string,
    @Body() dto: UpdateRoomTypeDto,
  ) {
    return this.rooms.updateRoomType(user.sub, roomTypeId, dto);
  }

  @Delete('types/:roomTypeId')
  @RequirePermissions('rooms.manage')
  deleteType(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roomTypeId') roomTypeId: string,
  ) {
    return this.rooms.deleteRoomType(user.sub, roomTypeId);
  }

  @Post()
  @RequirePermissions('rooms.manage')
  createRoom(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRoomDto,
  ) {
    return this.rooms.createRoom(user.sub, dto);
  }

  @Post('bulk')
  @RequirePermissions('rooms.manage')
  bulkCreateRooms(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkCreateRoomsDto,
  ) {
    return this.rooms.bulkCreateRooms(user.sub, dto);
  }

  @Patch('bulk/status')
  @RequirePermissions('rooms.manage')
  bulkStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkRoomStatusDto,
  ) {
    return this.rooms.bulkUpdateRoomStatus(user.sub, dto);
  }

  @Patch(':roomId')
  @RequirePermissions('rooms.manage')
  updateRoom(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roomId') roomId: string,
    @Body() dto: UpdateRoomDto,
  ) {
    return this.rooms.updateRoom(user.sub, roomId, dto);
  }

  @Delete(':roomId')
  @RequirePermissions('rooms.manage')
  deleteRoom(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roomId') roomId: string,
  ) {
    return this.rooms.deleteRoom(user.sub, roomId);
  }

  @Get('property/:propertyId')
  @RequirePermissions('rooms.manage')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId') propertyId: string,
  ) {
    return this.rooms.list(user.sub, propertyId);
  }

  @Get(':propertyId')
  @RequirePermissions('rooms.manage')
  legacyList(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId') propertyId: string,
  ) {
    return this.rooms.list(user.sub, propertyId);
  }

  @Post('rate-plans')
  @RequirePermissions('rooms.manage')
  createRatePlan(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRatePlanDto,
  ) {
    return this.rooms.createRatePlan(user.sub, dto);
  }

  @Get('rate-plans/:propertyId')
  @RequirePermissions('rooms.manage')
  listRatePlans(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId') propertyId: string,
  ) {
    return this.rooms.listRatePlans(user.sub, propertyId);
  }

  @Patch('rates/bulk')
  @RequirePermissions('rooms.manage')
  bulkRates(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkDailyRateDto,
  ) {
    return this.rooms.bulkUpdateRates(user.sub, dto);
  }

  @Post('restrictions')
  @RequirePermissions('rooms.manage')
  upsertRestriction(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertRestrictionDto,
  ) {
    return this.rooms.upsertRestriction(user.sub, dto);
  }

  @Post('inventory-overrides')
  @RequirePermissions('rooms.manage')
  upsertInventoryOverride(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertInventoryOverrideDto,
  ) {
    return this.rooms.upsertInventoryOverride(user.sub, dto);
  }

  @Get('availability/search')
  @RequirePermissions('rooms.manage')
  availability(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AvailabilityQueryDto,
  ) {
    return this.rooms.getAvailability(user.sub, query);
  }

  @Get('rates/calendar/:propertyId')
  @RequirePermissions('rooms.manage')
  rateCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId') propertyId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.rooms.getRateCalendar(user.sub, propertyId, from, to);
  }

  @Post('pricing/quote')
  @RequirePermissions('rooms.manage')
  quote(@CurrentUser() user: AuthenticatedUser, @Body() dto: PriceQuoteDto) {
    return this.rooms.priceQuote(user.sub, dto);
  }

  @Post('policies/cancellation')
  @RequirePermissions('rooms.manage')
  cancellationPolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCancellationPolicyDto,
  ) {
    return this.rooms.createCancellationPolicy(user.sub, dto);
  }

  @Post('tax-profiles')
  @RequirePermissions('rooms.manage')
  taxProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTaxProfileDto,
  ) {
    return this.rooms.createTaxProfile(user.sub, dto);
  }

  @Post('fee-rules')
  @RequirePermissions('rooms.manage')
  feeRule(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFeeRuleDto,
  ) {
    return this.rooms.createFeeRule(user.sub, dto);
  }

  @Post('promotions')
  @RequirePermissions('rooms.manage')
  promotion(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePromotionDto,
  ) {
    return this.rooms.createPromotion(user.sub, dto);
  }
}
