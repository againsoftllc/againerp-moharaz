# AgainERP — common UI rules

**Living document.** Global patterns every admin screen must follow.
When new common rules are agreed, **update this file** (and mirror into `.cursor/rules/erp-ui-common.mdc`).

Scope: `apps/web` admin / ERP UI. Storefront/marketing may differ unless noted.

---

## 1. Day / Night mode

- All admin UI must work in **light and dark** without hard-coded light-only or dark-only colors.
- Prefer theme tokens: `bg-background`, `bg-muted`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `border-input`, `bg-primary`, `bg-accent`.
- Avoid raw hex / `bg-white` / `text-black` / `bg-gray-*` unless tied to a token or chart exception.
- For AG Grid and other non-CSS surfaces, use `useIsDark()` from `@/lib/use-is-dark` and apply the matching theme class / options.
- Hover / focus / borders must remain readable in both modes.

---

## 2. Always square — never round

- Visual language is **squared**. No pills, soft cards, or circular chips.
- Use `rounded-none` on buttons, inputs, selects, cards, tables, dialogs, sheets, badges, chips, avatars, icon buttons.
- Forbidden on new/edited admin UI: `rounded-full`, `rounded-xl`, `rounded-lg`, `rounded-md`, `rounded-sm`.
- Status / role labels: squared border (`border border-border`), not pills.
- Shared primitives (`Button`, `Badge`, `Sheet`, …): override with `rounded-none` when the default still has radius.
- See also: `.cursor/rules/square-ui-no-round.mdc`, `.cursor/rules/again-drawer-buttons.mdc`.

```tsx
// ❌ BAD
<button className="rounded-full px-3 py-1">Active</button>

// ✅ GOOD
<button className="rounded-none border border-border px-2 py-0.5">Active</button>
```

---

## 3. Skeleton loading

- Do **not** leave blank flashes or spinner-only empty regions for list/data routes.
- Prefer shared shimmer: `ContentDataSkeleton` from `@/components/layout/content-data-skeleton` (`fb-shimmer`, `rounded-none`).
- Use for: route `loading.tsx`, `Suspense` fallbacks, lazy page loaders, grid/list first paint.
- Keep chrome (sidebar / top nav) outside the skeleton — only the changing content body shimmers.
- Local grid shimmers (e.g. product row placeholders) must stay square and theme-aware (`bg-muted` / shimmer), not rounded cards.

```tsx
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";

<Suspense fallback={<ContentDataSkeleton label="Loading products…" />}>
  …
</Suspense>
```

---

## 4. Drawers — drag to resize

- Side panels / sheets that hold filters, columns, live-edit, or similar tooling should be **resizable** by dragging the inner edge.
- Use shared `Sheet` / `SheetContent` from `@/components/ui/sheet` with `resizable` (and Again drawers’ existing resize where applicable).
- Default width may be narrow; allow grow/shrink within sane clamps (e.g. ~160px–720px).
- Do not lock width with a hard `max-w-[Npx]` that blocks resize; use `min-w` + a high `max-w` (or let resize set inline width).
- Close control: every drawer uses the same squared **X** (`closeButton="inside"`). Do not use the bordered chevron close.
- Header actions (Save / New / Publish) sit at the **start** of the header, left of the title; the X stays top-right.
- Resize grip and close button stay **square** and theme-token colored (day/night).

```tsx
<SheetContent
  side="right"
  resizable
  closeButton="inside"
  className="w-[180px] min-w-[160px] max-w-[720px] rounded-none"
>
  …
</SheetContent>
```

---

## 5. One global pattern

- Prefer **shared primitives** over one-off copies: `Sheet`, `Button`, `Badge`, `ContentDataSkeleton`, theme hooks/stores.
- New grids / drawers / filters should copy an existing module (e.g. products) rather than inventing a new visual system.
- If a pattern is missing, add it to the shared component **then** use it — do not fork styles per page.
- Cursor agents: follow `.cursor/rules/erp-ui-common.mdc` (`alwaysApply`) and this file.

### List datatable filter bar — page name

- Every AG Grid / list module filter bar starts with a **page name** left of `New` (or other primary action), then settings/actions.
- Use shared `ListGridHeaderStart` from `@/components/shared/list-grid-header-start` inside `headerLeftActions`.
- Label uses theme tokens (`text-foreground`), square chrome; keep title visible even when write is disabled.

