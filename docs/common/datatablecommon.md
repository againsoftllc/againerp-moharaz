# Common datatable standard

Every list page in AgainERP (Products, Brands, Categories, Payments, Cheque books, Customers …) follows this page. It is the **datatable half** of the common UI rules:

- global rules (day / night, square shapes, skeleton loading, one global pattern) — [ERP-UI-COMMON.md](../ERP-UI-COMMON.md)
- drawers (record forms and details) — [drawercommon.md](./drawercommon.md)
- **datatables (this page)** — the family, the shared shell, the look of a list page, what a cell may do
- which page / drawer uses which grid, and the table of behaviours every list shares (resize, zoom, filter menus, Filters / Columns / Live-edit drawers, Import / Export …) — [AGAIN-LIST-DATATABLE.md](../AGAIN-LIST-DATATABLE.md)

The **Products** list is the model: a new or redesigned list is built to look and work like it.

---

## 1. One family — the Again List Datatable

Admin lists that look like `/customers` (filter bar + AG Grid + zoom + 27 px native pager) are the **Again List Datatable** family.

- Shared CSS: `.ag-theme-again-list` / `.product-grid-fill` in `apps/web/src/app/globals.css`.
- Shared pieces: `AgainListGrid` (`@/components/shared/again-list-grid`), `ListGridHeaderStart`, `GridZoomControl`, `GridFullscreen` / `GridFullscreenHeader`, `GridRefLink`, `RowActionsTrigger`, `GridChipBadge`, `FinanceAgListGrid` (`components/finance/finance-ag-list-grid.tsx`).
- **Do not invent a new list chrome.** Change `AgainListGrid` / `.ag-theme-again-list` so every list updates together. A grid file passes columns, rows, `filterBar`, `headerLeftActions` and its drawers as children — nothing else.
- **A new list adds a row to** [AGAIN-LIST-DATATABLE.md](../AGAIN-LIST-DATATABLE.md).

### Which wrapper

| Need | Use |
| --- | --- |
| A finance-style list: column picker, CSV export, mobile rows, pinned actions column with the fullscreen toggle | `FinanceAgListGrid` (cheque books, cheques, accounts, journal …) |
| A catalogue-style list with live edit, bulk bar, drag to reorder, tree filter | `AgainListGrid` directly, as `product-grid.tsx` / `brand-grid.tsx` / `category-grid.tsx` do |
| Server-side paging (thousands of rows) | `AgainListGrid` with `serverPaging` — Customers is the reference |

---

## 2. Typography — one font, one size

- Every datatable uses Odoo's list font — **Inter** (`--font-list`) — at **one size** (`--ag-font-size`, 11 px at 100 % zoom, scaled by the zoom control). Header text matches cell size; headers are bold.
- It is enforced in `.ag-theme-again-list` (globals.css) for everything inside `.ag-cell` / `.ag-header-cell`, so a **column renderer must not set** its own `font-mono`, `text-xs`, `text-sm`, `font-size` or `font-family`.
- Need an id to stand out? Use weight (`font-medium`) or colour, never size or family. Icons (`.ag-icon`, `svg`) are exempt.

---

## 3. The look of a list page

Top to bottom, every list is:

```
[ Page name ] [ New ] [ ⚙ settings ] | search · filters …                                   (filter bar)
 ⚙ ⠿ ☐  Name        Slug     Products   Status      Updated    Updated by        ⚙         (pinned actions + columns)
 …rows…
 🔍 ─●─ 100 %   12 shown                          Page Size 50   1 to 50 of 410   ◀ 1 of 9 ▶   (footer)
```

### 3.1 Filter bar — page name first

- Every list's filter bar starts with a **page name**, left of `New` (or the other primary action), then the settings menu. Use `ListGridHeaderStart` (`@/components/shared/list-grid-header-start`) inside `headerLeftActions`.
- The label uses theme tokens (`text-foreground`) and square chrome; keep the title visible even when the user has no write permission.
- **Settings menu** (the `⚙` icon button, with a count badge of active filters): *Refresh · Filters · Columns · Export · Reset filters* (Products adds Import and Live edit). Filters / Columns open the list-settings drawers described in AGAIN-LIST-DATATABLE.md.

