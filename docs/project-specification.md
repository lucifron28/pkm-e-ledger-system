# PKM e-Ledger System — Project Specification

## 1. System Overview & Theme

The **PKM e-Ledger System** is a web-based Student Organization Financial Ledger System developed for **Pambayang Kolehiyo ng Mauban (PKM)**. The system digitizes financial record-keeping, cash balance tracking, attachment management, audit logging, and official report generation for all recognized student organizations under the Office of Student Affairs (OSA).

### Visual Branding & Theme
* **Primary Blue**: `#004aad`
* **Accent Yellow**: `#f9d818`
* **Design Philosophy**: Clean, light-mode financial interface prioritizing high legibility, structured data density, and print readiness.

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

The system defines 6 distinct roles across two administrative spheres: Organization-level management and OSA monitoring. There is no OSA Super Admin role; OSA operates as a read-only monitoring account across organizations.

### Role Definitions & Behavior

* **TREASURER**: Primary financial officer of an organization. Can record, edit, and soft-delete transactions, set opening balances, upload/delete attachments, view Treasurer Logs, and generate financial reports.
* **ADVISER**: Faculty adviser of an organization. Shares identical transaction-management, opening-balance, attachment-management, and report-generation privileges with the Treasurer for full oversight.
* **AUDIT**: Organization internal auditor. Shares identical transaction-management, opening-balance, attachment-management, report-generation, and Treasurer Log access privileges with the Treasurer and Adviser for auditing.
* **OFFICER**: Student organization officer (e.g., President, Vice President, Secretary). May only view available reports and organization financial summaries. Cannot view or edit detailed transaction records or Treasurer Logs.
* **MEMBER**: Student organization member. Shares identical summary-and-report view-only privileges with Officers for financial transparency. May only view available reports and organization financial summaries.
* **OSA**: Office of Student Affairs monitoring account. May only view reports, financial summaries, and ledger summaries across organizations. OSA must not generate reports or perform financial mutations (creating, editing, or deleting transactions, setting balances, or managing users/organizations/categories).

### Role Permissions Matrix

| Permission / Action | TREASURER | ADVISER | AUDIT | OFFICER | MEMBER | OSA |
|---------------------|:---------:|:-------:|:-----:|:-------:|:------:|:---:|
| View Org Summary & Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (All Orgs) |
| View Available Reports | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (All Orgs) |
| View Ledger Summaries | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (All Orgs) |
| Generate Financial Reports | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
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
* **Home Page** (`/`): The public landing page must include:
  * PKM e-Ledger System identity and branding
  * System description
  * About section
  * Login link
  * PKM blue (`#004aad`) and yellow (`#f9d818`) theme
* **Login Page** (`/login`): User authentication portal with required login behavior:
  * Username and password validation
  * Invalid credential message display upon failure
  * Inactive account handling (preventing login for disabled accounts)
  * Role-based redirect after successful login (management users to `/dashboard`, OSA to `/osa`, members/officers to transparency view)
  * Session creation in database with secure `HttpOnly` cookies
  * Login audit entry creation in Treasurer Logs
* Register Page (`/register`): User account registration form where users submit name, username, password, organization, and requested role. Public registration is limited to Officer and Member roles against active organizations; privileged roles (Treasurer, Adviser, Audit, OSA) cannot be self-assigned. Public registrants receive same-organization summary/report visibility immediately; this is an approved MVP policy and institutional membership verification is outside current scope. This is not production identity verification.
* **Change Password Page** (`/change-password`): Dedicated portal for forced password resets (when `mustChangePassword = true`) or user-initiated updates.

### Authenticated Navigation Structure
* **Financial Management Portal** (Treasurer, Adviser, Audit): Dashboard (`/dashboard`), Digital Ledger (`/ledger`), New Income (`/ledger/income/new`), New Expense (`/ledger/expense/new`), Reports (`/reports`), Treasurer Log (`/audit-log`), Term Settings (`/settings/term`), Account Settings (`/account`).
* **Transparency Portal** (Officer, Member): Dashboard (`/dashboard`), Reports (`/reports`), Account Settings (`/account`).
* **OSA Monitoring Portal** (OSA): OSA Overview (`/osa`), Organization Ledger Summary (`/ledger`), Reports (`/reports`), Account Settings (`/account`).

---

## 5. Dashboard Cards & Metrics

The dashboard displays **six core summary cards**:

