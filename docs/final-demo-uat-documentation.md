# Final Demo UAT Documentation

## Scope

This document records manual user-acceptance testing for the PKM e-Ledger
System on `qa/manual-uat-demo-readiness`. Testing covered the six application
roles, financial management workflows, transparency views, OSA monitoring,
report generation, responsive layouts, and evidence capture.

Testing used the existing fictional seed data plus fictional local UAT
records. No official workbook was imported. No official names, signatories,
student records, sample amounts, or reference files were used as application
data.

## Environment

- Local Next.js development server at `http://127.0.0.1:3000`.
- Node.js `v24.15.0`, npm `11.12.1`, Next.js `16.3.0`, SQLite.
- Browser verification used desktop, 768 px, 390 px, and 360 px viewports.
- UAT accounts were fictional role-specific seed accounts. Credentials are
  intentionally omitted from committed documentation.
- No deployment or production environment was used.

## Management Workflow

Treasurer, Adviser, and Audit management users were tested through the
following path:

1. Sign in and open the six-card dashboard.
2. Configure the active term and split opening balances between Cash on Hand
   and Cash in Bank.
3. Record fictional income and expense entries with document numbers,
   counterparty names, categories, event/activity names, cash accounts, and
   synthetic attachments.
4. Record cash transfers between cash accounts.
5. Open transaction details, edit a fictional description, and exercise the
   soft-delete confirmation dialog without deleting the UAT records.
6. Review the detailed ledger and Treasurer Log.
7. Open the report package and request PDF and Excel exports.

Evidence:

- [Login](evidence/screenshots/01-login.png)
- [Management dashboard](evidence/screenshots/02-treasurer-dashboard.png)
- [Adviser desktop dashboard](evidence/screenshots/14-adviser-dashboard-desktop.jpg)
- [Adviser reports](evidence/screenshots/15-adviser-reports-desktop.jpg)
- [Audit dashboard](evidence/screenshots/16-audit-dashboard-desktop.jpg)
- [Audit Log](evidence/screenshots/17-audit-log-desktop.jpg)
- [Term settings and balances](evidence/screenshots/03-term-settings-balances.png)
- [Populated ledger](evidence/screenshots/05-ledger-populated.png)
- [Cash transfers](evidence/screenshots/16-ledger-transfers.png)
- [Transaction details](evidence/screenshots/17-transaction-details.png)
- [Edit transaction dialog](evidence/screenshots/18-edit-transaction-dialog.png)
- [Updated ledger](evidence/screenshots/19-ledger-updated.png)
- [Delete confirmation](evidence/screenshots/20-delete-dialog.png)
- [Treasurer Log](evidence/screenshots/21-treasurer-log.png)

## Transparency Workflow

Officer and Member accounts were tested as same-organization, read-only users.
Both could view dashboard balances and the report package. Management-only
navigation and mutation controls were not available in their portal.

- [Officer transparency dashboard](evidence/screenshots/11-officer-transparency.png)
- [Member transparency dashboard](evidence/screenshots/12-member-transparency.png)
- [Officer desktop dashboard](evidence/screenshots/18-officer-dashboard-desktop.jpg)
- [Officer desktop report view](evidence/screenshots/19-officer-reports-desktop.jpg)
- [Member desktop dashboard](evidence/screenshots/21-member-dashboard-desktop.jpg)
- [Member desktop report view](evidence/screenshots/22-member-reports-desktop.jpg)

## OSA Monitoring Workflow

The OSA account was tested across the monitoring overview, organization
selection, organization ledger summary, and report view. Two fictional seeded
organizations were selected to confirm that the selected organization context
changes the read-only view. OSA could not use organization management or
transaction mutation actions, and the OSA report view did not expose export
controls.

- [OSA overview](evidence/screenshots/13-osa-overview.png)
- [First organization ledger](evidence/screenshots/22-osa-selected-ledger.png)
- [Second organization ledger](evidence/screenshots/23-osa-second-organization.png)
- [OSA second organization desktop view](evidence/screenshots/30-osa-other-organization-desktop.jpg)
- [OSA report view](evidence/screenshots/24-osa-report-view.png)

