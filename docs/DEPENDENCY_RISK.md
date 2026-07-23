# Dependency Risk Register

Last updated: 2026-07-23

## Current Audit Result

Command:

```bash
npm audit --audit-level=moderate
```

Result: failed with 3 advisories.

## Advisories

| Package                | Severity | Direct/transitive             | Installed version | Patched version      | Source                |
| ---------------------- | -------- | ----------------------------- | ----------------- | -------------------- | --------------------- |
| `postcss` under `next` | Moderate | Transitive via `next@16.2.11` | `8.4.31`          | `>=8.5.10`           | `GHSA-qx2v-qp2m-jg93` |
| `sharp`                | High     | Transitive via `next@16.2.11` | `0.34.5`          | `>=0.35.0` per audit | `GHSA-f88m-g3jw-g9cj` |

Root workspace also has direct `postcss@8.5.21`, which is not the affected copy. The vulnerable `postcss@8.4.31` is nested under `node_modules/next/node_modules/postcss`.

## Why Force Fix Is Unsafe

`npm audit fix --force` currently proposes installing `next@9.3.3`, which is a destructive major downgrade from `next@16.2.11`. That would break the App Router architecture and likely introduce larger compatibility and security risks.

## Runtime Exposure

- `postcss`: used in CSS processing/build tooling. Exposure is lower for ordinary authenticated SaaS runtime pages because users are not submitting arbitrary CSS for server-side stringification.
- `sharp`: used by Next image processing paths. Exposure depends on whether untrusted remote image inputs are processed. Current application does not expose an arbitrary public image upload/transform pipeline.

## Mitigation

- Do not run `npm audit fix --force`.
- Keep `next` pinned to a patched future release when available.
- Avoid enabling arbitrary user-controlled remote image transformations until `sharp` advisory is resolved.
- Keep E2E/CI audit visible so the advisories are not forgotten.

## Follow-Up Plan

1. Track the next stable Next.js patch that upgrades nested `postcss` and `sharp`.
2. Upgrade Next.js normally, not through a forced downgrade.
3. Re-run `npm audit --audit-level=moderate`.
4. Remove this accepted-risk entry only after audit passes or the advisories are otherwise proven not applicable.

## Production Blocker

Not currently a production blocker for the implemented local PMS workflows, but it remains a release risk that should be rechecked before public image upload, website-builder media handling, or arbitrary external image proxying is enabled.