1. **Opening Balance**: Combined opening Cash on Hand + Opening Cash in Bank for the active term.
2. **Cash on Hand Balance**: Opening Cash on Hand + Active Cash on Hand Income - Active Cash on Hand Expenses.
3. **Cash in Bank Balance**: Opening Cash in Bank + Active Cash in Bank Income - Active Cash in Bank Expenses.
4. **Total Income**: Aggregate of all active (non-deleted) income transactions for the term.
5. **Total Expenses**: Aggregate of all active (non-deleted) expense transactions for the term.
6. **Total Available Cash / Remaining Balance**: 
   $$\text{Remaining Balance} = \text{Opening Cash on Hand} + \text{Opening Cash in Bank} + \text{Active Income} - \text{Active Expenses}$$

---

## 6. Transaction Categories and Complete Required Fields

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

### Complete Required Transaction Fields
The following fields represent the complete required transaction fields for recording financial entries:
* **Transaction Date**: Date of the financial transaction (`YYYY-MM-DD`).
* **Academic Year**: The applicable academic year (e.g., `2025-2026`).
* **Semester**: The applicable semester (e.g., `1st Semester`, `2nd Semester`, or `Summer`).
* **Transaction Type**: `INCOME` or `EXPENSE`.
* **Amount**: Entered in Pesos, converted and stored as integer cents (`Int`).
* **Cash Account**: `CASH_ON_HAND` or `CASH_IN_BANK`.
* **Category**: Selected from defined Income or Expense categories.
* **Payor / Payee or Counterparty Name**: Name of person or entity paying or receiving funds.
* **Description**: Detailed description or particulars of the transaction.
* **Reference / Attachment Description**: Notes describing attached receipts, supporting references, or purpose. **State requirement**: Reference / Attachment Description is required in the full system.
* **Event / Activity Name**: Associated project, event, or activity name.
* **Attachment Upload**: File upload for scanned receipt or supporting document (JPEG, PNG, PDF up to 10 MB). **State requirement**: Attachment Upload is required in the full system.
* **Document Number where applicable**: Official Receipt (OR), Voucher number, or acknowledgement reference where applicable.

---

## 7. Validation Rules and Messages

* **Monetary Formatting**: Amounts must be positive, non-zero numbers.
* **Insufficient Funds Rule**: Expenses must not exceed available balance for the specified account (Cash on Hand or Cash in Bank).
  * Error message: *"Transaction failed: Insufficient funds in Cash on Hand/Bank balance."*
* **Mandatory Fields**: All required transaction fields including Reference / Attachment Description and Attachment Upload must be validated before submission.
* **Soft Deletion Reason**: A deletion reason is mandatory when soft-deleting any transaction.

---

## 8. Digital Ledger Complete Required Columns and Filters

### Complete Required Ledger Columns
The Digital Ledger table must display the following complete required columns:
1. **Transaction Date**
2. **Academic Year**
3. **Semester**
4. **Transaction Type**
5. **Category**
6. **Payor / Payee**
7. **Description**
8. **Reference / Attachment Description**
9. **Attachment** (Preview or download link)
10. **Event / Activity**
11. **Cash Account**
12. **Amount**
13. **Recorded By** (Username or full name of creator)
14. **Date Recorded** (System timestamp of record creation)
15. **Action** (Edit and Soft-Delete action buttons)
16. **Running Balance** (May remain as an additional useful column for cumulative tracking)

### Complete Ledger Filters
The Digital Ledger interface must provide the complete ledger filters:
* **Academic Year**
* **Semester**
* **Transaction Type** (`All`, `Income`, `Expense`)
* **Category**
* **Cash Account** (`All`, `Cash on Hand`, `Cash in Bank`)
* **Month**
* **Event / Activity**
* **Date Range** (Start Date and End Date)
* **Search** (Text search across description, counterparty, document number, and reference)

---

## 9. Opening Balance Rules

* Opening balances must be configured at the beginning of each Academic Term for:
  * Opening Cash on Hand (cents)
  * Opening Cash in Bank (cents)
* Balance Forwarded is the sum of both opening accounts.
* Opening balance adjustments are logged in the Treasurer Log.

---

## 10. Expanded Treasurer Log Requirements

The Treasurer Log (Audit Log) must capture complete audit trails. Requirements are expanded to include:
* **Login History**: Tracking user authentication events.
* **Transaction History**: Tracking all financial ledger modifications.
* **Logged In**: Timestamped login audit event.
* **Logged Out**: Timestamped logout audit event.
* **Changed Password**: Record of password update or reset event.
* **Added Income**: Record of new income transaction creation.
* **Added Expense**: Record of new expense transaction creation.
* **Edited Transaction**: Record of transaction modification with before/after details.
* **Deleted Transaction**: Record of soft-deletion with mandatory deletion reason.
* **Changed Opening Balance**: Record of initial balance configuration or adjustment.
* **Uploaded Attachment**: Record of receipt file upload.
* **Deleted Attachment**: Record of supporting document removal.
* **User**: The username or user ID performing the action.
* **Role**: The role of the user at the time of action.
* **Organization**: The organization context where the action occurred.
* **Date and time**: Precise timestamp of the audit event.
* **Entity or transaction details**: JSON or text payload detailing the affected record IDs, amounts, and metadata.

