import { spawnSync } from 'child_process';
import { ensureE2eDatabaseExists, getE2eDatabaseUrl } from './e2e-safety';

async function main(): Promise<void> {
  const databaseUrl = getE2eDatabaseUrl();
  await ensureE2eDatabaseExists(databaseUrl);

  const command = process.platform === 'win32' ? 'cmd.exe' : 'npx';
  const args =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', 'npx prisma db push --force-reset --skip-generate']
      : ['prisma', 'db', 'push', '--force-reset', '--skip-generate'];

  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    if (result.error) {
      console.error(result.error);
    }
    throw new Error(
      `E2E database reset failed with exit code ${result.status}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
