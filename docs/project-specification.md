# PKM e-Ledger System — Project Specification

## 1. System Overview & Theme

The **PKM e-Ledger System** is a web-based Student Organization Financial Ledger System developed for **Pambayang Kolehiyo ng Mauban (PKM)**. The system digitizes financial record-keeping, cash management, attachment management, and report generation for all recognized student organizations under the Office of Student Affairs (OSA).

### Visual Branding & Theme
* **Primary Color**: Navy Blue (`#003366` / `bg-blue-900`)
* **Secondary / Accent Color**: Gold / Yellow (`#FFCC00` / `bg-yellow-500`)
* **Design Philosophy**: Clean, light-mode financial interface prioritizing high legibility, structured table density, and print readiness.

---

## 2. Recognized Student Organizations

The system supports all 14 official PKM student organizations:

1. Agricultural Group of Students
2. Ang Lipunan
3. Ang Simbuhan
4. Junior Philippine Institute of Accountants
5. Kundayan Dance Krew
6. Lex et Ordo
7. Math Society
8. Musical Instructions & Tutorial for Teachers & Students
9. Samahan ng mga Mag-aaral sa Filipino
10. Supreme Student Council
11. Student Association on Food Education
12. Society of Elementary Educator Students
13. Students Response Units
14. The Language Guild

---

## 3. Exact Roles and Permissions

The system defines 6 distinct roles across two administrative spheres: Organization-level management and OSA monitoring.

### Role Definitions

* **TREASURER**: Primary financial officer of an organization. Can record, edit, and soft-delete transactions, set opening balances, upload/delete attachments, view Treasurer Logs, and generate financial reports.
* **ADVISER**: Faculty adviser of an organization. Shares identical transaction-management, opening-balance, attachment-management, and report-generation privileges with the Treasurer for full oversight.
* **AUDIT**: Organization internal auditor. Shares identical transaction-management and oversight privileges with the Treasurer and Adviser to conduct audit verifications and review Treasurer Logs.
* **OFFICER**: Student organization officer (e.g., President, Vice President, Secretary). Has view-only access to organization financial summaries, cash balances, and generated reports. Cannot view or edit detailed transaction records.
* **MEMBER**: Student organization member. Shares identical summary-and-report view-only privileges with Officers for financial transparency.
* **OSA**: Office of Student Affairs monitoring account. Has view-only monitoring access across all 14 student organizations (financial summaries, ledger summaries, and reports). OSA may **not** create, edit, or delete transactions, nor manage users, organizations, terms, or categories.

### Role Permissions Matrix

| Permission / Action | TREASURER | ADVISER | AUDIT | OFFICER | MEMBER | OSA |
|---------------------|:---------:|:-------:|:-----:|:-------:|:------:|:---:|
| View Org Summary & Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (All Orgs) |
| View Financial Reports | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (All Orgs) |
| Generate Financial Reports | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ (All Orgs) |
| Record Income / Expense | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Edit Transactions | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Soft-Delete Transactions | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Set Opening Balances | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Upload / Delete Attachments | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| View Detailed Transaction Ledger | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| View Treasurer Logs | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Switch Organization View | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |

---

## 4. Navigation Menus & Public Pages

### Public Pages (Unauthenticated)
* `/login` — User authentication portal.
* `/register` — Account registration form (users select organization and request role; registration prevents self-assigning privileged roles without authorization).
* `/change-password` — Password update form for account holders.

### Authenticated Navigation Structure
* **Financial Management Portal** (Treasurer, Adviser, Audit):
  * **Dashboard** (`/dashboard`): Financial overview cards, cash accounts breakdown, recent activity.
  * **Digital Ledger** (`/ledger`): Transaction table with filters, search, and action buttons.
  * **New Income** (`/ledger/income/new`): Income transaction form.
  * **New Expense** (`/ledger/expense/new`): Expense transaction form.
  * **Reports** (`/reports`): Report package viewer (Summary, S1, S2), PDF printer, and Excel exporter.
  * **Treasurer Log** (`/audit-log`): Log of transaction entries, edits, soft-deletions, and balance adjustments.
  * **Term Settings** (`/settings/term`): Opening balance setup for Cash on Hand and Cash in Bank.
* **Transparency Portal** (Officer, Member):
  * **Dashboard** (`/dashboard`): Financial summary cards and balance totals.
  * **Reports** (`/reports`): Published report package viewer and PDF exporter.
* **OSA Monitoring Portal** (OSA):
  * **OSA Overview** (`/osa`): Organization selector and multi-organization summary grid.
  * **Organization Ledger Summary** (`/ledger`): Read-only financial summary across organizations.
  * **Reports** (`/reports`): System-wide report package viewer.

---

## 5. Dashboard Cards & Metrics

The dashboard displays five core summary cards:

1. **Opening Balance**: Combined opening Cash on Hand + Opening Cash in Bank for the active term.
2. **Cash on Hand Balance**: Opening Cash on Hand + Active Cash on Hand Income - Active Cash on Hand Expenses.
3. **Cash in Bank Balance**: Opening Cash in Bank + Active Cash in Bank Income - Active Cash in Bank Expenses.
4. **Total Income**: Aggregate of all active (non-deleted) income transactions for the term.
5. **Total Expenses**: Aggregate of all active (non-deleted) expense transactions for the term.
6. **Total Available Cash / Remaining Balance**: 
   $$\text{Remaining Balance} = \text{Opening Cash on Hand} + \text{Opening Cash in Bank} + \text{Active Income} - \text{Active Expenses}$$