---

## 11. Report Package & Explicit Output Formats

The report package structure is based on the provided official workbook reference:
1. **Summary Report**: Portrait page displaying organization header, balance forwarded, collections by category, total cash available, less: total expenses, ending balance, and signature section.
2. **Schedule 1 Collections**: Portrait schedule grouping income collections by category/payor with sequence numbers and totals.
3. **Schedule 2 Expenses**: Landscape schedule with categorical expense columns (Supplies, Equipment, Transportation, Meals, Service, Misc, Donation, Others) and document numbers.
4. **Signature Section**: Formatted signature blocks for Treasurer, Adviser, Auditor, and President / OSA Representative.

### Explicitly Listed Report Outputs
The system must explicitly support all of the following report outputs:
* **In-app HTML viewer**: Interactive web-based rendering of the report package.
* **Print view**: Print-optimized stylesheet (`@media print`) formatting reports for physical printing.
* **PDF export**: Direct PDF document export and download.
* **Excel export**: Multi-sheet `.xlsx` workbook generation via `exceljs` containing Summary, Schedule 1, Schedule 2, and Receipts/Attachments reference sheets.

---

## 12. Account Page & Password Behavior

### Account Page Behavior (`/account`)
The Account Page must display and provide:
* **Full name** of the authenticated user.
* **Username** of the account.
* **Role** assigned to the user.
* **Assigned organization** name.
* **Change Password action**: Link or modal trigger to initiate password update.
* **Logout action**: Secure session termination button.

### Change Password Validation
The password update workflow must enforce the following validation rules:
* **Current password required**: User must input their existing password.
* **New password required**: User must input a new password (minimum 8 characters).
* **Confirmation required**: User must re-type the new password.
* **Current password must be correct**: Server must verify old password against stored bcrypt hash.
* **New passwords must match**: The new password and confirmation string must match identically.
* **Password change must be logged**: A `CHANGED_PASSWORD` audit entry must be recorded in the Treasurer Log upon success.

---

## 13. Complete System Process Flow

The end-to-end operational lifecycle of the PKM e-Ledger System follows this complete system process flow:

1. **User registers or uses a seeded account**: New users register via `/register` or utilize pre-seeded demonstration accounts.
2. **User logs in**: User authenticates at `/login` with username and password.
3. **System resolves role and organization**: Server validates credentials, creates a session, logs the audit event, and resolves the user's role and organization context.
4. **Management users configure academic term and opening balances**: Treasurer, Adviser, or Audit activates an academic term and establishes opening Cash on Hand and Cash in Bank balances.
5. **Management users record income and expenses**: Authorized management users submit transaction forms with all required fields, including Reference/Attachment Description and Attachment Uploads.
6. **System validates funds and recalculates balances**: For expenses, the system checks that the amount does not exceed the available cash account balance, converts amounts to integer cents, and recalculates running balances.
7. **Transactions appear in the Digital Ledger**: Validated transactions populate the Digital Ledger with complete required columns and become searchable via ledger filters.
8. **Edits and soft deletions update totals and logs**: Management users may edit or soft-delete entries (providing mandatory deletion reasons); all changes update dashboard summary cards and write detailed entries to Treasurer Logs.
9. **Reports are generated from active ledger data**: Treasurer, Adviser, and Audit generate Summary, Schedule 1, and Schedule 2 reports in HTML viewer, Print view, PDF export, or Excel export formats.
10. **Officers and Members view organization summaries and available reports**: Non-management organization members access the transparency portal to view financial summary cards and available published reports.
11. **OSA monitors summaries, ledger summaries, and reports across organizations**: OSA personnel use the organization switcher to view reports, financial summaries, and ledger summaries across all 14 recognized student organizations without mutation privileges.
12. **Users may change passwords and log out**: Users manage their security settings via the Account Page, updating passwords (with full validation and logging) and logging out when sessions conclude.

---

## 14. Enumerated Functional Requirements (FR-001 to FR-022)

