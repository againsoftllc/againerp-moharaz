# Common drawer standard

Every record, form or detail drawer in AgainERP follows this page. It builds on [ERP-UI-COMMON.md](../ERP-UI-COMMON.md) (datatables: [datatablecommon.md](./datatablecommon.md)) (§4 resize, §10 drafts) and **replaces the "create mode only" limit of §10**: drafts now cover editing an existing record too.

Reference implementation: the Cheque book drawers
- `apps/web/src/components/finance/cheque-book-detail-drawer.tsx` (open an existing record, a lot of information)
- `apps/web/src/components/finance/cheque-book-drawer.tsx` (new record, a short form)
- `apps/web/src/components/sales/sales-order-form-drawer.tsx` (the sales order: Odoo-style top bar and status bar, 80 % default (the busiest drawer), drafts for new and existing orders)

---

Forms inside a drawer (labels, inputs, groups, columns) follow [formcommon.md](./formcommon.md).

## The rules

### 1. Action buttons are always on top

- Save / Discard / Create / Cancel and every record action (Generate, Activate, Close, Print, Delete …) sit in a **control bar at the top of the drawer**, outside the scrolling body, so they are visible however far the user has scrolled.
- Left: the actions. Right: icon-only extras (delete record, **X close**).
- While the form has unsaved changes the bar shows **Save** (primary) and **Discard**; record actions that would act on stale data are hidden until the user saves or discards.
- Square corners only. Use `AGAIN_DRAWER_PRIMARY_BTN` (brand fill) and `AGAIN_DRAWER_ACTION_BTN` (plain). A destructive action may use a red fill, a positive bulk action a green one — never rounded.
- Never put the main action at the bottom of a long form.

### 2. Drag to make it bigger or smaller

- The drawer is resizable by dragging its **left edge** (the grip is shown on desktop, hidden on phones).
- The width the user chose is **remembered** (`widthStorageKey`, localStorage) and used the next time any drawer with that key opens.
- Clamp: minimum `minWidth` (about 360–420 px), maximum 85 % of the screen. Never lock the width with a hard `max-w-[…]`.

### 3. A drawer with a lot of information opens at 60 % of the screen

- Detail drawers that hold many fields, tables or sections (cheque book, invoice, product, partner …) open at **60 % of the screen width** by default: `defaultWidthRatio={0.6}`.
- Short forms ("New X" with a handful of fields) open narrow (`defaultWidth` 480–520 px).
- Phones and small windows: the drawer is full width.
- Once the user drags it, their width wins over the default.

### 4. Closing by accident never loses work — a draft is kept

- If the drawer is dismissed while it has unsaved changes — **click outside, Esc, or the X** — what was typed is saved as a **draft** (localStorage). This applies to **new records and to editing an existing record**.
- The next time the drawer opens for the same record (or "new X") the draft is **put back where the user left off**: the form values *and* the scroll position. A toast says "Restored unsaved … draft from 3 min ago" with a **Discard** action.
- The draft is removed by: a successful **Save / Create**, the **Discard** button, **Cancel** on a new-record drawer, or the toast's Discard. Those are deliberate.
- A draft never overwrites the saved record: it only fills the form; the server copy changes only when the user presses Save.
- One draft per drawer type **and record**: `cheque-book:new`, `cheque-book:<id>`, `supplier:new`, `product:<id>` …

### 5. User friendly and responsive