```tsx
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";

const headerLeftActions = (
  <ListGridHeaderStart title="Pages">
    {canWrite ? (
      <Button size="sm" className="rounded-none" onClick={openCreate}>
        New
      </Button>
    ) : null}
    {/* settings / refresh menu… */}
  </ListGridHeaderStart>
);
```

---

## 6. Product add — one search bar everywhere

On any admin screen where the user **adds a product onto a document** (purchase order, sales order, quotation, stock adjustment/transfer, invoice, RMA, …), the add control must match the **purchase order Order Lines** bar. Do not use a bare text field, a lone “Add product / Add line” button, or a search box without the filter + plus.

**Canonical implementation:** `ProductSearchAdd` in `apps/web/src/components/products/product-search-add.tsx`. Reuse that component; do not fork a different layout.

Joined square `h-8` control (`rounded-none`):

1. **Filter** (left, `h-8 w-8`, `border-r-0`) — `ListFilter`; popover for **Brand** and **Category**. Active filter: teal `#00a09d` fill + white corner dot + clear (X).
2. **Search** — search icon + input. Placeholder: `Name, SKU, barcode, or serial` (or `Search in filtered products…` when a filter is on). Typeahead / exact SKU / **barcode scan** / **serial number** adds the line.
3. **Plus** (right inside the search box) — opens quick-add / new product, not another search UI.

```tsx
// ✅ GOOD — PO Order Lines (ProductSearchAdd)
// [ filter ][ 🔍 Name, SKU, barcode, or serial          + ]

// ❌ BAD
<input placeholder="Search product" />
<button>Add line</button>
```

`StockProductSearchAdd` (`stock-line-search.tsx`) is the older search-only bar (stock adjustment/transfer). When those screens are edited, bring them up to this format.

Does **not** apply to catalog list pages whose primary action is “New product” (full product form), website merchandising pickers, or portal browse — only **document line add**.

---

## 7. List refs open drawers

