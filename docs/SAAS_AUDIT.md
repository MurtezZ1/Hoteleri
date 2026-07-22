# OdeoniFlow SaaS Audit

Last updated: 2026-07-22

## Existing Architecture

- Monorepo with NestJS API, Next.js web app, shared UI/types/config packages.
- PostgreSQL and Redis are provided through Docker Compose for development.
- Prisma models cover companies, users, roles, permissions, properties, guests, rooms, reservations, payments, invoices, automations, channel integrations, audit logs, subscriptions, and generic module records.
- API uses JWT authentication, DTO validation, Swagger, Helmet, and Prisma.
- Web app uses Next.js App Router and calls the API with bearer tokens.

## Existing Features

- Registration creates a user, company, owner role, permissions, and trial subscription.
- Login and forgot-password neutral response exist.
- Company/property/room/guest/reservation/module-record CRUD foundations exist.
- Basic overbooking conflict detection exists for reservation creation.
- Generic module CRUD now persists through Prisma.
- Swagger documentation is exposed at `/docs`.
- Health endpoints exist at `/health` and `/ready`.

## Missing Or Incomplete Features

- Email verification, password reset token flow, refresh-token rotation endpoint, logout/session revocation endpoint, change password, change email, account lockout, 2FA, and device management are incomplete.
- Full RBAC permission guard is not yet enforced on every endpoint.
- Super Admin dashboard and protected platform admin API are not implemented.
- Full subscription billing, Stripe integration, invoices, plan upgrade/downgrade, failed-payment handling, and grace-period workflows are incomplete.
- Automations, queues, delivery retries, channel webhooks, webhook signature verification, and reconciliation jobs are only modeled, not production implemented.
- Public legal/customer pages are incomplete.
- E2E tests, Docker image tests, secret scanning, and dependency remediation need more work.

## Security Vulnerabilities Found

- Several APIs trusted `companyId` or `propertyId` from the frontend without verifying authenticated membership.
- Generic module-record delete could delete a record by ID without first checking tenant ownership.
- Expired demo access tokens caused frontend fallback behavior instead of re-authentication.
- Root layout could show hydration warnings when browser extensions modified the DOM.
- Request body size limits and readiness endpoints were missing.
- Production env secret strength was not validated.

## Fixes Completed In This Step

- Added `TenantAccessService` and enforced company/property membership in guests, properties, rooms, reservations, and module-records endpoints.
- Added resource ownership validation for reservation guest and rooms.
- Added subscription status and property plan-limit enforcement for property creation.
- Added health/readiness endpoints.
- Added request body limits, CSP/security headers, stronger env checks, and shutdown hooks.
- Added tenant isolation tests.
- Added API and web `.env.example` files.
- Added API and web Dockerfiles.

## SaaS Problems Remaining

- Tenant isolation is improved for core endpoints, but every future endpoint must use the same access pattern.
- Role permissions are stored but not yet enforced through a reusable permission guard on every route.
- Subscription limits exist only for property creation in this step; room/staff/premium feature limits remain.
- Billing provider abstraction and Stripe integration remain TODO pending credentials and provider decisions.

## Database Problems

- `Subscription` is a simple string-based model and should evolve into `SubscriptionPlan`, `SubscriptionInvoice`, and `UsageRecord`.
- Some monetary fields lack explicit precision/scale declarations.
- Reservation overbooking protection is service-level; stronger transaction/idempotency/locking coverage is still needed.
- Audit logging exists in schema but is not consistently written by services.

## Frontend Problems

- Many customer modules use one generic CRUD surface instead of domain-specific workflows.
- RBAC-driven navigation hiding is incomplete.
- Public pages for features/pricing/legal/support are incomplete.
- Error states improved for CRUD save/delete but need consistent app-wide handling.

## Backend Problems

- Refresh-token rotation endpoints and revocation are incomplete.
- Permission enforcement is incomplete.
- Rate limiting and brute-force lockout are not yet implemented.
- Centralized exception logging/correlation IDs are not yet implemented.

## Deployment Problems

