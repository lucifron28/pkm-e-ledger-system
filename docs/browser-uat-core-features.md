# PKM e-Ledger Core Browser UAT

## Test Environment

| Item | Result |
| --- | --- |
| Branch | qa/browser-uat-core-features |
| Source | Current main at a07697d814b90a46cb24e51fff4616bbbf678a2b when UAT began |
| Application | Local production server from current main: npm run start, http://localhost:3001 |
| Browser | Codex In-app Browser, Chromium-based |
| Viewport | Desktop 1920 x 1080; long workflows use readable viewport captures at the relevant scroll position |
| Data | Fresh isolated SQLite database and fictional UAT records only |
| Cloud preview | No usable Vercel Preview was confirmed; local production UAT was used. Remote preview lookup was inconclusive because access permission timed out. |
| Workbook inspection | Officecli 1.0.142 used for workbook structure, formula, issue, and HTML/screenshot inspection. |
| Evidence QA | All 63 evidence files decode as valid PNG images. Targeted desktop recaptures replaced the 20 malformed narrow-column captures using an isolated fictional fixture; visual review found no remaining narrow-column evidence. |

No application source files were changed during this UAT. The reference workbook, private data, real credentials, and production/Turso data were not used.

## Overall Result

**PASS WITH VALIDATION WARNING**

No product failure was observed in the executed browser flows. Financial entry, balances, transfer handling, attachments, report rendering, PDF opening, role boundaries, OSA monitoring, organization scoping, soft deletion, and audit history passed. Evidence QA replaced the 20 malformed original captures with targeted desktop recaptures from an isolated fictional fixture; no production or committed application data was changed.

The XLSX download completed and Officecli visually inspected the workbook sheets. Officecli reported five OpenXML font-style schema warnings; workbook content, formulas, and rendered layout remained readable and free of reported formula/content issues.

## UAT Checklist

| Area | Status | Result |
| --- | --- | --- |
| Public registration | PASS | Fictional Officer and Member registration completed. |
| Management account setup | PASS | Fictional Treasurer profile and password update completed, followed by successful re-login. |
| Financial recording | PASS | Income, expense, attachment, and cash transfer workflows completed. |
| Ledger controls | PASS | Search, filters, details, edit, soft delete, and audit history completed. |
| Official reports | PASS | Summary, Schedule 1, Schedule 2, attachments, signatures, and PDF export rendered. |
| XLSX export | PASS WITH VALIDATION WARNING | Download completed; Officecli confirmed four expected sheets, formulas, zero issue reports, and readable rendered sheets. Five font-style schema warnings remain. |
| Screenshot evidence quality | PASS | All 63 files are valid PNGs and passed visual layout review. Targeted replacement captures use readable desktop viewport framing; the authorized attachment viewer remains intentionally captured at its native viewer size. |
| Role boundaries | PASS | Adviser and Auditor management access passed; Officer and Member remained view-only. |
| OSA monitoring | PASS | OSA overview, organization selection, report view, and Demo accounts Excel action passed. |
| Organization isolation | PASS | Cross-organization requests did not expose protected financial data. |
| Final reconciliation | PASS | Final active balances reconciled exactly. |

## Workflow Evidence

### Public Registration - PASS

Public registration is available for Officer and Member users only. Both fictional accounts reached their authorized view-only portal.

**Landing page**

![Landing page](evidence/browser-uat/01-landing-page.png)

**Public registration**

![Public registration](evidence/browser-uat/02-public-registration.png)

**Officer account result**

![Officer registration completed](evidence/browser-uat/03-officer-registration-completed.png)

![Officer account dashboard](evidence/browser-uat/04-officer-account-created.png)

**Member account result**

![Member registration completed](evidence/browser-uat/05-member-registration-completed.png)

![Member account dashboard](evidence/browser-uat/06-member-account-created.png)

### Management Account Setup - PASS

The prepared fictional Treasurer account opened Account, updated its profile, changed its password, and successfully re-entered the portal.

**Account page**

![Management account profile](evidence/browser-uat/07-management-account-profile.png)

**Successful profile update**

![Updated management profile](evidence/browser-uat/08-management-profile-updated.png)

