import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SystemRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from './current-user.decorator';
import { REQUIRED_PERMISSIONS_KEY } from './permissions.decorator';

type RequestWithAuth = {
  user?: AuthenticatedUser;
  params?: Record<string, string | undefined>;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const userId = request.user?.sub;
    if (!userId) {
      throw new ForbiddenException('Authenticated user is required.');
    }

    const companyIds = await this.resolveCompanyIds(request);
    const memberships = await this.prisma.companyUser.findMany({
      where: {
        userId,
        ...(companyIds.length ? { companyId: { in: companyIds } } : {}),
      },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    const allowed = memberships.some((membership) => {
      const systemRole = membership.role.systemRole;
      if (systemRole === SystemRole.PLATFORM_SUPER_ADMIN || systemRole === SystemRole.HOTEL_OWNER) {
        return true;
      }

      const granted = new Set(membership.role.permissions.map((rolePermission) => rolePermission.permission.key));
      return required.every((permission) => granted.has(permission));
    });

    if (!allowed) {
      throw new ForbiddenException('Insufficient permissions for this action.');
    }

    return true;
  }

  private async resolveCompanyIds(request: RequestWithAuth): Promise<string[]> {
    const ids = new Set<string>();
    this.addString(ids, request.params?.companyId);
    this.addString(ids, request.query?.companyId);
    this.addString(ids, this.bodyString(request.body, 'companyId'));

    const propertyId = request.params?.propertyId ?? this.bodyString(request.body, 'propertyId');
    if (propertyId) {
      const property = await this.prisma.property.findUnique({
        where: { id: propertyId },
        select: { companyId: true },
      });
      this.addString(ids, property?.companyId);
    }

    const recordId = request.params?.id;
    if (recordId) {
      const record = await this.prisma.moduleRecord.findUnique({
        where: { id: recordId },
        select: { companyId: true },
      });
      this.addString(ids, record?.companyId);
    }

    return [...ids];
  }

  private addString(ids: Set<string>, value: string | undefined): void {
    if (value) {
      ids.add(value);
    }
  }

  private bodyString(body: Record<string, unknown> | undefined, key: string): string | undefined {
    const value = body?.[key];
    return typeof value === 'string' ? value : undefined;
  }
}