- Dockerfiles were added, but production compose/reverse proxy/CI needs validation.
- Backup and restore procedures are documented only at a high level.
- Dependency audit still reports vulnerabilities that need triage.

## Testing Problems

- Unit tests exist and tenant isolation tests were added.
- Integration/E2E tests, authorization tests, subscription limit tests beyond properties, webhook tests, and concurrency tests need expansion.

## High-Priority Next Fixes

1. Add a reusable `PermissionsGuard` and annotate routes with required permissions.
2. Add auth hardening: refresh endpoint, logout, token rotation, reset tokens, rate limiting, login attempt tracking.
3. Add subscription plan tables and enforce room/staff/premium limits.
4. Add transactional reservation creation with idempotency keys and concurrency tests.
5. Add Super Admin module with strict platform-admin checks.
6. Add CI pipeline running lint, typecheck, tests, Prisma validation, build, audit, Docker build, and secret scan.

## Loop 1 - Dependency And Container Hardening

Date: 2026-07-22

### Completed

- Upgraded the NestJS stack to v11, Next.js to v16.2.11, and Vitest to v4.1.10.
- Removed the stale Next ESLint config key that is no longer typed in Next 16.
- Updated JWT signing options for the stricter Nest JWT 11 types.
- Removed stale workspace-local installs and regenerated the root install tree.
- Added Docker npm pinning so container builds use npm 11.6.2, matching the local lockfile generation behavior.
- Added `.dockerignore` to keep `node_modules`, build output, logs, and local env files out of Docker build context.

### Verification Results

- Install: passed.
- Lint: passed across all workspaces.
- TypeScript checks: passed across all workspaces.
- Prisma generate: passed after stopping local Node processes that held the Windows Prisma query engine file lock.
- Prisma migrations: passed; database already in sync.
- Tests: passed; API 7/7 and Web 1/1.
- Production build: passed across all workspaces.
- Docker API image: built as `odeoniflow-api:local`.
- Docker Web image: built as `odeoniflow-web:local`.
- Secret scan: no matches found in tracked project files and examples.

### Remaining Dependency Risk

- `npm audit --audit-level=high` still reports 3 advisories from the latest available Next.js dependency tree:
  - `next@16.2.11` still pins `postcss@8.4.31`, while the advisory expects `postcss >= 8.5.10`.
  - `next@16.2.11` depends on optional `sharp@^0.34.5`, while the advisory expects `sharp >= 0.35.0`.
- `npm audit fix --force` proposes installing `next@9.3.3`, which would be a destructive downgrade and was intentionally not applied.
- npm overrides for these nested Next dependencies were tested but did not change the resolved tree, so they were not kept.
- Web Docker `npm ci` still prints a non-fatal lockfile warning, but install, build, and image export complete successfully.

## Loop 2 - RBAC And Dashboard Tenant Hardening

Date: 2026-07-22

### Completed

- Added `@RequirePermissions(...)` route metadata for protected business actions.
- Added `PermissionsGuard` that resolves company scope from `companyId`, `propertyId`, or module-record `id`.
- Enforced permission checks on guests, rooms, properties, reservations, dashboard, and generic module-record endpoints.
- Preserved owner/platform-admin access while requiring explicit permission keys for lower roles.
- Fixed dashboard metrics so a user must have tenant access to the requested property before metrics are returned.
- Added unit coverage for permission allow/deny behavior.

### Verification Results

- Install: passed; same Next dependency advisories remain.
- Lint: passed across all workspaces.
- TypeScript checks: passed across all workspaces.
- Prisma generate: passed.
- Prisma migrations: passed; database already in sync.
- Tests: passed; API 9/9 and Web 1/1.
- Production build: passed across all workspaces.
- Docker API image: built as `odeoniflow-api:local`.
- Docker Web image: built as `odeoniflow-web:local`.

### Remaining Authorization Risk

- Permission coverage exists for current core controllers, but future modules still need endpoint-specific permission keys instead of broad `settings.manage`.
- Frontend navigation and button visibility are not yet fully driven by backend permission claims.
- There is still no admin UI for managing roles and permissions.

