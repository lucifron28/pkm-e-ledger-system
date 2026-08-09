# Financial Report Template Gap Analysis

## Scope

This analysis records the layout characteristics of a private historical
spreadsheet reference and maps them to the e-Ledger report package. The
reference is used for presentation guidance only. It is not imported as
application data, distributed with generated reports, or used as a seed,
fixture, test record, or demo dataset.

The application remains the source of truth. Reports are generated from the
selected academic term's active, normalized records and are live views rather
than immutable official publications.

## Reference Characteristics

- Workbook contains one summary sheet, repeated collection schedule sheets,
  one expense schedule sheet, and one receipts section.
- Summary uses a portrait page with a school header, organization header,
  financial report title, coverage/as-of date, balance-forwarded section,
  collection totals, cash available, expenses, ending balance, and signature
  roles.
- Collection schedules use portrait pages with a schedule heading, collection
  group label, sequence number, source name, amount, and a schedule total.
- The expense schedule uses a landscape table with document number, date,
  payee, particulars, total amount, and category amount columns.
- Expense categories are represented as one amount in the total column and one
  amount in its mapped category column. Category totals appear in a final row.
- Receipt pages are portrait-oriented and primarily present supporting receipt
  images identified by document number.
- Currency cells use a Philippine peso-style currency format. Date cells use a
  short calendar date format. Header and total rows use bold text and bordered
  emphasis.
- Repeated collection sheets represent historical collection groupings and
  do not define a required student-record subsystem for this application.

## Mapping

| Workbook element | Current equivalent | Gap | Recommended treatment | Classification |
| --- | --- | --- | --- | --- |
| School and organization header | `ReportPackageDto.organizationName`, term, and report viewer header | Export header hierarchy is flatter than the reference | Use a consistent three-level header with school label, organization name, report title, and coverage/as-of line | B - Presentational |
| Summary report title and coverage date | `academicYear`, `semesterLabel`, and `asOfDate` | Labels and spacing need closer template treatment | Keep values live and normalized; align typography, spacing, page orientation, and print breaks | B - Presentational |
| Balance forwarded | `openingCashOnHandCents`, `openingCashInBankCents`, `balanceForwardedCents` | Domain already has split opening accounts; renderers need matching order and labels | Render Cash on Hand, Cash in Bank, and Balance Forwarded in that order; preserve integer-cent calculations | A - Direct |
| Cash available | `totalCashAvailableCents` | Current presentation does not consistently expose the calculation chain | Show Balance Forwarded plus Total Collections, with a formula in Excel where practical | A - Direct |
| Collections by income bucket | `collectionGroups` and `totalIncomeCents` | In-app and exports use different levels of detail | Keep category totals in Summary and category/payor rows in Schedule 1; use `counterpartyName`, then description as fallback | A - Direct |
| Collection schedule pages | `collectionGroups[].items` | Current export is one flat table and lacks page-level group headings | Render grouped portrait sections with sequence, source name, amount, and total per schedule | B - Presentational |
| Historical individual or section collection sheets | No student/section collection subsystem | Current domain cannot reproduce historical student pages without inventing new data requirements | Do not add student entities or copy historical rows; represent only normalized transaction collections | D - Not representable from current domain |
| Expense schedule orientation | `expenseRows` and PDF schedule renderer | Landscape behavior needs explicit export and print settings | Keep Schedule 2 landscape in PDF, Excel print setup, and HTML print CSS | B - Presentational |
| Expense total and category columns | `amountCents`, `categoryBucketCents`, `expenseCategories` | Historical column labels and current canonical buckets need consistent mapping | Render one total Amount and one mapped category cell per expense; preserve `Others` when needed | A - Direct |
| Historical expense category labels | `ExpenseReportBucket` and `SCHEDULE_2_BUCKETS` | The reference does not show every current fallback bucket | Keep the approved application buckets; use the reference labels where they match and add `Others` only to preserve data | C - Derivable |
| Expense totals row | `expenseCategories` and `totalExpenseCents` | Existing export has totals but needs stronger template borders and formula coverage | Add a final totals row with formulas in Excel and matching totals in HTML/PDF | B - Presentational |
| Signature section | Role-only titles in `report.signatories` | The reference contains signature lines; real signatories must never be copied | Render blank signature lines and role/title labels only; do not seed or hardcode personal names | B - Presentational |
| Receipts / attachments section | Authorized attachment metadata in `report.attachments` | Historical receipt scans are not report data and cannot be copied | Generate a structured attachment index with document number, date, particulars, file name, type, and size; retain access control for files | A - Direct |
| Embedded receipt images | Attachment storage and authorized attachment route | Exporters do not receive unrestricted file paths or image bytes | Keep image access behind authorization; image embedding is optional and out of the initial template alignment scope | E - Out of scope for initial alignment |
| Workbook sheet order | Existing `SUMMARY`, Schedule 1, Schedule 2, and attachment sheet | Excel forbids `/` in sheet names, while the template label uses a slash | Use valid sheet name `RECEIPTS - ATTACHMENTS` with the visible title `RECEIPTS / ATTACHMENTS` | B - Presentational |
| Excel formulas | Formula-backed summary and schedule totals | Formula coverage and cached values must stay consistent with server totals | Use formulas for row and category totals where practical; retain server-calculated cached results | C - Derivable |
| Currency and date formats | Renderer-level formatting | Existing formats differ from the reference style | Use a Philippine peso-style number format and short date format without changing integer-cent storage | B - Presentational |
| Organization and term isolation | Snapshot report loading and authorization checks | Template alignment must not weaken access boundaries | Continue generating from one authorized organization and term snapshot | A - Direct |
| Transfers | Separate transfer aggregate and account balances | Transfers do not appear as collections or expenses in the reference schedules | Keep transfers out of Schedule 1 and Schedule 2; reflect their effect only in account balances | A - Direct |

## Supported Output Contract

Each generated report package contains:

1. Summary Report in portrait orientation.
2. Schedule 1 Collections in portrait orientation, grouped by income report
   bucket.
3. Schedule 2 Expenses in landscape orientation with mapped category columns.
4. Signature section with blank lines and role labels.
5. Receipts / Attachments reference with metadata only unless an authorized
   file-delivery feature is explicitly added later.

HTML remains the in-app report interface. PDF and Excel are export formats.
Excel uses sheets equivalent to `SUMMARY`, `SCHEDULE 1 - COLLECTIONS`,
`SCHEDULE 2 - EXPENSES`, and `RECEIPTS - ATTACHMENTS`.

## Privacy and Data Boundaries

- The private reference workbook remains local-only and ignored by Git.
- No real names, student names, signatories, document numbers, receipt images,
  organization identifiers, or exact sample amounts may appear in source,
  docs, tests, fixtures, seeds, screenshots, or generated demo output.
- Regression tests use fictional records with synthetic amounts.
- The report package exposes only authorized attachment metadata; private
  storage keys and unrestricted paths are never serialized into exports.

## Status

Gap analysis complete. Renderer, HTML/print, and regression-test alignment is
tracked in the current feature branch.