```tsx
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";

const headerLeftActions = (
  <ListGridHeaderStart title="Cheque books">
    {canWrite ? (
      <Button size="sm" className="rounded-none" onClick={openCreate}>New</Button>
    ) : null}
    {/* ⚙ settings menu: Refresh, Filters, Columns, Export, Reset filters */}
  </ListGridHeaderStart>
);
```

### 3.2 The pinned actions column

- First column, **26 px wide, pinned left**, not resizable / movable (`product-grid-actions-col`). The header carries `GridFullscreenHeader` (expand the list to full screen).
- The cell is the **row menu**: `RowActionsTrigger` (the green **settings cog** icon, not a ≡ menu icon; the icon lives in `row-actions-icon.tsx`, so every grid that uses the trigger changes together) in a `DropdownMenu` — *View / Open · Activity · Edit · Delete*. Write actions only when the user can write.
- A click on the row itself opens the record's drawer (or the view sheet). A list with bulk actions adds a tick-box column, and a list the user may reorder adds the drag grip column, **after** the actions column.

### 3.3 Cells

- **Status** is a coloured, squared badge (`Badge` / `GridChipBadge`), never plain text: `success` = live / published / active, `warning` = draft / needs work, `outline` = parked (unlisted), `muted` = archived / closed. The badge sits in a `flex h-full items-center` wrapper so it is vertically centred.
- **Numbers** are right-aligned with `NUMERIC_CELL` / `NUMERIC_HEADER` (tabular figures). **Money** uses `formatMoney`; **dates** `formatDate`. Empty value = `—`.
- **Images** (logo, thumbnail) are a small square with `object-contain`; empty = a neutral placeholder square.
- **A value that belongs to another record is a link** — see §4.
- Columns that are rarely needed start **hidden** (`hide: true`) and are switched on from *Columns*; the choice is saved per user (`useUserScopedState`).
- A row that is not live (unlisted / draft / archived) is **dimmed** (`opacity-45`) so the live ones stand out.

### 3.4 Filters

- Dropdown filters use `FilterSelect` — down arrow on the left, the label, a cross on the right that clears it. `All statuses`, `All banks` … is the empty value.
- Search is one `Input` (`rounded-none`) that matches name, slug / number and the other text columns together.
- A **Clear** ghost button appears at the end while any filter is active. The count of active filters shows on the settings button.
- Filters can be hidden / shown per user from the *Filters* drawer (a list passes `filterToggles` or its own drawer).

### 3.5 Footer

- The 27 px native pager (page size, range, page buttons) is drawn by the shell. The zoom control sits at its left, and a list may add a short count next to it (`footerLeftActions`: "12 shown", totals).

### 3.6 Empty, loading, phone

- **Loading** — the shell's skeleton (`AgainListGridSkeleton`); never a blank grid or "Loading…" text. Keep it only for the first paint (`loading && rows.length === 0`); a refresh keeps the old rows on screen.
- **Empty** — a title that says why (*No cheque books yet* / *No cheque books match your filters*) and, when the list is simply empty, what to do next (*Click New cheque book to register the first one*).
- **Phone** — below the breakpoint the grid becomes cards / rows (`mobileLine`, or a `*MobileCards` component): title, one meta line, the key value. Tapping a card opens the same drawer.

---

## 4. A value that points at another record opens that record

