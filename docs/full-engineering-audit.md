# PKM e-Ledger System — Full Engineering Audit & Remediation

## Executive Summary

This document details the comprehensive full post-implementation engineering audit and the subsequent financial-report-template alignment pass performed on the PKM e-Ledger System codebase (branch `feat/financial-report-template-alignment`).

The audit systematically evaluated:
1. Schema and database migrations (deterministic attachment storage key uniqueness, sidecar lifecycle).
2. Financial domain invariants (active academic term binding, integer cents math, overflow assertions, non-income/expense transfers).
3. Concurrency, versioning, and idempotency (strict integer version validation, lease expiry).
4. Auth & RBAC security (72-byte Bcrypt limits, length constraints, internal error sanitization, atomic org checks).
5. Reports and exports (Schedule 2 Miscellaneous mapping, exact line wrapper heights, header repeating, page capacity checks).
6. File storage and attachments (deterministic physical file rollback on failures, storage reconciliation script, non-disclosing 404s).
7. Digital ledger & UX (active category enforcement, inactive category preservation, direct income/expense creation routes, accessible dialogs).
8. Navigation matrix & OSA isolation (role-derived navigation, org query preservation, no client-side auth decisions).
9. Audit log and Treasurer Log (human-readable summaries, actor user filtering, expandable technical JSON).
10. Test suite expansion and automated verification.

---

## 1. Major Audit Findings & Remediations

### 1.1 Attachment Storage Migration Sidecar Safety
- **Issue**: Preflight script risked data loss during unlinking during failed rollbacks.
- **Fix**: Implemented strict `PREPARED`, `MIGRATED`, `ROLLED_BACK` state machine in `scripts/attachment-storage-preflight.js`. Database identity and uploads root are verified before any file operations. Rollback verifies that physical files are not referenced by `Attachment.storageKey` in SQLite before unlinking.

### 1.2 Academic Term Financial Binding
- **Issue**: Form submissions permitted transactions to target inactive or historical terms if client payload was modified.
- **Fix**: Bound hidden `termId` in `CreateTransactionForm` and `CreateCashTransferForm`. Mutating commands perform atomic DB query for active term (`id`, `organizationId`, `active: true`) inside transaction block and return `"The selected academic term is no longer active. Reload the ledger before recording this entry."` on mismatch.

### 1.3 Version Validation Hardening
- **Issue**: Version parameters used loose regex pattern matching.
- **Fix**: Replaced regex with `parseStrictVersion` enforcing canonical positive integer format (`/^[1-9]\d*$/`), `Number.isSafeInteger(v)`, `v >= 1`, and `v <= 2_147_483_647` across terms, transactions, and transfers in Zod schemas and application services.

### 1.4 Bcrypt UTF-8 Byte Limit & Field Constraints
- **Issue**: Passwords over 72 UTF-8 bytes were silently truncated by Bcrypt; text fields lacked max-length bounds.
- **Fix**: Implemented `validatePasswordLength` in `lib/auth/password.ts` enforcing min 8 characters and max 72 UTF-8 bytes (`Buffer.byteLength(plain, "utf8") <= 72`). Added Zod max length bounds to `fullName` (100) and `username` (50) in registration and profile actions.

### 1.5 Registration Atomic Organization Validation
- **Issue**: Active organization check in `registerAction` occurred outside database transaction.
- **Fix**: Moved organization lookup and `active` check inside `prisma.$transaction` block to eliminate race conditions with organization deactivation.

### 1.6 PDF & Report Package Correctness
- **Issue**: Miscellaneous category bucket key mismatch caused empty column in PDF Schedule 2; text overflow caused overlapping rows.
- **Fix**: Explicitly mapped bucket key `"Misc"` to `"Miscellaneous"`. Dynamically calculated PDF row heights based on wrapped text lines, repeated headers on page breaks, and enforced item capacity checks in Schedule 1 and attachments.

### 1.7 Attachment Failure Semantics & Storage Reconciliation
- **Issue**: Failed uploads could leave unreferenced physical files; non-disclosure status codes differed.
- **Fix**: Deterministic physical file rollback on DB failure in `createTransactionService`, `createCashTransferService`, and `uploadAttachmentAction`. Created `scripts/reconcile-storage.ts` (`npm run storage:reconcile`). Updated attachment route handler to return 404 for cross-organization or deleted entry attachments.

