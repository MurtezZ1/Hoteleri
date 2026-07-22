import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { SystemRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto';

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
  };
}

const ownerPermissions = [
  'reservations.view',
  'reservations.create',
  'reservations.update',
  'reservations.cancel',
  'guests.view',
  'guests.update',
  'payments.view',
  'payments.create',
  'invoices.manage',
  'reports.view',
  'rooms.manage',
  'staff.manage',
  'settings.manage',
];

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email is already registered.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { email: dto.email, passwordHash, fullName: dto.fullName },
      });
      const company = await tx.company.create({
        data: { name: dto.companyName, email: dto.email },
      });
      const role = await tx.role.create({
        data: { companyId: company.id, name: 'Owner', systemRole: SystemRole.HOTEL_OWNER },
      });
      await Promise.all(
        ownerPermissions.map((permission) =>
          tx.permission.upsert({
            where: { key: permission },
            create: { key: permission, description: permission },
            update: {},
          }),
        ),
      );
      const permissions = await tx.permission.findMany({ where: { key: { in: ownerPermissions } } });
      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
        skipDuplicates: true,
      });
      await tx.companyUser.create({
        data: { companyId: company.id, userId: createdUser.id, roleId: role.id, isOwner: true },
      });
      await tx.subscription.create({
        data: { companyId: company.id, plan: 'starter', status: 'trialing', seats: 3 },
      });
      return createdUser;
    });

    return this.issueTokens(user.id, user.email, user.fullName);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    return this.issueTokens(user.id, user.email, user.fullName);
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    await this.prisma.user.findUnique({ where: { email } });
    return { message: 'If the account exists, a reset link will be sent.' };
  }

  private async issueTokens(id: string, email: string, fullName: string): Promise<AuthResponse> {
    const payload = { sub: id, email };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET') ?? 'local-dev-access-secret',
      expiresIn: this.jwtExpiresIn('JWT_ACCESS_EXPIRES_IN', '15m'),
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET') ?? 'local-dev-refresh-secret',
      expiresIn: this.jwtExpiresIn('JWT_REFRESH_EXPIRES_IN', '7d'),
    });
    await this.prisma.user.update({
      where: { id },
      data: { refreshTokenHash: await bcrypt.hash(refreshToken, 12) },
    });
    return { accessToken, refreshToken, user: { id, email, fullName } };
  }

  private jwtExpiresIn(key: string, fallback: string): NonNullable<JwtSignOptions['expiresIn']> {
    return (this.config.get<string>(key) ?? fallback) as NonNullable<JwtSignOptions['expiresIn']>;
  }
}
