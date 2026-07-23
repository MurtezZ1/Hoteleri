import { PrismaClient } from '@prisma/client';

export function getE2eDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_E2E;
  if (!url) {
    throw new Error('DATABASE_URL_E2E is required for E2E database commands.');
  }
  assertSafeE2eDatabaseUrl(url);
  return url;
}

export function assertSafeE2eDatabaseUrl(url: string): void {
  const parsed = new URL(url);
  const databaseName = parsed.pathname.replace(/^\//, '');
  const safeHost = ['127.0.0.1', 'localhost'].includes(parsed.hostname);
  const safeName = /(e2e|test)/i.test(databaseName);

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('E2E database must use a PostgreSQL connection URL.');
  }
  if (!safeHost) {
    throw new Error(
      `Refusing to reset non-local E2E database host: ${parsed.hostname}`,
    );
  }
  if (!safeName) {
    throw new Error(
      `Refusing to reset database without e2e/test marker: ${databaseName}`,
    );
  }
}

export function adminDatabaseUrl(e2eUrl: string): string {
  const parsed = new URL(e2eUrl);
  parsed.pathname = '/postgres';
  return parsed.toString();
}

export function databaseName(e2eUrl: string): string {
  return new URL(e2eUrl).pathname.replace(/^\//, '');
}

export async function ensureE2eDatabaseExists(e2eUrl: string): Promise<void> {
  const name = databaseName(e2eUrl);
  const admin = new PrismaClient({
    datasources: { db: { url: adminDatabaseUrl(e2eUrl) } },
  });

  try {
    const rows = await admin.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = ${name}) AS "exists"
    `;
    if (!rows[0]?.exists) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await admin.$disconnect();
  }
}
