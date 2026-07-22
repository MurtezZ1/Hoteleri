import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { UpsertModuleRecordDto } from './dto';
import { ModuleRecordsService } from './module-records.service';

@ApiTags('module-records')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('module-records')
export class ModuleRecordsController {
  constructor(private readonly records: ModuleRecordsService) {}

  @Get(':moduleKey')
  @RequirePermissions('settings.manage')
  list(@CurrentUser() user: AuthenticatedUser, @Param('moduleKey') moduleKey: string, @Query('companyId') companyId: string, @Query('q') q?: string, @Query('status') status?: string) {
    return this.records.list(user.sub, moduleKey, companyId, q, status);
  }

  @Post(':moduleKey')
  @RequirePermissions('settings.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Param('moduleKey') moduleKey: string, @Body() dto: UpsertModuleRecordDto) {
    return this.records.create(user.sub, moduleKey, dto);
  }

  @Patch(':moduleKey/:id')
  @RequirePermissions('settings.manage')
  update(@CurrentUser() user: AuthenticatedUser, @Param('moduleKey') moduleKey: string, @Param('id') id: string, @Body() dto: UpsertModuleRecordDto) {
    return this.records.update(user.sub, moduleKey, id, dto);
  }

  @Delete(':moduleKey/:id')
  @RequirePermissions('settings.manage')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('moduleKey') moduleKey: string, @Param('id') id: string) {
    return this.records.remove(user.sub, moduleKey, id);
  }
}
