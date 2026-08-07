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
- **Fix**: Replaced regex with `parseStrictVersion` enforcing strict integer validation `Number.isInteger(v) && v >= 1` across terms, transactions, and transfers in Zod schemas and application services.

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
- **Fix**: Derived navigation matrices strictly from authenticated server-side role. Formatted Treasurer Log entries with human-readable action summaries, user filtering, clear buttons, and expandable technical JSON blocks.

---

## 2. Verification Suite Results

All automated verification gates passed successfully:
- `npm run lint`: Clean (0 errors).
- `npm run typecheck`: Clean (0 errors).
- `npm run build`: Production build succeeded.
- `npx prisma validate`: Schema valid.
- `npm run test:core`: All core tests passed.
- `npm run test:integration`: All integration tests passed.
- `npm run test:migrations`: Storage migration tests passed.
- `npm run verify-readiness`: All system readiness checks passed.
