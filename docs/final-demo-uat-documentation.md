# Final Demo UAT Documentation

## Scope

Manual UAT covered the six application roles, management financial workflows,
transparency views, OSA monitoring, report generation, desktop layout, focus
styling, and evidence capture on `qa/manual-uat-demo-readiness`.

Testing used fictional seeded accounts and fictional local UAT records. No
historical workbook was imported. No historical names, signatories, student
records, sample amounts, or reference files were used as application data.

## Environment

- Local Next.js development server at `http://127.0.0.1:3000`.
- Node.js `v24.15.0`, npm `11.12.1`, Next.js `16.3.0`, SQLite.
- Current desktop captures used a `1920x1080` viewport.
- Credentials are omitted from committed documentation.
- No deployment or production environment was used.

## Management Workflow

Treasurer, Adviser, and Audit users share the management workflow.

### Step 1 - Sign in

![Login screen](evidence/screenshots/01-login.png)

Fictional management account reaches authenticated portal after sign-in.

### Step 2 - Dashboard

![Management dashboard](evidence/screenshots/02-treasurer-dashboard.png)

Dashboard shows term selector, split cash balances, income, expenses, and
remaining balance.

### Step 3 - Term and opening balances

![Term settings and opening balances](evidence/screenshots/03-term-settings-balances.png)

Opening Cash on Hand, Opening Cash in Bank, and Balance Forwarded are visible
for active term.

### Step 4 - Ledger entry surface

![Digital ledger entry surface](evidence/screenshots/04-digital-ledger-desktop.jpg)

Ledger page exposes transaction fields, cash account, category, document
number, counterparty, reference, attachment, and activity fields.

### Step 5 - New income

![New income form](evidence/screenshots/05-new-income-desktop.jpg)

Income entry accepts required financial and supporting-document details.

### Step 6 - Recorded income and result

![Recorded income result](evidence/screenshots/04-income-recorded.png)

Recorded income updates the displayed cash and total-income state.

### Step 7 - New expense

![New expense form](evidence/screenshots/06-new-expense-desktop.jpg)

Expense entry uses selected cash account and mapped expense category.

### Step 8 - Recorded expense and result

![Recorded expense result](evidence/screenshots/05-ledger-populated.png)

Recorded expense updates total expenses and remaining balance using fictional
UAT records.

### Step 9 - Cash transfer

![Cash transfer and ledger filters](evidence/screenshots/13-cash-transfer-filters-desktop.jpg)

Cash transfer records movement between Cash on Hand and Cash in Bank without
counting as income or expense.

### Step 10 - Transaction details

![Transaction details](evidence/screenshots/10-transaction-details-desktop.jpg)

Details view shows date, type, amount, category, account, document number,
counterparty, activity, reference, and attachment metadata.

### Step 11 - Edit transaction

![Edit transaction dialog](evidence/screenshots/11-edit-transaction-desktop.jpg)

Authorized management user can edit transaction fields through the dialog.

### Step 12 - Updated result

The populated ledger result in Step 8 reflects recalculated totals after the
tested edit flow.

### Step 13 - Delete confirmation

![Delete confirmation](evidence/screenshots/12-delete-transaction-desktop.jpg)

Soft deletion requires a deletion reason and confirmation; UAT record was not
deleted during evidence capture.

### Step 14 - Treasurer Log

![Treasurer Log](evidence/screenshots/17-audit-log-desktop.jpg)

Audit history displays authentication, financial mutation, attachment, and
cash-transfer events with actor and role context.

### Step 15 - Report viewer

![Reference-aligned report viewer](evidence/screenshots/15-adviser-reports-desktop.jpg)

Generated financial view contains summary balances, collections, expenses,
and report-package navigation.

### Step 16 - PDF and XLSX export actions

![Report package export actions](evidence/screenshots/28-final-report-package.png)

Report viewer exposes print, PDF, and Excel export actions. Generated exports
remain local-only evidence and are not committed.

Additional management-role evidence:

![Adviser dashboard](evidence/screenshots/14-adviser-dashboard-desktop.jpg)

![Audit dashboard](evidence/screenshots/16-audit-dashboard-desktop.jpg)

## Officer Transparency

Officer users can view organization summaries and reports but cannot access
management ledger routes.

![Officer dashboard](evidence/screenshots/18-officer-dashboard-desktop.jpg)

![Officer report](evidence/screenshots/19-officer-reports-desktop.jpg)

![Officer restricted ledger route](evidence/screenshots/20-officer-restricted-ledger-desktop.jpg)

## Member Transparency

Member users can view organization summaries and reports but cannot access
management ledger routes.

![Member dashboard](evidence/screenshots/21-member-dashboard-desktop.jpg)

![Member report](evidence/screenshots/22-member-reports-desktop.jpg)

