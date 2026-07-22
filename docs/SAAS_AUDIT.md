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
