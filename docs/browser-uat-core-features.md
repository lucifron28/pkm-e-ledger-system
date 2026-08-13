# PKM e-Ledger Core Browser UAT

## Test Environment

| Item | Result |
| --- | --- |
| Branch | `qa/browser-uat-core-features` |
| Source | Current `main` at `a07697d814b90a46cb24e51fff4616bbbf678a2b` when UAT began |
| Application | Local production server from current main: `npm run start`, `http://localhost:3001` |
| Browser | Codex In-app Browser, Chromium-based |
| Viewport | Desktop `1920 x 1080`; long-page captures use the same viewport with full-page capture |
| Data | Fresh isolated SQLite database and fictional UAT records only |
| Cloud preview | No usable Vercel Preview was confirmed; local production UAT was used. Remote preview lookup was inconclusive because access permission timed out. |
| Workbook viewer | No LibreOffice, OpenOffice, or Microsoft Excel viewer was available in this environment. |

No application source files were changed during this UAT. The reference workbook, private data, real credentials, and production/Turso data were not used.

## Overall Result

**PASS WITH ENVIRONMENT-BLOCKED ITEM**

No product failure was observed in the executed browser flows. Financial entry, balances, transfer handling, attachments, report rendering, PDF opening, role boundaries, OSA monitoring, organization scoping, soft deletion, and audit history passed.

One export check is blocked by the environment: the XLSX download completed, but visual sheet-by-sheet inspection could not be performed because no spreadsheet viewer was installed. This is not classified as an application failure.

## UAT Checklist