### 1.8 Transaction Category Switching & Inactive Categories
- **Issue**: Switching transaction type retained stale category or forced first option; editing historical entry with inactive category failed.
- **Fix**: Reset category selection state when transaction type changes in `CreateTransactionForm` and `EditTransactionForm`. Preserved inactive categories with `(Inactive)` label on existing entries while requiring active categories for new selections.

### 1.9 Usability, Navigation, & Audit Log Improvements
- **Issue**: Navigation menus were not strictly role-derived; Treasurer Log displayed raw JSON.
- **Fix**: Derived navigation matrices strictly from authenticated server-side role (`getPortalNavLinks`). Formatted Treasurer Log entries with human-readable action summaries, user filtering, clear buttons, and expandable technical JSON blocks.

### 1.10 Final P2/P3 Remediation Pass (Security Pinning, Modal Focus, Keyset Pagination, Authoritative Field Limits)
- **Security Pinning**: Next.js & `eslint-config-next` exact-pinned to `16.3.0`; the release resolves the applicable PostCSS, Sharp, and NanoID advisory chain.
- **Authoritative Field Limits & Error Visibility**: Render top-level validation error unconditionally in create forms; unified input field limits across server Zod schemas and HTML forms via `TRANSACTION_FIELD_LIMITS` (`documentNumber`: 100, `counterpartyName`: 200, `description`: 500, `referenceDescription`: 500, `eventActivityName`: 200) and `TRANSFER_FIELD_LIMITS` (`documentNumber`: 100, `description`: 500, `referenceDescription`: 500, `eventActivityName`: 200).
- **Dedicated Income/Expense Server Actions**: Added `createIncomeTransactionAction` and `createExpenseTransactionAction` wrappers using production `forceTransactionType` helper to guarantee server-enforced transaction types on `/ledger/income/new` and `/ledger/expense/new`.
- **Direction-Aware Keyset Pagination**: Replaced `cstack` URL history with bi-directional keyset pagination returning `nextCursor` and `previousCursor` in `lib/data/transactions.ts` and `lib/data/audit-log.ts` (supporting Page 1 -> 2 -> 3 -> 4 -> 3 -> 2 -> 1 without URL inflation).
- **Header Responsiveness & Navigation Matrix**: Refactored header breakpoint to `xl` (1280px) to prevent tablet menu overflow; extracted `getPortalNavLinks` helper and added unit tests in `tests/core/navigation.test.ts`.
- **Modal Focus Management**: Wired `useModalFocus.handleKeyDown` to call `shouldAllowModalClose` directly, ensuring modal-focus unit tests directly protect production keyboard behavior.
- **Real Password Boundary Tests**: Created `tests/core/password.test.ts` testing 8-char min, 72 ASCII bytes max accepted, 73 ASCII bytes rejected, multibyte UTF-8 boundary checks, and overflow login handling.
- **Documentation Matrix Alignment**: Audited all entries in `docs/audit-coverage-matrix.md` and refreshed `docs/final-verification-checklist.md`.

### 1.11 Clean-install Prisma Client Generation
- **Issue**: A clean `npm ci` left the placeholder Prisma Client declarations in place, causing the mandated pre-generation typecheck to fail with missing Prisma enums and model types.
- **Fix**: Added the root `postinstall` script (`prisma generate`) so clean dependency installation produces the typed Prisma Client before validation and build commands run.

---

## 2. Final Current-Head Verification Results

Verification executed on `2026-08-09T13:53:00+08:00` from executable Git HEAD `9891d1b` using Node.js v24.15.0, npm 11.12.1, Next.js 16.3.0, SQLite 3, Windows 11, and `cmd.exe` command execution. Documentation changes after this commit do not alter executable sources.

