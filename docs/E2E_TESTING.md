# OdeoniFlow E2E Testing

## Prerequisites

- Node.js 20.18 or newer.
- Docker Desktop with the compose services running.
- PostgreSQL reachable at the E2E URL.
- Redis reachable locally for mock queue/provider paths.
- Playwright Chromium installed with `npx playwright install chromium`.

## Environment Variables

Use a separate database URL:

```bash
DATABASE_URL_E2E="postgresql://odeoniflow:odeoniflow@127.0.0.1:5433/odeoniflow_e2e?schema=public"
```

Optional overrides:

- `E2E_API_PORT`, default `4100`
- `E2E_WEB_PORT`, default `3100`
- `E2E_API_URL`, default `http://127.0.0.1:4100/api`
- `E2E_BASE_URL`, default `http://127.0.0.1:3100`
- `REDIS_URL`, default `redis://127.0.0.1:6379`

## Database Safety

`npm run db:e2e:reset` refuses to run unless:

- `DATABASE_URL_E2E` is present.
- The host is `127.0.0.1` or `localhost`.
- The database name contains `e2e` or `test`.
- The provider is PostgreSQL.

The reset command creates the local E2E database if needed, then runs Prisma `db push --force-reset` only against that E2E URL.

## Local Execution

```bash
npm install
npx playwright install chromium
$env:DATABASE_URL_E2E="postgresql://odeoniflow:odeoniflow@127.0.0.1:5433/odeoniflow_e2e?schema=public"
npm run db:e2e:reset
npm run db:e2e:seed
npm run test:e2e
```

Playwright starts the API on `4100` and the web app on `3100`. It captures screenshots, traces, and videos on failure.

## Headed And UI Mode

```bash
npm run test:e2e:headed
npm run test:e2e:ui
```

View a failed trace with:

```bash
npx playwright show-trace <path-to-trace.zip>
```

## CI Execution

CI should run:

```bash
npm ci
npx playwright install chromium
npm run db:e2e:reset
npm run db:e2e:seed
npm run test:e2e
```

Use only mock/local provider configuration in CI.

## Mock Providers

E2E forces `WHATSAPP_PROVIDER=mock` and uses mock/local paths for payment, invoice, channel, and message workflows. No production credentials or real external provider calls are required.

## Seeded Data

The E2E seed creates:

- Active tenant, read-only user, cross-tenant user, and disabled-subscription tenant.
- One active subscription plan and entitlements.
- One property policy.
- Two room types and four rooms.
- A maintenance room and a calendar block.
- Confirmed, checked-in, and conflicting reservations.

## Common Failures

- Existing Next dev server in the same app directory can block a second `next dev`; stop the older local dev server before E2E if needed.
- Missing `DATABASE_URL_E2E` fails safely before reset.
- Non-local or non-E2E database names are rejected.
- If Chromium is missing, run `npx playwright install chromium`.