| Area | Status | Evidence and result |
| --- | --- | --- |
| Landing page and public registration | PASS | [01 landing](evidence/browser-uat/01-landing-page.png), [02 registration](evidence/browser-uat/02-public-registration.png), [03 officer registration](evidence/browser-uat/03-officer-registration-completed.png), [05 member registration](evidence/browser-uat/05-member-registration-completed.png). Public registration created fictional Officer and Member accounts only. |
| Officer and Member view-only boundary | PASS | [42 officer dashboard](evidence/browser-uat/42-officer-dashboard.png), [43 officer reports](evidence/browser-uat/43-officer-reports.png), [44 officer access denied](evidence/browser-uat/44-officer-management-access-denied.png), [45 member dashboard](evidence/browser-uat/45-member-dashboard.png), [46 member reports](evidence/browser-uat/46-member-reports.png), [47 member management boundary](evidence/browser-uat/47-member-management-access-denied.png). Officer management route returned access denied; Member management route returned to its authorized home and exposed no management controls. |
| Prepared management account profile and password flow | PASS | [07 profile](evidence/browser-uat/07-management-account-profile.png), [08 profile updated](evidence/browser-uat/08-management-profile-updated.png), [09 change password](evidence/browser-uat/09-management-change-password.png), [10 post-password access](evidence/browser-uat/10-management-access-after-password.png), [11 re-login](evidence/browser-uat/11-management-relogin.png). Fictional Treasurer profile name and username were updated, password was changed, and the account re-entered the portal. |
| Dashboard and opening balances | PASS | [07 dashboard baseline](evidence/browser-uat/07-management-dashboard-before-uat.png), [08 term settings](evidence/browser-uat/08-term-settings.png). Opening Cash on Hand was set to PHP 500.00; Cash in Bank was PHP 0.00; Balance Forwarded was PHP 500.00. |
| Income entry | PASS | [09 income form](evidence/browser-uat/09-income-form.png), [10 income recorded](evidence/browser-uat/10-income-recorded.png), [11 dashboard after income](evidence/browser-uat/11-dashboard-after-income.png). Fictional Membership Dues income of PHP 1,000.00 recorded with document, payor, activity, reference, cash account, and attachment. |
| Expense entry and category mapping | PASS | [12 expense form](evidence/browser-uat/12-expense-form.png), [13 expense recorded](evidence/browser-uat/13-expense-recorded.png), [14 dashboard after expense](evidence/browser-uat/14-dashboard-after-expense.png). Fictional Supplies expense of PHP 300.00 appeared in the total and mapped category column. |
| Attachment upload and authorized open | PASS | [16 attachment opened](evidence/browser-uat/16-attachment-opened.png), [57 attachment after refresh](evidence/browser-uat/57-attachments-persisted-after-refresh.png). The fictional PDF attachment opened through the authorized attachment route and its link remained after refresh. Direct browser tab navigation treated the PDF route as a download, so no false download event is claimed. |
| Cash transfer | PASS | [17 transfer form](evidence/browser-uat/17-cash-transfer-form.png), [18 transfer recorded](evidence/browser-uat/18-cash-transfer-recorded.png), [19 dashboard after transfer](evidence/browser-uat/19-dashboard-after-transfer.png). PHP 200.00 moved from Cash on Hand to Cash in Bank without changing income, expense, or remaining totals. |
| Ledger search and filters | PASS | [20 ledger records](evidence/browser-uat/20-ledger-with-uat-records.png), [21 filtered ledger](evidence/browser-uat/21-ledger-filtered.png). Income, expense, and transfer were visible; search returned the fictional UAT records. |
| Transaction details | PASS | [22 transaction details](evidence/browser-uat/22-transaction-details.png). Details showed date, amount, category, cash account, document, counterparty, activity, reference, and attachment link. |
| Transaction edit and audit trail | PASS | [23 edit form](evidence/browser-uat/23-edit-transaction.png), [24 after edit](evidence/browser-uat/24-transaction-after-edit.png), [25 dashboard after edit](evidence/browser-uat/25-dashboard-after-edit.png), [26 edit audit](evidence/browser-uat/26-treasurer-log-after-edit.png). PHP 1,000.00 income was changed to PHP 1,100.00 and the audit log recorded the change. |
| Official report package viewer | PASS | [27 summary](evidence/browser-uat/27-report-summary.png), [28 Schedule 1 checkpoint](evidence/browser-uat/28-report-schedule-1.png), [29 Schedule 2 checkpoint](evidence/browser-uat/29-report-schedule-2.png), [30 attachments checkpoint](evidence/browser-uat/30-report-attachments.png). The rendered package contained Summary, Schedule 1 Collections, Schedule 2 Expenses, Receipts / Attachments, and signature blocks. These are one scrollable package view captured at section checkpoints; similar imagery is expected. |
| PDF export | PASS | [31 PDF export control](evidence/browser-uat/31-pdf-export.png), [32 PDF opened](evidence/browser-uat/32-pdf-opened.png). The PDF route opened in the browser PDF viewer and showed a four-page report package with summary structure and signature section. |
| Excel export | PASS / BLOCKED VISUAL CHECK | [33 XLSX export](evidence/browser-uat/33-xlsx-export.png). Browser download event completed. Visual workbook inspection is **BLOCKED** because no spreadsheet viewer was installed; no sheet-level visual PASS is claimed. |
| Soft deletion and excluded totals | PASS | [34 delete confirmation](evidence/browser-uat/34-delete-confirmation.png), [35 ledger after delete](evidence/browser-uat/35-ledger-after-delete.png), [36 dashboard after delete](evidence/browser-uat/36-dashboard-after-delete.png). Deleted income left the active ledger and no longer contributed to totals. |
| Delete audit history | PASS | [37 delete audit](evidence/browser-uat/37-treasurer-log-after-delete.png). Deletion reason and soft-delete action remained visible in the Treasurer Log. |
| Adviser permissions | PASS | [38 adviser access](evidence/browser-uat/38-adviser-access.png), [39 adviser action](evidence/browser-uat/39-adviser-action.png). Adviser could use organization-scoped financial management, then the disposable fictional check record was soft-deleted. |
| Auditor permissions | PASS | [40 auditor access](evidence/browser-uat/40-auditor-access.png), [41 auditor action](evidence/browser-uat/41-auditor-action.png). Auditor could use organization-scoped financial management, then the disposable fictional check record was soft-deleted. |
| OSA overview and prepared-account handoff | PASS | [49 OSA overview](evidence/browser-uat/49-osa-overview.png), [50 Demo accounts Excel action](evidence/browser-uat/50-osa-demo-accounts-action.png). OSA overview showed cross-organization summaries and the Demo accounts Excel action. The workbook was not opened or exposed in evidence because it contains prepared fictional credentials. |
| OSA organization summary | PASS | [51 organization selection](evidence/browser-uat/51-osa-organization-selection.png), [52 Organization A summary](evidence/browser-uat/52-osa-organization-a.png), [53 Organization B summary](evidence/browser-uat/53-osa-organization-b.png). OSA switched organization context and saw each organization’s own summary without edit controls. |
| OSA report access | PASS | [54 OSA report](evidence/browser-uat/54-osa-report.png). OSA opened a selected organization’s report package in view-only mode. |
| Organization isolation | PASS | [55 scoped organization request](evidence/browser-uat/55-organization-isolation-denied.png), [56 Officer organization request](evidence/browser-uat/56-officer-organization-isolation.png). A Treasurer requesting another organization’s context was returned to the assigned organization’s ledger; an Officer requesting another organization’s context was returned to the assigned dashboard. No other organization’s ledger was exposed. |
| Final cleanup and reconciliation | PASS | [50 final reconciliation](evidence/browser-uat/50-final-financial-reconciliation.png). Disposable organization-B and role-check records were soft-deleted. Main Organization-A final state reconciled exactly. |

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
| XLSX visual inspection unavailable | BLOCKED environment check | Download completed, but workbook sheet layout was not visually inspected because no spreadsheet viewer was available. |
| Vercel Preview could not be confirmed | Environment limitation | UAT ran against local production mode and did not claim remote/Turso persistence. |
| No product failures observed | Informational | No defect was raised from executed browser flows. |

