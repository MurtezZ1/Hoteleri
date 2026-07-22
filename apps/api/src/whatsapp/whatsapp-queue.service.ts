import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';
import { createHash } from 'crypto';
import IORedis from 'ioredis';

export interface WhatsAppJobPayload {
  companyId: string;
  messageId: string;
  idempotencyKey: string;
}

@Injectable()
export class WhatsAppQueueService implements OnModuleDestroy {
  private readonly connection: IORedis;
  private readonly queue: Queue<WhatsAppJobPayload>;
  private worker?: Worker<WhatsAppJobPayload>;

  constructor(private readonly config: ConfigService) {
    this.connection = new IORedis(
      this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
      {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      },
    );
    this.queue = new Queue<WhatsAppJobPayload>('whatsapp-messages', {
      connection: this.connection,
    });
  }

  async enqueue(payload: WhatsAppJobPayload, delayMs = 0): Promise<void> {
    await this.queue.add('send', payload, {
      jobId: queueJobId(payload.idempotencyKey),
      delay: delayMs,
      attempts: Number(this.config.get<string>('WHATSAPP_MAX_RETRIES') ?? 5),
      backoff: {
        type: 'exponential',
        delay: Number(
          this.config.get<string>('WHATSAPP_RETRY_DELAY_MS') ?? 30_000,
        ),
      },
      removeOnComplete: 1000,
      removeOnFail: false,
    });
  }

  registerProcessor(
    processor: (payload: WhatsAppJobPayload) => Promise<void>,
    exhausted?: (payload: WhatsAppJobPayload, error: Error) => Promise<void>,
  ): void {
    if (this.worker) {
      return;
    }
    this.worker = new Worker<WhatsAppJobPayload>(
      'whatsapp-messages',
      async (job: Job<WhatsAppJobPayload>) => processor(job.data),
      {
        connection: this.connection,
        concurrency: Number(
          this.config.get<string>('WHATSAPP_WORKER_CONCURRENCY') ?? 3,
        ),
      },
    );
    this.worker.on('failed', (job, error) => {
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        void exhausted?.(job.data, error);
      }
    });
  }

  async cancel(idempotencyKey: string): Promise<boolean> {
    const job = await this.queue.getJob(queueJobId(idempotencyKey));
    if (!job) {
      return false;
    }
    await job.remove();
    return true;
  }

  async health(): Promise<{
    waiting: number;
    delayed: number;
    failed: number;
    active: number;
  }> {
    const [waiting, delayed, failed, active] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getDelayedCount(),
      this.queue.getFailedCount(),
      this.queue.getActiveCount(),
    ]);
    return { waiting, delayed, failed, active };
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    await this.connection.quit();
  }
}

function queueJobId(idempotencyKey: string): string {
  return createHash('sha256').update(idempotencyKey).digest('hex');
}
