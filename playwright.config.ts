import { defineConfig, devices } from '@playwright/test';

const apiPort = Number(process.env.E2E_API_PORT ?? 4100);
const webPort = Number(process.env.E2E_WEB_PORT ?? 3100);
const databaseUrl =
  process.env.DATABASE_URL_E2E ??
  'postgresql://odeoniflow:odeoniflow@127.0.0.1:5433/odeoniflow_e2e?schema=public';
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${webPort}`;
const apiURL = process.env.E2E_API_URL ?? `http://127.0.0.1:${apiPort}/api`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
  },
  webServer: [
    {
      command: 'npm --workspace @odeoniflow/api run dev',
      url: `${apiURL.replace(/\/api$/, '')}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 90_000,
      env: {
        DATABASE_URL: databaseUrl,
        API_PORT: String(apiPort),
        WEB_ORIGIN: `${baseURL},http://localhost:${webPort}`,
        REDIS_URL: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
        JWT_ACCESS_SECRET:
          process.env.JWT_ACCESS_SECRET ??
          'e2e-access-secret-with-at-least-32-characters',
        JWT_REFRESH_SECRET:
          process.env.JWT_REFRESH_SECRET ??
          'e2e-refresh-secret-with-at-least-32-characters',
        WHATSAPP_PROVIDER: 'mock',
        WHATSAPP_CREDENTIAL_ENCRYPTION_KEY:
          process.env.WHATSAPP_CREDENTIAL_ENCRYPTION_KEY ??
          'e2e-credential-secret-32-bytes-long',
      },
    },
    {
      command: 'npm --workspace @odeoniflow/web run dev:e2e',
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 90_000,
      env: {
        NEXT_PUBLIC_API_URL: apiURL,
      },
    },
  ],
  projects: [
    {
      name: 'chromium',
      testIgnore: /mobile\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
});