No real names, passwords, student data, official workbook records, production database records, or private attachment contents were committed. Evidence uses fictional UAT labels only.

## Evidence Manifest

Every screenshot captured for this UAT is listed below. The browser harness saved these image files with `.png` names; their visual content was opened and checked. The desktop viewport was 1920 x 1080; full-page captures may exceed 1080 pixels in height.

| File | Evidence |
| --- | --- |
| [01-landing-page.png](evidence/browser-uat/01-landing-page.png) | Landing page |
| [02-public-registration.png](evidence/browser-uat/02-public-registration.png) | Public registration |
| [03-officer-registration-completed.png](evidence/browser-uat/03-officer-registration-completed.png) | Fictional Officer registration |
| [04-officer-account-created.png](evidence/browser-uat/04-officer-account-created.png) | Officer account dashboard |
| [05-member-registration-completed.png](evidence/browser-uat/05-member-registration-completed.png) | Fictional Member registration |
| [06-member-account-created.png](evidence/browser-uat/06-member-account-created.png) | Member account dashboard |
| [07-management-account-profile.png](evidence/browser-uat/07-management-account-profile.png) | Management account profile |
| [07-management-dashboard-before-uat.png](evidence/browser-uat/07-management-dashboard-before-uat.png) | Financial baseline dashboard |
| [08-management-profile-updated.png](evidence/browser-uat/08-management-profile-updated.png) | Updated management profile |
| [08-term-settings.png](evidence/browser-uat/08-term-settings.png) | Opening balance settings |
| [09-income-form.png](evidence/browser-uat/09-income-form.png) | Income entry form |
| [09-management-change-password.png](evidence/browser-uat/09-management-change-password.png) | Change-password form |
| [10-income-recorded.png](evidence/browser-uat/10-income-recorded.png) | Recorded income |
| [10-management-access-after-password.png](evidence/browser-uat/10-management-access-after-password.png) | Access after password change |
| [11-dashboard-after-income.png](evidence/browser-uat/11-dashboard-after-income.png) | Dashboard after income |
| [11-management-relogin.png](evidence/browser-uat/11-management-relogin.png) | Management re-login |
| [12-expense-form.png](evidence/browser-uat/12-expense-form.png) | Expense entry form |
| [13-expense-recorded.png](evidence/browser-uat/13-expense-recorded.png) | Recorded expense |
| [14-dashboard-after-expense.png](evidence/browser-uat/14-dashboard-after-expense.png) | Dashboard after expense |
| [16-attachment-opened.png](evidence/browser-uat/16-attachment-opened.png) | Authorized attachment open |
| [17-cash-transfer-form.png](evidence/browser-uat/17-cash-transfer-form.png) | Cash transfer form |
| [18-cash-transfer-recorded.png](evidence/browser-uat/18-cash-transfer-recorded.png) | Recorded cash transfer |
| [19-dashboard-after-transfer.png](evidence/browser-uat/19-dashboard-after-transfer.png) | Dashboard after transfer |
| [20-ledger-with-uat-records.png](evidence/browser-uat/20-ledger-with-uat-records.png) | Ledger records |
| [21-ledger-filtered.png](evidence/browser-uat/21-ledger-filtered.png) | Filtered ledger |
| [22-transaction-details.png](evidence/browser-uat/22-transaction-details.png) | Transaction details |
| [23-edit-transaction.png](evidence/browser-uat/23-edit-transaction.png) | Edit transaction |
| [24-transaction-after-edit.png](evidence/browser-uat/24-transaction-after-edit.png) | Edited transaction |
| [25-dashboard-after-edit.png](evidence/browser-uat/25-dashboard-after-edit.png) | Dashboard after edit |
| [26-treasurer-log-after-edit.png](evidence/browser-uat/26-treasurer-log-after-edit.png) | Edit audit entry |
| [27-report-summary.png](evidence/browser-uat/27-report-summary.png) | Report summary checkpoint |
| [28-report-schedule-1.png](evidence/browser-uat/28-report-schedule-1.png) | Schedule 1 checkpoint |
| [29-report-schedule-2.png](evidence/browser-uat/29-report-schedule-2.png) | Schedule 2 checkpoint |
| [30-report-attachments.png](evidence/browser-uat/30-report-attachments.png) | Attachments checkpoint |
| [31-pdf-export.png](evidence/browser-uat/31-pdf-export.png) | PDF export control |
| [32-pdf-opened.png](evidence/browser-uat/32-pdf-opened.png) | PDF viewer |
| [33-xlsx-export.png](evidence/browser-uat/33-xlsx-export.png) | XLSX export control |
| [34-delete-confirmation.png](evidence/browser-uat/34-delete-confirmation.png) | Soft-delete confirmation |
| [35-ledger-after-delete.png](evidence/browser-uat/35-ledger-after-delete.png) | Ledger after deletion |
| [36-dashboard-after-delete.png](evidence/browser-uat/36-dashboard-after-delete.png) | Dashboard after deletion |
| [37-treasurer-log-after-delete.png](evidence/browser-uat/37-treasurer-log-after-delete.png) | Delete audit entry |
| [38-adviser-access.png](evidence/browser-uat/38-adviser-access.png) | Adviser access |
| [39-adviser-action.png](evidence/browser-uat/39-adviser-action.png) | Adviser disposable action |
| [40-auditor-access.png](evidence/browser-uat/40-auditor-access.png) | Auditor access |
| [41-auditor-action.png](evidence/browser-uat/41-auditor-action.png) | Auditor disposable action |
| [42-officer-dashboard.png](evidence/browser-uat/42-officer-dashboard.png) | Officer dashboard |
| [43-officer-reports.png](evidence/browser-uat/43-officer-reports.png) | Officer reports |
| [44-member-management-access-denied.png](evidence/browser-uat/44-member-management-access-denied.png) | Member access-boundary checkpoint |
| [44-officer-management-access-denied.png](evidence/browser-uat/44-officer-management-access-denied.png) | Officer access denied |
| [45-member-dashboard.png](evidence/browser-uat/45-member-dashboard.png) | Member dashboard |
| [46-member-reports.png](evidence/browser-uat/46-member-reports.png) | Member reports |
| [47-member-management-access-denied.png](evidence/browser-uat/47-member-management-access-denied.png) | Member management boundary |
| [48-organization-b-fixture.png](evidence/browser-uat/48-organization-b-fixture.png) | Organization-B isolation fixture |
| [49-osa-overview.png](evidence/browser-uat/49-osa-overview.png) | OSA overview |
| [50-final-financial-reconciliation.png](evidence/browser-uat/50-final-financial-reconciliation.png) | Final balance reconciliation |
| [50-osa-demo-accounts-action.png](evidence/browser-uat/50-osa-demo-accounts-action.png) | OSA Demo accounts Excel action |
| [51-osa-organization-selection.png](evidence/browser-uat/51-osa-organization-selection.png) | OSA organization selection |
| [52-osa-organization-a.png](evidence/browser-uat/52-osa-organization-a.png) | OSA Organization-A summary |
| [53-osa-organization-b.png](evidence/browser-uat/53-osa-organization-b.png) | OSA Organization-B summary |
| [54-osa-report.png](evidence/browser-uat/54-osa-report.png) | OSA report package |
| [55-organization-isolation-denied.png](evidence/browser-uat/55-organization-isolation-denied.png) | Treasurer cross-organization scope fallback |
| [56-officer-organization-isolation.png](evidence/browser-uat/56-officer-organization-isolation.png) | Officer cross-organization scope fallback |
| [57-attachments-persisted-after-refresh.png](evidence/browser-uat/57-attachments-persisted-after-refresh.png) | Attachment links after refresh |
