# PKM e-Ledger System

PKM e-Ledger System is a web-based Student Organization Financial Ledger System
for Pambayang Kolehiyo ng Mauban.

The project is being implemented in phases with a local-first stack:

- Next.js App Router
- TypeScript
- Prisma with SQLite for local development
- Server Actions for mutations
- Route Handlers for PDF, Excel, and download endpoints
- Server-only data access and role-based authorization

## Local Development

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in a browser.

## Current Project Structure

- `app/` contains App Router pages, layouts, and future route groups.
- `components/` is reserved for shared UI components.
- `lib/` is reserved for server-only utilities, validation, auth, RBAC, and data access.
- `prisma/` is reserved for the Prisma schema, migrations, and seed scripts.
- `docs/` contains committed project documentation.
- `data-sources/` may contain ignored local-only reference files.

## Phase 0 Scope

This branch prepares the foundation only:

- Replace starter metadata and home content.
- Add PKM theme tokens.
- Add base project folders for later phases.
- Document the local-only official report layout reference.
- Ignore private official source files while allowing `data-sources/README.md`.

## Local-Only Report References

Official report samples under `data-sources/` are layout references only. Do not
import them as app data, seed data, test data, or demo output. Do not copy names,
student records, signatories, exact sample records, or exact sample amounts into
the application or documentation.

See [docs/report-layout-reference.md](docs/report-layout-reference.md) for the
anonymized report structure expected in later report-generation phases.

## Useful Scripts

```bash
npm run lint
npm run build
```

Deployment is not configured yet; the project will be demonstrated locally first.
