# PKM e-Ledger System

**PKM e-Ledger System** is a web-based Student Organization Financial Ledger System for **Pambayang Kolehiyo ng Mauban (PKM)**. It digitizes financial record-keeping, balance tracking, attachments, audit trails, and reference-aligned financial report generation across all 14 recognized student organizations under the Office of Student Affairs (OSA).

---

## Technical Stack

* **Core**: Next.js 16 (App Router), React 19, TypeScript (Strict mode)
* **Styling**: Tailwind CSS, System / Arial / Helvetica font stack
* **Database & ORM**: SQLite via Prisma ORM 6, with optional Turso/libSQL runtime adapter for deployment
* **Storage**: Local filesystem in development, private Vercel Blob with direct client uploads in deployment
* **Key Architecture**: Server Actions for mutations, Node.js Route Handlers for secure file downloads and PDF/Excel exports (`pdfkit`, `exceljs`), and database-backed sessions with `bcryptjs` password hashing.

---

## Documentation Links

* [Project Specification](docs/project-specification.md) — Complete source of truth for functional rules, RBAC, domain rules, and security specifications.
* [Implementation Roadmap](docs/implementation-roadmap.md) — Multi-phase implementation plan, branch names, grouped commits, and status tracking.
* [Report Layout Reference](docs/report-layout-reference.md) — Anonymized layout specifications for Summary Report, Schedule 1 Collections, Schedule 2 Expenses, and Signatures based on the provided historical workbook reference.
* [Developer Documentation](docs/dev/README.md) — Audit, traceability, demo, UAT, and verification records kept outside core project docs.
* [Repository Agent Guidelines](AGENTS.md) — Coding agent rules, financial invariants, architecture constraints, and testing expectations.
* [Deployment Manual](DEPLOYMENT.md) — Vercel + Turso deployment guide, local SQLite development, and attachment-storage operations.

---

## Current Project Status

The repository foundation and database foundation are completed. Feature development and post-implementation hardening are complete:

* **Phase 0**: Project Foundation (`chore/project-foundation`) — **Completed**
* **Phase 1**: Database Foundation Completion (`feature/database-foundation-completion`) — **Completed**
* **Phase Context**: Documentation Alignment (`docs/project-context`) — **Completed**
* **Phase 2**: Authentication & Access (`feature/auth-and-access`) — **Completed**
* **Phase 3**: Accounts & Academic Terms (`feature/accounts-and-terms`) — **Completed**
* **Phase 4**: Ledger & Transactions (`feature/ledger-and-transactions`) — **Completed**
* **Phase 5**: Reports & Exports (`feature/reports-and-exports`) — **Completed**
* **Phase 6**: Transparency Portals & OSA Monitoring (`feature/transparency-portals`) — **Completed**
* **Phase 7**: Testing, Hardening & Demo Polish (`feature/testing-hardening-and-demo`) — **Completed**
* **Phase 8**: Post-implementation Business-Invariant Hardening (`fix/business-invariants-concurrency-and-audit`) — **Completed** (Merged into `main` via PR #10)
* **Full Engineering Audit & Remediation**: (`audit/full-project-completeness-ui-docs`) — **In Progress**

Phase 8 adds cash transfer workflows, database-level financial invariants, idempotent financial commands, optimistic concurrency, crash-recoverable attachment storage, snapshot-consistent reads, immutable audit history, and cursor pagination. Reports are live generated views (HTML/PDF/XLSX) built from current non-deleted financial data — exports are not immutable publications.

---

## Local Setup & Database Commands

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Database commands**:
   ```bash
   # Generate Prisma Client
   npm run db:generate

   # Run migrations through the safe orchestrator (attachment storage-key
   # preflight runs automatically for legacy databases, with automatic
   # rollback of preflight-copied files if the migration fails)
   npm run db:migrate

   # Production/CI: apply pending migrations through the same orchestrator
   npm run db:migrate:deploy

   # Seed database with fictional demo accounts
   npm run db:seed

   # Run database smoke test
   npm run test:db
   ```
   > **Note**: Never run `prisma migrate dev` or `prisma migrate deploy` directly.
   > Always use `npm run db:migrate` / `npm run db:migrate:deploy` so the
   > attachment storage-key preflight (`scripts/attachment-storage-preflight.js`)
   > is never bypassed.

3. **Run development server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

4. **Seeded Demo Accounts**:
   * **OSA Monitoring Account**: `demo_osa`
   * **Organization Treasurer**: `demo_treasurer_supreme-student-council`
   * **Organization Adviser**: `demo_adviser_supreme-student-council`
   * **Organization Auditor**: `demo_audit_supreme-student-council`

   Demo passwords come from `DEMO_PASSWORD` during seed/deployment. Local development
   may use the documented non-production fallback when `DEMO_PASSWORD` is absent.

---

## Quality & Build Verification

```bash
npm run lint
npm run typecheck
npx prisma validate
npm run test:db
npm run build
```
