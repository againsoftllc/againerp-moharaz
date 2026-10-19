# Again List Datatable

**Family name:** Again List Datatable  
**Canonical screen:** `/customers` (`CustomerGrid`) — filter bar + AG Grid + 27px zoom + native paging footer.

Every admin list that looks like Customers is this family. Visual and paging changes must land in the **shared shell**, not one page at a time.

Living UI rules: `docs/ERP-UI-COMMON.md`. This file is the **inventory** of which pages and drawers use the family.

---

## Shared library (use these — do not fork)

| Piece | Path | Role |
| --- | --- | --- |
| Theme / footer CSS | `apps/web/src/app/globals.css` → `.ag-theme-again-list`, `.product-grid-fill` | Square chrome, 27px paging bar |
| AG Grid register | `apps/web/src/components/providers/ag-grid-provider.tsx` | Modules / license |
| Page name in filter bar | `apps/web/src/components/shared/list-grid-header-start.tsx` | `[Page name] [New] [⋯]` |
| Footer zoom | `apps/web/src/components/shared/grid-zoom.tsx` | Left overlay on paging bar |
| Fullscreen | `apps/web/src/components/shared/grid-fullscreen.tsx` | Header expand |
| Ref cells | `apps/web/src/components/shared/grid-ref-link.tsx` | Open related drawer |
| Status chips | `apps/web/src/components/shared/grid-chip-badge.tsx` | Squared labels |
| Height fix | `apps/web/src/components/shared/use-ag-grid-height-fix.ts` | Fill viewport |
| Dark mode | `apps/web/src/lib/use-is-dark.ts` | `ag-theme-quartz-dark` |
| Native server pager | `apps/web/src/components/shared/use-ag-native-server-pager.ts` | Native footer, server `limit`/`offset` (owned by the shell) |
| List shell | `apps/web/src/components/shared/again-list-grid.tsx` | Filter bar, zoom, 27px pager, empty overlay, day/night — **one change updates every list** |
| Finance wrapper | `apps/web/src/components/finance/finance-ag-list-grid.tsx` | Column picker + CSV + mobile cards on top of `AgainListGrid` |

