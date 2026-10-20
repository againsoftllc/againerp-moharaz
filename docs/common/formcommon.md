# Common form standard (Odoo style)

How a record form looks inside a drawer: **label on the left, an underline control on the right, fields in titled groups**. It builds on [drawercommon.md](./drawercommon.md) (the drawer itself: control bar, width, drafts) and [ERP-UI-COMMON.md](../ERP-UI-COMMON.md). Read-only record views follow the same look (see "Read-only view" below).

Reference implementations
- Edit / add product: `apps/web/src/components/inventory/inventory-product-quick-add.tsx`
- Sales order → **Payment** (register payment), **Shipping**, **Others** and the **Return details** group of the Returns tab: `apps/web/src/components/sales/sales-order-form-drawer.tsx`. The Order Lines and Return Lines *tables* keep their own cell inputs; only the form groups around them use this standard.
- Read-only: `apps/web/src/components/products/product-drawer/` (`FactList`), RMA detail (`Fact` / `Section`)

---

## The pieces (nothing to re-implement)

| Piece | Where | What it does |
| --- | --- | --- |
| `.again-odoo-form` | `app/globals.css` | **Global CSS.** Put the class on the form container and every text `input`, `textarea`, `select` and bordered combobox inside becomes an **underline** (no box, no radius, transparent), **teal `#00a09d` on focus**. Checkboxes / radios / files are untouched; add `odoo-keep-border` to anything that must keep its box (a segmented control). |
| `AgainFormField` | `components/again/again-form-sheet.tsx` | One row: label left (13 px, normal weight, `6.75rem` column), control right. `required` adds the red star, `hint` a one-line note under the control. |
| `AgainFormGroupTitle` | same file | Group heading: 11 px uppercase, muted, with a rule under it. |
| `AgainFormRow`, `AgainUnderlineInput`, `AgainUnderlineTextarea` | same file | The older Sales-order-style row and underline controls for forms built from scratch; same look. |
| `@container` + `@xl:` | Tailwind container queries | The drawer's **own width** picks one or two columns, not the window's. |

Do not copy the CSS into a component and do not write `border border-input bg-background …` boxes inside a record form: use the class and the components.

## Anatomy

```
┌ control bar (Save / Discard …)                                   X ┐
│  PRODUCT                                                            │   <- AgainFormGroupTitle
│  ─────────────────────────────────────────────────────────────────  │
│  Product name *   Microphone Arm Stand …                            │   <- AgainFormField (full row)
│  SKU              1010065            Model        Monster Arm …     │   <- two columns when wide
│  INVENTORY                                                          │
│  Manage stock     ☑ Track quantity   Not for selling  ☐ Hide …      │
└─────────────────────────────────────────────────────────────────────┘
```

```tsx
<div className="again-odoo-form @container space-y-5">
  <div className="grid gap-x-8 gap-y-0 @xl:grid-cols-2">
    <AgainFormGroupTitle className="@xl:col-span-2">Product</AgainFormGroupTitle>
    <AgainFormField label="Product name" required className="@xl:col-span-2">
      <Input value={name} onChange={…} />
    </AgainFormField>
    <AgainFormField label="SKU"><Input … /></AgainFormField>
    <AgainFormField label="Model"><Input … /></AgainFormField>
  </div>
</div>
```

## Rules

1. **Label left, control right.** Never a small grey label above a boxed input.
2. **Underline controls only** (via `.again-odoo-form`); focus is the teal underline, never a ring or a box.
3. **Group the fields** with `AgainFormGroupTitle` (Product · Inventory · Pricing · Description …). A group holds related fields only; do not stack unrelated fields in one long list.
4. **Two columns by container width** (`@container` on the form, `@xl:grid-cols-2`); full-width rows (name, long text, multi-select) take `@xl:col-span-2`. A drawer dragged narrow collapses to one column.
5. **Type scale:** label and value 13 px, group title 11 px uppercase, hints 11 px muted. Money / counts use `tabular-nums`.
6. **Required** fields: red `*` after the label. **Help** goes in `hint` (one line), not a tooltip-only.
7. **Textareas** are underline too (3 rows by default, resizable vertically).
8. **Selects and comboboxes** (`FilterSelect`, brand / category pickers) keep their dropdown behaviour; only the closed control is restyled.
9. **Segmented choices** (Simple / Variable / Combo) keep a box: add `odoo-keep-border`.
10. Colours are theme tokens (`text-foreground`, `border-border`, `text-muted-foreground`) plus the brand teal for focus; nothing else.

## Read-only view

The same grammar without inputs: a group title with a rule, then rows of **label (medium weight) · value (13 px, left aligned, beside it)** with one quiet divider per row (`FactList` in the product drawer, `Fact` + `Section` in the RMA drawer). A record header shows the title large (20 px bold) and **smart stat boxes** (figure on top, caption below) instead of a pipe-separated line. The customer / supplier drawer's Overview uses the same stat boxes (`PartnerKpiGrid`), the same group title (`PartnerSectionTitle`) and plain ruled lists (no outer box) for orders, wallet, points and history (`components/customers/partner-customer-sections.tsx`); status cells are small chips, never full-width fills.

## Product-add bar (order lines)

`ProductSearchAdd` follows the same look and the search view's **facets**: the Filter toggle (with a caret) sits left of the search box; active Brand / Category filters appear **as removable chips inside the search box**; the filter panel opens under the bar at the bar's full width, Brand and Category side by side. **The filter panel and the results list never show together**: opening one closes the other.

## Checklist for a new or restyled form

- [ ] Container has `again-odoo-form @container`.
- [ ] Rows are `AgainFormField`, groups are `AgainFormGroupTitle`, two columns via `@xl:`.
- [ ] No hand-written boxed inputs, no ring-on-focus classes.
- [ ] Segmented controls carry `odoo-keep-border`.
- [ ] Checked at a narrow drawer (one column) and a wide one (two columns).
- [ ] Drawer rules from [drawercommon.md](./drawercommon.md) still hold (control bar on top, draft kept, default width).