## Report Package and Exports

The HTML report viewer displayed the complete official-style package:

- Summary Report with school header, organization, coverage date, balance
  forwarded, Cash on Hand, Cash in Bank, collections, expenses, ending
  balance, and role-only signature blocks.
- Schedule 1 Collections grouped by income bucket with sequence number,
  payor/source, amount, and totals.
- Schedule 2 Expenses with document number, date, payee, particulars, total
  amount, and mapped expense category columns.
- Receipts / Attachments reference.

- [Final report package viewer](evidence/screenshots/28-final-report-package.png)
- [PDF page 1: Summary and signatures](evidence/screenshots/pdf/report-page-1.png)
- [PDF page 2: Schedule 1 Collections](evidence/screenshots/pdf/report-page-2.png)
- [PDF page 3: Schedule 2 Expenses](evidence/screenshots/pdf/report-page-3.png)
- [PDF page 4: Receipts / Attachments](evidence/screenshots/pdf/report-page-4.png)

PDF verification passed for the generated fictional report package. `pdfinfo`
confirmed four pages with portrait Summary, portrait Schedule 1, landscape
Schedule 2, and portrait Attachments pages. The generated PDF is local-only
evidence and is not committed.

Excel export was fetched and reopened with ExcelJS. Structural verification
confirmed these sheets and formula totals:

- `SUMMARY`
- `SCHEDULE 1 - COLLECTIONS`
- `SCHEDULE 2 - EXPENSES`
- `RECEIPTS - ATTACHMENTS`

Manual spreadsheet visual inspection was **not verified** because no local
spreadsheet viewer was available. The generated XLSX is local-only evidence
and is not committed.

## Responsive and Accessibility Checks

- [360 px dashboard](evidence/screenshots/25-dashboard-360px.png): checked
  with no horizontal overflow.
- [768 px ledger](evidence/screenshots/26-ledger-768px.png): checked with no
  horizontal overflow.
- [Mobile navigation](evidence/screenshots/27-mobile-navigation.png): menu
  toggle and expanded state exercised.
- [Keyboard focus state](evidence/screenshots/25-keyboard-focus-desktop.jpg):
  visible focus styling captured on the login form.
- [Desktop report state](evidence/screenshots/15-report-print-state.png):
  print action exercised from the report viewer.

Focus styling and dialog controls were inspected. Full keyboard traversal was
attempted, but browser focus diagnostics did not produce a conclusive tab
sequence; a complete keyboard-only pass remains **not verified**.

The browser automation did not expose the operating-system print preview.
Therefore toolbar/header hiding in print preview remains **not verified**;
PDF page orientation was verified independently from the generated artifact.

## UML Evidence

PlantUML CLI rendered four source diagrams to PNG and SVG:

- [Use case diagram](evidence/diagrams/use-case.png) ([source](uml/use-case.puml))
- [Activity diagram](evidence/diagrams/activity-ledger-workflow.png) ([source](uml/activity-ledger-workflow.puml))
- [Sequence diagram](evidence/diagrams/sequence-transaction-entry.png) ([source](uml/sequence-transaction-entry.puml))
- [Domain class diagram](evidence/diagrams/domain-class-diagram.png) ([source](uml/domain-class-diagram.puml))

## UAT Result

Core manual workflows passed for the tested fictional records. UAT defects
were corrected on this branch:

- Validation schemas were moved into a server-safe domain module so Next.js
  Server Action modules export functions only while schema regression tests
  remain available.
- PDFKit is treated as a server external package so authenticated PDF export
  resolves its bundled font data correctly.

Remaining verification limits are documented above and are not presented as
passed checks.

## Privacy and Artifact Handling

Official report references remain local-only and ignored by Git. Synthetic PDF
and XLSX exports, the temporary synthetic attachment, and any local database
files must remain uncommitted. Committed screenshots and diagrams contain only
fictional UAT or seeded demo data.
