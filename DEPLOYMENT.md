# PKM e-Ledger System — Deployment & Hosting Manual

This document details the configuration, deployment, hosting, and backup maintenance procedures for the **PKM e-Ledger System** on a local Windows Server, VM, or dedicated office workstation at the **Pambayang Kolehiyo ng Mauban (PKM)**.

---

## 1. Prerequisites

Before deploying the application, ensure the following software is installed on the host machine:

1. **Node.js** (v20 LTS or newer recommended) — [Download here](https://nodejs.org/)
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
   npm install --omit=dev
   ```

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

2. **Run Prisma Migrations**:
   This applies the tables, schemas, indexes, and triggers to the SQLite database.
   ```bash
   npx prisma migrate deploy
   ```

3. **Seed Initial Data**:
   This seeds the default organizations, system transaction categories, and initial admin/OSA users:
   ```bash
   npx prisma db seed
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

To protect student organization ledgers and scanned receipts from hard drive failures, schedule automated daily backups.

### Scheduling Backups on Windows (Task Scheduler)

1. Open **Task Scheduler** (`taskschd.msc`) on the server.
2. Select **Create Basic Task...** in the Actions pane.
3. Configure the following:
   * **Name**: `PKM e-Ledger Daily Backup`
   * **Trigger**: `Daily` (Set to a quiet time, e.g., `12:00 AM`)
   * **Action**: `Start a program`
   * **Program/script**: `node`
   * **Add arguments**: `scripts/backup.js`
   * **Start in**: `C:\pkm-eledger`
4. Save the task.

### Running Backups Manually
To perform an on-demand backup before doing system upgrades or configuration changes, run:
```bash
node scripts/backup.js
```
Backups are saved inside `C:\pkm-eledger\backups\backup_YYYYMMDD_HHMMSS\`. The backup utility automatically keeps only the **latest 10 backups** to optimize disk space.

---

## 7. Restoring Data from Backup

If you need to recover the system to a previous state:

1. Execute the restore utility:
   ```bash
   node scripts/restore.js
   ```
2. The script will list all available backups from the `backups/` folder. Select the desired number.
3. Confirm with `yes`.
4. *Safety Guard*: The script automatically saves a temporary rollback copy of your current active files in `backups/temp_safety_rollback/` before overwriting. If anything fails, it reverts itself.

---

## 8. Verification & Pre-flight Health Check

Run the pre-flight verification script to ensure all write permissions, folders, and env parameters are validated and configured:

```bash
node scripts/verify-readiness.js
```
If this outputs `✓ ALL CHECKS PASSED`, the system is fully configured and ready for live production use.
