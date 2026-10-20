# STEP 01 — AgainERP RMA Module: Integration Map & User-Friendly Development Plan

> **This document has two parts.** Part A (sections 1–10) is the specification and plan. Part B (sections B.0–B.10, at the end) is the implementation record: the architecture audit of the existing codebase, what each phase actually built, how it was verified, and the known limits. Where the two differ, Part B is what the code does (for example the payment presets of section 5 became the RMA Settlement of B.8).
> UI standards: [common/drawercommon.md](./common/drawercommon.md), [common/datatablecommon.md](./common/datatablecommon.md).


**Product:** AgainERP  
**Module:** RMA (Return Merchandise Authorization)  
**UI standard:** Odoo-inspired, drawer-based  
**Purpose:** Define what RMA connects to, how the user workflow should work, and the safe order to implement it.

## 1. Core design decision

RMA is the workflow coordinator for customer complaints, warranty claims, supplier replacement/repair, and customer handover. It must not become a second inventory, sales, purchasing, warranty, or accounting system.

**Source of truth:**
- Product and SKU → existing Product module
- Customer and phone → existing Customer/Party module
- Sold serial, sales invoice/order, sales date → existing Sales/POS and serial traceability
- Supplier and purchase invoice → existing Supplier/Purchase module and serial-to-purchase traceability
- Quantity, store/location, serial ownership/location, stock movements → existing Inventory/Serial module
- Customer charges, receipts, receivables, journal entries → existing Finance/Accounting module
- Assigned technician and approver → existing Users/HR/Permissions
- Print, attachments, notifications, activity history → existing shared document/activity services where available

Before implementation, inspect the repository and map these existing components. Do not assume a new table/service is needed until existing support is checked.

## 2. RMA integration map

### Required integrations
1. **Sales / POS**
   - Search by Sold Serial No. first.
   - If the product has no serial, search by customer phone, sales order number, or invoice number.
   - Auto-fill customer, product, invoice/order and sales date.
2. **Product / Serial / IMEI**
   - Read SKU/model and unit identity.
   - Preserve original serial history.
   - Link the sent serial to the actual received serial if a supplier replacement has a different serial.
3. **Warranty**
   - Calculate in-warranty/out-of-warranty/unknown using the sold unit's applicable terms and sales date.
   - Do not guess when dates/terms are missing.
4. **Purchase / Supplier**
   - Resolve original supplier and purchase invoice from the serial/purchase traceability.
   - Allow authorized manual selection only when traceability is missing or ambiguous.
5. **Inventory / Warehouse / Stock Ledger**
   - Track the unit in the RMA store.
   - On supplier dispatch, move it out of available RMA stock into a supplier/in-transit state/location.
   - On supplier receipt approval, stock in the actual received serial to the RMA store.
   - On customer handover approval, stock out from the RMA store.
   - Every movement must link to the RMA and must not post twice.
6. **Finance / Accounting**
   - Record customer charges and payments through existing services.
   - Create/update receivables only according to existing billing policy.
   - No duplicate invoice, receipt, or journal entries.
   - Zero-charge warranty delivery should not create a receivable.
7. **Users / Permissions / Approvals**
   - Assign a responsible staff member/technician.
   - Enforce approval permissions and record approver, timestamp and reason.
8. **Print / Attachments / Activity**
   - Reuse shared print/PDF and file attachment patterns.
   - Keep customer-facing printouts free of internal notes/costs.
   - Record relevant activity and reprint events where supported.

### Optional/conditional integration
- **Service / Job Card:** Use when the unit needs diagnosis, repair work, technician tasks, spare parts, labour or a paid service invoice. RMA authorizes and tracks the complaint; Service manages the actual repair work. Do not duplicate the Service workflow inside RMA.
- **Notifications:** Notify assigned staff or customer at configured stages if AgainERP already has notification infrastructure.
- **Reports:** Use the existing report/list infrastructure; do not build a separate analytics engine for RMA.

## 3. Recommended user experience

### Main RMA list
Use an Odoo-inspired data table with search, filters, saved views if already supported, and clear stage/status labels.