---

## 6. Transaction Categories and Fields

### Income Categories (Schedule 1 Buckets)
1. Membership Dues
2. Monthly Contribution
3. Donation
4. Booth Subsidy
5. Prize / Award
6. Organization Shirt
7. Sales
8. Others

### Expense Categories (Schedule 2 Columns)
1. Supplies
2. Equipment
3. Transportation
4. Meals
5. Service
6. Miscellaneous
7. Donation
8. Events
9. Activities
10. Others

### Required Transaction Fields
* **Transaction Type**: Income or Expense.
* **Date**: Transaction date (`YYYY-MM-DD`).
* **Document Number**: Official Receipt (OR) or Acknowledgement Voucher number.
* **Amount**: Entered in Pesos, converted and stored as integer cents (`Int`).
* **Cash Account**: Cash on Hand or Cash in Bank.
* **Category**: Selected from defined Income or Expense categories.
* **Payor / Payee (Counterparty Name)**: Name of person/entity receiving or giving funds.
* **Description**: Detailed description of the transaction.
* **Reference / Purpose**: Purpose or reference details.
* **Event / Activity Name**: Optional linked event or project name.

---

## 7. Validation Rules and Messages

* **Monetary Formatting**: Amounts must be positive, non-zero numbers.
* **Insufficient Funds Rule**: Expenses must not exceed available balance for the specified account (Cash on Hand or Cash in Bank).
  * Error message: *"Transaction failed: Insufficient funds in Cash on Hand/Bank balance."*
* **Mandatory Fields**: Date, Amount, Category, Description, and Cash Account are strictly required.
* **Soft Deletion Reason**: A deletion reason is mandatory when soft-deleting a transaction.

---

## 8. Digital Ledger Columns and Filters

### Ledger Table Columns (Treasurer, Adviser, Audit)
1. Date
2. Document Number
3. Category
4. Payor / Payee
5. Particulars / Description
6. Cash Account
7. Income Amount (₱)
8. Expense Amount (₱)
9. Running Balance (₱)
10. Actions (Edit, Soft-Delete, View Attachments)

### Ledger Filters
* Date Range (Start Date / End Date)
* Transaction Type (All, Income, Expense)
* Cash Account (All, Cash on Hand, Cash in Bank)
* Category (Dropdown filter)
* Search (Text search across description, document number, and counterparty)

---

## 9. Opening Balance Rules

* Opening balances must be configured at the beginning of each Academic Term for:
  * Opening Cash on Hand (cents)
  * Opening Cash in Bank (cents)
* Balance Forwarded is the sum of both accounts.
* Opening balance adjustments are logged in the Treasurer Log.

---

## 10. Treasurer Log Contents

The Treasurer Log (Audit Log) records:
* Timestamp
* User & Role
* Action Type (`ADDED_INCOME`, `ADDED_EXPENSE`, `EDITED_TRANSACTION`, `DELETED_TRANSACTION`, `CHANGED_OPENING_BALANCE`, `UPLOADED_ATTACHMENT`, `DELETED_ATTACHMENT`)
* Entity ID & Transaction Details
* Deletion Reasons and Before/After monetary values

---

## 11. Report Package & Layout Reference

The report package structure is based on the provided official workbook reference:

1. **Summary Report**: Portrait page displaying organization header, balance forwarded (Cash on Hand + Bank), collections by category, total cash available, less: total expenses, ending balance, and signature block.
2. **Schedule 1 Collections**: Portrait schedule grouping income collections by category/payor with sequence numbers and totals.
3. **Schedule 2 Expenses**: Landscape schedule with categorical expense columns (Supplies, Equipment, Transportation, Meals, Service, Misc, Donation, Others) and document numbers.
4. **Signature Section**: Formatted signature blocks for Treasurer, Adviser, Auditor, and President / OSA Representative.
5. **Outputs**: HTML viewer, Print CSS (`@media print`), and downloadable `.xlsx` Excel files (`exceljs`).

---

## 12. Member & OSA Modules

* **Member Module**: Provides read-only financial transparency. Members view cash balance cards, income/expense totals, and published report packages. Detailed transaction ledgers are restricted to preserve financial control.
* **OSA Module**: Provides read-only multi-organization oversight. Includes an organization switcher to inspect financial status across all 14 student organizations. OSA does not edit or record entries.

---

## 13. Account and Password Behavior

* **Password Security**: Passwords are **hashed** using `bcryptjs` (cost factor 12). Plaintext passwords are never stored or logged.
* **Session Cookies**: Session tokens are stored in `HttpOnly`, `SameSite=Lax` cookies with server-side database validation (`Session` table).
* **Password Resets**: Account holders can update passwords via `/change-password`.

---

## 14. Functional & Non-Functional Requirements

### Functional Requirements (FRs)
* **FR-1**: System must support organization isolation across all queries.
* **FR-2**: System must store all monetary amounts as integer cents.
* **FR-3**: System must enforce insufficient balance validation on expense entries.
* **FR-4**: System must preserve soft-deleted records and exclude them from financial totals.
* **FR-5**: System must support file attachment uploads (JPEG, PNG, PDF up to 10 MB) via authenticated routes.
* **FR-6**: System must generate multi-page financial report packages matching reference specifications.

### Non-Functional Requirements (NFRs)
* **NFR-1**: Local-first operation without reliance on external cloud services.
* **NFR-2**: Fast page load and report rendering performance under 2 seconds.
* **NFR-3**: Strict RBAC authorization checks on every Server Action and Route Handler.
