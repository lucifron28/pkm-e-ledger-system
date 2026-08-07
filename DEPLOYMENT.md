# PKM e-Ledger System — Deployment & Hosting Manual

This document details the configuration, deployment, hosting, and backup maintenance procedures for the **PKM e-Ledger System** on a local Windows Server, VM, or dedicated office workstation at the **Pambayang Kolehiyo ng Mauban (PKM)**.

---

## 1. Prerequisites

Before deploying the application, ensure the following software is installed on the host machine:

1. **Node.js** — Minimum supported runtime: Node >= 20.9 (LTS). Primary repository verification environment: Node 24.15.0 (Node 24 LTS). Node 18 is deprecated and no longer supported.
2. **Git** — [Download here](https://git-scm.com/)
3. **SQLite3** (Usually bundled automatically, but good to have CLI utility installed for low-level DB queries)

---

## 2. Server Setup & Installation

Follow these steps to set up the codebase on the server machine:

1. **Clone or Copy Codebase**:
   ```bash
   git clone <repository-url> C:\pkm-eledger
   cd C:\pkm-eledger
   ```

2. **Install Dependencies**:
   ```bash
   npm ci
   ```
   > **Note**: Do not run `npm install --omit=dev` before building. Build, testing, and database tools (`prisma`, `tsx`, `scripts/migrate.js`) require devDependencies. If production deployment prunes devDependencies (`npm prune --omit=dev`), you MUST run `npm install` (or `npm ci`) to reinstall devDependencies prior to executing maintenance scripts, database migrations, attachment reconciliation, or seeds.

3. **Configure Environment Variables**:
   * Copy the template environment file:
     ```cmd
     copy .env.example .env
     ```
   * Open `.env` in a text editor (e.g. Notepad) and configure the variables:
     * **DATABASE_URL**: We recommend storing the SQLite database in a folder *outside* the application codebase folder to ensure that updates or clean builds never overwrite the production database.
       Example: `file:C:/pkm-eledger-data/production.db`
     * **PORT**: Set to the HTTP port (e.g., `3000` or `80` if dedicated).
     * **NEXT_PUBLIC_APP_URL**: The IP address or domain name where the server will be accessed on the local network (e.g., `http://192.168.1.50:3000`).

---

## 3. Database Scaffolding & Migrations

If setting up the system for the first time, initialize the database and tables:

1. **Ensure the database storage folder exists**:
   If you set `DATABASE_URL="file:C:/pkm-eledger-data/production.db"`, create the `C:\pkm-eledger-data` directory.

2. **Generate Prisma Client**:
   ```bash
   npm run db:generate
   ```

3. **Run Migrations through the Safe Orchestrator**:
   This applies the tables, schemas, indexes, and triggers to the SQLite database.
   The orchestrator inspects the `Attachment` table shape, runs the attachment
   storage-key preflight automatically for legacy databases (copying duplicated
   physical files to their deterministic migration keys, refusing to overwrite
   conflicting pre-existing files), applies the Prisma migration, and rolls back
   preflight-copied files if the migration fails.
   ```bash
   npm run db:migrate:deploy
   ```
   > **Important**: Never run `npx prisma migrate deploy` directly. The
   > orchestrator (`scripts/migrate.js`) is the only supported migration entry
   > point so the storage-key preflight can never be bypassed.

4. **Seed Initial Data**:
   This seeds the default organizations, system transaction categories, and initial admin/OSA users:
   ```bash
   npm run db:seed
   ```

---

## 4. Building the Application

Compile the Next.js server to generate optimized static files and compiled route bundles:

```bash
npm run build
```

Verify that the build compilation exits with no errors.

---

## 5. Hosting the Application with PM2

To keep the application running persistently in the background and restart automatically if the machine reboots or the server process crashes, we use **PM2**.

1. **Install PM2 globally**:
   ```bash
   npm install -g pm2
   ```

2. **Start the Next.js Production Server**:
   ```bash
   pm2 start npm --name "pkm-eledger" -- run start
   ```

3. **Configure Startup on Windows**:
   To make PM2 start on Windows startup:
   * Install `pm2-windows-service` (run as Administrator in PowerShell):
     ```powershell
     npm install --global --unsafe-perm pm2-windows-service
     pm2-service-install
     ```
     *When prompted, select "Perform automatic startup" and use the default settings.*
   * Save the current active PM2 process list:
     ```bash
     pm2 save
     ```

---

## 6. Disaster Recovery: Automated Backups

To protect student organization ledgers and scanned receipts from hard drive failures, schedule automated backups.

### Offline Backup Requirement
The SQLite backup utility requires the application writer process (PM2) to be stopped before taking a backup. Running backup while the application process is writing can result in unflushed WAL state or database lock errors.

Before backing up:
1. Stop the application process via PM2:
   ```bash
   pm2 stop pkm-eledger
   ```
2. Run the backup utility with confirmation flag (or `APP_WRITER_STOPPED=true` env var):
   ```bash
   node scripts/backup.js --confirm-app-stopped
   ```
3. Restart the application process:
   ```bash
   pm2 start pkm-eledger
   ```

Backups are saved inside `backups/backup_YYYYMMDD_HHMMSS/`. The backup utility verifies SQLite `PRAGMA integrity_check` and retains the latest 10 backups.

### Scheduling Backups on Windows (Task Scheduler)
To automate daily backups during off-peak hours (e.g., 2:00 AM), create a batch script `scripts/daily-backup.cmd`:
```cmd
pm2 stop pkm-eledger
node scripts/backup.js --confirm-app-stopped
pm2 start pkm-eledger
```
Configure Task Scheduler (`taskschd.msc`) to run `scripts/daily-backup.cmd` daily.

---

## 7. Restoring Data from Backup

Restoring data overwrites active SQLite database files and attachment uploads. The application process MUST be stopped before restoring.

1. Stop the application process:
   ```bash
   pm2 stop pkm-eledger
   ```
2. Execute the restore utility:
   ```bash
   node scripts/restore.js --confirm-app-stopped
   ```
3. Select the target backup from the interactive prompt (or pass target folder: `node scripts/restore.js backup_YYYYMMDD_HHMMSS --confirm-app-stopped`).
4. *Safety Guard*: The restore utility validates `PRAGMA integrity_check` on the backup *before* modifying active files, clears stale WAL sidecar files, overwrites active database and uploads, runs `PRAGMA integrity_check` on the restored database, and automatically rolls back if any step fails.
5. Restart the application process:
   ```bash
   pm2 start pkm-eledger
   ```

## 8. Verification & Pre-flight Health Check

Run the pre-flight verification script to ensure local environment prerequisites, database connection, and folder write permissions are configured:

```bash
node scripts/verify-readiness.js
```
*Note*: The readiness script verifies environment prerequisites and storage permissions; it does not prove end-to-end production deployment success or replace functional testing.