Suggested columns:
- RMA Number
- Complaint Date
- Customer
- Product
- Sold Serial No.
- Warranty Status
- Supplier
- Assigned To
- RMA Store
- Approx. Delivery Date
- Current Stage
- Customer Charge / Due (only if appropriate for the user's permission)

Main actions:
- **New RMA** → opens Create RMA drawer
- Click row → opens RMA Detail drawer
- Stage actions appear contextually based on status and permission

### RMA Detail drawer
Use a compact header with RMA number, customer, product/serial, current stage and next valid action. Then show a stage timeline and sections/tabs:
- Overview
- Complaint & Diagnosis
- Supplier Claim
- Replacement Receipt
- Customer Delivery
- Stock Movements
- Payment / Accounting
- Attachments
- Activity / History

Only show sections that are relevant to the current RMA. Use lazy-loading for long history/attachments if the existing UI supports it.

### Drawer rules
- Create, view, edit, approval, claim, receive and delivery flows all open in drawers.
- Avoid separate full-page forms.
- Use searchable dropdowns, sensible defaults and inline validation.
- Auto-filled fields should be visibly identifiable and read-only by default; authorized overrides require a reason and audit trail.
- Show one clear primary action at each stage.
- Warn about previous RMA history without automatically blocking the user.
- Show stock state in plain language: **In RMA Store**, **With Supplier**, **Replacement Received**, **Delivered to Customer**.

## 4. End-to-end workflow

### Stage A — Complaint Received
1. User opens New RMA drawer.
2. Search by Sold Serial No.
3. If no serial exists, search by phone/order/invoice and choose the correct sales line.
4. Auto-fill customer, product, invoice, sales date, warranty and supplier/purchase traceability where available.
5. Show prior RMA history for the serial/unit.
6. User enters problem, diagnosis requirement/report, assigned staff, receiving RMA store and approximate delivery date.
7. Enter customer charge estimate if applicable.
8. Save and print **Complaint Receipt**.
9. Send for complaint approval.

### Stage B — Complaint Approval
1. Approver reviews complaint, warranty, attachments, prior history and receiving store.
2. Approve, reject or return for correction.
3. On approval, confirm stock receipt into RMA store according to existing inventory posting policy.
4. Rejection must not create approved stock.

### Stage C — Replacement Claim
1. Create claim from approved RMA.
2. Auto-fill supplier, product, serial, complaint, diagnosis and purchase invoice where traceable.
3. User reviews/edits allowed fields, adds supplier reference, dispatch details and accessories.
4. Approve claim and print **Supplier Claim / Dispatch Copy**.
5. On approved dispatch, move the unit out of available RMA store stock to Supplier / In Transit.
6. Preserve custody and serial history.

### Stage D — Replacement Received
1. Open receipt from the supplier claim.
2. Default actual received serial to the serial sent.
3. If supplier sends a different serial, enter the actual serial and validate uniqueness.
4. Record outcome: Replacement / Original Unit Repaired / Returned Unrepaired / Other.
5. Approve receipt and print **Replacement Receive Copy**.
6. On approval, move the actual received unit into the selected RMA store.
7. Preserve a link between original serial and actual received serial.

### Stage E — Customer Delivery
1. Open delivery drawer from RMA detail.
2. Auto-fill customer, product, actual serial held, charge and complaint details.
3. Select the delivery/payment case and enter amount/payment reference where applicable.
4. Review amount received and amount due.
5. Approve and print **Customer Delivery Copy**.
6. If physical handover is approved, stock out the unit from RMA store.
7. Mark RMA Completed only when the required physical outcome is complete. A payment-only event must not silently deliver the product or close the RMA.

## 5. Simplify payment handling

> *As built:* the five presets were replaced by a separate, reusable **RMA Settlement** (money in / money out) — see B.8. A delivery now only hands the unit over.

The requested business cases are:
1. Without Payment
2. Payment Received
3. Payment Payable
4. Product with Payment Received
5. Product with Payment Payable

To prevent user mistakes, model the behaviour internally as two separate concepts:
- **Physical action:** Deliver product now / No product handover
- **Payment state:** No charge / Received / Due

Then provide quick-select presets for the five common cases. This keeps the UI familiar while preventing a payment-only action from accidentally moving stock or completing the RMA.

Rules:
- Without Payment = no payment and no amount due for this delivery.
- Payment Received = payment-only event; no physical stock movement unless a separate delivery is confirmed.
- Payment Payable = record the amount due/payment obligation; do not imply physical delivery by this label alone.
- Product with Payment Received = physical handover plus payment received.
- Product with Payment Payable = physical handover plus a due amount.
- Use existing Finance services for receipts, invoices and receivables.

## 6. Stock rules and source of truth

Use existing inventory stock movement and serial/IMEI logic. Do not create an RMA-only stock balance that disagrees with Inventory.

| Event | RMA stock effect | Required tracking |
|---|---|---|
| Complaint received and approved | In to RMA store | RMA, product, serial, store |
| Approved supplier dispatch | Out of available RMA store | Supplier / In Transit location/state |
| Approved replacement receipt | In to RMA store | Actual received serial and original serial link |
| Approved customer handover | Out of RMA store | Customer, delivery record, actual serial |

Pending/unapproved actions must be visibly pending and must not be counted as finalized stock. Every posting must be idempotent: approving the same document twice must not duplicate stock or accounting entries.

## 7. Approvals, permissions and audit

Reuse AgainERP's permission/approval model. Separate permissions for:
- Create/edit complaint
- Approve/reject complaint
- Override supplier or purchase invoice
- Create/approve supplier claim
- Dispatch to supplier
- Receive/approve replacement
- Record charges/payments
- Deliver/approve delivery
- Change actual received serial
- Manual lookup exception
- Reprint documents

Log important changes with user, time and reason where relevant. Never silently overwrite a serial or erase a previous RMA.

## 8. Recommended development phases

> *As built:* Phases 1–5 are implemented and verified locally — see B.4 to B.9.

### Phase 0 — Repository audit and design
- Locate existing drawer components and list/detail patterns.
- Map Product, Customer/Party, Sales/POS, Serial/IMEI, Purchase/Supplier, Inventory/Stock Ledger, Finance, Service, permissions, print and activity services.
- Document current data sources and APIs.
- Identify gaps before proposing new models.

**Deliverable:** Short architecture map and implementation plan; no feature coding before this review.

### Phase 1 — RMA core and complaint intake
- RMA list and detail drawer
- RMA record and status model
- Serial lookup and non-serial sales lookup
- Customer/invoice/warranty/supplier auto-fill
- Previous RMA detection
- Assigned staff, RMA store, diagnosis and charge estimate
- Complaint receipt print
- Complaint approval

**Acceptance:** Staff can receive a sold product, identify the correct sale/customer, print a receipt and approve intake. Inventory reflects the approved item in the RMA store exactly once.

### Phase 2 — Supplier claim and stock dispatch
- Create claim from approved RMA
- Auto-fill supplier/purchase traceability and problem details
- Claim approval and supplier print copy
- Supplier/In Transit stock movement

**Acceptance:** After approved dispatch, the unit is not available in RMA store stock, and its location/history shows it with the supplier.

### Phase 3 — Supplier replacement receipt
- Receipt drawer
- Same/different serial support
- Serial uniqueness validation and serial mapping
- Receipt approval and print copy
- Stock-in of the actual received unit

**Acceptance:** A different serial can be received without overwriting the original serial history; approved stock shows the actual received serial exactly once.

### Phase 4 — Customer delivery and finance
- Delivery drawer
- Five payment/delivery presets
- Finance integration
- Delivery approval and print copy
- Stock-out and completion rules

**Acceptance:** A delivered product leaves RMA stock exactly once; payment-only activity does not move stock; received/due amounts link to existing finance records without duplicates.

### Phase 5 — Service integration, reports and hardening
- Optional Service/Job Card linkage for diagnosis/repair
- Filters, overdue list, supplier-pending list and repeat-RMA history
- Permissions and audit review
- End-to-end tests, edge cases, responsive drawer QA

**Acceptance:** All stage transitions, approvals, stock and finance posting, printouts and exception scenarios pass tests.

## 9. Test checklist

- Serial found and unique.
- Serial not found.
- Non-serial product selected by phone/order/invoice.
- Multiple matching sales lines.
- Missing warranty or supplier traceability.
- Previous RMA found.
- Diagnosis required but report missing.
- Claim dispatch changes stock state correctly.
- Supplier returns a different serial.
- Received serial already exists.
- Supplier returns original repaired unit.
- Rejected receipt does not add finalized stock.
- Payment-only event does not deliver product.
- Product delivered with amount due.
- Zero-charge warranty delivery.
- Repeated approval does not duplicate stock or finance postings.
- User without permission cannot override protected fields.
- Cancellation after stock movement uses a reversal/return workflow, not silent deletion.

## 10. Claude implementation command

Read this document fully and inspect the existing AgainERP codebase before coding. First return a concise architecture map showing which existing models, APIs, drawer components, inventory/serial services, sales/purchase traceability, finance services, permissions, Service/Job Card patterns, and print templates will be reused.

Then implement the RMA module in the phases defined here. All RMA forms, details, edits, approvals, claim, replacement receipt and customer delivery actions must use existing drawer-based UI patterns. Do not create duplicate Product, Customer, Supplier, Sales, Purchase, Stock Ledger, Serial, Warranty or Finance systems. Use existing stock movement and accounting posting services. Add only necessary schema changes, validations, permissions, audit events, print templates and tests. Do not skip phases or use mock data. After each phase, run relevant tests and summarize changed files, migrations, endpoints, UI drawers, and remaining gaps.

---

# Part B — Implementation record (as built)

**Build status:** audit done. **Phases 1–5 are built and verified locally (not pushed)** — see B.4 to B.9; the delivery's payment part was then split out as **RMA Settlement** (B.8), and Phase 5 (work queues, job card link, permission audit, hardening) is B.9.

### B.0 Headline

An RMA module **already exists** (`rma_tickets` + `services/rma/rma_service.py` + `components/rma/*`). It is a generic, single-ticket, status-driven warranty system. It is **not** the Stage A–E document flow of this document: there is no complaint approval record, no claim / receipt / delivery document, no stock posting on intake / dispatch / handover, no serial mapping, no print, no attachments, no per-stage permissions.

**Decision: extend the existing ticket, do not start a parallel module.** The ticket stays the one RMA record; later phases add claim / receipt / delivery documents that hang off it.

### B.1 Architecture map — what RMA reuses

| Concern | Reuse (source of truth) | Evidence | Genuine gap |
| --- | --- | --- | --- |
| Product / SKU | `Item` (SSOT, ADR-014); `CatalogProduct.warranty` (free text) | `models/item.py`, `models/catalog_product.py` | RMA joins products by **SKU** (`CatalogProduct.sku == line.sku`); switch to `item_id` |
| Customer / Party | `CommerceCustomer` ← `Party`; `SalesOrder.customer_id`; storefront `CommerceOrder` denormalised name / phone | `models/commerce_customer.py` | none (phone matching already normalised) |
| Sales / POS lookup | `rma_service.search_orders` (`GET /rma/order-search`): serial > order no. > phone, over `SalesOrder` and `CommerceOrder`; POS sale = `SalesOrder` | `routers/rma.py`, `rma_service.py` | **invoice number is not searched** (`SalesOrder.invoice_number`, `PosReceipt.invoice_number`) |
| Serial / IMEI | `InventorySerial` + `serial_service` (`lookup_for_claim`, `attach_to_rma`, `release_from_rma`, `find_by_number`) | `models/inventory_serial.py` | no serial **history** table (only free-text `notes`); no serial → serial link; no "with supplier" state (`in_service → in_transit` not allowed); warehouse only, no location |
| Warranty | `services/rma/warranty.py` (`evaluate` → in / out / unknown, manual override, company `warranty_start_basis`) | `warranty.py` | text only; `InventorySerial.warranty_expires_on` ignored. Rule "do not guess" already holds (unknown) |
| Purchase / supplier trace | `serial.source_id` → `PurchaseReceipt` → `PurchaseOrder` → `PurchaseBill`; `serial.supplier_id` → `CommerceSupplier` | `serial_service._trace_context` | trace stops at the receipt: **bill / vendor invoice no. not resolved**; breaks for manual / opening / adjustment serials; no audited manual override |
| Inventory / stock | `StockMovementService.apply_movement` (`customer_return` IN, `rma_replacement` / `scrap` OUT, `source_type="rma"`); `StockTransferService` (warehouse → warehouse, serial in_transit); `InventoryWarehouse` (free `type`, preset "Returns / Damaged") | `services/inventory/*` | **no RMA / non-sellable warehouse flag; no "Supplier / In Transit" location**; ledger has **no unique key** on (source_type, source_id); serial moves are not wired to stock moves (caller pairs them) |
| Finance | `FinanceService.record_rma_invoice`, `FinanceReceivable(source_type="rma")`, `try_post`; zero total already refused | `finance_service.py` | `settle_receivable` / `record_payment` **not idempotent**; payment has no RMA link; RMA and Service can both bill one repair (Phases 4–5) |
| Service / job card | `ServiceJob.rma_id`, `create_service_from_rma`, `ServiceJobHistory` | `service_job_service.py` | none for Phase 1 (Phase 5) |
| Permissions | `require_permission(module, action)`, RBAC modules × (read/create/write/delete/publish/export); web `usePermission` | `deps/auth.py`, `services/rbac.py` | **no fine-grained keys**; `/status` lets any `rma:write` user approve; RMA web uses only coarse `useAdminCanWrite` |
| Approvals | per-module status fields; `approval_limit` (amount ceilings by document type) | `services/core/approval_service.py` | RMA has no approver / timestamp / reason, no reject / return-for-correction path |
| Attachments | `CollabFile` + `/collaboration/{entity_type}/{id}/files`; media upload `POST /media/upload` | `models/collab_file.py` | no RMA attachment UI; no upload → `storage_ref` bridge in drawers |
| Print / PDF | client-side HTML + `window.print()`: store payload → `app/(print)/…/print` route → `InvoiceLayoutPreviewDocument`; company letterhead in `Company.invoice_layout` | `lib/sales/sales-print.ts`, `(print)/sales/print` | **no RMA receipt**; no reprint tracking; no server PDF (keep client-side) |
| Activity / audit | `CollaborationService.record_activity`; `RmaStatusHistory` (changed_by + note) | `services/collaboration/*` | not wired into RMA; `ActivityEntityType` lacks `rma`; no reason-capturing audit for overrides |
| Users / HR | `GET /auth/users`, `fetchAuthUsers` | `routers/auth_users.py` | `RmaTicket.assigned_to` is **free text**, not a user id |
| Drawer UI | `AgainDrawerPanel / ControlBar / Button / Switch / CloseButton`, `useDrawerDraft`, `AgainFormRow`, `FilterSelect`; datatable family `AgainListGrid` | `components/again/*` | `rma-claim-drawer` is a 44-line wrapper of a flat panel sheet: no timeline, no tabs |

#### Data flow (Phase 1)

```
Sale lookup:  serial / phone / order / invoice ─► search_orders + serial lookup ─► customer, product(item_id), order, sale date
Warranty:     product warranty text + sale date ─► warranty.evaluate ─► in / out / unknown
Supplier:     serial.source_id ─► PurchaseReceipt ─► PO ─► PurchaseBill(vendor inv. no.) ─► supplier   (else manual, reason + audit)
Intake:       RmaTicket(draft) ─► serial sold→in_service (open-claim lock) ─► print Complaint Receipt ─► pending_approval
Approval:     approve ─► ONE guarded customer_return IN to the RMA store (source_type="rma") + serial.warehouse = RMA store
              reject / return-for-correction ─► no stock; serial released back to sold
Audit:        every step ─► RmaStatusHistory + CollaborationService.record_activity
```

### B.2 Gaps that need schema or service work (all phases)

1. Stage documents: supplier claim, replacement receipt, customer delivery (Phases 2–4).
2. Stock custody states (In RMA Store / With Supplier / Replacement Received / Delivered) and an RMA warehouse flag + "Supplier / In Transit" holding place.
3. Serial event history + original → actual received serial link.
4. Per-event idempotent posting guards for stock and finance.
5. Fine-grained permissions and recorded approvals.
6. Print templates + reprint log, attachments, real activity, user-id assignee.

### B.3 Phase 1 plan — RMA core and complaint intake

Acceptance (section 8, Phase 1): *staff can receive a sold product, identify the correct sale / customer, print a receipt and approve intake; inventory shows the approved item in the RMA store exactly once.*

#### B.3.1 Data (additive, in `services/rma/schema.py::ensure_rma_columns`, the repo's own pattern — no alembic)

`rma_tickets` new columns:
- `custody_state` (`in_rma_store` | `with_supplier` | `replacement_received` | `delivered` | null) — plain-language stock state; Phase 1 only sets `in_rma_store`.
- Approval: `complaint_decision` (`approved` | `rejected` | `correction_requested`), `complaint_decided_by`, `complaint_decided_at`, `complaint_decision_reason`.
- Intake: `assigned_to_user_id` (+ keep `assigned_to` name), `promised_delivery_date`, `charge_estimate`, `diagnosis_required` (bool), `diagnosis_report` (text).
- Supplier trace: `supplier_id`, `supplier_name`, `purchase_receipt_id`, `purchase_bill_id`, `vendor_invoice_no`, `supplier_source` (`traced` | `manual`), `supplier_override_reason`.
- Guards: `intake_movement_id` (set once, under row lock = the "exactly once" guard), `receipt_no`, `receipt_print_count`, `receipt_last_printed_at`.
- Warehouse: `warehouse_id` is the RMA store; add `InventoryWarehouse.is_rma_store` (bool) so the store picker lists only RMA stores and stock reports can exclude them from sellable stock.

New status: `correction_requested` (`pending_approval → correction_requested → pending_approval`). Existing statuses stay.

#### B.3.2 API (extend `routers/rma.py`)

| Endpoint | Purpose |
| --- | --- |
| `GET /rma/order-search` | also match **invoice number** |
| `GET /rma/prior?serial=&item_id=&customer_id=` | previous RMAs of the unit (history, never blocks) |
| `GET /inventory/serials/lookup` | add supplier, purchase receipt, **bill / vendor invoice**, trace source |
| `POST /rma/tickets` / `PATCH` | new intake fields; **protected fields** (customer, order, serial, supplier, warranty) change only with `rma_override` + a reason, recorded |
| `POST /rma/tickets/{id}/submit` | draft / correction → `pending_approval` (validates diagnosis report when required) |
| `POST /rma/tickets/{id}/decision` | `{decision, reason}`; **approve** posts the intake stock-in once, **reject** / **correct** posts nothing and frees the serial; needs `rma_approve` |
| `POST /rma/tickets/{id}/receipt-print` | returns the receipt payload (no internal notes / costs), bumps print count; reprint needs `rma_reprint` |
| `/rma/tickets/{id}/status` | approval statuses now refused here (must use `/decision`) |

Service: `post_intake_stock(ticket)` — one function, called by approve (walk-in) or "mark received" (remote request); takes the ticket row lock, returns if `intake_movement_id` is set, else `apply_movement(customer_return, RMA store, qty, source_type="rma", source_id=ticket.id)`, then sets the serial's warehouse. Same guard pattern as `ServiceJobLine.stock_moved`.
Also in Phase 1 (they would otherwise double-count the RMA store): add the same guard to `issue_replacement`, `release_to_stock`, `scrap_unit`, and stop `scrap_unit` swallowing stock errors; cancellation after a posted intake goes through `reverse_movement`, not a status flip.

#### B.3.3 Permissions

New RBAC sub-modules (the supported route — they appear in the role editor automatically and are back-filled by `ensure_role_permissions`): `rma_approve` (approve / reject / return a complaint), `rma_override` (protected-field and supplier override, manual lookup exception), `rma_reprint`. Create / edit stays `rma:create|write`. Web: `usePermission(...)` replaces the coarse `useAdminCanWrite` in RMA.

#### B.3.4 UI (all drawers, common drawer standard)

- **List** (`rma-grid`): add Complaint Date, Supplier, Assigned To, RMA Store, Approx. Delivery, stage chip with custody state, Charge (only with finance permission).
- **New RMA drawer** (already on `AgainDrawerPanel` + draft): add assigned staff (user picker), receiving RMA store, approx. delivery date, diagnosis-required + report, charge estimate, prior-RMA history list (warning, not blocking), supplier / purchase invoice auto-fill shown **read-only and marked "auto"**, with *Override* (needs `rma_override`, asks a reason). Primary **Save**, plus **Save & print receipt** and **Send for approval**.
- **RMA detail drawer** (rebuild `rma-claim-drawer`): `AgainDrawerPanel` at 60 %, compact header (number, customer, product / serial, stage chip, custody state, one primary next action), stage timeline, tabs shown only when relevant: **Overview · Complaint & Diagnosis · Stock Movements · Attachments · Activity** (Supplier Claim, Replacement Receipt, Customer Delivery, Payment tabs arrive in their phases). The existing Warranty / Inspection / Charge drawers keep working and open from the tabs.
- **Approval drawer**: warranty, supplier trace, attachments, prior history, receiving store, then Approve / Reject / Return for correction with a required reason.
- **Complaint Receipt print**: client-side print route, same pattern as sales print; layout follows the complaint-receive slip (complain no., customer, address, mobile, product, under-warranty, received serial, sales invoice no. + date, problem, narration, prior job ref + no. of times, engineer, delivery date, charges, customer / authorised signatures); no internal notes, no costs.
- **Attachments**: `CollabFile` with `entity_type="rma"` via media upload.
- **Activity**: add `rma` to `ActivityEntityType`; every transition and override calls `record_activity`.

#### B.3.4b Out of Phase 1

Supplier claim + dispatch (Phase 2), replacement receipt + serial mapping (3), delivery + five payment presets + finance (4), service job linkage, overdue / supplier-pending reports (5).

#### B.3.5 Tests and verification

- Unit (existing `test_rma_unit.py` style): transitions incl. `correction_requested`; decision rules; warranty unknown when data missing; phone / invoice matching; permission gating of `/decision`.
- Service tests against the local database: approve twice → exactly **one** movement and one stock level change; reject → no movement, serial back to `sold`; cancel after approval → reversal; protected-field edit without `rma_override` → 403; prior-RMA detection; serial not found / unique / several sales lines.
- Manual / browser pass on the local stack: intake → print → approve → check Inventory stock for the RMA store → repeat approve.
- Final summary after the phase: files changed, migrations, endpoints, drawers, remaining gaps.

#### B.3.6 Risks and decisions to confirm

1. **Extend the existing ticket** rather than a new RMA table set (recommended; keeps 5 demo tickets and every existing screen working).
2. **RMA store = a normal warehouse with `is_rma_store`** (recommended) instead of a new location type; "Supplier / In Transit" will be a second flagged warehouse in Phase 2.
3. **Permissions as RBAC sub-modules** (`rma_approve`, `rma_override`, `rma_reprint`) rather than new action bits (less invasive).
4. Stock-in happens **on approval for walk-ins**; for remote requests (`awaiting_return`) it happens when the unit is marked received. One guarded function serves both.
5. Print stays **client-side** (no server PDF in the repo).

### B.4 Phase 1 result (built 2026-10-20)

Built as planned, with these deliberate differences:

| Plan | What was built | Why |
| --- | --- | --- |
| `intake_movement_id` on the ticket as the "once" guard | table `rma_stock_events` with a **unique (rma_id, event_key)** | a real DB constraint, and the same table serves dispatch / receipt / delivery in Phases 2–4 and the Stock Movements tab |
| start status chooses remote vs walk-in | `unit_received` flag; every complaint starts as **draft** | a remote request can no longer skip approval |
| print route `/rma/print` | `/rma-print` | `/rma/*` is a legacy redirect to `/inventory/rma/*` |
| restock = new stock in | restock moves the unit **out of the RMA store** into the chosen sellable warehouse (`transfer_out` + `transfer_in`) when intake was posted | the unit was already in the RMA store |

**Backend** — `models/rma.py` (new columns, `RmaStockEvent`), `services/rma/complaint_service.py` (new: trace, prior history, submit / decide, `post_stock_event`, intake stock + reversal, protected fields, receipt payload, activity), `rma_service.py` (create, `change_status` guards and hooks, guarded `issue_replacement` / `release_to_stock` / `scrap_unit`, invoice search), `routers/rma.py` (`/stores`, `/trace`, `/prior`, `/tickets/{id}/submit|decision|receipt-print|stock-events`), `services/rbac.py` (`rma_approve`, `rma_override`, `rma_reprint`, off by default for everyone except System Manager), `inventory_warehouses.is_rma_store`. A default "RMA Store" warehouse is created the first time the stores list is read.
**Web** — `rma-intake-drawer` (staff, store, delivery date, diagnosis, charge estimate, trace, prior history, Save / Save & send for approval / Save & print receipt), `rma-detail-drawer` (header, stage timeline, tabs Overview · Complaint & Diagnosis · Stock Movements · Attachments · Activity), `rma-approval-drawer`, `rma-supplier-override-drawer`, `rma-receipt-document` + `/rma-print`, `rma-grid` columns (Complaint date, Assigned to, RMA store, Approx. delivery, Stock state, supplier; charges only with finance access).
**Verified** — 13 new unit tests + the 16 existing (29 pass); end to end on the local stack: approve → 1 unit in the RMA store, second approve refused, cancel → ledger reversal back to 0; staff role gets 403 on approve / reprint / protected-field change; the receipt payload has no internal notes or costs; UI flow detail → approve → Stock Movements; receipt page renders the complaint slip.

**Known limits / follow-ups**
- The stock engine keeps levels per catalog product and refuses an item with **no catalog product**. For an RMA, approval repairs that link itself: it creates a minimal **archived** catalog product (not for sale, not on the website) for the item and logs `catalog_link_created` in the claim's activity — so a returned unit of an archived / legacy item can still be stocked into the RMA store. Other modules still refuse such items.
- Nothing yet excludes `is_rma_store` warehouses from sellable stock and availability reports (flag only).
- The old plain "Received" start for new claims is gone from the UI; the API still accepts `draft → received` for old integrations (no stock is posted without an approval).
- `rma_tickets.assigned_to` keeps the name; `assigned_to_user_id` is the real link.
- Print is client-side (no server PDF), as in the rest of the ERP.

### B.5 Phase 2 result — supplier claim and dispatch (built 2026-10-20)

Flow: **Create claim** (from an approved RMA whose unit is in the RMA store) → review / edit → **Send for approval** → **Approve** (or Return for correction / Reject, with a reason) → **Dispatch** → print the **Supplier Claim / Dispatch Copy**.

- **Data** — table `rma_supplier_claims` (`SCL-YYYY-nnnn`; status draft · pending_approval · correction_requested · approved · dispatched · rejected · cancelled; supplier, purchase receipt / bill / vendor invoice, serial, problem, diagnosis, accessories, dispatch details, decision, dispatcher, print count). Supplier, serial and purchase invoice are copied from the RMA and read-only; only the claim text, accessories and dispatch details edit. One open claim per RMA. `rma_stock_events.dest_warehouse_id`; `inventory_warehouses.is_supplier_transit`.
- **Stock** — dispatch posts ONE guarded `dispatch` event: `transfer_out` from the RMA store and `transfer_in` to **Supplier / In Transit** (a warehouse created the first time it is needed), the RMA goes to *Sent to supplier*, the stock state to **With Supplier**, the serial's warehouse follows the unit and its notes record where it went. A second dispatch is refused. Approving the claim moves nothing.
- **Existing supplier job kept in step** — dispatch upserts the legacy supplier job (status *dispatched*), so the list's Supplier column and the old drawers keep working. A plain "sent to supplier" status move is refused while the unit is in the RMA store (it has to go through a claim); older tickets that never had stock posted keep the old behaviour. `received → sent_to_supplier` is now a legal transition, reachable only through a claim.
- **Permissions** — new `rma_claim_approve` and `rma_dispatch` (plus the existing `rma_override` to choose a supplier by hand when the serial has no purchase trace, and `rma_reprint` for a reprint). Off by default for everyone except System Manager.
- **Endpoints** — `GET|POST /rma/tickets/{id}/claims`, `GET|PATCH /rma/claims/{id}`, `POST /rma/claims/{id}/submit|decision|dispatch|cancel|print`.
- **UI** — detail drawer: new **Supplier Claim** tab (claims, create, supplier picker for the no-trace case), stock tab shows `RMA Store → Supplier / In Transit`; `rma-supplier-claim-drawer` (control bar adapts to the status); `/rma-print` now prints either document; the supplier copy carries no customer details, internal notes or costs.
- **Verified** — 17 new unit tests (46 RMA tests pass); on the local stack: legacy move blocked, no-trace claim needs override, dispatch before approval refused, dispatch → RMA store 1 → 0 and Supplier / In Transit 0 → 1, second dispatch refused, cancelling the RMA after dispatch refused; UI flow claim → Dispatch → Stock Movements; both print pages render.

**Not in Phase 2** — the supplier's reply (receipt of the replacement, serial mapping, stock-in of the received unit) is Phase 3. A dispatched claim cannot be cancelled; the unit comes back through the receipt. RMA / supplier warehouses are flagged but still not excluded from sellable-stock reports.

### B.6 Phase 3 result — supplier replacement receipt (built 2026-10-20)

Flow: from a **dispatched** claim, **Receive from supplier** → fill in what came back → **Send for approval** → **Approve & receive** (or Return for correction / Reject, with a reason) → print the **Replacement Receive Copy**.

- **Data** — table `rma_supplier_receipts` (`RRC-YYYY-nnnn`; status draft · pending_approval · correction_requested · approved · rejected · cancelled; sent serial, received serial, outcome *Replacement / Original unit repaired / Returned unrepaired / Other*, supplier delivery ref, received date / by, condition, accessories, RMA store, decision, print count). `rma_tickets.received_serial_number`; `inventory_serials.replaces_serial` and `replaced_by_serial`. One open receipt per claim.
- **Serial rules** — the received serial starts as the serial that was sent. A **different** serial needs the new `rma_serial_change` permission (checked when it is typed and again at approval), must not exist in the registry (409 otherwise, case-insensitive) and must not be on another open receipt. `rma_tickets.serial_number` is never overwritten.
- **Approval posts, nothing else does** — one guarded `receipt` stock event: `transfer_out` from Supplier / In Transit and `transfer_in` into the chosen RMA store; stock state **Replacement Received**; the RMA goes through *at supplier* to **Back from supplier**; the supplier job becomes *returned* with the outcome. A rejected, sent-back, draft or pending receipt creates no stock. A second approval is refused.
- **Serial history** — a different serial is registered (source `rma_replacement`, source id = the receipt, supplier) as an `in_service` unit in the RMA store that `replaces` the original; the original becomes `replaced` and keeps its row, `replaced_by_serial` and a dated note. The same serial coming back just moves to the RMA store with a note. An open claim also covers `received_serial_number`.
- **Guards** — a plain "back from supplier" status move is refused while the unit is with the supplier (the receipt does it); an approved receipt cannot be cancelled; cancelling the RMA after receipt is refused for stock that moved on.
- **Permissions** — new `rma_receive_approve` and `rma_serial_change` (plus `rma_reprint` for reprints). Off by default for everyone except System Manager.
- **Endpoints** — `GET|POST /rma/claims/{id}/receipts`, `GET|PATCH /rma/receipts/{id}`, `POST /rma/receipts/{id}/submit|decision|cancel|print`.
- **UI** — Supplier Claim tab: *Replacement receipt* under each dispatched claim with **Receive from supplier**; `rma-receipt-drawer`; header shows `S/N old → new`, Overview shows *Received serial*; `/rma-print` prints the third document; the copy carries no customer details, internal notes or costs.
- **Verified** — 15 new unit tests (61 RMA tests pass); on the local stack with a real sold serial: dispatch → RMA store 0 / In Transit 1, an existing serial refused, a different serial approved → RMA store 1 / In Transit 0, original `replaced` + `replaced_by`, new `in_service` + `replaces`, second approval refused; UI flow receipt → Send for approval → Approve & receive; the receive copy renders.

**Not in Phase 3** — delivering the unit to the customer (the actual serial held is `received_serial_number`, else `serial_number`), the payment / delivery presets and finance are Phase 4. Replacements of a different *item* than the one sent are not modelled (same item only).

### B.7 Phase 4 result — customer delivery and payment (built 2026-10-20; the payment half is replaced by B.8)

Flow: **Delivery & Payment** tab → **New delivery / payment** → choose the case → **Save** → **Send for approval** → **Approve & post** (or Return for correction / Reject, with a reason) → print the **Customer Delivery Copy**.

- **Two concepts, five presets** — the document holds a *physical action* (`deliver_product`: hand the product over now or not) and a *payment state* (`none` / `received` / `due`). The five familiar cases are shortcuts that set both: **Without Payment** (deliver + none), **Payment Received** (no handover + received), **Payment Payable** (no handover + due), **Product with Payment Received** (deliver + received), **Product with Payment Payable** (deliver + due). The drawer shows the two settings under the presets, so a payment-only document cannot hand the product over by accident.
- **Data** — table `rma_deliveries` (`DLV-YYYY-nnnn`; status draft · pending_approval · correction_requested · approved · rejected · cancelled; preset, deliver_product, payment_state, amount total / received / due, payment account, reference, due date, delivery date, received by, serial delivered, decision, and the links approval created: payment number, receivable number, stock posted). One open delivery per RMA; several approved ones over time (a payment, then later the handover).
- **Rules** — at least one effect; a charged RMA is never delivered "without payment" (it must be received or payable); no charge means no payment and no receivable; amount received > 0 and ≤ what is owed (a partial payment leaves the rest due); an amount due carries no payment; payment fields need the new `rma_payment` permission; the handover needs the unit in the RMA store (not with the supplier) and the RMA inspected / Ready for delivery. `summary` (`GET /rma/tickets/{id}/delivery-summary`) tells the UI what is possible and why not.
- **Approval posts, exactly once** — *money* through the existing finance services: the RMA's own receivable (`raise_bill`, billed once) and `FinanceService.settle_receivable` for a payment (reference = the delivery number); *product*: one guarded `delivery` stock event takes the unit out of the RMA store, stock state **Delivered to Customer**, the serial back with the customer (`sold`, warehouse cleared; a replacement unit inherits the customer and order of the original), and the RMA goes through delivered to **Completed**. A **payment-only** delivery never moves stock or the RMA's status. A second approval is refused; rejected, sent-back, draft and pending documents post nothing; an approved delivery cannot be cancelled.
- **Guards** — a plain status move to *delivered* is refused while the unit is held in stock (the old "Move on" cannot bypass the stock-out).
- **Permissions** — new `rma_delivery_approve` and `rma_payment`; `rma_reprint` for reprints. Off by default for everyone except System Manager.
- **Endpoints** — `GET /rma/tickets/{id}/delivery-summary`, `GET|POST /rma/tickets/{id}/deliveries`, `GET|PATCH /rma/deliveries/{id}`, `POST /rma/deliveries/{id}/submit|decision|cancel|print`.
- **UI** — `rma-delivery-drawer` (preset chips, Product / Payment controls, charges / paid / owed, amount received, account, reference, due date, delivery date, received by), the **Delivery & Payment** tab with the money summary and the documents, a completed RMA shows every stage done; `/rma-print` prints the fourth document; the copy shows the amounts but no internal notes or supplier cost.
- **Verified** — 22 new unit tests (83 RMA tests pass); on the local stack with the real finance services: payment-only → payment `PAY-…` inbound and a paid, posted receivable with no stock or status change; a later product-only delivery → RMA store 1 → 0 and Completed with no second payment or receivable; zero-charge warranty delivery → no receivable; product with payment payable → open receivable with the due date; a charged RMA refused "without payment"; the old status move to delivered refused; UI flow preset → Save → Send for approval → Approve & post; the copy renders.

**Not in Phase 4** — an approved delivery is final (reversing a handover or a payment would go through finance and a stock reversal, not a cancel); refunds and the older Refund / Replacement / Restock actions are unchanged; no separate receipt voucher is printed for a payment (the delivery copy carries the payment number). Phase 5 (service-job linkage, overdue / supplier-pending lists, repeat-RMA history, permission and audit review, responsive QA) is next.


### B.8 Settlement — money in / money out, separate from the delivery (built 2026-10-20)

Replaces the five payment presets of B.7. Phase 4's delivery mixed "hand the unit over" with "take the money", which was confusing. They are now two documents in the **Delivery & Settlement** tab: a **delivery** (hand-over only) and any number of **settlements** (money). A settlement never moves stock or the RMA status; a delivery never posts a payment.

#### Step 01 audit — what was reused (nothing new in Finance except one method)

| Need | Existing piece reused |
|---|---|
| Money records | `finance_payments` (direction inbound / outbound, source, party, journal link) — no second ledger |
| Posting funnel | `FinanceService._post_journal` (period control, one balanced entry per source) |
| The RMA's own charges | `rma_service.raise_bill` (one receivable per RMA) + `FinanceService.settle_receivable` |
| Cash / bank account | `finance_payment_accounts` + `fetchPaymentAccounts` (the account's *kind* is the payment method) |
| Parties | Party master `parties` + `party_roles` (customer, supplier, vendor = dealer); `GET /parties` gained a `search` filter |
| Approval | RMA privileged sub-modules + the amount ceiling `approval_service.assert_can_approve` (`finance.payment`) |
| UI | common drawer (`AgainDrawerPanel` …), `FilterSelect`, `useDrawerDraft` |

The only addition to Finance is `FinanceService.post_party_payment` — one idempotent money-in / money-out against a counter account the caller names, through `_post_journal` (source type `rma_settlement`). Everything else is RMA-side.

#### What a settlement is

Table `rma_settlements` (`STL-YYYY-nnnn`): party type (Customer · Dealer · Supplier · Other Party), party (a `parties` row holding that role; Other Party can also be a typed name), direction (Money In + / Money Out −), amount, purpose (Parts / Service Charge · Damage Compensation · Repair / Labour Charge · Refund / Settlement · Replacement Price Difference · Other), purpose details (required; at least 20 characters for Other), cash / bank account (+ its kind as the payment method), transaction date, reference, created by, approval status (draft · pending approval · needs correction · approved · rejected · cancelled), decided by / at / reason, and the links approval creates: payment number, journal number, invoice number, counter account.

#### Accounting — decided by purpose, direction and party (`services/rma/settlement_accounts.py`)

The cash / bank side is the chosen account. The other side is **not** "positive = income, negative = expense":

| Direction | Purpose | Other side |
|---|---|---|
| In | Parts / Service, Repair / Labour (customer) | settles the RMA receivable (Dr cash / Cr 1100) — raised once, partial payments add up |
| In | Damage Compensation | 4100 Other Income |
| In | Refund / Settlement | customer, dealer: 1100 Receivable · supplier: 2100 Payable |
| In | Replacement Price Difference | customer, dealer, other: 4000 Sales Revenue · supplier: 2100 Payable |
| In | Other | 4100 Other Income |
| Out | Parts / Service, Repair / Labour (dealer, supplier, other) | 6000 Operating Expenses |
| Out | Damage Compensation | 6000 Operating Expenses |
| Out | Refund / Settlement | customer, dealer: 4200 Sales Returns · supplier: 2100 Payable |
| Out | Replacement Price Difference | customer, dealer, other: 4200 Sales Returns · supplier: 2100 Payable |
| Out | Other | 6000 Operating Expenses |

Refused with a clear message: the RMA's own charges from anyone but its customer; a service charge paid out to a customer (that is a refund); a refund to / from an Other Party (it has no ledger). **The account table is one dictionary — an accountant should review it once.**

#### Rules

- Draft / pending / rejected / sent-back entries post nothing and touch no balance. Only **Approve & post** posts, once.
- Approval takes the RMA row lock, requires `pending_approval`, refuses a settlement that already has a payment, and keys the finance payment on the settlement id — a retry returns the payment already made. Two pending entries cannot together collect more than is owed (re-checked at approval against the receivable).
- Amount > 0 always. A **zero-charge RMA** cannot take a Parts / Service or Labour collection, so no zero receipt, receivable or journal is ever created.
- Several settlements per RMA, each with its own history row (date, party, direction, amount, purpose, note, status, payment / invoice number). An approved settlement is final — correct it with a new settlement in the other direction. A settlement is allowed after the RMA is closed (payment after delivery), not before the complaint is approved.
- The delivery now only hands the unit over. On approval it invoices any charges once (unpaid, `raise_bill`) so the amount owed stays on the books; a zero-charge RMA gets no receivable; charges with no linked customer block the delivery. Old deliveries that carried a payment keep their history; an old draft loses its payment part on resubmit and an old pending one is refused on approval with a pointer to Settlement.

#### Permissions

`rma_payment` — create / edit / send for approval / cancel a settlement. `rma_settlement_approve` (new) — approve, reject, send back; also subject to the amount ceiling of `finance.payment`. Both off by default except System Manager.

#### Endpoints

`GET /rma/tickets/{id}/settlement-summary`, `GET|POST /rma/tickets/{id}/settlements`, `GET|PATCH /rma/settlements/{id}`, `POST /rma/settlements/{id}/submit|decision|cancel`.

#### Verified

28 settlement tests with the **real** finance service (money in for charges, partial + multiple payments, over-payment, compensation, customer refund, supplier refund, price difference, other party, zero-charge, note / party / role rules, duplicate approval, posting retry, permissions, approval limit, no stock / status change) and 15 delivery tests; all RMA tests pass. On the local stack: two payments settle one invoice (`PAY` in, receivable partial → paid), compensation → 4100, refund out → Dr 4200, supplier refund in → Cr 2100, zero-charge refused, delivery of a charged RMA leaves an open receivable and a later settlement after closing pays it. Test data was removed and the finance sequences restored.

#### Not included

Printing a receipt / voucher for a settlement; linking a settlement to a specific older invoice other than the RMA's own. *(Reversing an approved settlement was added later: see B.10.)*


### B.9 Phase 5 result — work queues, job card link, permission audit, hardening (built 2026-10-20)

#### Work queues (read-only over the real records — no new tables)

`services/rma/queue_service.py`. One definition, used by the API list filter, the dashboard counts and the list's Queue dropdown, so the three always agree.

| Queue | Meaning |
|---|---|
| **Overdue** | open, complaint approved, promised delivery date before today (due today is not late); shows days late |
| **Supplier pending** | the supplier leg is unfinished: a claim waiting for approval, an approved claim not yet dispatched, a unit out with the supplier (flagged **late** when the expected return date has passed), a receipt waiting for approval, or an older manual supplier job with no claim. A dispatched claim whose unit came back is *not* pending |
| **Repeat** | open RMA on a unit / customer with earlier RMAs (`prior_rma_count > 0`) |

- API: `GET /rma/queues` (the three lists + counts), `GET /rma/tickets?queue=overdue|supplier_pending|repeat`, dashboard gains `overdue_count`, `supplier_pending_count`, `supplier_late_count`, `repeat_count`; every ticket carries `days_open`, `overdue_days`, `is_repeat`.
- UI: RMA dashboard — Overdue / Waiting on a supplier / Repeat cards (click → the filtered list) and two short lists (most overdue first, late supplier units first); RMA list — **Queue** dropdown (`?queue=`), "Approx. delivery" column with a red "Nd late" tag; detail drawer — Overdue and Repeat badges, and the repeat history lists every earlier RMA (click opens it).

#### Service / Job Card link (optional)

`create_service_from_rma` and `ServiceJob.rma_id` already existed. Added: the RMA shows its job card (number · status · technician) in Handling and via `GET /rma/tickets/{id}/service-job`; a job card can only be opened while the unit is in the shop (not with the supplier, delivered, closed, rejected or cancelled); a second job is refused (409).

#### Withdrawal guards (checklist: "cancellation after stock movement uses a reversal, not silent deletion")

Rejecting or cancelling an RMA is now refused while the unit is **with the supplier** or **already delivered**, and while a supplier claim (before dispatch), receipt, delivery or settlement is still open (the message names them). Otherwise the intake stock is taken back through the ledger's reversal (once), as before; later stock steps still have to be reversed through their own documents.

#### Permission audit

Every mutating RMA endpoint is now accounted for in an executable table (`EXPECTED` in `test_phase5_flow.py`): the test fails if a new mutating endpoint appears without an entry, or if an endpoint's grants drift. Gaps found and closed (legacy endpoints that bypassed the new controls):

| Endpoint | Was | Now |
|---|---|---|
| `POST /rma/tickets/{id}/bill` | any RMA writer | `rma_payment` |
| `POST /rma/tickets/{id}/refund` | any RMA writer | `rma_payment` |
| `POST …/replacement`, `…/release-stock`, `…/scrap` | any RMA writer | new `rma_stock_adjust` |
| `POST …/warranty` (set by hand) | any RMA writer | `rma_override` |
| `PUT …/supplier-job` (supplier by hand) | any RMA writer | `rma_override` |
| settlement `GET`s (money) | RMA read | RMA read **and** Finance read |

`rma_stock_adjust` is a new privileged grant (off for everyone but System Manager). The detail drawer hides Refund / Replacement / Restock / Scrap and disables "Set by hand" for people without the matching grant. Every other privileged action (approve, override, reprint, claim approve, dispatch, receive approve, serial change, delivery approve, payment, settlement approve + amount ceiling) was already gated and is now in the table too.

#### Verification

- **125 RMA tests** pass (165 with the finance unit tests), 21 of them new in `test_phase5_flow.py` (queue definitions and edge cases, list filters, dashboard counts, days open, withdrawal guards, job card guards and summary, supplier trace found / not found / missing, the permission audit, and 403s without the grants).
- **Live, local stack:** overdue appears on the queue, the list filter and clears when the date moves; a job card opens once (second try 409) and shows on the RMA; cancelling with an open claim is refused naming the claim, then succeeds once it is cancelled and the intake stock is reversed (stock 4 → 3); logged in as **staff**, bill / refund / scrap / replacement / warranty override / settlement all return 403 while reading queues and tickets still works; order lookup by sales-order number, invoice, commerce order, phone and serial all return the right hits, no match and too-short return nothing.
- **Responsive:** at 390 px wide the RMA detail drawer (all seven tabs), the delivery, supplier-claim and settlement drawers have no horizontal page overflow (measured, not eyeballed); wide tables (settlement history) scroll inside their own box. An approved delivery no longer shows the "already delivered" warning as if it were a problem.
- Test data created for the checks was removed and the number sequences restored.

#### Checklist (section 9, Test checklist → where it is proven)

| Item | Proven by |
|---|---|
| Serial found and unique / not found | `TraceTests` (trace), live serial lookup; `test_a_received_serial_that_already_exists_is_refused` |
| Non-serial product by phone / order / invoice | live order-search check (all four paths); `test_plus_880_matches_local` |
| Multiple matching sales lines | **not exercised**: this database has no multi-line order; the line picker is untested beyond the single-line path |
| Missing warranty or supplier traceability | `TraceTests`, `test_no_supplier_trace_needs_an_authorized_manual_choice`, `test_not_found` |
| Previous RMA found | `test_prior_history_finds_earlier_claims_on_the_serial`, repeat queue tests |
| Diagnosis required but report missing | `test_diagnosis_required_blocks_submit_until_reported` |
| Claim dispatch changes stock state correctly | `test_dispatch_moves_the_unit_out_of_the_rma_store_exactly_once` |
| Supplier returns a different serial / the same serial / a serial that already exists | the receipt-flow serial tests |
| Rejected receipt adds no stock | `test_rejected_or_sent_back_receipts_create_no_stock` |
| Payment-only event does not deliver the product | settlement tests (`test_a_settlement_never_moves_stock_or_changes_the_rma`) — delivery and money are now separate |
| Product delivered with amount due | `test_a_charged_delivery_invoices_the_charges_once_and_takes_no_payment` |
| Zero-charge warranty delivery | `test_a_zero_charge_delivery_hands_the_unit_over_with_no_receivable` |
| Repeated approval does not duplicate stock / finance | delivery, receipt and settlement "approving twice" tests |
| No permission → no override of protected fields | `test_protected_fields_need_override_and_a_reason`, the permission audit |
| Cancellation after a stock movement uses a reversal | `test_cancel_after_intake_reverses_through_the_ledger_once`, the withdrawal-guard tests |

#### Not included / known limits

*(Superseded by B.10: cancelling now voids an unpaid invoice, an approved settlement can be reversed, and the multi-line picker and cheque test are covered.)* An approved delivery stays final by design; RMA and supplier warehouses are flagged but not yet excluded from sellable-stock reports; the multi-line order picker is untested here; `test_cheque_service.test_edit_details` fails ("no such table finance_cheque_leaves") — a missing table in that test's setup, unrelated to RMA.

### B.10 Closing the open items (built 2026-10-20)

Four limits recorded in B.8 / B.9 were closed.

**1. Settlement reversal (B.8 "approved settlement is final").** An approved settlement is still never edited or cancelled. The correction is a new, linked **reversal**: `POST /rma/settlements/{id}/reverse` (needs `rma_payment` and a reason) opens a draft with the opposite direction and the same party, amount, purpose and account; its `reverses_id` points at the original, and the original's `reversed_by_id` is set when the reversal is approved. The reversal goes through the same send-for-approval / approve steps (`rma_settlement_approve`, approval ceiling) and approving it posts the **exact mirror** of the original journal through Finance (`FinanceService.reverse_party_payment`: opposite payment on the same account and party, every debit and credit swapped; idempotent on the reversal's id). For the RMA's own charges the amount is put back on the invoice (`unapply_payment_from_receivable`: the invoice goes paid → partial → open again and the RMA's billing status follows). Only the explanation, date and reference of a reversal can be edited; one open or approved reversal per settlement; a reversal cannot itself be reversed (record a new settlement instead); a rejected reversal frees the original for another try. The settlement list tags rows *Reversal* / *Reversed*.