**Change Password page**

![Change-password page](evidence/browser-uat/09-management-change-password.png)

**Successful access after password change**

![Access after password change](evidence/browser-uat/10-management-access-after-password.png)

![Management re-login](evidence/browser-uat/11-management-relogin.png)

### Dashboard Baseline - PASS

The management dashboard showed the starting financial position before recording UAT transactions.

![Dashboard before financial UAT](evidence/browser-uat/07-management-dashboard-before-uat.png)

### Academic Term and Opening Balances - PASS

Term Settings accepted Cash on Hand of PHP 500.00, Cash in Bank of PHP 0.00, and Balance Forwarded of PHP 500.00.

![Academic term opening balances](evidence/browser-uat/08-term-settings.png)

### Income Entry - PASS

The Treasurer successfully recorded the fictional PHP 1,000.00 Membership Dues collection. The ledger, Cash on Hand, Total Income, and Remaining Balance updated correctly.

**Income form**

![Completed income form](evidence/browser-uat/09-income-form.png)

**Recorded income**

![Income recorded in Digital Ledger](evidence/browser-uat/10-income-recorded.png)

**Updated dashboard**

![Dashboard after income](evidence/browser-uat/11-dashboard-after-income.png)

### Expense Entry - PASS

The Treasurer recorded the fictional PHP 300.00 Supplies expense. The expense appeared in the total and mapped category column.

**Expense form**

![Completed expense form](evidence/browser-uat/12-expense-form.png)

**Recorded expense**

![Expense recorded in Digital Ledger](evidence/browser-uat/13-expense-recorded.png)

**Updated dashboard**

![Dashboard after expense](evidence/browser-uat/14-dashboard-after-expense.png)

### Attachment - PASS

The fictional PDF attachment was visible on the transaction, opened through the authorized attachment route, and remained available after refresh.

**Authorized attachment access**

![Authorized attachment opened](evidence/browser-uat/16-attachment-opened.png)

**Attachment persisted after refresh**

![Attachment links after refresh](evidence/browser-uat/57-attachments-persisted-after-refresh.png)

### Cash Transfer - PASS

The Treasurer transferred PHP 200.00 from Cash on Hand to Cash in Bank. The transfer changed account balances without changing income, expense, or remaining totals.

**Transfer form**

![Cash transfer form](evidence/browser-uat/17-cash-transfer-form.png)

**Recorded transfer**

![Cash transfer recorded](evidence/browser-uat/18-cash-transfer-recorded.png)

**Updated dashboard**

![Dashboard after cash transfer](evidence/browser-uat/19-dashboard-after-transfer.png)

### Digital Ledger - PASS

The Digital Ledger showed the fictional income, expense, and transfer records. Search and filtering returned the expected UAT records.

**Ledger containing UAT records**

![Ledger with UAT records](evidence/browser-uat/20-ledger-with-uat-records.png)

**Filtered ledger**

![Filtered ledger](evidence/browser-uat/21-ledger-filtered.png)

### Transaction Details - PASS

The details view showed date, amount, category, cash account, document, counterparty, activity, reference, and attachment information.

![Transaction details view](evidence/browser-uat/22-transaction-details.png)

### Edit and Audit Trail - PASS

The Treasurer edited the fictional income from PHP 1,000.00 to PHP 1,100.00. The updated transaction, dashboard, and audit log reflected the change.

**Edit form**

![Edit transaction form](evidence/browser-uat/23-edit-transaction.png)

**Transaction after edit**

![Transaction after edit](evidence/browser-uat/24-transaction-after-edit.png)

**Dashboard after edit**

![Dashboard after edit](evidence/browser-uat/25-dashboard-after-edit.png)

**Treasurer Log edit entry**

![Treasurer Log after edit](evidence/browser-uat/26-treasurer-log-after-edit.png)

### Financial Reports - PASS

The rendered official report package contained Summary, Schedule 1 Collections, Schedule 2 Expenses, Receipts / Attachments, and signature blocks.

**Summary Report**

![Financial report summary](evidence/browser-uat/27-report-summary.png)

**Schedule 1 Collections**

