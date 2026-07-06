# Official Report Layout Reference

This document describes the expected PKM e-Ledger financial report structure
based on a local-only official workbook reference. The reference workbook is not
application data and must not be imported, seeded, copied, or committed.

Do not copy personal names, student names, signatories, exact sample amounts, or
sample transaction rows from the reference workbook into this repository.
Generated demo data must use fictional names and fictional amounts only.

## Report Package

Generated financial reports should be treated as a package, not a single flat
ledger table. The package includes:

- Summary Report
- Schedule 1 Collections
- Schedule 2 Expenses
- Signature Section
- Optional Receipts / Attachments Reference

## Summary Report

The summary report is a portrait-oriented page with:

- School header
- Organization name
- Financial report title
- Coverage or as-of date
- Balance forwarded section
- Cash on Hand
- Cash in Bank
- Total balance forwarded
- Collections grouped by income report bucket
- Total collections
- Total cash available
- Less: expenses from Schedule 2
- Ending balance
- Signature blocks

Opening balance must be split into Cash on Hand and Cash in Bank. Balance
forwarded is the sum of both opening balance accounts.

## Schedule 1 Collections

Schedule 1 contains grouped collection pages. Each page should represent a
collection grouping such as a report bucket, month, activity, or another
configured grouping.

Collection schedule columns:

- Sequence number
- Payor / source name
- Amount

Use `counterpartyName` as the payor or source. Fall back to the transaction
description only when no counterparty name is available. Each schedule should
include a total row.

## Schedule 2 Expenses

Schedule 2 is a landscape-oriented expense table.

Expense columns:

- Doc No.
- Date
- Payee
- Particulars
- Amount
- Supplies
- Equipment
- Transportation
- Meals
- Service
- Miscellaneous
- Donation
- Others, if needed

Each expense appears in the total Amount column and in exactly one mapped
expense category column.

## Exports

PDF export should preserve the official package structure:

- Summary Report in portrait
- Schedule 1 pages in portrait
- Schedule 2 in landscape
- Signature section

Excel export should generate equivalent workbook sheets:

- `SUMMARY`
- `SCHEDULE 1 - COLLECTIONS`
- `SCHEDULE 2 - EXPENSES`
- `RECEIPTS / ATTACHMENTS`

Use spreadsheet formulas for totals where practical.

## Privacy Rules

- Do not seed real names from the official workbook.
- Do not commit official workbook data to public repositories.
- Do not hardcode personal names from the sample.
- Do not copy exact sample amounts or sample transaction rows.
- Generated demo data must use fake/demo names only.
