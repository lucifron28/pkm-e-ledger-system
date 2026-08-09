# PKM e-Ledger System — Demonstration Walkthrough Script

This document details the role-by-role demonstration script for evaluating the **PKM e-Ledger System** at Pambayang Kolehiyo ng Mauban (PKM).

---

## 1. Demo Credentials (Fictional Seed Accounts)

| Role | Username | Password | Organization Context |
| :--- | :--- | :--- | :--- |
| **Treasurer** | `demo_treasurer` | *[Supplied locally during demo]* | Recognized Student Organization A |
| **Officer / Member** | `demo_officer` | *[Supplied locally during demo]* | Recognized Student Organization A |
| **OSA Monitor** | `demo_osa` | *[Supplied locally during demo]* | Office of Student Affairs (Multi-Org Oversight) |

*Note: All student names, monetary figures, and transaction descriptions are purely fictional.*

---

## 2. Walkthrough Flow 1: Organization Management (Treasurer)

### Objective
Demonstrate academic term setup, opening cash balance configuration, income and expense entry with attachments, insufficient funds validation, soft deletion, audit logs, and report exports.

1. **Login & Dashboard Inspection**:
   - Log in as `demo_treasurer`.
   - Observe the 6-Card Financial Dashboard: Balance Forwarded / Opening Balance, Cash on Hand, Cash in Bank, Total Income, Total Expenses, and Remaining Balance.

2. **Term Settings & Opening Balances**:
   - Navigate to **Term Settings** (`/settings/term`).
   - View active academic term (e.g., A.Y. 2025-2026 1st Semester).
   - Configure/Verify opening balances: Cash on Hand = ₱1,000.00, Cash in Bank = ₱2,000.00 (Balance Forwarded = ₱3,000.00).

3. **Income Entry**:
   - Navigate to **Digital Ledger** (`/ledger`).
   - Record an Income transaction:
     - Type: Income
     - Category: Membership Fees / Collections
     - Account: Cash on Hand
     - Amount: ₱500.00
     - Payor / Payee: Student Members
     - Reference: OR# 0001
   - Attach a sample receipt (`sample_receipt.pdf`).
   - Observe real-time update of Cash on Hand to ₱1,500.00.

4. **Expense Entry & Insufficient-Funds Validation**:
   - Attempt to record an Expense of ₱5,000.00 from Cash on Hand (exceeding available ₱1,500.00).
   - Observe system rejection: *"Transaction failed: Insufficient funds in Cash on Hand/Bank balance."*
   - Enter a valid Expense of ₱300.00 from Cash on Hand for Office Supplies.

5. **Soft Deletion & Audit Log**:
   - Click **Delete** on the expense transaction and enter a reason: *"Duplicate entry error"*.
   - Confirm transaction is soft-deleted and removed from active ledger totals.
   - Navigate to **Treasurer Log** (`/audit-log`) to inspect the permanent audit trail entry detailing user, timestamp, action (`DELETED_TRANSACTION`), and reason.

6. **Financial Reports & Exports**:
   - Navigate to **Financial Reports** (`/reports`).
   - View HTML Report Package: Summary Report, Schedule 1 Collections, Schedule 2 Expenses, Attachment References, and Signatures.
   - Export **PDF Report** (`/api/reports/[termId]/pdf`).
   - Export **Excel Workbook** (`/api/reports/[termId]/excel`).

---

## 3. Walkthrough Flow 2: Student Member Transparency (Officer / Member)

### Objective
Demonstrate view-only access to financial summaries and reports, historical term switching, and strict RBAC enforcement blocking transaction edits or raw log access.

1. **Login & Dashboard**:
   - Log in as `demo_officer`.
   - Observe the 6-card transparency dashboard for Organization A.

2. **Historical Term Inspection**:
   - Use the Term Selector to view previous academic terms.
   - Observe updated balance metrics and income/expense totals for selected terms.

3. **Report Viewing**:
   - Navigate to **Reports** (`/reports`).
   - View official HTML report package with signature blocks.
   - Verify that PDF/Excel export buttons are hidden for view-only roles.

4. **RBAC Hardening Verification**:
   - Attempt to access `/ledger` or `/audit-log` directly in the browser address bar.
   - Confirm automatic redirection to `/dashboard` or `/access-denied`.

---

## 4. Walkthrough Flow 3: OSA Multi-Organization Oversight (OSA)

### Objective
Demonstrate multi-organization summary monitoring, explicit organization selection, summarized ledger oversight, and strict security isolation blocking transaction rows or exports.

1. **Login & OSA Monitoring Overview**:
   - Log in as `demo_osa`.
   - View the **OSA Overview** (`/osa`) displaying summary metrics for all active recognized student organizations across campus.

2. **Explicit Organization Selection & Summarized Ledger**:
   - Navigate to **Organization Ledger Summary** (`/ledger`).
   - Observe explicit selection state requiring organization choice.
   - Select an organization from the active dropdown list (URL updates to `/ledger?org=supreme-student-council`).
   - Observe summarized financial balances and category subtotals. Verify that individual transaction rows and receipt attachments are omitted.

3. **Cross-Organization Navigation**:
   - Move to **Reports** (`/reports`). Observe that the selected organization parameter (`?org=supreme-student-council`) is preserved.
   - Switch organization to inspect another campus organization's financial summary package.

4. **Security Isolation Verification**:
   - Confirm OSA cannot record, edit, or delete transactions.
   - Confirm direct attempts to access export routes return HTTP 403 Access Denied.