On every admin datatable, a cell that **points at another record** (invoice #, order #, PO, receipt, customer, supplier, product, category, brand …) must be clickable and open that record's drawer. Do not leave those values as plain text.

Canonical cell: `GridRefLink` in `apps/web/src/components/shared/grid-ref-link.tsx`. Square, theme tokens, hover `text-primary`. Stop propagation so row-click actions (settle, row menu) do not fire.

```tsx
// ✅ GOOD — invoice / customer / supplier / PO
<GridRefLink title={row.invoice_number} onClick={() => openInvoice(row)}>
  {row.invoice_number}
</GridRefLink>

// ❌ BAD — related record shown but not openable
{row.customer_name}
```

- Document number → that document's form drawer (sales order, PO, receipt, RMA, …).
- Party name → customer (`AgainPartnerDrawer`) or supplier (`SupplierDetailDrawer`).
- Product / SKU on a list that has a product sheet → product drawer.
- No linked record → toast, do not navigate away.
- **Never put Next.js `<Link>` in grid cells.** Prefetch + row click abort the RSC payload (`TypeError: Failed to fetch` / `navigateToUnknownRoute`). Use `GridRefLink` or one `router.push`.
- Gated by the write permission where the drawer edits; works even when the column is live-edit enabled (single click on the value opens the drawer; the live editor needs a double click on the empty part of the cell).

Does **not** apply to status chips, dates or money columns. The full rule (live edit of a picked record uses the form's own picker, etc.) is in AGAIN-LIST-DATATABLE.md.

---

## 5. Day / night and square

- Datatables follow the global rules: theme tokens only, `useIsDark()` from `@/lib/use-is-dark` for AG Grid's theme class (`ag-theme-quartz-dark`), `rounded-none` on every badge, chip, button and tile.
- Checkboxes in cells and headers keep AG Grid's own checkbox glyph font — the `font-family` rule must not reach `.ag-checkbox-input-wrapper`.

---

## Recipe — a new list in ten minutes

```tsx
export const ChequeBookGrid = forwardRef<GridHandle, Props>(function ChequeBookGrid({ rows, loading, headerLeftActions, onOpen }, ref) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const filtered = useMemo(() => rows.filter(/* search + dropdown filters */), [rows, filters]);

  const columns = useMemo(() => [
    { colId: "number", field: "book_number", headerName: "Cheque book no", width: 150, cellClass: "font-medium" },
    { colId: "state", field: "state", headerName: "State", width: 110, cellRenderer: StateBadge },
    { colId: "created", field: "created_at", headerName: "Created", hide: true, valueFormatter: (p) => formatDate(p.value) },
  ], []);

  return (
    <FinanceAgListGrid
      gridRef={ref} storageKey="cheque-books" rows={filtered} columns={columns} loading={loading}
      headerLeftActions={headerLeftActions}          // <ListGridHeaderStart title="…"> New + ⚙ menu
      rowActions={(row) => <RowMenu row={row} />}     // RowActionsTrigger + DropdownMenu
      onRowClicked={onOpen}
      filterToggles={FILTER_TOGGLES} filterBar={(visible) => <>…search, FilterSelect, Clear…</>}
      emptyTitle="No cheque books yet" emptyHint="Click New cheque book to register the first one."
      csvFileName="cheque-books.csv" csvHeaders={[…]} csvRow={(r) => […]} mobileLine={(r) => ({ title, meta, value })}
    />
  );
});
```

The page wraps it with `dynamic(() => import(...), { ssr: false, loading: <ListGridOpenFallback /> })`, owns the rows and the drawers, and passes the settings menu into `headerLeftActions` (it calls the grid's handle: `openFilters()`, `openColumns()`, `exportCsv()`, `resetFilters()`).

Reference implementations: `components/finance/cheque-book-grid.tsx` + `app/(admin)/finance/cheque-books/page.tsx` (finance wrapper), `components/brands/brand-grid.tsx` (catalogue list with live edit and bulk bar), `components/products/product-grid.tsx` (the model).

---

## Checklist for a new or touched list

- [ ] Built on `AgainListGrid` / `FinanceAgListGrid` — no private chrome, no private pager
- [ ] Filter bar starts with the page name (`ListGridHeaderStart`), then New, then the ⚙ settings menu
- [ ] Pinned 26 px actions column: fullscreen header + `RowActionsTrigger` row menu; row click opens the drawer
- [ ] Status is a squared coloured badge; numbers right-aligned; empty value `—`; no own font size / family in renderers
- [ ] Rarely needed columns start hidden; column choice saved per user
- [ ] Values that point at another record are `GridRefLink`s (no Next `<Link>`)
- [ ] Skeleton on first load, a written empty state, cards on a phone
- [ ] Day / night and square corners checked
- [ ] A row added to AGAIN-LIST-DATATABLE.md

## Changelog

| Date | Change |
| --- | --- |
| 2026-10-28 | New list: RMA reports (`/inventory/rma/reports`, `rma-register-report.tsx` on `FinanceAgListGrid`). It has the page name, the ⚙ settings menu, and a Report picker (Complain Receive · Replacement Claim · Replacement Receive · Customer Delivery · Summary) plus Register / Analysis and Group-by pickers in the filter bar. Document and RMA numbers are `GridRefLink`s that open the RMA drawer, and rarely needed columns start hidden. |
| 2026-10-28 | `FinanceAgListGrid` gets optional tick-box selection (`selection={{ isRowSelectable, onChange }}` + `banner` for the bulk bar, `clearSelection()` on the handle). It is the expense list's pattern, moved into the shell: the tick-box column comes after the actions column, and the header tick box only ticks rows that can be selected. First users: Cheques (Treat selected → Cheque treatment drawer). New list: Cheque reports (`/finance/reports/cheque-register`), which has the page name + ⚙ settings menu and a Report picker in the filter bar. |
| 2026-10-27 | Stock transfers (`stock-transfer-grid.tsx`) moved onto `FinanceAgListGrid`: settings menu with Refresh / Filters / Columns / Export / Reset filters, Filters + Columns drawers saved per user, rarely needed columns (Source Document, Value, Created By, Shipped, Completed) hidden by default, cancelled transfers dimmed, row click opens the drawer, written empty state, phone cards; `New` replaces "New Transfer" and the private floating button is gone. |
| 2026-10-27 | Product report (`/inventory/reports/product`, `product-report-grid.tsx`) built the same way as the Stock page: title + settings cog (`InventoryGridHeader`, shared with Stock) with Refresh / Filters / Columns / Reset filters, search + warehouse + status toolbar with Clear, tick-box column, row menu (View ledger / Open product), Export selected, Filters + Columns drawers saved per user, phone cards. Columns: Image, Product, SKU, Warehouse, In Stock, In Transit, Unit cost, Stock value, Status, Updated (figures summed per product from the stock lines, status filter applied by the API); Category, Supplier, Available, Purchased, Sold, Sales and Profit stay in the column chooser, hidden by default. |
| 2026-10-27 | Stock on-hand report (`/inventory/reports/on-hand`) is server-paged and server-searched: the API used to cut the list at 8,000 of 8,989 lines and the search/totals only saw that slice. Totals above the grid are now summed in SQL over every matching line; CSV export asks for all of them. Valuation and by-supplier reports still use the 8,000-row cap. |
| 2026-10-27 | Movement summary report (`/inventory/reports/movements`, `movement-report-grid.tsx`) built like the Stock page: title + settings cog (Refresh / Filters / Columns / Export CSV / Reset filters), date range + search (SKU, name, reference) + warehouse + movement-type toolbar with Clear, Image column, type chips tinted by stock effect, Filters + Columns drawers saved per user, phone cards. Server-paged: the API used to cut the ledger at 8,000 of 9,152 movements and the totals/per-type chips only counted that slice; they are now summed in SQL over every matching movement. Export CSV pulls up to 10,000 lines. |
| 2026-10-27 | Users list (Settings › Permission, `workspace-users-panel.tsx`) replaced its hand-made HTML table with `FinanceAgListGrid`: "Users" page name + New + Roles + settings cog (Refresh / Filters / Columns / Export / Reset filters), search + role + status filters with Clear, Filters + Columns drawers saved per user, initials avatar in the Name cell, role chips, warehouse scope, status chip, inactive members dimmed, row menu (Open / Activate / Deactivate / Remove), row click opens the user drawer, phone cards. |
| 2026-10-20 | First version. The datatable rules (family + shared shell, typography, page name in the filter bar, list refs open drawers) moved here from ERP-UI-COMMON.md §5 / §7 / §8; added the list-page look (actions column, cells, filters, footer, empty / loading / phone), the recipe and the checklist. Cheque books is the finance reference. |