- `npm ci`: exit status 0; root postinstall generated Prisma Client v6.19.3.
- `npm run lint`: exit status 0; 0 errors and 0 warnings.
- `npm run typecheck`: exit status 0.
- `npm run db:generate`: exit status 0.
- `npx prisma validate`: exit status 0; schema valid.
- `npm run test:core`: 11 discovered files; 98 pass, 0 fail, 0 skip.
- `npm run test:integration`: 5 discovered files; 29 pass, 0 fail, 0 skip.
- `npm run test:migrations`: 1 discovered file; 13 pass, 0 fail, 0 skip.
- `npm run test`: 17 discovered files; 140 pass, 0 fail, 0 skip.
- `npm run test:db`: exit status 0; 14 organizations, 18 categories, 71 users, and 14 academic terms validated.
- `npm run build`: exit status 0; 18 route endpoints generated. Six non-fatal Turbopack dynamic-filesystem tracing warnings were emitted for attachment storage.
- `npm run verify-readiness`: exit status 0; all checks passed.
- `npm run storage:reconcile`: exit status 0; dry run modified zero files. Plan reported 27 active orphan candidates, 0 stale staging files, 0 trash items, 0 missing database files, and 0 retained-for-review items.
- Isolated fictional storage-reconciliation dry-run test: passed through the core and full test suites.
- Report-template verification: synthetic anonymized XLSX round-trip passed for the four export sheets, formulas, grouped collections, mapped expense columns, attachment metadata, and print orientation. Synthetic PDF output was visually inspected across summary, collection, expense, and attachment pages.

Final dependency triage reduced the audit to 4 package findings (2 moderate, 2 high), with 3 production findings (2 moderate, 1 high). Remaining records are documented below. No `npm audit fix --force` was run. Manual browser, viewport, focus traversal, and print-preview checks remain explicitly **NOT VERIFIED** in the checklist.

## 3. Current Dependency-Security Triage (2026-08-09)

Commands captured on this branch: `npm audit --json`, `npm audit --omit=dev --json`,
`npm audit`, and `npm audit --omit=dev`. Current totals are 4 findings (2 high,
2 moderate) with 3 findings in the production-only report (1 high, 2 moderate).
`npm explain` and source inspection were used for dependency paths and API reachability.

Class legend: A = runtime, applicable, and fix available; B = runtime, applicable,
and no compatible fix; C = runtime dependency but vulnerable API not reachable;
D = dev-only; E = false-positive or superseded advisory.

| Package and installed version | Severity | Advisory | Directness and dependency path | Runtime / dev | API reachable? | Fix status | Class |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `brace-expansion` 1.1.15, 2.1.2, 5.0.7 | High | [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp), [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg), [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) | Transitive: `exceljs -> archiver -> readdir-glob -> minimatch -> brace-expansion`; separate ESLint/TypeScript-ESLint dev paths | Runtime and dev nodes | No application-controlled glob pattern reaches `readdir-glob`; XLSX export uses ExcelJS `writeBuffer()` and does not call directory globbing | Patched releases exist (`1.1.18`, `2.1.4`, `5.0.9`); non-force dry-run made no lockfile change; no blind override applied | C |
| `js-yaml` 4.3.0 | High | [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) | Transitive: `eslint -> @eslint/eslintrc -> js-yaml` | Dev-only | No production import or route | Patched `4.3.1+` exists; not a runtime remediation target | D |
| `exceljs` 4.4.0 | Moderate | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) through `uuid` | Direct runtime dependency used by `/api/reports/[termId]/excel` | Runtime | ExcelJS is reachable, but its observed UUID call is v4 without a caller-supplied buffer | Audit suggests breaking downgrade to ExcelJS `3.4.0`; no compatible stable fix demonstrated | C |
| `uuid` 8.3.2 | Moderate | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq), range `<11.1.1` | Transitive: `exceljs@4.4.0 -> uuid@8.3.2` | Runtime | ExcelJS source uses `uuidv4()` only; vulnerable v3/v5/v6 buffer API is not reachable, and application source has no direct UUID import | UUID major upgrade was not proven compatible with ExcelJS; no override introduced | C |

Residual audit status: no unresolved applicable runtime HIGH vulnerability. The
remaining audit exit status `1` is documented residual risk from class C and D
records. ExcelJS export regression tests generate and reopen XLSX output.

## 3.1 Historical Dependency-Security Triage (prior executable head)

The following table records an earlier executable-head audit. It is retained for
audit history only; the current table above is authoritative for this branch.

Commands captured before and after remediation: `npm audit --json`, `npm audit --omit=dev --json`, `npm audit`, and `npm audit --omit=dev`. Baseline JSON reported 8 package findings: 6 high and 2 moderate. Production-only baseline reported 7: 5 high and 2 moderate. Npm repeats one advisory when several installed nodes or version ranges are affected; table preserves each distinct advisory ID and range.

Class legend: A = runtime, applicable, and fix available; B = runtime, applicable, and no compatible fix; C = runtime dependency but vulnerable API not reachable; D = dev-only; E = false-positive or superseded advisory.

