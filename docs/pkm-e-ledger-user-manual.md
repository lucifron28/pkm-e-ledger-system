# PKM e-Ledger System User Manual

## Purpose

PKM e-Ledger is a shared financial-records portal for recognized student organizations. It records collections, expenses, cash transfers, opening balances, receipts, reports, and audit history for each organization and academic term.

This manual describes the current application workflow in plain language. It is written for student organization officers, advisers, auditors, members, and the Office of Student Affairs (OSA).

> **Privacy note:** Screenshots use fictional demo records. Never publish real passwords, personal student information, receipt files, or official financial records in a manual or public repository.

## Contents

1. [Access and user roles](#access-and-user-roles)
2. [Signing in and public registration](#signing-in-and-public-registration)
3. [Setting up a Treasurer, Adviser, or Auditor account](#setting-up-a-treasurer-adviser-or-auditor-account)
4. [Using the dashboard](#using-the-dashboard)
5. [Setting the academic term and opening balances](#setting-the-academic-term-and-opening-balances)
6. [Recording income](#recording-income)
7. [Recording expenses](#recording-expenses)
8. [Adding receipt attachments](#adding-receipt-attachments)
9. [Moving money between cash accounts](#moving-money-between-cash-accounts)
10. [Reviewing and filtering the ledger](#reviewing-and-filtering-the-ledger)
11. [Viewing, editing, and deleting entries](#viewing-editing-and-deleting-entries)
12. [Reviewing the Treasurer Log](#reviewing-the-treasurer-log)
13. [Generating financial reports](#generating-financial-reports)
14. [Officer and Member view-only access](#officer-and-member-view-only-access)
15. [OSA monitoring](#osa-monitoring)
16. [Managing your own account](#managing-your-own-account)
17. [A complete fictional workflow](#a-complete-fictional-workflow)
18. [Troubleshooting](#troubleshooting)
19. [Frequently asked questions](#frequently-asked-questions)
20. [Good practices](#good-practices)
21. [Screenshot reference](#screenshot-reference)

## Access and user roles

Each account belongs to one organization and has one role. The role controls which pages and actions are available.

| Role | Main access |
| --- | --- |
| Treasurer | Maintains the organization ledger, terms, opening balances, cash transfers, attachments, reports, and Treasurer Log. |
| Adviser | Has the same financial-record management permissions as the Treasurer. |
| Auditor | Has the same financial-record management permissions as the Treasurer. The application may display this role as **Audit**. |
| Officer | View-only access to the organization dashboard, summaries, and reports. |
| Member | View-only access to the organization dashboard, summaries, and reports. |
| OSA | Monitors summaries and reports across recognized organizations. OSA cannot create, edit, or delete financial entries and cannot manage accounts. |

Treasurer, Adviser, and Auditor can record, edit, and soft-delete financial entries. Officer and Member users cannot change financial records. OSA can inspect other organizations without receiving edit access.

## Signing in and public registration

### Sign in

1. Open the application sign-in page.
2. Enter your username.
3. Enter your password.
4. Select **Sign in to account**.

Management users go to their organization dashboard. OSA goes to **OSA Overview**. A user who has been assigned a required password change is sent to **Change account password** before continuing.

![Sign-in page](user-manual/screenshots/04-management-account-login.png)

### Public registration

Public registration is available only for **Officer** and **Member** accounts.

1. Select **Register here** on the sign-in page.
2. Enter your full name.
3. Choose a username and password.
4. Select your student organization.
5. Choose **Officer** or **Member** as the requested role.
6. Submit the registration form.
7. Return to the sign-in page and sign in.

Treasurer, Adviser, Auditor, and OSA accounts do not use public self-registration. They are prepared system or organization accounts.

![Public registration](user-manual/screenshots/02-register-account.png)

## Setting up a Treasurer, Adviser, or Auditor account

These roles use prepared accounts rather than public registration. The prepared account is assigned to a specific organization and role before it is handed to the official user.

### OSA prepares the handoff

1. Sign in as OSA.
2. Open **OSA Overview**.
3. Select **Demo accounts Excel** to download the fictional prepared-account directory for a controlled demo or account handoff.
4. Give the assigned prepared credentials to the intended Treasurer, Adviser, or Auditor through a private channel.

The downloaded directory is for controlled handoff. It is not an account-management screen, and it does not give OSA a way to create, delete, deactivate, or change roles.

![OSA Overview with Demo accounts Excel](user-manual/screenshots/03-osa-overview.png)

### The assigned user personalizes the account

The assigned Treasurer, Adviser, or Auditor should complete these steps:

1. Open the sign-in page.
2. Sign in with the assigned prepared username and temporary password.
3. Open **Account**.
4. Replace the fictional **Full Name** with the official user's name.
5. Replace the prepared **Username** with the official username.
6. Enter the current password in **Current password**.
7. Select **Save profile**.
8. Open **Change password**.
9. Enter the current password, a private new password, and the confirmation.
10. Select **Update password**.

![Prepared account sign-in](user-manual/screenshots/04-management-account-login.png)

![Account profile before personalization](user-manual/screenshots/04-account-profile.png)

![Editing Full Name and Username](user-manual/screenshots/05-edit-account-profile.png)

![Successful profile update](user-manual/screenshots/06-profile-updated.png)

Changing the name or username does **not** change the assigned organization or role. The account remains connected to the organization and role selected during preparation.

![Change password page](user-manual/screenshots/08-change-password.png)

After the password update, the user returns to the appropriate portal dashboard and can sign in again with the private password.

![Portal after password change](user-manual/screenshots/09-management-dashboard-after-password.png)

The current application does not include an OSA **User Management** screen. Do not expect OSA to create accounts, delete accounts, deactivate accounts, or change roles inside the portal. The OSA account itself is a prepared system/bootstrap account, not a public registration account.

## Using the dashboard

The management dashboard shows the selected academic term and the organization's current financial position.

The summary cards show:

- **Remaining balance:** opening funds plus income minus expenses.
- **Cash on Hand:** physical cash balance.
- **Cash in Bank:** bank account balance.
- **Total income:** recorded collections for the selected term.
- **Total expenses:** recorded expenses for the selected term.

Management users can use the dashboard actions to record income, record expenses, review the ledger, and open reports.

![Management dashboard](user-manual/screenshots/09-management-dashboard.png)

## Setting the academic term and opening balances

Treasurer, Adviser, and Auditor users can manage academic terms for their organization.

1. Open **Term Settings**.
2. Enter the academic year and semester.
3. Enter the opening **Cash on Hand** amount.
4. Enter the opening **Cash in Bank** amount.
5. Select **Set as active term** when this should be the term used by current records.
6. Select **Create Academic Term**.

Only one term is active for an organization at a time. Setting a new term active preserves previous terms for historical reference.

![Academic term settings](user-manual/screenshots/10-academic-term-settings.png)

The opening balance is split between the two cash accounts. **Balance Forwarded** is the combined opening amount:

`Balance Forwarded = Opening Cash on Hand + Opening Cash in Bank`

Use **Edit Balances** when authorized opening amounts need correction. Review the result before recording new activity.

![Opening balance fields](user-manual/screenshots/11-opening-balances.png)

## Recording income

Use **New Income** for collections such as dues, contributions, donations, sales, subsidies, or other approved income.

1. Open **New Income**.
2. Select the transaction date.
3. Enter the amount in Philippine pesos.
4. Choose **Cash on Hand** or **Cash in Bank**.
5. Choose the income category.
6. Enter the document number when one exists.
7. Enter the payor or source name.
8. Enter the particulars and any reference or attachment description.
9. Add the event or activity name when applicable.
10. Add the receipt attachment.
11. Select **Record Income**.

Use the real payor or source in **Payor / payee** so Schedule 1 can identify who provided the collection. Keep the description specific enough for another reviewer to understand the entry.

![New income form](user-manual/screenshots/13-add-income.png)

![Income saved in the ledger](user-manual/screenshots/14-income-saved.png)

## Recording expenses

Use **New Expense** for approved organization disbursements.

1. Open **New Expense**.
2. Select the transaction date.
3. Enter the amount.
4. Choose the cash account used for payment.
5. Choose the expense category.
6. Enter the document number when one exists.
7. Enter the payee.
8. Enter the particulars, event, and reference details.
9. Add the receipt attachment.
10. Select **Record Expense**.

The amount appears in the total Amount column and in its mapped expense category column in Schedule 2. An expense cannot be recorded when it would exceed the available balance.

![New expense form](user-manual/screenshots/15-add-expense.png)

![Expense saved in the ledger](user-manual/screenshots/16-expense-saved.png)

## Adding receipt attachments

Receipt attachments support review and reporting. The application accepts:

- JPEG or JPG images
- PNG images
- PDF files
- Files up to 10 MB

The file extension and file contents must match the selected file type. Attach the receipt to the related income, expense, or cash transfer and use a clear reference description.

![Receipt attachment upload](user-manual/screenshots/17-attachment-upload.png)

Only authorized users can access an organization's attachments. Do not upload unrelated personal documents.

## Moving money between cash accounts

Use **Move cash between accounts** when money moves between Cash on Hand and Cash in Bank.

1. Select the source account.
2. Confirm the destination account.
3. Enter the date and amount.
4. Enter a document number when one exists.
5. Add the event, particulars, reference, and attachment information.
6. Select **Record Cash Transfer**.

A transfer changes the Cash on Hand and Cash in Bank positions, but it is not income and is not an expense. It does not increase collections or reduce the remaining balance.

![Cash transfer form](user-manual/screenshots/19-cash-transfer.png)

![Cash transfer saved](user-manual/screenshots/20-cash-transfer-saved.png)

## Reviewing and filtering the ledger

Open **Digital Ledger** to review entries for the selected organization and term. The page shows Cash on Hand, Cash in Bank, Total Collections, Total Expenses, and Remaining Balance.

![Digital ledger](user-manual/screenshots/21-digital-ledger.png)

Use filters to narrow the list by:

- Transaction type
- Entry type
- Category
- Cash account
- Search text
- Month
- Event or activity
- Date range

Select **Clear filters** to return to the complete list for the term.

![Ledger filters](user-manual/screenshots/22-ledger-filters.png)

## Viewing, editing, and deleting entries

### View details

Select **Details** on an entry to review its document number, date, payor or payee, particulars, amount, category, cash account, event, references, and attachments.

![Transaction details](user-manual/screenshots/23-transaction-details.png)

### Edit an entry

1. Select **Edit** on the entry.
2. Review the current values.
3. Update the permitted details.
4. Save the changes.

Editing updates the current ledger record and creates an audit entry. Recheck the totals after saving.

![Edit transaction](user-manual/screenshots/24-edit-transaction.png)

![Edited transaction](user-manual/screenshots/25-edited-transaction.png)

### Delete an entry

Deletion is a soft delete. It removes the entry from active balances and reports while preserving its history in the Treasurer Log.

1. Select **Delete**.
2. Enter a clear deletion reason.
3. Review the confirmation.
4. Select **Confirm Delete**.

![Delete confirmation](user-manual/screenshots/26-delete-confirmation.png)

![Ledger after deletion](user-manual/screenshots/27-ledger-after-delete.png)

The same review rule applies to cash transfers. A deleted entry must not be used to explain current totals, but its audit history remains available for accountability.

## Reviewing the Treasurer Log

Open **Treasurer Log** to review recorded actions. Use the filters for action, actor, and date range, then select **Apply filters**.

Review the action, user, date, and summary. The log helps explain who created, edited, or deleted a financial record. Some entries may contain a technical details section; ordinary users should focus on the human-readable action summary.

![Audit entry after deletion](user-manual/screenshots/28-delete-audit-entry.png)

![Treasurer Log](user-manual/screenshots/29-treasurer-log.png)

## Generating financial reports

Open **Financial Reports** and choose an academic term. The report viewer presents an official report package rather than one flat table.

The package contains:

1. **Summary Report** in portrait format
2. **Schedule 1 Collections** in portrait format
3. **Schedule 2 Expenses** in landscape format
4. **Signature Section** with role-based signature blocks
5. **Receipts / Attachments Reference**

The summary includes the school header, organization name, report title, coverage or as-of date, balance forwarded, Cash on Hand, Cash in Bank, collections grouped by income category, Total Cash Available, expenses, ending balance, and signature blocks.

![Summary report and report package](user-manual/screenshots/30-report-summary.png)

### Schedule 1 Collections

Schedule 1 groups collections by income category. Each collection line includes:

| Column | Meaning |
| --- | --- |
| Sequence number | Order of the collection in the schedule. |
| Payor / source name | The person, group, or source recorded in the income entry. |
| Amount | Collection amount. |
| Total per schedule | Total for the collection group or schedule. |

The system uses **Payor / source name**. If it is unavailable, the description is used as a fallback.

![Schedule 1 Collections](user-manual/screenshots/31-schedule-1-collections.png)

### Schedule 2 Expenses

Schedule 2 uses a landscape table so expense categories remain visible. Each expense appears in the total **Amount** column and in one mapped category column.

The table includes:

| Column | Meaning |
| --- | --- |
| Doc No. | Document or receipt number. |
| Date | Expense date. |
| Payee | Person or supplier paid. |
| Particulars | Explanation of the expense. |
| Amount | Total expense amount. |
| Category columns | The mapped category amount, such as Supplies, Equipment, Transportation, Meals, Service, Miscellaneous, Donation, or Others. |

![Schedule 2 Expenses](user-manual/screenshots/32-schedule-2-expenses.png)

### Receipts and attachment references

The final report section lists the receipt or attachment references connected to report entries. Keep uploaded filenames and descriptions understandable to the reviewer.

![Receipts and attachment references](user-manual/screenshots/33-report-attachments.png)

### Print, PDF, and Excel

The report toolbar provides:

- **Print:** opens the browser print flow. Use portrait pages for the Summary and Schedule 1, and landscape for Schedule 2.
- **PDF:** downloads the report package as a PDF with the official page structure.
- **Excel:** downloads a workbook with equivalent report sheets.

![PDF export control](user-manual/screenshots/34-pdf-export-button.png)

![Excel export control](user-manual/screenshots/35-excel-export-button.png)

The Excel workbook contains sheets equivalent to:

- `SUMMARY`
- `SCHEDULE 1 - COLLECTIONS`
- `SCHEDULE 2 - EXPENSES`
- `RECEIPTS / ATTACHMENTS`

Where practical, workbook totals use formulas. Always select the correct academic term before exporting.

## Officer and Member view-only access

Officer and Member users can review their organization's financial position and report package. Their navigation contains Dashboard, Reports, and Account.

They cannot record income, record expenses, create cash transfers, edit entries, delete entries, change opening balances, or use the Treasurer Log.

![Officer dashboard](user-manual/screenshots/38-officer-dashboard.png)

![Officer reports](user-manual/screenshots/39-officer-reports.png)

![Member dashboard](user-manual/screenshots/40-member-dashboard.png)

![Member reports](user-manual/screenshots/41-member-reports.png)

## OSA monitoring

OSA can compare recognized organizations and inspect summarized financial positions.

### Organization overview

**OSA Overview** lists organizations with their active term, Cash on Hand, Cash in Bank, collections, expenses, remaining balance, and links to the summarized ledger or report package.

![OSA organization monitoring](user-manual/screenshots/42-osa-overview.png)

### Organization ledger summary

1. Open **Organization Ledger Summary**.
2. Select an organization.
3. Select an academic term when needed.
4. Review the cash position, collections, expenses, remaining balance, and category subtotals.

Selecting an organization changes the viewing context without granting edit access.

![OSA organization selection](user-manual/screenshots/43-osa-organization-selection.png)

![OSA organization summary](user-manual/screenshots/44-osa-organization-summary.png)

### OSA report viewing

Select **View report package** to inspect the selected organization's current report package. OSA is a monitoring role. The current OSA report view does not provide management edit actions or report export controls.

![OSA report view](user-manual/screenshots/45-osa-report.png)

OSA does not have a User Management screen in the current version.

## Managing your own account

Open **Account** to update your profile and security settings.

### Update profile details

1. Change **Full Name** when the displayed name needs correction.
2. Change **Username** when an official username is needed.
3. Enter the current password.
4. Select **Save profile**.

The current password is required to authorize the profile update. This changes the displayed name and username only. It does not change role, organization assignment, or account status.

![Account settings](user-manual/screenshots/49-account-settings.png)

### Change password

1. Select **Change password**.
2. Enter the current password.
3. Enter a private new password.
4. Confirm the new password.
5. Select **Update password**.

Password changes apply to the next sign-in. Sign out when finished with a shared or temporary device.

## A complete fictional workflow

Use this sequence for a normal organization reporting cycle:

1. A prepared Treasurer, Adviser, or Auditor account is handed to the assigned official.
2. The official updates the fictional name and username, then changes the temporary password.
3. The management user confirms the correct active academic term.
4. The management user reviews Cash on Hand and Cash in Bank opening balances.
5. Collections are recorded with source names, income categories, and receipts.
6. Approved expenses are recorded with payees, particulars, categories, and receipts.
7. Cash moved between accounts is recorded as a transfer, not as income or expense.
8. The management user reviews filters, details, totals, and the Treasurer Log.
9. The organization opens the report package, checks Summary, Schedule 1, Schedule 2, signatures, and attachments.
10. The organization prints or exports the selected term for review.
11. Officer and Member users review the report package using their view-only accounts.
12. OSA compares organization summaries and opens report packages for monitoring.

Use fictional names and sample amounts only in demos. Replace them with authorized real records only inside the deployed application and according to the organization's privacy rules.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Sign-in rejected | Check the username, password, and keyboard case. Use the assigned account, not a public registration attempt for a management role. |
| Wrong role or organization | Contact the responsible system administrator or OSA. Profile editing cannot change role or organization. |
| No active term | A Treasurer, Adviser, or Auditor must configure or activate the appropriate academic term. |
| Attachment rejected | Confirm the file is JPEG, PNG, or PDF, is no larger than 10 MB, and has a matching extension and file type. |
| Expense cannot be recorded | Review Cash on Hand, Cash in Bank, opening balances, income, and existing expenses. The expense may exceed available funds. |
| Entry seems missing | Check the selected term and clear filters. A soft-deleted entry is excluded from active totals but remains in the Treasurer Log. |
| Export buttons are not visible | Export access is available to management report users. OSA, Officer, and Member report views are for viewing according to their current permissions. |
| Password is forgotten | Use the organization's responsible account administrator or approved support process. The current application does not provide a public password-reset workflow. |

## Frequently asked questions

### Who can register for an account?

Officer and Member users can use public registration. Treasurer, Adviser, Auditor, and OSA users use prepared accounts.

### How does a Treasurer, Adviser, or Auditor get an account?

The role uses a prepared organization account. The assigned official signs in, updates the account's name and username, then changes the temporary password.

### Can OSA create accounts inside the system?

No. The current version does not include a User Management screen. OSA cannot create, delete, deactivate, or change roles for accounts through the portal.

### How is the OSA account created?

The OSA account is a prepared system/bootstrap account, not a public registration account.

### Who can edit financial records?

Treasurer, Adviser, and Auditor users can manage financial records for their assigned organization. Officer and Member users are view-only. OSA monitors records without editing them.

### What changes when a user edits their profile?

The Full Name and Username shown in the portal and audit records change. The assigned organization, role, and account status do not change.

### What is a soft delete?

Soft delete removes an entry from active balances and reports while preserving its history and deletion reason in the Treasurer Log.

### Do cash transfers count as collections or expenses?

No. A cash transfer only moves money between Cash on Hand and Cash in Bank.

### What should appear in a financial report?

The report package contains Summary Report, Schedule 1 Collections, Schedule 2 Expenses, Signature Section, and Receipts / Attachments Reference.

## Good practices

- Use one account per authorized user.
- Replace temporary prepared-account passwords immediately.
- Do not share private passwords in screenshots, documents, chat groups, or public repositories.
- Use clear document numbers, payor or payee names, particulars, event names, and receipt descriptions.
- Attach the supporting receipt to the correct entry.
- Review cash-account balances after every transfer.
- Review the Treasurer Log before finalizing a report.
- Select the correct academic term before viewing or exporting.
- Keep official reports and personal information in approved private storage.
- Use fictional names, usernames, amounts, and attachments in demonstrations.

## Screenshot reference

Screenshots are stored in [`docs/user-manual/screenshots/`](user-manual/screenshots/). They were captured from the current `feature/pkm-user-manual` application workflow using a desktop viewport of 1920 x 1080 where possible. Long pages were captured at full page height so the complete report or organization list remains visible.

The screenshots do not display passwords. The account names, organizations, amounts, and attachments shown are fictional demo records or current application seed content and must not be treated as official financial data.

This manual documents the current workflow. It does not describe an unimplemented OSA user-management feature, and it does not include the historical financial-report workbook as application data.
