# PKM e-Ledger System — Implementation Roadmap

This document defines the implementation roadmap for the PKM e-Ledger System, tracking compressed phase scopes, branch names, grouped commits, dependencies, and current status.

---

## Roadmap Overview & Status Summary

| Phase | Branch Name | Primary Goal | Status |
|-------|-------------|--------------|--------|
| **Phase 0** | `chore/project-foundation` | Base repository scaffolding, PKM theme tokens, folder structure, and layout reference documentation. | **Completed** |
| **Phase 1** | `feature/database-foundation-completion` | Foundational SQLite database schema (because later phases may require additional migrations), initial migration, database runtime client, seed scripts, and verification. | **Completed** |
| **Phase Context** | `docs/project-context` | Align project specification, implementation roadmap, agent instructions, and README with approved FRD. | **In Review** |
| **Phase 2** | `feature/auth-and-access` | Authentication, user registration flow, bcrypt password hashing, database sessions, password changes, and RBAC matrix. | **Not Started** |
| **Phase 3** | `feature/accounts-and-terms` | Organization contexts, academic terms, and opening cash balances (Cash on Hand vs. Cash in Bank). | **Not Started** |
| **Phase 4** | `feature/ledger-and-transactions` | Income/expense entry, integer-cent arithmetic, insufficient balance checks, soft deletion, attachments, and Treasurer Logs. | **Not Started** |
| **Phase 5** | `feature/reports-and-exports` | HTML report package viewer (Summary, S1, S2), print CSS stylesheets, PDF generator, and Excel export (`exceljs`). | **Not Started** |
| **Phase 6** | `feature/transparency-portals` | Member transparency view, OSA multi-organization monitoring overview, and organization switcher. | **Not Started** |
| **Phase 7** | `feature/testing-hardening-and-demo` | Focused automated unit tests, security hardening, responsive UI polish, demo preparation, and FRD traceability. | **Partially Started** *(Supporting backup, restore, readiness, and deployment utilities already implemented)* |

---

## Detailed Phase Scope & Grouped Commits

### Phase 0: Project Foundation
* **Branch**: `chore/project-foundation`
* **Dependencies**: Initial repository creation
* **Goal**: Prepare project structure, PKM color tokens (`#004aad` and `#f9d818`), and reference documentation.
* **Status**: **Completed**

### Phase 1: Database Foundation Completion
* **Branch**: `feature/database-foundation-completion`
* **Dependencies**: Phase 0
* **Goal**: Establish the foundational SQLite database schema (because later phases may require additional migrations) with enums, indexes, initial migrations, runtime client initialization, seed data, and smoke tests.
* **Grouped Commits**:
  1. `feat(db): setup prisma sqlite runtime and database scripts`
  2. `feat(schema): add final schema integrity changes`
  3. `feat(db): add initial migration and database seed data`
  4. `docs(db): document database foundation and add basic verification smoke tests`
* **Status**: **Completed**

### Documentation & Context Integration
* **Branch**: `docs/project-context`
* **Dependencies**: Phase 1
* **Goal**: Reconcile all project documentation (`docs/project-specification.md`, `docs/implementation-roadmap.md`, `AGENTS.md`, `README.md`) with the approved FRD.
* **Grouped Commits**:
  1. `docs: add complete PKM e-Ledger project specification`
  2. `docs: add compressed implementation roadmap`
  3. `docs: define repository agent instructions`
  4. `docs: update README project navigation`
  5. `docs: finalize project specification alignment`
* **Status**: **In Review**

### Phase 2: Authentication & Access
* **Branch**: `feature/auth-and-access`
* **Dependencies**: Phase 1
* **Goal**: Implement user authentication, user registration flow with role authorization, bcrypt password hashing, database session cookies, password reset workflows, and server-side RBAC validation.
* **Expected Grouped Commits**:
  1. `feat(auth): implement session store and cookie management`
  2. `feat(auth): implement login, registration, and password change server actions`
  3. `feat(auth): implement RBAC matrix and access control helpers`
* **Status**: **Not Started**

### Phase 3: Accounts & Academic Terms
* **Branch**: `feature/accounts-and-terms`
* **Dependencies**: Phase 2
* **Goal**: Implement organization context selection, academic term management, and opening cash balance setup (Cash on Hand and Cash in Bank in integer cents).
* **Expected Grouped Commits**:
  1. `feat(terms): implement academic term selection and configuration`
  2. `feat(terms): implement opening balance setup for cash on hand and cash in bank`
* **Status**: **Not Started**

### Phase 4: Ledger & Transactions
* **Branch**: `feature/ledger-and-transactions`
* **Dependencies**: Phase 3
* **Goal**: Implement income/expense transaction entry, integer-cent monetary arithmetic, insufficient balance checks, soft deletion with deletion reasons, receipt attachment upload/download routes, and Treasurer Log auditing.
* **Expected Grouped Commits**:
  1. `feat(ledger): implement income and expense transaction forms and server actions`
  2. `feat(ledger): implement soft-deletion and Treasurer Log auditing`
  3. `feat(attachments): implement receipt attachment upload and download route handlers`
* **Status**: **Not Started**

### Phase 5: Reports & Exports
* **Branch**: `feature/reports-and-exports`
* **Dependencies**: Phase 4
* **Goal**: Build in-app HTML report viewer, Schedule 1 & 2 layouts, print CSS stylesheets, PDF generator, and `.xlsx` Excel exporter (`exceljs`) based on the official workbook reference.
* **Expected Grouped Commits**:
  1. `feat(reports): implement summary report, schedule 1 collections, and schedule 2 expenses views`
  2. `feat(reports): implement print css layout and pdf printing support`
  3. `feat(reports): implement excel workbook export generator`
* **Status**: **Not Started**

### Phase 6: Transparency Portals & OSA Monitoring
* **Branch**: `feature/transparency-portals`
* **Dependencies**: Phase 5
* **Goal**: Build Member/Officer view-only transparency portal and OSA read-only multi-organization monitoring overview with organization switcher.
* **Expected Grouped Commits**:
  1. `feat(transparency): implement member transparency dashboard and report viewer`
  2. `feat(osa): implement read-only multi-organization monitoring dashboard`
* **Status**: **Not Started**

### Phase 7: Testing, Hardening & Demo Preparation
* **Branch**: `feature/testing-hardening-and-demo`
* **Dependencies**: Phase 6
* **Goal**: Add focused automated unit tests for financial logic and RBAC, apply security hardening, polish responsive UI layouts, conduct end-to-end demo preparation, and verify FRD traceability. Supporting backup (`backup.js`), disaster recovery (`restore.js`), readiness check (`verify-readiness.js`), and deployment manual (`DEPLOYMENT.md`) utilities are already completed as supporting infrastructure.
* **Expected Grouped Commits**:
  1. `test(core): add focused unit tests for financial calculations and rbac`
  2. `fix(security): apply authorization and route security hardening`
  3. `style(ui): polish responsive layouts and print styling`
  4. `docs(demo): prepare demo scripts and final FRD verification checklist`
* **Status**: **Partially Started** *(Supporting utility scripts completed)*