![Schedule 1 collections](evidence/browser-uat/28-report-schedule-1.png)

**Schedule 2 Expenses**

![Schedule 2 expenses](evidence/browser-uat/29-report-schedule-2.png)

**Receipts / Attachments**

![Report attachment references](evidence/browser-uat/30-report-attachments.png)

### PDF Export - PASS

The PDF export control opened a four-page report package in the browser PDF viewer.

**PDF export control**

![PDF export control](evidence/browser-uat/31-pdf-export.png)

**PDF opened and rendered**

![PDF opened in browser viewer](evidence/browser-uat/32-pdf-opened.png)

### XLSX Export - PASS WITH VALIDATION WARNING

The XLSX download completed successfully. Officecli 1.0.142 inspected the workbook structure and rendered each expected sheet. The workbook contains SUMMARY, SCHEDULE 1 - COLLECTIONS, SCHEDULE 2 - EXPENSES, and RECEIPTS - ATTACHMENTS. Formula and content issue checks reported zero issues, and the rendered sheets were readable with no visible truncation or placeholder leakage.

Officecli validation reported five OpenXML schema warnings in the workbook font-style records (`styles.xml`, unexpected `sz` child elements). This is recorded as a validation warning, not silently dismissed.

Officecli rendered previews for all four sheets: `SUMMARY`, `SCHEDULE 1 - COLLECTIONS`, `SCHEDULE 2 - EXPENSES`, and `RECEIPTS - ATTACHMENTS`. The previews were readable and showed no visible truncation or placeholder leakage. The preview files were temporary inspection artifacts and were not committed as application data.

**XLSX export control**

![XLSX export control](evidence/browser-uat/33-xlsx-export.png)

**Officecli workbook audit**

| Sheet | Rows | Columns | Formulas | Error cells |
| --- | ---: | ---: | ---: | ---: |
| SUMMARY | 33 | 3 | 5 | 0 |
| SCHEDULE 1 - COLLECTIONS | 13 | 3 | 2 | 0 |
| SCHEDULE 2 - EXPENSES | 10 | 12 | 8 | 0 |
| RECEIPTS - ATTACHMENTS | 10 | 7 | 0 | 0 |

Officecli issue inspection returned zero formula/content issues. Workbook schema validation still reports five font-style warnings in `styles.xml`; these remain documented as a validation warning.

### Delete and Audit History - PASS

The edited fictional income was soft-deleted with a reason. It disappeared from active ledger totals while its deletion audit entry remained visible.

**Delete confirmation**

![Delete confirmation](evidence/browser-uat/34-delete-confirmation.png)

**Ledger after deletion**

![Ledger after deletion](evidence/browser-uat/35-ledger-after-delete.png)

**Dashboard after deletion**

![Dashboard after deletion](evidence/browser-uat/36-dashboard-after-delete.png)

**Treasurer Log delete entry**

![Treasurer Log after deletion](evidence/browser-uat/37-treasurer-log-after-delete.png)

### Adviser - PASS

The Adviser used organization-scoped financial management. The disposable fictional check record was then soft-deleted.

![Adviser access](evidence/browser-uat/38-adviser-access.png)

![Adviser disposable action](evidence/browser-uat/39-adviser-action.png)

### Auditor - PASS

The Auditor used organization-scoped financial management. The disposable fictional check record was then soft-deleted.

![Auditor access](evidence/browser-uat/40-auditor-access.png)

![Auditor disposable action](evidence/browser-uat/41-auditor-action.png)

### Officer - PASS

Officer access remained view-only. Reports were available, while a direct management route returned Access not available.

**Officer Dashboard**

![Officer dashboard](evidence/browser-uat/42-officer-dashboard.png)

**Officer Reports**

![Officer reports](evidence/browser-uat/43-officer-reports.png)

**Denied management access**

![Officer management access denied](evidence/browser-uat/44-officer-management-access-denied.png)

### Member - PASS

Member access remained view-only. Reports were available, while management controls were not exposed.

**Member Dashboard**

![Member dashboard](evidence/browser-uat/45-member-dashboard.png)

**Member Reports**

![Member reports](evidence/browser-uat/46-member-reports.png)