On every admin datatable, a cell that **points at another record** (invoice #, order #, PO, receipt, customer, supplier, product, …) must be clickable and open that record’s drawer. Do not leave those values as plain text.

Canonical cell: `GridRefLink` in `apps/web/src/components/shared/grid-ref-link.tsx`. Square, theme tokens, hover `text-primary`. Stop propagation so row-click actions (settle, row menu) do not fire.

```tsx
// ✅ GOOD — invoice / customer / supplier / PO
<GridRefLink title={row.invoice_number} onClick={() => openInvoice(row)}>
  {row.invoice_number}
</GridRefLink>

// ❌ BAD — related record shown but not openable
{row.customer_name}
```

- Document number → that document’s form drawer (sales order, PO, receipt, RMA, …)
- Party name → customer (`AgainPartnerDrawer`) or supplier (`SupplierDetailDrawer`)
- Product / SKU on a list that has a product sheet → product drawer
- No linked record → toast, do not navigate away
- Never put Next.js `<Link>` in grid cells. Prefetch + row click abort the RSC payload (`TypeError: Failed to fetch` / `navigateToUnknownRoute`). Use `GridRefLink` or one `router.push`.

Does **not** apply to status chips, dates, or money columns.

---

## 8. Again List Datatable (one family)

Admin lists that look like `/customers` (filter bar + AG Grid + zoom + 27px native pager) are the **Again List Datatable** family.

- Inventory of every page and drawer: `docs/AGAIN-LIST-DATATABLE.md`
- Shared CSS: `.ag-theme-again-list` / `.product-grid-fill` in `apps/web/src/app/globals.css`
- Shared pieces: `AgainListGrid` (`@/components/shared/again-list-grid`), `ListGridHeaderStart`, `GridZoomControl`, `GridFullscreen`, `GridRefLink`, `finance-ag-list-grid.tsx`
- Do **not** invent a new list chrome. Change `AgainListGrid` / `.ag-theme-again-list` so every list updates together.
- New lists: add a row to `docs/AGAIN-LIST-DATATABLE.md`

---

## 9. Image upload — one Add tile everywhere

Whenever the user **picks or uploads an image** (company logo, invoice logo, signature/seal, category image, …), use the **same square tile** as the product media gallery **Add** cell. Do not invent a wide preview box, a separate thumbnail + “Media” button, or a plain file input.

**Canonical look:** `MediaGallery` empty cell in `apps/web/src/components/products/media-gallery.tsx`.

**Single-image fields:** `MediaPickTile` in `apps/web/src/components/media/media-pick-tile.tsx`. Reuse that component; do not fork a different picker.

Square `rounded-none` tile (`w-28` on forms; gallery cells are `w-full` + `pt-[100%]`):

1. **Empty** — dashed `border-border`, `ImagePlus`, label **Add**. Click opens the media library. Drop a file to upload.
2. **Filled** — same square, image `object-contain`, corner **X** to remove. Click the tile to change.

```tsx
// ✅ GOOD — MediaPickTile / MediaGallery Add
// [  +     ]
// [  Add   ]

// ❌ BAD
<input type="file" />
<button>Upload logo</button>
// thumbnail rectangle + separate “Media / Change” button
```

Does **not** apply to product **multi-image** galleries (keep `MediaGallery` grid + Add more) or storefront merchandising — only the **tile chrome** must match.

---

## 10. Drawers — save a draft on accidental close

- A **"New X"** drawer (create mode only — not editing an existing record) must not silently discard typed-in data when the user closes it by clicking outside or pressing Escape. Losing an accidental close's worth of typing is a real cost; an explicit **Cancel** click stays an intentional discard and does not save a draft.
- Use the shared helpers in `@/lib/hooks/use-drawer-draft` (`readDraft`, `writeDraft`, `clearDraft`, `draftAgeLabel`) — a small `localStorage`-backed store, one entry per drawer type (e.g. `"supplier"`, `"product"`, `"customer"`). Do not invent a second draft mechanism per drawer.
- Wire it in three places:
  1. On `<SheetContent>`, call a `saveDraftIfDirty()` from `onPointerDownOutside`, `onInteractOutside`, and `onEscapeKeyDown` (side effect only — do not `preventDefault`, let the close proceed).
  2. On the drawer's open-effect, in create mode only (no record being edited, and no other explicit prefill already in play), check `readDraft(key)`; if present, hydrate form state from it and show `toast.info("Restored unsaved … draft from …", { action: { label: "Discard", onClick: … } })` using `draftAgeLabel(savedAt)`.
  3. On a successful create, call `clearDraft(key)` so a finished record doesn't leave a stale draft behind.
- Reference implementation: `apps/web/src/components/suppliers/supplier-form-drawer.tsx`. New "New X" drawers (and existing ones as they're touched) should follow the same shape.

```tsx
const saveDraftIfDirty = () => {
  if (editing) return;
  if (/* form is still at its blank default */) return;
  writeDraft(DRAFT_KEY, { form, /* ...other draftable state */ });
};

<SheetContent
  onPointerDownOutside={() => saveDraftIfDirty()}
  onInteractOutside={() => saveDraftIfDirty()}
  onEscapeKeyDown={() => saveDraftIfDirty()}
>
```

---

## Changelog (common rules)

| 2026-09-26 | Drawers: save a draft on accidental outside-click/Escape (`@/lib/hooks/use-drawer-draft`), reference impl in supplier drawer |
| 2026-09-07 | Image upload: one square Add tile (`MediaPickTile` / `MediaGallery`) |
| 2026-09-07 | `AgainListGrid` global list shell — one chrome change updates every datatable |
| 2026-09-07 | Again List Datatable family catalog (`docs/AGAIN-LIST-DATATABLE.md`) |
| 2026-09-06 | List refs: invoice / party / document cells open drawers (`GridRefLink`) |
| 2026-09-01 | Product add: barcode scan and serial number resolve to the SKU on every ProductSearchAdd bar |
| 2026-08-19 | Drawers: one X close on all sheets; header actions start left of title |
| 2026-07-30 | List grid filter bar: shared page name via `ListGridHeaderStart` left of New |
| 2026-07-19 | Initial: day/night, square shapes, skeleton loading, resizable drawers, global consistency |
| 2026-07-19 | Product form/view sheets: resizable + chevron close + square chrome (same drawer pattern) |
