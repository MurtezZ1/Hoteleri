import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { FrontDeskQueryDto } from './dto';
import { FrontDeskService } from './front-desk.service';

@ApiTags('front-desk')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('front-desk')
export class FrontDeskController {
  constructor(private readonly frontDesk: FrontDeskService) {}

  @Get(':propertyId')
  @RequirePermissions('frontdesk.view')
  overview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId') propertyId: string,
    @Query() query: FrontDeskQueryDto,
  ) {
    return this.frontDesk.overview(user.sub, propertyId, query);
  }
}