**Denied management access**

![Member access boundary](evidence/browser-uat/44-member-management-access-denied.png)

![Member management route result](evidence/browser-uat/47-member-management-access-denied.png)

### OSA - PASS

OSA overview provided cross-organization summaries and the Demo accounts Excel action. OSA switched organization context and opened a selected organization report in view-only mode. The workbook was not opened in evidence because it contains prepared fictional credentials.

**OSA Overview**

![OSA overview](evidence/browser-uat/49-osa-overview.png)

**Demo accounts Excel action**

![OSA Demo accounts Excel action](evidence/browser-uat/50-osa-demo-accounts-action.png)

**Organization selection**

![OSA organization selection](evidence/browser-uat/51-osa-organization-selection.png)

**Organization A summary**

![OSA Organization A summary](evidence/browser-uat/52-osa-organization-a.png)

**Organization B summary**

![OSA Organization B summary](evidence/browser-uat/53-osa-organization-b.png)

**OSA report**

![OSA report package](evidence/browser-uat/54-osa-report.png)

### Organization Isolation - PASS

A management account requesting another organization's context was returned to its assigned organization. An Officer request for another organization's context returned to the assigned dashboard. No protected financial data from another organization was exposed.

**Organization-B isolation fixture**

![Organization B isolation fixture](evidence/browser-uat/48-organization-b-fixture.png)

**Treasurer scope boundary**

![Treasurer organization isolation result](evidence/browser-uat/55-organization-isolation-denied.png)

**Officer scope boundary**

![Officer organization isolation result](evidence/browser-uat/56-officer-organization-isolation.png)

### Final Financial Reconciliation - PASS

Disposable Organization-B and role-check records were soft-deleted. The final active Organization-A state reconciled exactly.

![Final financial reconciliation](evidence/browser-uat/50-final-financial-reconciliation.png)

## Financial Reconciliation

### Report verification checkpoint

The report package was verified before deleting the edited fictional income record:

| Item | PHP |
| --- | ---: |
| Opening Cash on Hand | 500.00 |
| Opening Cash in Bank | 0.00 |
| Balance Forwarded | 500.00 |
| Active income after edit | 1,100.00 |
| Active expenses | 300.00 |
| Transfer: Cash on Hand to Cash in Bank | 200.00 |
| Ending Cash on Hand | 1,100.00 |
| Ending Cash in Bank | 200.00 |
| Ending / remaining balance | 1,300.00 |

Formula check: 500.00 + 1,100.00 - 300.00 = **1,300.00**. Ending cash accounts: 1,100.00 + 200.00 = **1,300.00**.

The report checkpoint showed Membership Dues collection, Supplies expense, Schedule 1, Schedule 2, attachment references, and signatures.

### Final post-cleanup state

The edited fictional income was then soft-deleted to verify exclusion from active totals:

| Item | PHP |
| --- | ---: |
| Opening Cash on Hand | 500.00 |
| Opening Cash in Bank | 0.00 |
| Balance Forwarded | 500.00 |
| Active income after soft deletion | 0.00 |
| Active expenses | 300.00 |
| Active transfer: Cash on Hand to Cash in Bank | 200.00 |
| Final Cash on Hand | 0.00 |
| Final Cash in Bank | 200.00 |
| Final remaining balance | 200.00 |

Formula check: 500.00 + 0.00 - 300.00 = **200.00**. Final cash accounts: 0.00 + 200.00 = **200.00**. Transfer did not change income or expense totals.

## Issues and Blocked Items

| Item | Classification | Impact |
| --- | --- | --- |
| XLSX OpenXML font-style warnings | VALIDATION WARNING | Officecli reported five unexpected `sz` child elements in `styles.xml`. Workbook structure, formulas, content checks, and rendered sheet previews passed. |
| Targeted screenshot recapture | COMPLETED | Twenty malformed original captures were replaced with visually checked desktop captures from a disposable isolated SQLite fixture containing fictional Browser UAT records. No production database, committed database, official workbook, real credentials, or application source code was changed. |
| Vercel Preview could not be confirmed | Environment limitation | UAT ran against local production mode and did not claim remote/Turso persistence. |
| No product failures observed | Informational | No defect was raised from executed browser flows. |