## Loop 3 - Authentication Hardening

Date: 2026-07-22

### Completed

- Added Prisma auth/security models: `AuthSession`, `EmailVerificationToken`, `PasswordResetToken`, `LoginAttempt`, `SecurityEvent`, and `UserInvitation`.
- Added rotating opaque refresh tokens stored only as SHA-256 hashes.
- Added refresh-token family reuse detection that revokes the full token family.
- Added session metadata: IP address, user agent, creation time, last-used time, expiration, revocation time, and revocation reason.
- Added auth endpoints for email verification, resend verification, password reset, refresh, logout, logout-all, session listing, selected session revocation, password change, and email change.
- Added login lockout using configurable failure threshold and time window.
- Added strong password validation for registration, reset, and password change.
- Added single-use expiring verification and reset token flows.
- Added revocation of sessions after password reset and sensitive account changes.
- Added security event logging for registration, login, reset, verification, lockout, token reuse, password changes, and email changes.
- Added frontend pages for `/verify-email`, `/reset-password`, and `/settings/sessions`.
- Added frontend refresh handling: expired access tokens now attempt `/auth/refresh`; failed refresh clears local auth state and redirects to login.
- Expanded auth tests to cover lockout, verification token acceptance/rejection, reset token acceptance/rejection, refresh rotation, refresh reuse family revocation, logout, and cross-user session deletion rejection.

### Verification Results

- Lint: passed across all workspaces.
- TypeScript checks: passed across all workspaces.
- Prisma validate: passed.
- Prisma generate: passed.
- Tests: passed; API 18/18 and Web 1/1.
- Production build: passed across all workspaces.
- Prisma migration deploy: passed after starting Docker Desktop and bringing up PostgreSQL/Redis with Docker Compose.
- Seed: passed against the local `odeoniflow` database.
- Runtime smoke check: API `/api/health` returned `ok`; web `/login` returned HTTP 200.
- Docker API/Web image builds: blocked by repeated `ECONNRESET` failures while `npm ci` fetched packages from `registry.npmjs.org` inside Docker. Dockerfiles now include npm retry/timeouts, but the container network still failed during this run.
- Dependency audit: still reports the known Next.js transitive `postcss` and optional `sharp` advisories; destructive downgrade was not applied.
- Secret scan: no matches found in tracked project files and examples.

### Remaining Authentication Risk

- Email delivery is not integrated yet; verification and reset token generation exists, but real outbound email requires Loop 7 provider work.
- MFA is still only architecture-ready, not implemented as a user-facing factor enrollment/challenge flow.
- Session/device UI is functional but minimal and not yet integrated into role-driven settings navigation.
- Docker image validation is still blocked by transient container network failures to npm registry, not by application code.

## Loop 4 - Subscriptions And Billing Domain

Date: 2026-07-22

### Completed

- Added billing Prisma models: `SubscriptionPlan`, `BillingCustomer`, `SubscriptionInvoice`, `BillingEvent`, `UsageRecord`, `FeatureEntitlement`, and `WebhookEvent`.
- Expanded `Subscription` with billing interval, lifecycle status, period dates, trial/cancel/grace/suspension fields, plan relation, customer relation, invoices, and usage records.
- Added default plan catalog for Starter, Pro, and Enterprise with property, room, staff, reporting, automation, booking engine, and channel manager entitlements.
- Added `BillingProvider` interface with local `MockBillingProvider` and a Stripe provider placeholder that explicitly requires real credentials before use.
- Added billing endpoints for plans, current company subscription, change plan, cancellation, and mock webhook ingestion.
- Added duplicate webhook event detection and duplicate billing event logging.
- Enforced room limits in backend subscription guard in addition to existing property limits.
- Added billing UI at `/billing` and linked it from the sidebar.
- Added billing tests for plan seeding, mock upgrade/invoice creation, duplicate webhook handling, property limits, and room limits.

### Verification Results

