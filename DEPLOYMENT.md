# PKM e-Ledger Deployment Guide

This guide describes the supported deployment shape for the PKM e-Ledger System:

* Vercel for the Next.js application;
* Turso/libSQL for the remote SQLite-compatible database;
* a private Vercel Blob store for receipt attachments.

No official financial workbook, personal record, real signatory, or sample amount is
required by this process. Use fictional data only. This guide does not authorize a
production deployment or destructive cloud operation.

## Runtime Design

The Prisma datasource remains `sqlite`. `lib/db/prisma.ts` selects the runtime adapter:

* Local development: `new PrismaClient()` with `DATABASE_URL=file:./dev.db`.
* Turso deployment: `PrismaLibSQL` with `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
* Turso timestamps: adapter option `timestampFormat: "unixepoch-ms"`.

Both Turso variables are required together. Vercel fails closed when they are absent.
Local SQLite remains available when no Turso variables are set.

Attachments use the same local-first split:

* Local mode stores files below `uploads/` using staging, active, and trash areas.
* Vercel mode uses private Blob namespaces `staging/`, `active/`, and `trash/`.
* Browser uploads use the Vercel Blob client-upload flow, so the file does not pass
  through a Server Action request.
* The server re-authenticates the owner, reads the staged object, checks size, MIME,
  extension, and magic bytes, then copies it to `active/` before creating the database
  record and audit row.
* Downloads always pass through the authenticated organization-scoped route. Blob URLs
  are never exposed as public application links.

## Environment Variables

Copy `.env.example` to the local environment. Fill deployment values in the Vercel
project settings or a secret manager. Do not commit a filled environment file.

| Variable | Local development | Vercel deployment |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` |
| `DATABASE_URL` | `file:./dev.db` | Keep Prisma schema compatibility value `file:./dev.db` |
| `TURSO_DATABASE_URL` | unset | `<FILL_ME_TURSO_DATABASE_URL>` |
| `TURSO_AUTH_TOKEN` | unset | `<FILL_ME_TURSO_AUTH_TOKEN>` |
| `ATTACHMENT_STORAGE_PROVIDER` | `local` | `vercel-blob` |
| `NEXT_PUBLIC_ATTACHMENT_STORAGE_PROVIDER` | `local` | `vercel-blob` |
| `BLOB_READ_WRITE_TOKEN` | unset | `<FILL_ME_VERCEL_BLOB_TOKEN>` |
| `DEMO_PASSWORD` | optional documented local fallback | `<FILL_ME_STRONG_DEMO_PASSWORD>` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | deployed application URL |

`DEMO_PASSWORD` is required by seed/deployment checks in production. The local fallback
is `local-demo-only-password` and is used only when `NODE_ENV` is not `production` and
`VERCEL` is not set. Never use that fallback in a deployed environment.

## Local Preparation

Run from the repository root:

```bash
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run test:db
npm run verify-readiness
```

Use the repository migration orchestrator. Do not run `prisma migrate dev` or
`prisma migrate deploy` directly. Local SQLite files, uploads, and backup folders are
ignored by Git.

## Sanitized Turso Bootstrap

Create a fresh fictional SQLite database from migrations and seed logic. Do not copy an
existing production database, official workbook, student data, attachments, or real
credentials into this file.

PowerShell example:

```powershell
$env:NODE_ENV = "development"
$env:DATABASE_URL = "file:./turso-bootstrap.db"
$env:ATTACHMENT_STORAGE_PROVIDER = "local"
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
npm run test:db
npm run verify-readiness
turso db create <fictional-database-name> --from-file .\prisma\turso-bootstrap.db
```

The generated file is `prisma/turso-bootstrap.db` because relative SQLite URLs are
resolved from the Prisma schema directory. The file is ignored and must not be
committed. Remove it after the Turso database has been created if it is no longer
needed.

If Linux tooling is required, use Docker with the same repository commands rather than
changing application behavior for one host:

```bash
docker run --rm -v "$PWD:/workspace" -w /workspace -e NODE_ENV=development \
  -e DATABASE_URL=file:./turso-bootstrap.db node:20-bookworm \
  bash -lc 'npm ci && npm run db:generate && npm run db:migrate:deploy && npm run db:seed && npm run test:db'
```

