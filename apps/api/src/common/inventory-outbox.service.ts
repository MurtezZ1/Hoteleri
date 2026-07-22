import { Injectable } from '@nestjs/common';
import { InventoryOutboxStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryOutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async dispatchPending(
    limit = 25,
  ): Promise<{ processed: number; failed: number }> {
    const events = await this.prisma.inventoryOutboxEvent.findMany({
      where: {
        status: {
          in: [InventoryOutboxStatus.PENDING, InventoryOutboxStatus.FAILED],
        },
        availableAt: { lte: new Date() },
        attempts: { lt: 5 },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    let processed = 0;
    let failed = 0;
    for (const event of events) {
      try {
        await this.prisma.inventoryOutboxEvent.update({
          where: { id: event.id },
          data: {
            status: InventoryOutboxStatus.PROCESSING,
            attempts: { increment: 1 },
          },
        });
        await this.prisma.inventoryOutboxEvent.update({
          where: { id: event.id },
          data: {
            status: InventoryOutboxStatus.PROCESSED,
            processedAt: new Date(),
            lastError: null,
          },
        });
        processed += 1;
      } catch (error) {
        failed += 1;
        await this.prisma.inventoryOutboxEvent.update({
          where: { id: event.id },
          data: {
            status: InventoryOutboxStatus.FAILED,
            lastError:
              error instanceof Error
                ? error.message
                : 'Unknown outbox dispatch failure',
            availableAt: new Date(Date.now() + 60_000),
          },
        });
      }
    }
    return { processed, failed };
  }
}