| Package and baseline version | Severity | Advisory IDs and affected ranges | Directness and dependency path | Runtime or dev-only | Vulnerable API reachable? | Fix status | Class |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `brace-expansion` 1.1.15, 2.1.2, 5.0.7 | High | [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) `<1.1.16`; [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) `<1.1.17`, `2.0.0-2.1.2`, `4.0.0-5.0.7`; [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) `<1.1.18`, `2.0.0-2.1.3`, `4.0.0-5.0.8` | Transitive: `exceljs -> archiver -> archiver-utils/readdir-glob -> glob/minimatch`; separate dev path through `eslint-config-next -> typescript-eslint` | Runtime and dev nodes | No application-controlled brace pattern reaches these helpers; report export calls `ExcelJS.Workbook.xlsx.writeBuffer()` | `npm audit fix` reports a fix; no blind transitive rewrite applied | C |
| `js-yaml` 4.3.0 | High | [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj), range `4.0.0-4.3.0` | Transitive: `eslint -> @eslint/eslintrc -> js-yaml` | Dev-only | No production import or runtime route | Fix available through audit tooling; not a runtime remediation target | D |
| `nanoid` 3.3.15 | High | [GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv) and [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8), range `<=3.3.16` | Transitive: `next -> postcss -> nanoid`; root `@tailwindcss/postcss -> postcss -> nanoid` is dev | Runtime dependency tree and dev | PostCSS uses fixed-size `nanoid(6)` during CSS processing; application has no direct NanoID/PostCSS request path | Fixed by compatible Next upgrade; final NanoID is 3.3.18 | C |
| `next` 16.2.11 | High | Aggregate finding through the PostCSS and Sharp records below; npm JSON supplied no separate Next GHSA | Direct runtime dependency used by all App Router routes | Runtime | Framework is active in application routes; affected transitive packages upgraded together | Safe compatible update to Next 16.3.0; React 19.2.4 and Node 24.15.0 peers remain compatible | A |
| `postcss` 8.5.16 and nested 8.4.31 | High | [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) `<8.5.10`; [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q) `<=8.5.11`; [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) `<=8.5.17`; [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) `<=8.5.22` | Transitive under direct `next`; root copy also under `@tailwindcss/postcss` | Runtime dependency tree and dev | Build-time CSS and source-map processing; no application request accepts PostCSS source input | Fixed by Next 16.3.0, which resolves PostCSS 8.5.23 | A |
| `sharp` 0.34.5 | High | [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj), including CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, and CVE-2026-35591 | Transitive optional dependency: `next -> sharp` | Runtime optional dependency | No `next/image` use exists in application source; framework image optimization can load Sharp | Fixed by Next 16.3.0, which resolves Sharp 0.35.3 | A |
| `exceljs` 4.4.0 | Moderate | Aggregate report entry via [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) on `uuid` | Direct runtime dependency used by Excel export | Runtime | ExcelJS export is reachable, but its observed UUID call is v4 without a caller buffer | Only audit force-fix is ExcelJS 3.4.0, a breaking downgrade; no compatible stable ExcelJS fix | C |
| `uuid` 8.3.2 | Moderate | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq), range `<11.1.1` | Transitive: `exceljs@4.4.0 -> uuid@8.3.2` | Runtime dependency | ExcelJS source uses `uuidv4()` only; no v3/v5/v6 call with `buf` is reachable | Direct UUID override was not proven compatible with ExcelJS; no compatible upstream ExcelJS fix | C |

### Remediation and Final State

- Updated `next` and `eslint-config-next` from `16.2.11` to `16.3.0` without `npm audit fix --force`.
- This resolved the applicable framework chain: PostCSS `8.5.23`, Sharp `0.35.3`, and NanoID `3.3.18`.
- Final `npm audit --json`: 4 findings, 2 high and 2 moderate. Final `npm audit --omit=dev --json`: 3 findings, 1 high and 2 moderate.
- Remaining high finding is `brace-expansion` class C; remaining high `js-yaml` is class D. Remaining moderate `exceljs` and `uuid` records are class C.
- `npm audit` and `npm audit --omit=dev` exit with status 1 because documented residual records remain. No unresolved applicable runtime high vulnerability remains.
- ExcelJS regression coverage generated an XLSX buffer, reopened it with `workbook.xlsx.load`, and passed the report export test. Stable ExcelJS is still 4.4.0; the only audit-suggested fix is breaking ExcelJS 3.4.0, so no UUID major override was introduced.
