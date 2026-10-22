# Studio Desk

A client, project and invoice workspace built by Fahad Sani with HTML, CSS and JavaScript ES modules. Serve the directory through a static web server; no build step or third-party runtime dependencies are required.

## Included workflows

- Six sections: overview, clients, projects, invoices, activity and settings.
- Search across the workspace with Ctrl/Cmd K; section search and status filters.
- Create/edit clients, contact details, notes and archive/lead/active status.
- Create/edit projects, switch board/list layouts, change status, and manage checklists.
- Create/edit draft invoices with multiple line items, decimal quantities, discounts and tax; totals calculated in integer cents.
- Issue invoices locally, record partial/full payments, detect overdue balances, duplicate as a new draft and print/save PDF through the browser.
- Linked client/project/invoice records and computed dashboard totals.
- Activity history, CSV list exports, JSON workspace export and explicit reset.
- Responsive hamburger navigation, light/dark theme, native dialogs, input validation, reduced-motion support, and print styles.

## Data scope

The initial businesses and all financial records are fictional sample content. State stays in memory for this browser tab and resets on refresh. Only the colour-theme preference is stored in localStorage. No business records or personal data are sent to a server or saved in browser storage. Use sample details. JSON exports contain the records currently entered; keep any exported real data private.

Issuing an invoice does not send an email. Recording a payment does not charge or move money. This is a portfolio application, not a production accounting service. A production version would need authentication, authorization, a durable database, audit logs, server validation, backups, jurisdiction-specific invoice/tax requirements and approved integrations.

## Verification

Run `node --test tests/model.test.mjs` from this directory. Financial tests cover discount/tax rounding, partial/full payment balance and status, overpayment rejection, draft restrictions and safe CSV quoting/formula neutralization.

Browser checks should cover adding/editing linked records, invoice lines/totals/preview, project tasks/status, partial payments, search/filter, theme/navigation and mobile layout. Print opens the browser's print dialog; PDF support depends on the browser's print destinations.