- Prisma migration `20260722164854_billing_domain` was generated and applied.
- Lint: passed across all workspaces.
- TypeScript checks: passed across all workspaces.
- Tests: passed; API 23/23 and Web 1/1.
- Prisma migration deploy: passed; no pending migrations.
- Prisma generate: passed.
- Production build: passed across all workspaces.
- Dependency audit: still reports the known Next.js transitive `postcss` and optional `sharp` advisories; destructive downgrade was not applied.
- Docker API/Web image builds: still blocked by repeated `ECONNRESET` failures while `npm ci` fetched packages from `registry.npmjs.org` inside Docker.

### Remaining Billing Risk

- Stripe is architecture-only; live payment operations require credentials, webhook secret, and production provider setup.
- Proration is represented as a provider boundary but not implemented with real Stripe invoice previews.
- Failed payment, grace-period automation, suspension/reactivation workflows, and invoice retry jobs are not fully automated yet.
- Staff, automation, reports, booking-engine, and channel-manager limits need deeper enforcement at each future module endpoint.

## Loop 5 - WhatsApp Messaging Architecture

Date: 2026-07-22

### Completed

- Added provider-independent WhatsApp architecture with `WhatsAppProvider`, mock provider, Twilio provider boundary, Meta Cloud provider boundary, and provider factory.
- Added Prisma WhatsApp models for connections, recipients, templates, messages, webhook events, plus guest WhatsApp consent/opt-out fields.
- Added BullMQ/Redis queue for WhatsApp sends with retry, idempotent job IDs, health counts, worker processing, and dead-letter status.
- Added webhook endpoints for mock, Twilio, and Meta with duplicate event protection and tenant resolution from configured sender numbers.
- Added `/settings/whatsapp` and `/messages` UI.
- Added WhatsApp tests for queuing, staff notifications, duplicate webhooks, tenant resolution, STARTER gating, credential masking, and invalid webhook verification.

### Verification Results

- Install: passed after adding `bullmq` and `ioredis`; npm audit reported 0 vulnerabilities.
- Prisma migration `20260722180905_whatsapp_integration` was generated and applied.
- Prisma validate/generate/migrate: passed.
- Lint: passed.
- TypeScript checks: passed.
- Tests: passed; API 31/31 and Web 2/2.
- Production build: passed.
- Docker API image: built as `odeoniflow-api:whatsapp`.
- Docker Web image: built as `odeoniflow-web:whatsapp` and inspected successfully.
- Runtime mock send: verified a test WhatsApp message moved from `QUEUED` to `SENT`.

### Remaining WhatsApp Risk

- Real Twilio and Meta outbound API calls require credentials, approvals, and final provider HTTP integration.
- Full WhatsApp session-window enforcement and all event-specific automations are not complete.
- `format:check` exists but currently fails because the broader existing repository is not Prettier-formatted.
- `test:integration` and `test:e2e` scripts are still missing.

## Loop 6 - Feature Parity Audit And Reservation Concurrency

Date: 2026-07-22

### Completed

- Audited the repository against public PMS/channel-manager/booking-engine/payment/messaging/security requirements.
- Reviewed the public reference website only for advertised feature categories and documented gaps without copying protected assets or text.
- Created `docs/FEATURE_PARITY_AUDIT.md`.
- Added `ReservationIdempotencyRecord` for persistent reservation idempotency.
- Added `BLOCKED` and `MAINTENANCE` reservation statuses for future calendar inventory blocks.
- Added `Idempotency-Key` header support on `POST /reservations`.
- Moved reservation creation into a PostgreSQL serializable transaction.
- Revalidated room overlap inside the transaction using the required overlap condition.
- Added serialization retry handling for Prisma `P2034`.
- Return HTTP 409 for overlapping reservation conflicts or idempotency-key misuse.

### Verification Results

- Prisma validate: passed.
- Prisma migration `20260722185937_reservation_idempotency_concurrency` was generated and applied.
- Prisma generate: passed during migration.

### Remaining Reservation Risk

- True parallel integration tests against PostgreSQL are still needed to prove exactly-one-success behavior under concurrent requests.
- Reservation update, date resize, room reassignment, cancellation, and inventory restoration need the same transaction/idempotency protection.

