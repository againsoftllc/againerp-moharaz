# AgainERP — common UI rules

**Living document.** Global patterns every admin screen must follow.
When new common rules are agreed, **update this file** (and mirror into `.cursor/rules/erp-ui-common.mdc`).

Scope: `apps/web` admin / ERP UI. Storefront/marketing may differ unless noted.

Detailed standards live in `docs/common/`: [drawercommon.md](./common/drawercommon.md) (drawers) and [datatablecommon.md](./common/datatablecommon.md) (datatables).

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

> The full drawer standard (actions on top, drag resize, 60 % default for heavy drawers, drafts on accidental close for new **and** existing records, responsive layout) is in [drawercommon.md](./common/drawercommon.md).

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

> Moved to [common/datatablecommon.md](./common/datatablecommon.md) §3.1 (page name left of `New`, `ListGridHeaderStart`, the ⚙ settings menu).

---

## 6. Product add — one search bar everywhere

On any admin screen where the user **adds a product onto a document** (purchase order, sales order, quotation, stock adjustment/transfer, invoice, RMA, …), the add control must match the **purchase order Order Lines** bar. Do not use a bare text field, a lone “Add product / Add line” button, or a search box without the filter + plus.

**Canonical implementation:** `ProductSearchAdd` in `apps/web/src/components/products/product-search-add.tsx`. Reuse that component; do not fork a different layout.

Joined square `h-9` control (`rounded-none`; Filter label 13 px, search text 14 px):

1. **Filter** (left, `h-8`, `border-r-0`) — `ListFilter` + caret; a panel under the bar (full bar width, **Brand** and **Category** side by side). Active filters turn the button teal `#00a09d` **and show as removable chips inside the search box** (Odoo facets). The panel and the results list never show together (opening one closes the other).
2. **Search** — search icon + input. Placeholder: `Name, SKU, barcode, or serial` (or `Search in filtered products…` when a filter is on). Typeahead / exact SKU / **barcode scan** / **serial number** adds the line.
3. **Plus** (right inside the search box) — opens quick-add / new product, not another search UI.

**Results:** real products first (in stock, priced, name / SKU starting with the typed word) ahead of imported placeholders; the screen also asks the server while the user types (`onQueryChange`) because the preloaded list is only the most recently updated products.

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

> Moved to [common/datatablecommon.md](./common/datatablecommon.md) §4 — a cell that points at another record opens that record's drawer (`GridRefLink`, never a Next `<Link>` in a grid cell).

---

## 8. Again List Datatable (one family)

> Moved to [common/datatablecommon.md](./common/datatablecommon.md) — the family and the shared shell (`AgainListGrid`, `.ag-theme-again-list`), typography (Inter, one size), the look of a list page (filter bar, pinned actions column, cells, filters, footer, empty / loading / phone), the recipe and the checklist. Inventory of every list and the behaviours they share: [AGAIN-LIST-DATATABLE.md](./AGAIN-LIST-DATATABLE.md).

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

> Extended in [drawercommon.md](./common/drawercommon.md): drafts also cover editing an existing record (key per record), use the `useDrawerDraft` hook, and restore the scroll position.

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

| 2026-10-17 | Datatables: one font (Inter, Odoo list font) and one size in every cell/header, enforced in `.ag-theme-again-list`; no `font-mono` / `text-xs` in cell renderers |
| 2026-10-20 | Datatables: the datatable rules moved to `common/datatablecommon.md` (§5 page name, §7 list refs, §8 family / font); `drawercommon.md` now lives in `docs/common/` |
| 2026-10-20 | Drawers: new standard page `drawercommon.md` (actions on top, resize, 60 % default, drafts for edit too, responsive) |
| 2026-10-17 | Drawers: primary actions (Cancel / Save) in the header; dropdowns inside drawers use `avoidCollisions` so they flip above near the bottom |
| 2026-09-26 | Drawers: save a draft on accidental outside-click/Escape (`@/lib/hooks/use-drawer-draft`), reference impl in supplier drawer |
| 2026-09-07 | Image upload: one square Add tile (`MediaPickTile` / `MediaGallery`) |
| 2026-09-07 | `AgainListGrid` global list shell — one chrome change updates every datatable |
| 2026-09-07 | Again List Datatable family catalog (`docs/AGAIN-LIST-DATATABLE.md`) |
| 2026-09-06 | List refs: invoice / party / document cells open drawers (`GridRefLink`) |
| 2026-10-20 | Forms: Odoo form standard (label left, underline controls, titled groups) in [common/formcommon.md](./common/formcommon.md); `ProductSearchAdd` filter facets, panel no longer overlaps the results |
| 2026-09-01 | Product add: barcode scan and serial number resolve to the SKU on every ProductSearchAdd bar |
| 2026-08-19 | Drawers: one X close on all sheets; header actions start left of title |
| 2026-07-30 | List grid filter bar: shared page name via `ListGridHeaderStart` left of New |
| 2026-07-19 | Initial: day/night, square shapes, skeleton loading, resizable drawers, global consistency |
| 2026-07-19 | Product form/view sheets: resizable + chevron close + square chrome (same drawer pattern) |
