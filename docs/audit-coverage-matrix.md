# Audit Coverage Matrix

| Area | Finding | Severity | Affected Files | Tests Added | Status |
|---|---|---|---|---|---|
| Migration & Storage | Preflight unlinking safety & state machine | High | `scripts/attachment-storage-preflight.js`, `scripts/migrate.js` | `tests/migrations/migration.test.ts` | Remediated |
| Financial Terms | Active term binding in mutation actions | High | `app/(portal)/ledger/page.tsx`, `lib/application/transactions.ts`, `lib/application/transfers.ts` | `tests/integration/organization-isolation.test.ts` | Remediated |
| Concurrency | Loose version regex replaced with strict integer >= 1 | Medium | `lib/actions/terms.ts`, `lib/actions/transactions.ts`, `lib/actions/transfers.ts` | `tests/core/transfers.test.ts` | Remediated |
| Security | Bcrypt 72-byte limit & max string lengths | High | `lib/auth/password.ts`, `lib/actions/register.ts`, `lib/actions/password.ts` | `tests/core/password.test.ts` | Remediated |
| Security | Atomic org active check in registration | Medium | `lib/actions/register.ts` | `tests/integration/security-routes.test.ts` | Remediated |
| Reports | Schedule 2 "Misc" mapping & PDF row wrapping/headers | High | `lib/domain/reports.ts`, `lib/reports/renderers/pdf-report-renderer.ts` | `tests/core/reports.test.ts` | Remediated |
| Storage & Attachments | Deterministic physical file rollback & non-disclosure 404 | High | `lib/application/transactions.ts`, `lib/actions/attachments.ts`, `app/api/attachments/[id]/route.ts` | `tests/core/attachments.test.ts` | Remediated |
| Storage | Storage reconciliation CLI tool | Medium | `scripts/reconcile-storage.ts`, `package.json` | `tests/core/storage-reconciliation.test.ts` | Remediated |
| Digital Ledger | Category reset on type change & inactive category support | Medium | `app/(portal)/ledger/create-transaction-form.tsx`, `app/(portal)/ledger/edit-transaction-form.tsx`, `lib/application/transactions.ts` | `tests/core/financial.test.ts` | Remediated |
| Digital Ledger | Direct income/expense creation routes | Low | `app/(portal)/ledger/income/new/page.tsx`, `app/(portal)/ledger/expense/new/page.tsx` | `tests/core/financial.test.ts` | Remediated |
| Navigation | Role-derived navigation matrix & OSA query preservation | Medium | `components/navigation/portal-nav.tsx` | `tests/core/rbac.test.ts` | Remediated |
| Audit Log | Human-readable summaries, actor user filter & keyset pagination | Low | `lib/data/audit-log.ts`, `app/(portal)/audit-log/page.tsx` | `tests/core/audit.test.ts` | Remediated |
| Dashboard | Specification-aligned card ordering & terminology | Low | `app/(portal)/dashboard/page.tsx` | Manual UI inspection | Remediated |
| Accessibility | Accessible modal focus management, ARIA attributes & Escape key handling | Medium | `lib/hooks/use-modal-focus.ts`, `app/(portal)/ledger/*.tsx` | `tests/core/modal-focus.test.ts` | Remediated |