No real names, passwords, student data, official workbook records, production database records, or private attachment contents were committed. Evidence uses fictional UAT labels only.

## Evidence Manifest

All 63 screenshots are embedded above under their corresponding workflow. The manifest remains a filename/index table to avoid rendering every full-size image a second time.

| Screenshot file | Description |
| --- | --- |
| 01-landing-page.png | Landing page |
| 02-public-registration.png | Public registration |
| 03-officer-registration-completed.png | Fictional Officer registration |
| 04-officer-account-created.png | Officer account dashboard |
| 05-member-registration-completed.png | Fictional Member registration |
| 06-member-account-created.png | Member account dashboard |
| 07-management-account-profile.png | Management account profile |
| 07-management-dashboard-before-uat.png | Financial baseline dashboard |
| 08-management-profile-updated.png | Updated management profile |
| 08-term-settings.png | Opening balance settings |
| 09-income-form.png | Income entry form |
| 09-management-change-password.png | Change-password form |
| 10-income-recorded.png | Recorded income |
| 10-management-access-after-password.png | Access after password change |
| 11-dashboard-after-income.png | Dashboard after income |
| 11-management-relogin.png | Management re-login |
| 12-expense-form.png | Expense entry form |
| 13-expense-recorded.png | Recorded expense |
| 14-dashboard-after-expense.png | Dashboard after expense |
| 16-attachment-opened.png | Authorized attachment open |
| 17-cash-transfer-form.png | Cash transfer form |
| 18-cash-transfer-recorded.png | Recorded cash transfer |
| 19-dashboard-after-transfer.png | Dashboard after transfer |
| 20-ledger-with-uat-records.png | Ledger records |
| 21-ledger-filtered.png | Filtered ledger |
| 22-transaction-details.png | Transaction details |
| 23-edit-transaction.png | Edit transaction |
| 24-transaction-after-edit.png | Edited transaction |
| 25-dashboard-after-edit.png | Dashboard after edit |
| 26-treasurer-log-after-edit.png | Edit audit entry |
| 27-report-summary.png | Report summary checkpoint |
| 28-report-schedule-1.png | Schedule 1 checkpoint |
| 29-report-schedule-2.png | Schedule 2 checkpoint |
| 30-report-attachments.png | Attachments checkpoint |
| 31-pdf-export.png | PDF export control |
| 32-pdf-opened.png | PDF viewer |
| 33-xlsx-export.png | XLSX export control |
| 34-delete-confirmation.png | Soft-delete confirmation |
| 35-ledger-after-delete.png | Ledger after deletion |
| 36-dashboard-after-delete.png | Dashboard after deletion |
| 37-treasurer-log-after-delete.png | Delete audit entry |
| 38-adviser-access.png | Adviser access |
| 39-adviser-action.png | Adviser disposable action |
| 40-auditor-access.png | Auditor access |
| 41-auditor-action.png | Auditor disposable action |
| 42-officer-dashboard.png | Officer dashboard |
| 43-officer-reports.png | Officer reports |
| 44-member-management-access-denied.png | Member access-boundary checkpoint |
| 44-officer-management-access-denied.png | Officer access denied |
| 45-member-dashboard.png | Member dashboard |
| 46-member-reports.png | Member reports |
| 47-member-management-access-denied.png | Member management boundary |
| 48-organization-b-fixture.png | Organization-B isolation fixture |
| 49-osa-overview.png | OSA overview |
| 50-final-financial-reconciliation.png | Final balance reconciliation |
| 50-osa-demo-accounts-action.png | OSA Demo accounts Excel action |
| 51-osa-organization-selection.png | OSA organization selection |
| 52-osa-organization-a.png | OSA Organization-A summary |
| 53-osa-organization-b.png | OSA Organization-B summary |
| 54-osa-report.png | OSA report package |
| 55-organization-isolation-denied.png | Treasurer cross-organization scope fallback |
| 56-officer-organization-isolation.png | Officer cross-organization scope fallback |
| 57-attachments-persisted-after-refresh.png | Attachment links after refresh |