## Loop 7 - Front Desk Operations

Date: 2026-07-22

### Completed

- Added a dedicated Front Desk backend module with `GET /front-desk/:propertyId`.
- Enforced JWT auth, `frontdesk.view` permission, tenant/property access, active subscription entitlement, DTO validation, and audit logging before returning operations data.
- Added `pms.frontdesk` subscription feature gating at the Starter plan level.
- Added owner/seed permissions for front desk management, check-in, check-out, room assignment, no-show handling, payments, and invoices.
- Added a protected `/front-desk` Next.js page linked from the app shell navigation.
- Built the Front Desk UI for property/date/status/search filters, operational metrics, alerts, quick actions, reservation tables, outstanding balances, and room readiness.
- Added service tests proving tenant-scoped success, cross-tenant denial before data access, and subscription denial before data access.

### Verification Results

- Lint: passed across all workspaces.
- TypeScript checks: passed across all workspaces.
- Tests: passed; API 36/36 and Web 2/2.

### Remaining Front Desk Risk

- Quick actions currently route users to existing modules; they do not yet execute transactional domain workflows.
- Dedicated endpoints are still required for check-in, check-out, assign/change room, mark no-show, record payment, add charge, generate invoice, mark room clean, and create maintenance issue.
- Browser E2E tests should verify permission-driven visibility and full front desk workflows after those action endpoints are implemented.

## Loop 8 - Front Desk Domain Actions

Date: 2026-07-22

### Completed

- Added a reservation transition validator with structured `INVALID_RESERVATION_TRANSITION` conflict errors.
- Added transactional reservation action endpoints for assign room, change room, check-in, check-out, and no-show.
- Added payment recording on reservations with Decimal-safe balance calculation, refund validation, recorded-by metadata, and best-effort idempotency lookup.
- Added invoice generation endpoint with unique local invoice numbering, immutable line snapshots, currency, generated-by metadata, and PDF path placeholder.
- Added housekeeping task creation endpoint and automatic checkout housekeeping task creation.
- Added maintenance issue creation endpoint and room blocking behavior when the issue blocks sale.
- Added room operational/housekeeping/maintenance status update endpoint.
- Added audit logging for room assignment/change, check-in, check-out, no-show, payment/refund, invoice, housekeeping, maintenance, and room status changes.
- Connected `/front-desk` quick actions to real modals and backend calls instead of redirects to generic CRUD pages.
- Added migration `20260722213205_init` for reservation lifecycle fields, `ReservationRoomChange`, expanded payment/invoice/housekeeping/maintenance operational fields, and new enum values.
- Added front desk action tests for room assignment, maintenance-room denial, overlap conflict, invalid check-in transition, payment idempotency, and checkout housekeeping synchronization.

### Verification Results

- Prisma validate: passed before migration.
- Prisma generate: passed.
- Prisma migration `20260722213205_init`: created and applied.
- Lint: passed before documentation update.
- TypeScript checks: passed before documentation update.
- Tests: passed before documentation update; API 42/42 and Web 2/2.

### Remaining Front Desk Action Risk

- Property timezone, early check-in, deposit/payment policy, force checkout permission split, and full check-in identity policy are simplified and need configurable policy models.
- Payment idempotency is service-level with an index, not a dedicated strict idempotency table.
- Invoice PDF download path is stored, but real PDF generation/render verification is not complete.
- Email/WhatsApp notifications are not yet triggered for every action after commit.
- Maintenance channel-sync outbox event is not yet implemented.
- Browser E2E tests for the new Front Desk modals are still missing.

## Loop 9 - Live Reservation Calendar

Date: 2026-07-23

### Completed