**Typography is shared too:** Inter (Odoo's list font) at one size for every cell and header — set once in `.ag-theme-again-list` (`--font-list`, `--ag-font-size`). Cell renderers must not set `font-mono`, `text-xs`/`text-sm` or any font size/family; use weight or colour for emphasis. See `docs/ERP-UI-COMMON.md` §8.

Page files pass columns, rows, `filterBar`, `headerLeftActions`, sheets as children. Do **not** fork chrome (`ag-theme-again-list`, zoom, pager) in a grid file.

**Zoom covers the whole list, not just the rows** (2026-10-18): the footer zoom control (85 - 140 %) scales the grid's cells, headers AND the filter row above it (search box, selects, buttons, `New`). The shell does it once - `AgainListGrid` gives the filter bar the same scale (`style={{ zoom: scale }}`) - so every list that uses `AgainListGrid` behaves the same; a grid file must not size its own filter row in a way that ignores zoom (no fixed pixel heights set from outside the shell, no second zoom state). Menus that open from the filter row are portalled out of the zoomed row, so they follow the zoom through `--list-zoom` (published by `useGridZoom`): mark such a menu with `data-list-filter-menu` (`FilterSelect`, `CategoryTreeFilter` and `CategoryCombobox listFilter` already do) and `globals.css` gives its search box, rows and messages **one font size** (10px x zoom) - the same as the filter row. A new filter control must use those components or set the attribute; no `text-xs` / `text-sm` of its own.

### Behaviours every list shares (all come from `AgainListGrid` - a grid file does not re-implement them)

| Behaviour | How |
| --- | --- |
| **Columns resize freely** (2026-10-18) | Any column can be dragged down to **48px** and up to any width. A page's own `minWidth` (80-190px was common) and `maxWidth` are only starting hints - the shell relaxes them (`relaxWidthLimits`). A column fixed on purpose (`minWidth === maxWidth`: tick box, star, icon) keeps its size. Saved widths still win. |
| **Zoom covers the filter row** | rows, headers and the filter row scale together (see above) |
| **Filter menus follow zoom, one font size** | `data-list-filter-menu` (see above) |
| **Header tick box = this page only** | a colDef with `headerCheckboxSelection` gets `headerCheckboxSelectionCurrentPageOnly` unless the page sets it; "select all" never ticks rows of other pages |
| **Filter controls look the same** (2026-10-18) | every dropdown filter in the filter row = **down arrow on the left, the label, a cross on the right** that clears it once a value is picked (the product form's category picker is the model). One piece draws it: `FilterTriggerContent` (`components/shared/filter-trigger.tsx`) - `FilterSelect`, `CategoryTreeFilter` and the brand filter use it, `CategoryCombobox` draws the same. A new filter uses those, never its own arrow on the right or a "x" of its own. The cross resets to the "all" value (`clearValue` on `FilterSelect`; default the option whose value is `all` or empty) |
| **Filters drawer = Columns drawer** (2026-10-18) | a list with a "Filters" drawer shows it the way the Columns drawer works: a tick box per filter to show / hide it, **drag a row to reorder** the filters in the toolbar (the order is saved per user), "Reset filters" puts back the defaults. Products offers: Search, Status, Category (several), Brand, Stock status, Price range, **Source** (company name only), **Warranty**, **Updated by**, **Product type**; the value lists of Source / Warranty / Updated by are built from the rows on the list |
| **A value that belongs to a record opens that record's drawer** (2026-10-18) | every cell whose value is a **link to another record that has its own drawer** is clickable: click it -> that record's own edit / open drawer (not a row click, not a new page). Customer / supplier / category / brand / specification profile / warehouse / order number ... all follow it. Render the value as a small button (`GridRefLink`, or the pattern in `components/products/linked-record-editors.tsx`), call `e.stopPropagation()` so the row click is not triggered, show a hover underline + a `title` saying what opens, and open the drawer in place (a `target` state in the grid + the record's existing form drawer; after a save the list reloads). Gated by the write permission (a read-only user just sees text); works even when the column is live-edit enabled (a single click on the value opens the drawer; the live editor needs a double click on the empty part of the cell). Products: category chips, Brand, Specification profile. A column that is plain text (SKU, price) is not a link |
| **Live edit of a picked record uses the form's own picker** (2026-10-18) | a live-edit cell for a record choice (a category, a brand, a profile) offers the **same picker as the form** - not a plain `agSelectCellEditor` list - and it works **live**: **double click** the cell, the picker opens just under the row, and every tick lands in the row at once (saved a moment later, several ticks = one save); no Done / confirm step, no pencil icon, and no chips row or Done button inside the popover (the row itself shows what is picked). Category: `CategoryLivePopover` (`components/products/category-live-popover.tsx`) = the category TREE (expand / collapse, search, check boxes, several at once, the picked ones scrolled into view); click away / Esc closes it. The chips themselves open the category drawers (single click). It is a popover opened from `onCellDoubleClicked`, not an AG editor, so the row keeps updating while it is open |
| **List settings drawers share one pattern** (2026-10-18) | the three drawers that configure a list - **Columns**, **Filters**, **Live edit** - look and work the same: a narrow resizable right sheet (`w-[180px]`, drag its edge), the title, a one-line hint, then one row per item = **⋮⋮ grip + tick box + label**; **drag a row to reorder** (saved per user), the tick shows / hides (or turns live edit on); a **Reset** button at the bottom puts back the defaults (and the order). A new "list settings" drawer copies this - no second style. Live edit offers only fields that are safe to change in a cell: **Unit type and Alert quantity are not live-edit fields** (they are Inventory columns, changed in the product form) |
| **Import / Export** (2026-10-18) | the list's `⋯` menu has **Import** and **Export**. Export = **only the columns visible in the table now** (their order and header names), **every row the search / filters leave** (not just the page), as **Excel (.xlsx)** or **PDF**; Excel keeps numbers as numbers, PDF prints the text shown. One piece does it for every list: `gridToTable(api)` (`lib/list-io/grid-table.ts`) -> `downloadXlsx` / `downloadPdf` (`lib/list-io/spreadsheet.ts`, exceljs / jsPDF loaded only when used). Controls / picture / button columns are skipped; a custom column that is not plain text gives a `valueGetter` (Source = the company name). Import = an **Excel file with the same header names** (any subset, any order), a **sample file to download**, a **preview** (new / updated / problems, columns not used) and then the import (a row whose key - SKU - exists updates it, the others create); Products: `product-import-dialog.tsx`. A new list copies these two pieces, not its own file code |
| **Heavy client-side filters stay responsive** | a page that filters thousands of rows in the browser prepares what it needs **once** (sets / maps built before the row loop, never inside it) and feeds the filter state through `useDeferredValue`, so ticking a filter never waits for the list (Products: category filter, 36k rows) |
| **A header that depends on the page** | a custom header (Price Compare's site tick boxes) refreshes on `onPaginationChanged` (`api.refreshHeader()`) |

---

## How to update all datatables together

1. Change **`AgainListGrid`** or shared CSS (`.ag-theme-again-list`) — one edit, all lists.
2. Finance extras (CSV / column sheet / mobile cards): `FinanceAgListGrid`.
3. Customers is the reference for **server-side paging**: pass `serverPaging` into `AgainListGrid`.

---

## Pages (full-viewport list)

Local admin: prefix `http://localhost:3210`.

### Contacts / parties

| Datatable | Component | Route | Notes |
| --- | --- | --- | --- |
| Customers | `customer-grid.tsx` | `/customers`, `/customers/[id]` | Canonical. Server page + native footer. Drawer: `AgainPartnerDrawer` |
| Suppliers | `supplier-grid.tsx` | `/purchase/suppliers` | Drawer: `SupplierDetailDrawer` |
| Employees | `employee-grid.tsx` | `/hrm/employees` | Other HRM screens are **not** this family (`HrmEntityPage` HTML tables) |

### Sales / service / RMA

| Datatable | Component | Route |
| --- | --- | --- |
| Sales orders | `sales-order-grid.tsx` | `/sales` |
| Sales returns | `sales-return-grid.tsx` | `/sales/returns` |
| Service jobs | `service-job-grid.tsx` | `/service/jobs` |
| RMA (one datatable, **Stage** column + filter) | `rma-grid.tsx` | `/inventory/rma` |

### Purchase

| Datatable | Component | Route |
| --- | --- | --- |
| Purchase orders | `purchase-order-grid.tsx` | `/purchase/orders` |
| RFQs | `purchase-rfq-grid.tsx` | `/purchase/rfq` |
| Quotations | `purchase-quotation-grid.tsx` | `/purchase/quotations` |
| Receipts | `purchase-receipt-grid.tsx` | `/purchase/receipts` |
| Bills | `purchase-bill-grid.tsx` | `/purchase/bills` |
| Returns | `purchase-return-grid.tsx` | `/purchase/returns` |
| Purchase products | `purchase-product-grid.tsx` | `/purchase/products` |
| Open orders report | `purchase-report-grid.tsx` | `/purchase/reports/open-orders` |
| Price report | `inventory-report-grid.tsx` | `/purchase/reports/prices` |

### Catalog / dropshipping / vendors (same grids, multiple routes)

| Datatable | Component | Routes |
| --- | --- | --- |
| Products | `product-grid.tsx` | `/catalog/products`, `/dropshipping/products`, `/inventory/catalog`, `/vendors/catalog` |
| Brands | `brand-grid.tsx` | `/catalog/brands`, `/dropshipping/brands` |
| Categories | `category-grid.tsx` | `/catalog/categories`, `/dropshipping/categories` |
| Collections | `collection-grid.tsx` | `/catalog/collections`, `/dropshipping/collections` |
| Bundles | `bundle-grid.tsx` | `/catalog/bundles`, `/dropshipping/bundles` |
| Variants | `variant-catalog-list.tsx` | `/catalog/variants`, `/dropshipping/variants` |
| Reviews | `review-grid.tsx` | `/catalog/reviews` |
| Q&A | `qa-grid.tsx` | `/catalog/qa` |

### Inventory

| Datatable | Component | Route |
| --- | --- | --- |
| Stock | `stock-grid.tsx` | `/inventory/stock` |
| Warehouses | `warehouse-grid.tsx` | `/inventory/warehouses` |
| Movements | `movement-grid.tsx` | `/inventory/movements` |
| Serials | `serial-grid.tsx` | `/inventory/serials` |
| Adjustments | `stock-adjustment-grid.tsx` | `/inventory/adjustments` |
| Transfers | `stock-transfer-grid.tsx` | `/inventory/transfers` |
| Stock counts | `stock-count-grid.tsx` | `/inventory/stock-counts` |
| Inventory reports | `inventory-report-grid.tsx` | `/inventory/reports/on-hand`, `/valuation`, `/by-supplier`, `/movements`, `/serials` |

### Finance (most wrap `finance-ag-list-grid.tsx`)

| Datatable | Component | Route |
| --- | --- | --- |
| Chart of accounts | `account-grid.tsx` → `FinanceAgListGrid` | `/finance/accounts` |
| Journal | `journal-grid.tsx` → `FinanceAgListGrid` | `/finance/journal` |
| Expenses | `expense-grid.tsx` → `FinanceAgListGrid` | `/finance/expenses` |
| Payment accounts | `payment-account-grid.tsx` → `FinanceAgListGrid` | `/finance/payment-accounts` |
| Cost centers | `cost-center-grid.tsx` → `FinanceAgListGrid` | `/finance/cost-centers` |
| Allocation rules | `allocation-rule-grid.tsx` → `FinanceAgListGrid` | `/finance/allocation-rules` |
| Payments | `payment-grid.tsx` | `/finance/payments` |
| Cheques (Cheques tab) | `cheque-grid.tsx` → `FinanceAgListGrid` | `/finance/payments` |
| Payables | `payable-grid.tsx` | `/finance/payables` |
| Receivables | `receivable-grid.tsx` | `/finance/receivables` |
| P&amp;L | `profit-loss-grid.tsx` → `FinanceAgListGrid` | `/finance/reports/profit-loss` |
| Other GL reports | `finance-report-ag-grid.tsx` → `FinanceAgListGrid` | `/finance/reports/balance-sheet`, `/trial-balance`, `/cash-flow`, `/general-ledger`, `/receivable-aging`, `/payable-aging`, `/tax-summary`, `/expense-by-cost-center` |

### Website / SEO / blog

| Datatable | Component | Route |
| --- | --- | --- |
| Website pages | `website-pages-grid.tsx` | `/website/pages` |
| Website menus | `website-menu-grid.tsx` | `/website/menus` |
| SEO URLs | `seo-url-grid.tsx` | `/seo` |
| SEO redirects | `seo-redirect-grid.tsx` | `/seo/redirects` |
| Blog articles | `blog-article-grid.tsx` | `/blog/articles` |
| Blog categories | `blog-category-grid.tsx` | `/blog/categories` |
| Blog comments | `blog-comment-grid.tsx` | `/blog/comments` |

### Super-admin

| Datatable | Component | Route |
| --- | --- | --- |
| Companies | `company-grid.tsx` | `/super-admin/companies` |
| Plans | `subscription-plan-grid.tsx` | `/super-admin/plans` |

---

## Drawers / embedded panels (same AG list chrome)

These are **inside** a record drawer or workspace, not a full page. Footer/zoom/theme must still match the family.

| Datatable | Component | Host drawer / surface |
| --- | --- | --- |
| Partner ledger | `partner-ledger-panel.tsx` (via customer + supplier wrappers) | Customer drawer Ledger tab; `SupplierDetailDrawer` → `SupplierWorkspace` |
| Customer orders | `partner-customer-orders-panel.tsx` | Same customer drawer |
| Supplier POs | `supplier-purchase-orders.tsx` | Same supplier drawer / `/purchase/suppliers/[id]` |

Customer URL `/customers/[id]` opens the **Customers** list plus `AgainPartnerDrawer` (not a separate grid).

---

## Not this family (do not treat as Again List Datatable)

- Most **HRM** screens (`HrmEntityPage` HTML tables), except Employees above
- Catalog **filters / attributes / spec templates** (`catalog-filter-grid`, `attribute-profile-grid`, `spec-templates-grid`) — custom lists, not AG Grid
- Attribute profile **sortable** editor (`sortable-attribute-grid.tsx`) — drag editor, not the list footer
- Dashboard widgets (`dashboard-grid.tsx`)
- Storefront / portal tables
- Document **line** editors (PO lines, etc.) — use `ProductSearchAdd`, not this list

When those screens are rebuilt as lists, they must join this family via `AgainListGrid`.

---

## Checklist for a new list

- [ ] Use `AgainListGrid` from `@/components/shared/again-list-grid` — do not copy another grid’s chrome
- [ ] `ListGridHeaderStart` for the page name
- [ ] Pass columns + rows + `filterBar` / `headerLeftActions`; sheets as children
- [ ] Native pager is owned by the shell (page size 25, selector `[10, 25, 50, 100]`)
- [ ] `GridRefLink` on record refs
- [ ] Large datasets: server `limit`/`offset` + `serverPaging` (Customers pattern)
- [ ] Add a row to **this file**