**2. Cancelling an RMA with an invoice (B.9 "does not void the receivable").** Cancelling now voids the RMA's own **unpaid** invoice with a mirror journal keyed by the receivable (`FinanceService.void_rma_receivable`, source type `receivable_void`, same pattern as a cancelled sales order) and sets the RMA's billing back to not billed. If the invoice already has payments on it the cancel is refused with the invoice number: reverse those settlements first (item 1), then cancel. After both, invoice, payment, reversal and void net to zero on every account.

**3. Delivery stays final, by design.** A delivery is a physical hand-over; reversing it would mean taking a unit back from the customer. The proper path is a **new RMA** for the unit coming back, which is tracked as a repeat RMA (B.9). The Overview's *Stage summary* shows what was handed over, to whom and when.

**4. Multi-line orders and the cheque test.** Order lookup is now covered with a three-line order (`test_order_lookup.py`: one hit with all lines in order, each line with only its own serials, serial search names the matched serial, invoice and phone paths, no-match) and the intake drawer's line picker was driven end to end in a real browser against a mocked three-line order: all lines listed, none preselected, two ticked, two grouped claims created (same group id, each its own SKU, order line and — when it has exactly one — its own serial; one fix: several lines now pick up their single serial instead of leaving it blank). The `test_cheque_service` failure was a missing cheque-book / leaf table in that test's setup, not a code bug (fixed; 15 pass).

**Also:** the Overview tab now opens with a **Stage summary** of the four stages (Complain Receive, Replacement Claim, Replacement Receive, Customer Delivery): who decided, claim / receipt / delivery numbers and status, supplier, dispatch and expected return, serials, charges and settlement totals, each with an *Open* link to its tab.

**Verified:** 195 tests pass (RMA + finance unit + cheque). Live: a damage-compensation settlement reversed → payments inbound 500 / outbound 500, journal net 0 on every account, original marked reversed, second reversal 409, locked fields 400, staff 403; a charged RMA — pay, cancel refused, reverse, cancel → invoice void with one void entry; an unpaid-invoice RMA cancelled → invoice void. Test data removed, sequences restored.

**Still not included:** a printed receipt / voucher for a settlement; linking a settlement to an older invoice other than the RMA's own; RMA and supplier warehouses are flagged but not yet excluded from sellable-stock reports.
