# UI/UX Audit and Design

## Scope

This audit covers public entry, authentication, the authenticated portal shell, dashboard, OSA oversight, ledger workflows, reports, audit history, account settings, and academic-term settings.

Financial calculations, role permissions, organization isolation, transaction actions, report totals, and export routes remain unchanged. The official financial report structure remains the source of truth for report presentation.

## Audit Findings

### Navigation and context

- Desktop navigation placed too much responsibility in a crowded header.
- Mobile users lacked a consistent workspace navigation pattern.
- Organization, role, academic term, and active or historical context were not consistently visible.
- Back links and action controls used several unrelated visual patterns.

### Workflow clarity

- Dashboard metrics had equal visual weight even though remaining balance and cash accounts are the primary review signals.
- OSA monitoring used one large card per organization, which slowed cross-organization comparison.
- Ledger entry forms and filters created a long vertical workflow and used repeated field styles.
- Destructive actions and attachment controls were visually small and inconsistent.

### Reports and review

- Report package pages repeated masthead markup and varied in header treatment.
- Report controls used custom inline SVGs and did not clearly separate term selection from export actions.
- Tables needed stronger responsive handling, stable headings, and clear mobile overflow behavior.

### Accessibility and trust

- Several error states lacked a consistent live-region treatment.
- Icon-only or symbol-based controls did not consistently expose accessible labels.
- Modal close controls varied in size and semantics.
- Visible encoding artifacts reduced trust in financial records.

## Design Direction

Use a light institutional interface appropriate for public-sector financial records:

- PKM blue for navigation and primary actions.
- PKM yellow only for high-value emphasis and active context.
- Slate neutrals for structure and scanning.
- Green for collections or success, red for expenses or destructive actions, and amber for warnings.
- Eight-pixel panels, six-pixel controls, minimum 44-pixel interactive targets, visible keyboard focus, and restrained motion.
- Inter/system sans for interface text and monospace for money, document numbers, and other audit-sensitive values.
- Tabler Icons for consistent action and navigation symbols.

The interface prioritizes dense comparison and clear operational actions over decorative cards, gradients, glass effects, or marketing-style composition.

## Implemented Changes

### Shared system

- Added reusable `PageHeader`, `Panel`, `MetricCard`, `StatusPanel`, `Button`, `ButtonLink`, and `IconButton` primitives.
- Added shared field, table, status, focus, report-toolbar, public-shell, and portal-shell styles.
- Added a persistent desktop sidebar and compact mobile navigation menu.
- Removed the unused forced dark-mode rule and normalized user-facing encoding.

### Public and authentication

- Reframed the home page as an operational entry point with direct sign-in and portal actions.
- Applied one public shell to login, registration, password-change, and access-denied states.
- Added accessible busy, error, and live status behavior to authentication forms.

### Portal and dashboard

- Added organization and role context to the portal header and sidebar.
- Prioritized remaining balance, Cash on Hand, Cash in Bank, collections, and expenses.
- Added role-appropriate next actions without changing authorization behavior.

### OSA oversight

- Replaced organization cards with a comparison table showing term, cash position, collections, expenses, remaining balance, and direct ledger/report actions.
- Applied the same comparison and context controls to summarized ledger oversight.

### Ledger

- Grouped recording workflows into transaction and cash-transfer panels.
- Standardized fields, labels, error states, filters, pagination, account visibility, and responsive table behavior.
- Preserved separate treatment for cash transfers because they affect account balances but not income or expense totals.
- Increased modal and attachment action clarity without changing soft-delete or attachment authorization behavior.

### Reports

- Added a reusable report masthead to Summary, Schedule 1, Schedule 2, and attachment-reference pages.
- Standardized term selection, print, PDF, and Excel actions.
- Preserved official package order and print orientation: portrait summary, portrait Schedule 1, landscape Schedule 2, and portrait attachment references.

### Audit and settings

- Standardized audit filters, log tables, empty states, account controls, term cards, opening-balance editing, and activation actions.
- Added explicit dialog semantics and accessible close actions to opening-balance and ledger dialogs.

## Intentionally Unchanged

- Server Actions, Route Handlers, data-access functions, Prisma models, and business-invariant enforcement.
- Role and organization authorization rules.
- Integer-cent money handling and report calculations.
- PDF and Excel export endpoints and report package data contracts.
- Official workbook reference files, sample names, signatories, transactions, and amounts.

## Verification Plan

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Focused core, integration, migration, database, and report export tests.
- Manual responsive review at mobile, tablet, and desktop widths.
- Keyboard review for navigation, forms, filters, dialogs, and report controls.
