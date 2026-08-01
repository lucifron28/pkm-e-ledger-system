# PKM e-Ledger System — Final Release & Demo Verification Checklist

This document details the final verification checklist for validating the **PKM e-Ledger System** prior to demonstration and final verification audit at Pambayang Kolehiyo ng Mauban (PKM).

---

## Verification Execution Evidence Log

- **Execution Timestamp**: `2026-08-06T21:24:08+08:00`
- **Execution Environment**: Node.js v24.15.0, SQLite 3, Windows 11 / PowerShell
- **Node 20 Note**: The implementation no longer depends on `node:sqlite`; integrity checks use the existing `@prisma/client` dependency via `PRAGMA integrity_check`. Direct execution on Node 20 remains **NOT VERIFIED** — this environment only ran Node 24.15.0, so Node 20 runtime compatibility was not verified.

---

## Latest Automated Verification Evidence (2026-08-06)

- `npm run test:core` — **7 files, 65 cases, 65 pass / 0 fail / 0 skip** (`attachments.test.ts`, `audit.test.ts`, `financial.test.ts`, `money.test.ts`, `rbac.test.ts`, `reports.test.ts`, `transfers.test.ts`).
- `npm run test:integration` — **5 files, 29 cases, 29 pass / 0 fail / 0 skip** (`concurrency.test.ts`, `organization-isolation.test.ts`, `recovery.test.ts`, `security-routes.test.ts`, `seed.test.ts`).
- `npm run test:migrations` — **1 file, 8 cases, 8 pass / 0 fail / 0 skip** (`migration.test.ts`; includes the 5 migration-orchestrator tests added in this hardening pass).
- `npm run test` (full suite) — **13 files, 102 cases, 102 pass / 0 fail / 0 skip**.
- `npm run test:db` — smoke test passes (14 organizations, 18 categories, 71 users, 14 academic terms).
- `npm run build` — succeeds cleanly generating the Next.js App Router production bundle (**15 route endpoints**).
- `npm run lint`, `npm run typecheck`, `npx prisma validate`, `npx prisma generate`, `npm run verify-readiness` — all pass with exit status 0.

---

## Pre-flight Verification Checklist

### 1. Environment & Dependencies Setup
- [x] Node.js environment confirmed (v24.15.0).
- [x] `.env` file present and configured (`DATABASE_URL="file:./dev.db"`).
- [x] `npm install` executed cleanly without dependency conflicts.
- [x] `npx prisma validate` confirms valid database schema.

### 2. Automated Test Suite Execution
- [x] `npm run lint` passes with 0 errors and 0 warnings (`eslint`).
- [x] `npm run typecheck` passes with 0 TypeScript compilation errors (`tsc --noEmit`).
- [x] `npm run test:core` passes 65 core unit tests across 7 test files (`attachments.test.ts`, `audit.test.ts`, `financial.test.ts`, `money.test.ts`, `rbac.test.ts`, `reports.test.ts`, `transfers.test.ts`).
- [x] `npm run test:integration` passes 29 integration tests across 5 test files (`concurrency.test.ts`, `organization-isolation.test.ts`, `recovery.test.ts`, `security-routes.test.ts`, `seed.test.ts`), including production-Prisma-singleton isolation assertions (`PRAGMA database_list` targets the temporary test database), restore CLI confirmation tests, real concurrency/idempotency scenarios, migration-orchestrator storage-key tests, and seed idempotency.
- [x] `npm run test:migrations` passes 8 migration tests across 1 test file (`migration.test.ts`), including empty-DB deploy, legacy upgrade with real-file storage-key resolution, missing-file preflight abort, and the 5 migration-orchestrator scenarios (legacy migration, rerun no-op, identical pre-existing destination, conflicting pre-existing destination, failed-migration rollback retaining pre-existing files).
- [x] `npm run test` passes full test suite (102/102 passing across 13 test files; 0 fail, 0 skip).
- [x] `npm run test:db` passes database smoke test against an isolated fictional seeded database (14 organizations, 18 categories, 71 users, 14 academic terms; verifies single active term per org, canonical YYYY-YYYY academic year format, typed category buckets, all six roles, and unique demo usernames).
- [x] `npm run build` succeeds cleanly generating Next.js App Router production bundle (15 route endpoints).

### 3. Disaster Recovery & System Utilities Verification
- [x] `npm run verify-readiness` outputs `✓ ALL CHECKS PASSED` (verifies local environment prerequisites; it does not prove production deployment success).
- [x] `npm run backup` (with `--confirm-app-stopped`) creates timestamped backup containing `dev.db` and uploads in `backups/backup_YYYYMMDD_HHMMSS/`.
- [x] `backups/` directory ignored in `.gitignore`.
- [x] Backup, restore, preflight rejection, restore shutdown-confirmation enforcement, and post-replacement rollback safety verified in isolated SQLite database sandbox harness (`tests/integration/recovery.test.ts`).

### 4. Role & Authorization Security Scan
- [x] **Tested service/handler portions**: Management role (Treasurer, Adviser, Audit) access to term, detailed ledger, transaction edit, attachment download, and PDF/XLSX export services verified via production DAL and route-handler integration tests.
- [x] **Tested service/handler portions**: Officer/Member access to same-organization term and HTML report services verified; rejection from management services (detailed ledger, term management, transaction edit, exports) verified.
- [x] **Tested service/handler portions**: OSA access to monitoring services (active organization selection, inactive/nonexistent rejection, ledger summary) verified; OSA rejection from org-portal and management services verified even with a hypothetical `organizationId`.
- [x] **Tested service/handler portions**: Attachment and export route handlers return correct status codes (200/401/403/404) with security headers; test uploads isolated in a temporary sandbox directory.
- [ ] **Complete Management browser/action workflow** (6-card dashboard, term settings UI, transaction mutation forms, Treasurer Log UI, report viewer interactions): `NOT VERIFIED - Manual browser testing required`.
- [ ] **Complete Transparency (Officer/Member) browser/action workflow**: `NOT VERIFIED - Manual browser UI redirect/navigation test required`.
- [ ] **Complete OSA browser flow** (multi-org overview, explicit org selector, row-less ledger view): `NOT VERIFIED - Manual browser UI navigation test required`.

### 5. Responsive Design & Accessibility Scan
- [ ] Viewport navigation checked at ~360px mobile, ~768px tablet, and desktop viewports (`NOT VERIFIED - Manual UI viewport inspection required`).
- [x] `PortalNav` desktop navigation (`hidden md:flex`) and mobile menu toggle (`md:hidden`) with `aria-expanded` and `aria-controls="mobile-menu"` (markup-level check only).
- [x] All interactive buttons and inputs have visible focus indicators (`focus-visible:ring-2`) (markup-level check only).
- [x] Official PKM color palette (`#004aad` primary, `#f9d818` accent) used consistently (markup-level check only).
- [ ] Print CSS verified: Summary & S1 in portrait, Schedule 2 in landscape, toolbar and headers hidden on print (`NOT VERIFIED - Manual print preview inspection required`).

### 6. Repository & Privacy Compliance
- [x] No `.env` secrets, real passwords, or personal student data tracked by Git.
- [x] No SQLite `.db` binary files or uploaded receipt files tracked by Git.
- [x] All seed data and test records use fictional names and synthetic figures.