![Member restricted ledger route](evidence/screenshots/23-member-restricted-ledger-desktop.jpg)

## OSA Monitoring

OSA user can select active organizations and view read-only summaries, ledger
summaries, and generated financial views. Export controls are not exposed.

![OSA organization selector](evidence/screenshots/26-osa-organization-selector-desktop.jpg)

![OSA monitoring overview](evidence/screenshots/27-osa-monitoring-overview-desktop.jpg)

![Selected organization summary](evidence/screenshots/28-osa-selected-organization-summary-desktop.jpg)

![OSA report view](evidence/screenshots/29-osa-report-view-desktop.jpg)

![Second organization summary](evidence/screenshots/30-osa-other-organization-desktop.jpg)

## Reference-Aligned Report Package

The in-app HTML viewer presents a generated financial view with the following
historical-workbook-reference-aligned sections:

- Summary Report with school header, organization, coverage date, balance
  forwarded, Cash on Hand, Cash in Bank, collections, expenses, ending
  balance, and role-only signature blocks.
- Schedule 1 Collections grouped by income bucket with sequence number,
  payor/source, amount, and totals.
- Schedule 2 Expenses with document number, date, payee, particulars, total
  amount, and mapped expense category columns.
- Receipts / Attachments reference.

### PDF page evidence

![PDF page 1 - Summary and signatures](evidence/screenshots/pdf/report-page-1.png)

Summary Report and signature section. Portrait orientation verified.

![PDF page 2 - Schedule 1 Collections](evidence/screenshots/pdf/report-page-2.png)

Schedule 1 Collections. Portrait orientation verified.

![PDF page 3 - Schedule 2 Expenses](evidence/screenshots/pdf/report-page-3.png)

Schedule 2 Expenses. Landscape orientation verified.

![PDF page 4 - Receipts and attachments](evidence/screenshots/pdf/report-page-4.png)

Receipts / Attachments reference. Portrait orientation verified.

`pdfinfo` confirmed four pages and the expected page orientations. The
generated PDF is local-only evidence and is not committed.

### Excel export

ExcelJS round-trip verification confirmed these sheets and formula totals:

- `SUMMARY`
- `SCHEDULE 1 - COLLECTIONS`
- `SCHEDULE 2 - EXPENSES`
- `RECEIPTS - ATTACHMENTS`

Manual spreadsheet visual inspection remains **not verified** because no local
spreadsheet viewer was available. The generated XLSX is local-only evidence
and is not committed.

## UML Evidence

Four PlantUML sources remain in scope:

![Use case diagram](evidence/diagrams/use-case.png)

![Activity diagram](evidence/diagrams/activity-ledger-workflow.png)

![Sequence diagram](evidence/diagrams/sequence-transaction-entry.png)

![Simplified domain class diagram](evidence/diagrams/domain-class-diagram.png)

PlantUML CLI was run from `docs/uml` with a temporary JAR using these commands
(temporary tool file was not committed):

```powershell
java -jar <temporary-plantuml-cli.jar> -tpng -o ..\evidence\diagrams *.puml
java -jar <temporary-plantuml-cli.jar> -tsvg -o ..\evidence\diagrams *.puml
```

The use-case diagram uses Management User and Transparency User actor
generalization while retaining Treasurer, Adviser, Audit, Officer, Member,
and OSA as visible concrete roles.

## Desktop, Responsive, and Accessibility Limits

- Current final role and workflow captures use `1920x1080` desktop dimensions.
- Older responsive captures remain supporting evidence for 360px, 768px, and
  mobile navigation states.
- Visible keyboard focus styling was captured. Full keyboard-only traversal
  remains **not verified** because browser focus diagnostics were
  inconclusive.
- Browser operating-system print preview was unavailable. Toolbar/header
  hiding in system print preview remains **not verified**; PDF orientation was
  verified independently.

## Supporting Evidence Manifest

Retained supporting captures not embedded above:

- Responsive: `07-dashboard-mobile.png`, `25-dashboard-360px.png`,
  `26-ledger-768px.png`, `27-mobile-navigation.png`.
- Accessibility and print state: `25-keyboard-focus-desktop.jpg`,
  `15-report-print-state.png`.
- Public registration: `24-register-desktop.jpg`.
- OSA ledger summary: `22-osa-selected-ledger.png`.

## UAT Result

Core manual workflows passed for fictional records. Remaining verification
limits are recorded above and are not presented as passed checks. No
institutional approval, production deployment, security certification, or
immutable publication is claimed.

## Privacy and Artifact Handling

Historical report references remain local-only and ignored by Git. Synthetic
PDF/XLSX exports, temporary attachments, and local database files remain
uncommitted. Committed screenshots and diagrams contain fictional UAT or
seeded demo data only.
