<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AGENTS.md

## Project

PKM e-Ledger System is a web-based Student Organization Financial Ledger System for Pambayang Kolehiyo ng Mauban.

Before changing code, read:

1. `docs/project-specification.md`
2. `docs/implementation-roadmap.md`
3. `docs/report-layout-reference.md`
4. `README.md`
5. Relevant existing source files and migrations

Do not make current-status claims without inspecting the repository.

## Current Implementation Status

* **Completed**: Project foundation (`chore/project-foundation`), Database foundation (`feature/database-foundation-completion`), Documentation alignment (`docs/project-context`), Authentication and role-based access (`feature/auth-and-access`), Accounts and academic terms (`feature/accounts-and-terms`), Ledger and transactions (`feature/ledger-and-transactions`), and Reports and exports (`feature/reports-and-exports`).
* **Current**: Transparency portals (`feature/transparency-portals`).
* **Next**: Testing, hardening, and demo (`feature/testing-hardening-and-demo`).

## Source of Truth

`docs/project-specification.md` defines the approved business and functional requirements.

`docs/implementation-roadmap.md` defines the implementation phases and branch scope.

`docs/report-layout-reference.md` defines the required official financial report structure based on the provided official workbook reference.

When code and documentation conflict, identify the conflict before changing behavior. Do not silently replace approved requirements.

## Architecture

The current local-first stack is:

* Next.js App Router
* React
* TypeScript with strict mode
* Tailwind CSS
* Prisma
* SQLite for local development
* Server Actions for application mutations
* Route Handlers for file downloads and report exports
* Server-only data access layer
* Database-backed sessions
* HTML/CSS report viewer
* PDF and Excel report exports

Do not introduce Supabase, another database, a separate backend, or a spreadsheet-viewer framework unless explicitly requested.

Use integer cents for all monetary values. Never use floating-point values for financial calculations.

## Domain Rules

Each organization has separate:

* Users
* Academic terms
* Opening balances
* Transactions
* Ledger summaries
* Reports

Every organization-scoped query must enforce organization isolation.

OSA may view financial reports, financial summaries, and ledger summaries across organizations but must not create, edit, or delete financial transactions, nor manage users, organizations, terms, or categories.

Treasurer, Adviser, and Audit have the same transaction-management permissions.

Officer and Member users have the same summary-and-report view-only permissions.

Transactions do not require approval before becoming final.

Expenses must not exceed the available balance.

Deleted transactions must use soft deletion and must not affect balances or reports.

Editing and deleting transactions must create audit-log entries.

Cash transfers between Cash on Hand and Cash in Bank must not count as income or expense.

Remaining balance is:

$$\text{Remaining Balance} = \text{Opening Cash on Hand} + \text{Opening Cash in Bank} + \text{Active Income} - \text{Active Expenses}$$

## Reports

The in-app report viewer must use HTML and print CSS.

The official report package consists of:

* Summary Report
* Schedule 1 Collections
* Schedule 2 Expenses
* Signature Section
* Receipts / Attachments reference

Excel is an export format, not the in-app report interface.

Do not import the official workbook as application data.

Do not copy real names, signatories, transactions, or amounts from official reference files.

## Authentication and Authorization

Do not rely on hidden UI elements or route redirects for security.

Every Server Action, Route Handler, and data-access function must independently validate:

* Authentication
* Role permission
* Organization scope
* Record ownership or visibility

Passwords must be hashed (using bcrypt).

Session cookies must be HttpOnly.

Public registration must not permit users to grant themselves privileged roles.

Do not send password hashes, raw session tokens, private storage paths, or unrestricted database records to Client Components.

## Attachments

Validate attachment:

* MIME type
* Extension
* Size
* Organization access
* User authorization

Attachments must be accessed through an authorized server route. Do not expose unrestricted local storage paths.

## Development Workflow

Work on only the requested phase.

Before editing:

1. Inspect the current branch and working tree.
2. Inspect relevant files.
3. State the branch goal and intended commits.
4. Confirm that the requested work belongs to the current phase.

Use one branch for each compressed phase.

Use Conventional Commits.

Prefer three to six coherent commits per branch. Do not create a separate commit for every field or component, and do not place an entire major phase into one mixed commit.

Do not amend or rewrite existing commits unless explicitly instructed.

Do not begin the next phase without instruction.

## Validation

During feature phases, run at minimum:

```bash
npm run lint
npm run typecheck
npm run build
npx prisma validate
```

Run database generation, migration, and seed verification when schema or seed files change.

Add focused tests for high-risk logic:

* Financial calculations
* Insufficient-fund validation
* Soft deletion
* Organization isolation
* Role permissions
* Authentication
* Report totals

Do not generate low-value tests for static markup or simple presentational components unless specifically requested.

## Privacy and Repository Rules

Do not commit:

* `.env` files
* SQLite database files
* Uploaded receipts
* Official financial spreadsheets
* Personal student data
* Real passwords
* Real financial records

All seed and test data must be fictional.

Files under `data-sources/` are local references unless explicitly documented otherwise.

## Code Quality

Prefer server components by default.

Use client components only when browser state or interaction requires them.

Keep business calculations in reusable server-side domain functions, not page components.

Keep validation schemas centralized.

Keep authorization checks centralized but invoke them at every protected entry point.

Avoid duplicated financial formulas.

Use descriptive names based on the approved domain terminology.

## Completion Report

After completing a branch, report:

* Branch name
* Commits created
* Main files changed
* Requirements implemented
* Commands run
* Test/build results
* Known limitations
* Recommended next branch

## Communication Mode (Caveman)

<!-- caveman-begin -->
Respond terse like smart caveman. All technical substance stay. Only fluff die.

Rules:
- Drop: articles (a/an/the), filler (just/really/basically), pleasantries, hedging
- Fragments OK. Short synonyms. Technical terms exact. Code unchanged.
- Pattern: [thing] [action] [reason]. [next step].
- Not: "Sure! I'd be happy to help you with that."
- Yes: "Bug in auth middleware. Fix:"

Switch level: /caveman lite|full|ultra|wenyan
Stop: "stop caveman" or "normal mode"

Auto-Clarity: drop caveman for security warnings, irreversible actions, user confused. Resume after.

Boundaries: code/commits/PRs written normal.
<!-- caveman-end -->

## CodeGraph Instructions

<!-- CODEGRAPH_START -->
In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->