The Turso CLI command is run from the host or a separate CLI container. No command in
this repository performs `turso db create` automatically.

## Migration Workflow

Prisma Migrate is a local migration authoring tool for this deployment shape. The
Prisma libSQL adapter does not provide a supported direct remote migration workflow.

For each future schema change:

1. Edit `prisma/schema.prisma` and add the migration through the existing local
   migration/orchestration workflow.
2. Inspect the generated SQL and run local migration, seed, and tests.
3. Apply the reviewed SQL to Turso with the Turso CLI, for example:

   ```powershell
   Get-Content .\prisma\migrations\<migration>\migration.sql | turso db shell <fictional-database-name>
   ```

4. Run `npm run db:generate`, `npx prisma validate`, and the report/ledger regression
   tests against the intended runtime configuration.
5. Record migration name, application timestamp, operator, and verification result in
   the deployment change record.

Never point `prisma migrate deploy` at a remote Turso URL. Never use a schema-only
bootstrap that bypasses migrations, seed constraints, or verification.

## Vercel Project Setup

1. Import the GitHub repository into Vercel.
2. Use Node.js 20 or newer. The build command is `npm run build`; install uses the
   committed lockfile through `npm ci`.
3. Add the environment variables from the table above for Preview and Production as
   appropriate. Keep `DATABASE_URL` present for Prisma schema generation even though
   runtime queries use the Turso adapter.
4. Create a private Blob store and add its read/write token as
   `BLOB_READ_WRITE_TOKEN`. Do not choose public Blob access.
5. Confirm `ATTACHMENT_STORAGE_PROVIDER=vercel-blob` and the matching public variable.
6. Set the Vercel region only after checking latency to the selected Turso primary
   region. `vercel.json` intentionally does not hardcode a region.
7. Run the verification checklist below before approving a deployment.

The PDF, Excel, attachment, Turso, and Blob routes explicitly use the Node.js runtime.
Do not switch those handlers to Edge runtime.

## Attachment Operations

The accepted attachment types are JPEG, PNG, and PDF up to 10 MB. The lifecycle is:

```text
authenticated owner
    -> private staging upload
    -> server-side metadata and magic-byte validation
    -> private active object copy
    -> database Attachment row
    -> audit log
    -> staged-object cleanup
```

If database creation fails after the active copy, the application deletes the active
object only after an ownership lookup proves it is unreferenced. If that lookup fails,
the object is retained for reconciliation. Reconciliation re-queries the database and
fails closed on database or Blob listing errors.

Run local reconciliation with a dry run first:

```bash
npm run storage:reconcile
npm run storage:reconcile -- --confirm
```

The same command selects the Vercel Blob provider when
`ATTACHMENT_STORAGE_PROVIDER=vercel-blob`. Review retained-for-inspection entries;
never delete objects manually while a database reference is uncertain.

## Verification Gate

Run the complete gate from a clean checkout or clean working tree:

```bash
npm ci
npm run lint
npm run typecheck
npm run db:generate
npx prisma validate
npm run test:core
npm run test:integration
npm run test:migrations
npm run test
npm run test:db
npm run build
npm run verify-readiness
npm audit
npm audit --omit=dev
```

Cloud verification must use fictional organization/user data and a private Blob store.
Confirm login, organization isolation, transaction create/edit/delete, cash transfers,
report PDF and Excel exports, attachment upload/download/delete, audit history, and
reconciliation behavior. Do not claim production readiness from a build alone.

## Backup and Recovery

The existing `backup` and `restore` scripts are local SQLite/attachments operations.
They are not a Turso backup strategy. For Turso, use the provider's documented backup,
branch, and restore controls and record the operation outside the repository. For
Vercel Blob, retain private object lifecycle records and use reconciliation before any
manual cleanup.

For local recovery, stop the application before restoring database and uploads, run
the restore validation, then run `npm run test:db` and `npm run verify-readiness`.

## Privacy Rules

* Never commit `.env`, database files, uploads, official spreadsheets, or real student data.
* Never seed real names, signatories, sample amounts, or official workbook records.
* Use fake names and fictional amounts in tests and demos.
* Do not place access tokens in logs, URLs, client bundles, or documentation.