- **One column of meaning**: a title (record number / name), a one-line summary, then sections with small uppercase headings (`Bank details`, `Cheque numbers`, `Cheque leaves`). Do not stack unrelated fields in one long list.
- **Responsive to the drawer, not only the screen**: wrap the body in `@container` and use container breakpoints (`@xl:grid-cols-2`, `@md:grid-cols-3`). A drawer the user has dragged narrow collapses to one column; dragged wide it spreads out.
- **Tables** scroll horizontally inside the drawer (`overflow-x-auto` + `min-w`) instead of squeezing columns; secondary columns may be dropped, their value moves into a tooltip.
- **Quick filters / counts** for long lists inside a drawer (All / Unused / Not treated / Cleared) — counts double as filters.
- **Say what is happening**: a visible "Unsaved changes" note while dirty, "Loading…" while fetching, toasts for success and for errors (with the server's message), buttons disabled while a request runs.
- **Explain locks**: when a field cannot be edited (numbers fixed after cheques exist) show a one-line reason and what to do.
- Empty states say what to do next ("No cheques yet. Click Generate Cheques …").
- Dropdowns inside a drawer use `avoidCollisions`; inputs are at least 28 px high so they are easy to hit on touch screens; numeric fields accept digits only.
- Keyboard: Esc closes (and keeps the draft), Tab order follows the visual order.
- Day / night: use theme tokens only (`bg-background`, `text-foreground`, `border-border` …), no fixed colours except the brand button colour.

---

## Button types (the control bar)

One look for every drawer. The sales order drawer's bar is the reference:

```
[ Save ] [ Print ] [ Packing Slip ] [ Delivery Note ] [ Draft ] [ Discard ] [ Preview ]  Quotation | Sales Order        [ X ]
  primary   action   action          action           action    action      action        switch (teal = current)    close
```

| Type | Component | Looks like | Use for |
| --- | --- | --- | --- |
| **Primary** | `<AgainDrawerButton variant="primary">` | purple fill (`#714B67`), white text | Save, Create, Confirm, Send. **One per bar**, always first (leftmost). |
| **Action** | `<AgainDrawerButton>` (default) | plain grey, 1 px border, dark text | Print, Draft, Discard, Cancel, Preview, Return, Activate … every other action. |
| **Success** | `variant="success"` | green fill | A positive bulk action: Generate, Approve. |
| **Danger** | `variant="danger"` | red fill | A destructive action: Delete Unused, Reject. A plain Delete of the whole record is an icon-only red trash on the right, next to the X. |
| **Switch** | `<AgainDrawerSwitch options value onChange label>` | segmented, current side filled teal (`#00a09d`), others plain | The record's type or state in the bar: *Quotation \| Sales Order*, *Draft \| Active \| Closed*. Omit `onChange` to show the state without letting the user click it. |
| **Close** | `<AgainDrawerCloseButton>` | squared **X**, no border | Far right (`trailing`), every drawer. Closing while dirty keeps a draft. |

Rules:

- **Order** left to right: Primary, then the actions (most used first), then the Switch. Right side: icon-only extras (Activity, delete, **X**).
- **Size**: every bar button is `h-6 px-2 text-[11px]` (`AGAIN_DRAWER_BAR_BTN_SIZE`, applied by the component). Do not set your own heights or font sizes.
- **Square** (`rounded-none`), `type="button"` (never a submit), no icons inside text buttons, no pills.
- **Disabled** = 50 % opacity, `not-allowed` cursor, no hover fill. Disable while a request runs (`disabled={saving}`) and show "Saving…" in the primary.
- **Dirty-aware**: while the form has unsaved changes show **Save** + **Discard**; hide record actions that would act on stale data (see §1).
- **Day / night**: the components use theme tokens; only the purple and teal brand colours are fixed.

```tsx
<AgainDrawerControlBar trailing={<AgainDrawerCloseButton onClick={() => handleOpenChange(false)} />}>
  <AgainDrawerButton variant="primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</AgainDrawerButton>
  <AgainDrawerButton onClick={print}>Print</AgainDrawerButton>
  <AgainDrawerButton onClick={discard} disabled={!dirty}>Discard</AgainDrawerButton>
  <AgainDrawerSwitch label="Document type" value={kind} onChange={setKind}
    options={[{ value: "quotation", label: "Quotation" }, { value: "order", label: "Sales Order" }]} />
</AgainDrawerControlBar>
```

Existing drawers that still build these buttons by hand (`AGAIN_DRAWER_PRIMARY_BTN` / `AGAIN_DRAWER_ACTION_BTN` + inline sizes — the sales order drawer, …) move to the components when they are next touched. The constants stay exported for that period.

---

## Building blocks (use these, do not re-invent)

| Need | Use |
| --- | --- |
| Panel, resize grip, 60 % default | `AgainDrawerPanel` — `resizable`, `defaultWidthRatio`, `defaultWidth`, `minWidth`, `widthStorageKey` (`components/again/again-drawer.tsx`) |
| Layout: bar + scrolling body | `AgainDrawerLayout`, `AgainDrawerControlBar` (`trailing` = right side), `AgainDrawerScrollBody` (`scrollRef`) |
| Buttons in the control bar | `AgainDrawerButton` (`primary` / `action` / `success` / `danger`), `AgainDrawerSwitch`, `AgainDrawerCloseButton` — see *Button types* above |
| Raw button classes (only where the component cannot be used) | `AGAIN_DRAWER_PRIMARY_BTN` + `AGAIN_DRAWER_PRIMARY_COLOR`, `AGAIN_DRAWER_ACTION_BTN`, `AGAIN_DRAWER_BAR_BTN_SIZE` |
| Body background | `AGAIN_DRAWER_FIELD_SHEET_CLASS` |
| Label + underline fields | `AgainFormRow`, `AgainUnderlineInput`, `AgainUnderlineTextarea`, `AgainUnderlineSelect`, `AGAIN_FORM_RECORD_TITLE_CLASS` (`components/again/again-form-sheet.tsx`) |
| Dropdown | `FilterSelect` with `avoidCollisions` |
| Draft: save on dismiss, restore on open | `useDrawerDraft` (`lib/hooks/use-drawer-draft.ts`); low level `readDraft / writeDraft / clearDraft` |

---

## Recipe

```tsx
const scrollRef = useRef<HTMLDivElement>(null);
const pendingScroll = useRef<number | null>(null);

const { saveDraftIfDirty, clear: clearDraft } = useDrawerDraft<{ form: Form; scrollTop: number }>({
  key: recordId ? `thing:${recordId}` : "thing:new",   // one draft per record
  ready: open && loaded,                                // the record has loaded into the form
  dirty,                                                // form differs from the saved record
  getValues: () => ({ form, scrollTop: scrollRef.current?.scrollTop ?? 0 }),
  restore: (v) => { setForm(v.form); pendingScroll.current = v.scrollTop; },
  onDiscard: () => setForm(toForm(record)),
  label: "thing",
});

// put the scroll position back after a draft is restored
useEffect(() => {
  if (pendingScroll.current == null) return;
  const top = pendingScroll.current; pendingScroll.current = null;
  requestAnimationFrame(() => scrollRef.current?.scrollTo({ top }));
}, [form]);

// every dismissal (outside click, Esc, X button) goes through here
const handleOpenChange = (next: boolean) => { if (!next) saveDraftIfDirty(); onOpenChange(next); };

<AgainDrawerPanel open={open} onOpenChange={handleOpenChange} title="Thing"
  resizable defaultWidthRatio={0.6} minWidth={420} widthStorageKey="again-thing-drawer-width">
  <AgainDrawerLayout>
    <AgainDrawerControlBar trailing={<AgainDrawerCloseButton onClick={() => handleOpenChange(false)} />}>
      {dirty ? (
        <>
          <AgainDrawerButton variant="primary" onClick={save}>Save</AgainDrawerButton>
          <AgainDrawerButton onClick={discard}>Discard</AgainDrawerButton>
        </>
      ) : <>…record actions…</>}
    </AgainDrawerControlBar>
    <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS} scrollRef={scrollRef}>
      <div className="@container space-y-5">…sections…</div>
    </AgainDrawerScrollBody>
  </AgainDrawerLayout>
</AgainDrawerPanel>
```

After a successful save call `clearDraft()`. **Discard** and **Cancel** call `clearDraft()` as well.

For a "New X" drawer declare the "fresh empty form on open" effect **before** `useDrawerDraft`, so the restored draft is applied after the reset.

---

## Checklist for a new or touched drawer

- [ ] Actions are in the top control bar; Save/Discard appear when dirty
- [ ] Buttons are `AgainDrawerButton` (one primary, the rest action / success / danger), the state is an `AgainDrawerSwitch`, the close is `AgainDrawerCloseButton`
- [ ] Left-edge drag resize works; width is remembered (`widthStorageKey`)
- [ ] Detail drawer with lots of data opens at 60 % (`defaultWidthRatio={0.6}`); short form opens narrow
- [ ] Outside click / Esc / X while dirty keeps a draft; reopening restores form **and** scroll, with a Discard toast
- [ ] Draft cleared on Save, Discard and Cancel; draft key includes the record id
- [ ] Body uses `@container` breakpoints; tables scroll sideways; nothing is cut off at 360 px
- [ ] Locked fields explain why; empty and loading states are written out
- [ ] Square corners, theme tokens, one X close

## Changelog

| Date | Change |
| --- | --- |
| 2026-10-20 | Button types: `AgainDrawerButton`, `AgainDrawerSwitch`, `AgainDrawerCloseButton` + the "Button types" section (the sales order drawer's bar is the reference). Brand drawer, New cheque book and the Cheque book detail drawer (Generate = success, Delete Unused = danger, state = switch) use them. |
| 2026-10-20 | Sales order drawer: Print menu, Odoo status bar (Quotation > Quotation Sent > Sales Order), 60 % default width, draft + scroll position for existing orders, "unsaved changes" note |
| 2026-10-20 | First version. Drafts now cover editing too; `useDrawerDraft` hook; `AgainDrawerPanel` `defaultWidthRatio`; `AgainDrawerScrollBody` `scrollRef`; cheque book drawers redesigned as the reference. |
