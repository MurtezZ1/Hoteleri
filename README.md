# OdeoniFlow PMS

OdeoniFlow PMS is a multi-tenant hotel and property management SaaS for hotels, apartments, villas, hostels, guesthouses, and short-term rental operators.

## Architecture Overview

- `apps/api`: NestJS REST API with Prisma, PostgreSQL, Redis/BullMQ-ready infrastructure, JWT auth, RBAC guards, Swagger, seed data, and tests.
- `apps/web`: Next.js App Router application with Tailwind CSS, shadcn-style UI primitives, auth/onboarding screens, reservation calendar placeholder, and dashboard.
- `packages/ui`: Shared React UI primitives.
- `packages/types`: Shared domain enums and DTO-friendly TypeScript types.
- `packages/config`: Shared configuration helpers.
- `packages/eslint-config`: Shared ESLint flat config.

Tenant isolation is modeled around `Company`, `CompanyUser`, `Property`, and `PropertyUser`. Business records include `companyId` or `propertyId` where appropriate. API access is designed to be constrained by authenticated user, company membership, role permissions, and property assignment.

## Folder Structure

```txt
apps/
  api/
    prisma/
      migrations/
      schema.prisma
      seed.ts
    src/
      auth/
      common/
      companies/
      dashboard/
      guests/
      prisma/
      properties/
      reservations/
      rooms/
      app.module.ts
      main.ts
  web/
    app/
    components/
    lib/
packages/
  config/
  eslint-config/
  types/
  ui/
```

## Database Model

Core relationships:

- `Company` owns users through `CompanyUser`, properties, guests, reservations, payments, invoices, automations, integrations, notifications, subscriptions, and audit logs.
- `Property` belongs to a company and owns room types, rooms, property staff assignments, reservations, housekeeping, settings, booking page settings, and channel connections.
- `Role` owns permissions through `RolePermission`; `CompanyUser` and `PropertyUser` assign roles.
- `Reservation` belongs to company/property/guest/source and connects rooms through `ReservationRoom`, additional guests through `ReservationGuest`, extras, payments, invoices, channel reservations, and message logs.
- `Room` belongs to a property and room type, and is protected from double booking by service-level availability validation.

See [schema.prisma](apps/api/prisma/schema.prisma) for the complete model, enums, indexes, and foreign keys.

## Implementation Roadmap

Phase 1:

- Monorepo, Docker Compose, environment examples, strict TypeScript, lint/test/build scripts.
- Prisma schema, initial migration, seed data.
- NestJS auth, company/property onboarding, RBAC, rooms, guests, reservations, availability validation, Swagger.
- Next.js auth/onboarding screens and initial dashboard/calendar layout.

Phase 2:

- Payments, invoices, reports, CSV export, printable receipt/invoice pages.
- Reservation calendar drag/resize interactions.
- Housekeeping mobile workflow and notifications.

Phase 3:

- Automation templates, BullMQ scheduling, mock email/WhatsApp/SMS providers.
- Channel manager abstractions and mock Airbnb/Booking.com/Expedia imports.

Phase 4:

- Public booking engine, branded booking URLs, mock online payments, confirmation messaging.
- Analytics depth, PDF export architecture, audit review tools.

## Assumptions

- PostgreSQL and Redis run locally through Docker Compose for development.
- External payment, email, WhatsApp, and channel APIs are mocked until credentials are provided.
- The brand is original temporary branding: OdeoniFlow PMS.
- The first version uses REST APIs, Prisma service validation, and JWT access tokens.

## Setup

```bash
npm install
docker compose up -d postgres redis
cp apps/api/.env.example apps/api/.env
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Web: <http://localhost:3000>

API: <http://localhost:4000>

Swagger: <http://localhost:4000/docs>

## Verification

Run the required quality gates after each major step:

```bash
npm install
npm run lint
npm run typecheck
npm run db:generate
npm run db:migrate
npm run test
npm run build
```

## Production Notes

- Copy `apps/api/.env.example` to `apps/api/.env` and replace all secrets before production.
- Never use local development JWT secrets in production; the API refuses weak production secrets.
- Run `npm run db:generate` and `npm --workspace @odeoniflow/api exec prisma migrate deploy` during deployment.
- Health checks are available at `/health` and `/ready`.
- Keep PostgreSQL backups outside the application host and test restores regularly.
- Legal documents and compliance claims must be reviewed by a qualified lawyer before launch.

See [docs/SAAS_AUDIT.md](docs/SAAS_AUDIT.md) for the current SaaS/security audit and remaining production gaps.
