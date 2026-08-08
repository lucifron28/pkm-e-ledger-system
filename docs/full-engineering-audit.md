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

---

## 2. Verification Suite Results

All automated verification gates passed successfully:
- `npm run lint`: Clean (0 errors, 0 warnings).
- `npm run typecheck`: Clean (0 errors).
- `npm run build`: Production build succeeded (18 route endpoints).
- `npx prisma validate`: Schema valid.
- `npm run test:core`: 97/97 core unit tests passed across 11 test files.
- `npm run test:integration`: 29/29 integration tests passed across 5 test files.
- `npm run test:migrations`: 13/13 migration tests passed across 1 test file.
- `npm run test`: Full test suite 139/139 passed across 17 test files (0 fail, 0 skip).
- `npm run test:db`: Database smoke test passed (14 organizations, 18 categories, 71 users, 14 academic terms).
- `npm run verify-readiness`: All system readiness checks passed.
- `npm run storage:reconcile`: Dry-run storage reconciliation completed cleanly.
