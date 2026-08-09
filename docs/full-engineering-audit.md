# PKM e-Ledger System — Full Engineering Audit & Remediation

## Executive Summary

This document details the comprehensive full post-implementation engineering audit and remediation pass performed on the PKM e-Ledger System codebase (branch `audit/full-project-completeness-ui-docs`).

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
- **Security Pinning**: Next.js & `eslint-config-next` exact-pinned to `16.2.11` to address security advisories.
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

Verification executed on `2026-08-09T10:43:06+08:00` from Git HEAD `a6e78c418bed72df4054ac6cb6cd391a29f32692` using Node.js v24.15.0, npm 11.12.1, Next.js 16.2.11, SQLite 3, Windows 11, and `cmd.exe` command execution.

- `npm ci`: exit status 0; root postinstall generated Prisma Client v6.19.3.
- `npm run lint`: exit status 0; 0 errors and 0 warnings.
- `npm run typecheck`: exit status 0.
- `npm run db:generate`: exit status 0.
- `npx prisma validate`: exit status 0; schema valid.
- `npm run test:core`: 11 discovered files; 97 pass, 0 fail, 0 skip.
- `npm run test:integration`: 5 discovered files; 29 pass, 0 fail, 0 skip.
- `npm run test:migrations`: 1 discovered file; 13 pass, 0 fail, 0 skip.
- `npm run test`: 17 discovered files; 139 pass, 0 fail, 0 skip.
- `npm run test:db`: exit status 0; 14 organizations, 18 categories, 71 users, and 14 academic terms validated.
- `npm run build`: exit status 0; 18 route endpoints generated. One non-fatal Turbopack NFT warning was emitted for dynamic attachment storage tracing.
- `npm run verify-readiness`: exit status 0; all checks passed.
- `npm run storage:reconcile`: exit status 0; dry run modified zero files. Plan reported 27 active orphan candidates, 0 stale staging files, 0 trash items, 0 missing database files, and 0 retained-for-review items.
- Isolated fictional storage-reconciliation dry-run test: passed through the core and full test suites.

`npm ci` also reported 8 dependency audit findings (2 moderate, 6 high). No automatic dependency remediation was performed because it was outside confirmed audit findings. Manual browser, viewport, focus traversal, and print-preview checks remain explicitly **NOT VERIFIED** in the checklist.
