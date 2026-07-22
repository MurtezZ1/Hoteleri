import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  findForUser(userId: string) {
    return this.prisma.company.findMany({
      where: { users: { some: { userId } }, deletedAt: null },
      include: { properties: true, users: { include: { role: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
}