* **FR-001: Organization Isolation** — The system must isolate financial data, accounts, and transactions across all 14 recognized PKM student organizations.
* **FR-002: Role-Based Access Control** — The system must enforce role permissions across TREASURER, ADVISER, AUDIT, OFFICER, MEMBER, and OSA roles as defined in the RBAC matrix.
* **FR-003: Registration** — The system must provide account registration with role authorization verification to prevent self-assignment of privileged roles.
* **FR-004: Authentication** — The system must authenticate users via username and password, create secure database-backed sessions with `HttpOnly` cookies, and log login/logout events.
* **FR-005: Change Password** — The system must enforce password changes when flagged, validate current/new/confirmation passwords on the Account Page, store bcrypt hashes, and log password updates.
* **FR-006: Academic Terms** — The system must allow management users to create, configure, and activate Academic Years and Semesters.
* **FR-007: Opening Balances** — The system must allow management users to set and modify opening Cash on Hand and Cash in Bank balances in integer cents for active terms.
* **FR-008: Income Entry** — The system must record income transactions with all complete required fields (date, term, account, category, payor, description, reference, attachment, document number).
* **FR-009: Expense Entry & Insufficient-Funds Validation** — The system must record expense transactions and reject any expense entry that exceeds the available balance of the selected cash account.
* **FR-010: Dashboard Summaries** — The system must calculate and display the six core summary cards (Opening Balance, Cash on Hand, Cash in Bank, Total Income, Total Expenses, Total Available Cash).
* **FR-011: Digital Ledger** — The system must render the Digital Ledger displaying all complete required columns (Date, AY, Semester, Type, Category, Payor/Payee, Description, Reference, Attachment, Event/Activity, Account, Amount, Recorded By, Date Recorded, Action, and Running Balance).
* **FR-012: Ledger Filters** — The system must provide multi-criteria filtering across Academic Year, Semester, Transaction Type, Category, Cash Account, Month, Event/Activity, Date Range, and Text Search.
* **FR-013: Transaction Editing** — The system must allow Treasurer, Adviser, and Audit to edit existing transactions and record before/after states in Treasurer Logs.
* **FR-014: Soft Deletion** — The system must allow management users to soft-delete transactions upon providing a mandatory deletion reason, excluding deleted records from active balances and logging the action.
* **FR-015: Attachments** — The system must mandate receipt attachment uploads (JPEG, PNG, PDF up to 10 MB) and Reference/Attachment Descriptions for all transactions, serving files via secure authenticated routes.
* **FR-016: Treasurer Logs** — The system must maintain immutable audit logs capturing Login History, Transaction History, Logged In, Logged Out, Changed Password, Added Income, Added Expense, Edited Transaction, Deleted Transaction, Changed Opening Balance, Uploaded Attachment, Deleted Attachment, User, Role, Organization, Date/Time, and Entity Details.
* **FR-017: Financial Report Generation** — The system must allow Treasurer, Adviser, and Audit to generate official Summary Reports, Schedule 1 Collections, and Schedule 2 Expenses based on active ledger data. Reports are live generated financial views built from current non-deleted financial data; generated HTML/PDF/XLSX exports are not immutable publications and cannot be reproduced byte-for-byte after ledger edits. `GENERATED_REPORT` audit entries represent export generation, not publication/approval.
* **FR-018: Print Output** — The system must render reports with print-optimized styling (`@media print`) for physical document generation.
* **FR-019: PDF Export** — The system must provide explicit PDF export functionality for downloading official report packages.
* **FR-020: Excel Export** — The system must generate multi-sheet `.xlsx` Excel workbooks via `exceljs` containing Summary, Schedule 1, Schedule 2, and Attachment reference sheets.
* **FR-021: Member Transparency** — The system must allow Officers and Members to view organization dashboard summaries and available published reports while restricting transaction mutation and ledger editing.
* **FR-022: OSA Monitoring** — The system must allow OSA to switch across all 14 student organizations to view reports, financial summaries, and ledger summaries without report generation or financial mutation privileges.

---

## 15. Non-Functional Requirements (NFRs)

* **Usability**: The interface must present a clean, light-mode financial design utilizing the approved `#004aad` (Blue) and `#f9d818` (Yellow) color palette, ensuring intuitive navigation and clear error messaging.
* **Security**: All routes, server actions, and file downloads must independently verify user authentication, role authorization, and organization isolation. Passwords must be hashed with bcrypt.
* **Accuracy**: All financial calculations, running balances, and report totals must be computed using integer cents to eliminate floating-point approximation errors.
* **Accountability**: Every financial mutation, balance adjustment, and authentication event must be attributable to a specific user and timestamp via immutable Treasurer Logs.
* **Transparency**: Organization members and officers must have seamless access to financial summaries and published reports to ensure institutional trust.
* **Maintainability**: Codebase architecture must enforce strict separation between server-side data access layers, business domain logic, and client presentational components.
* **Local-First Operation**: The system must operate self-contained on Windows hosting environments using Next.js App Router, SQLite, and Prisma ORM without external cloud runtime dependencies.
* **Internal Engineering Performance Target**: Page load times and report generation queries should target sub-two-second response times under standard local loads. Note: This under-two-second target is an internal engineering goal and benchmark rather than an approved client requirement.