- Replaced the static calendar mock with a real protected `/calendar` workspace.
- Added `CalendarModule` with a compact tenant-scoped timeline API.
- Added `GET /calendar/timeline` with property/date/room type/room/status/source/search/cancelled/no-show filters and a 62-day range limit.
- Added `PATCH /reservations/:reservationId/calendar-move` and `PATCH /reservations/:reservationId/calendar-resize`.
- Added `POST /calendar/blocks`.
- Added `CalendarBlock` and `CalendarBlockType` to Prisma, with composite timeline indexes.
- Calendar move/resize uses serializable transactions, overlap validation, calendar-block validation, room status validation, terminal-state validation, audit logging, room-change history, and optimistic concurrency through `expectedUpdatedAt`.
- Empty-slot reservation creation uses the existing reservation creation endpoint and sends an `Idempotency-Key`.
- Added UI for day/week/14-day views, previous/next/today navigation, property selector, filters, room grouped rows, reservation bars, current-day marker, weekend distinction, room state indicators, block indicators, mobile list fallback, details modal, create modal, edit-stay modal, and block creation.
- Added backend CalendarService tests for timeline fetch, tenant denial, range validation, move success, stale move rejection, overlap rejection, and block creation.

### Verification Results

- TypeScript checks: passed before migration and tests.
- Tests: passed before final validation; API 49/49 and Web 2/2.
- Prisma migration `20260722222935_init`: created and applied.

### Remaining Calendar Risk

- Browser E2E has not been added, so drag/drop rollback and visual behavior are not browser-verified.
- Calendar block deletion/update endpoints are not implemented yet.
- Calendar blocks are local inventory blocks; channel-manager outbox sync is still pending.
- Advanced rate/min-stay/max-stay policies are not enforced during calendar moves.
- Large-property virtualization is basic; the UI uses horizontal scrolling and should be virtualized later for very large hotels.

## Loop 9 Hardening - Calendar Blocks, Outbox, Idempotency, Policies, PDF

Date: 2026-07-23

### Completed

- Added `PATCH /calendar/blocks/:blockId` and `DELETE /calendar/blocks/:blockId`.
- Added soft delete to `CalendarBlock`.
- Added `InventoryOutboxEvent`, `InventoryOutboxStatus`, and `InventoryOutboxEventType`.
- Added a local `InventoryOutboxService` dispatcher foundation for safe post-transaction processing.
- Added outbox event creation in calendar move, block create/update/delete, reservation creation, room assignment/change, check-in, check-out, no-show, and maintenance room blocking.
- Added `PaymentIdempotencyRecord` and request hashing for reservation payment idempotency.
- Added `PropertyOperationalPolicy` and enforced core check-in/check-out policy flags.
- Added invoice PDF download endpoint: `GET /invoices/:invoiceId/download`.
- Added local PDF generation and tenant-safe local invoice storage path.
- Added calendar block update/delete tests.
- Ran full repository Prettier formatting; `format:check` now passes.

### Verification Results

- `npm run format:check`: passed after formatting cleanup.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run db:generate`: passed.
- `npm run db:migrate`: migration `20260722225707_init` created/applied; final run already in sync.
- `npm run test`: passed; API 51/51 and Web 2/2.
- `npm run build`: passed.
- `npm install`: passed with 3 existing audit advisories.
- `docker compose config`: passed.
- `docker build -f apps/api/Dockerfile -t odeoniflow-api:local .`: passed.
- `docker build -f apps/web/Dockerfile -t odeoniflow-web:local .`: passed.
- Local regex secret scan: no real provider credentials found; only normal code references to token/password/secret variables matched.

### Remaining Hardening Risk

- `npm audit --audit-level=moderate`: still fails on Next transitive `postcss`/`sharp` advisories; npm currently suggests `npm audit fix --force`, which would apply a breaking downgrade path and was not run.
- Browser E2E infrastructure and Playwright workflow tests are still missing.
- Outbox dispatcher is local/mock; real OTA/channel publishing is not active.
- Payment idempotency has unit behavior, but true concurrent duplicate integration testing still needs a database-level parallel test.
- Invoice PDF is real and valid but intentionally minimal; rich templates, logo handling, cloud storage, and fiscal compliance are not implemented.
- Property policy engine covers core flags but not full timezone/DST/early-check-in/no-show cutoff scenarios yet.
- Loop 10 was not started in this pass because browser E2E and full room/rate/availability work are large enough to require a separate implementation loop.
