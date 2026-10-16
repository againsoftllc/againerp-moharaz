# AgainERP — Party Architecture: Implementation Plan

Status: **PLANNING ONLY — implementation not started.**
Companion document: `docs/architecture/PARTY_ARCHITECTURE_AUDIT.md` (read that first — this plan
assumes its findings).

## Ground rule for every phase below

The existing `Party`/`PartyRole` system (`apps/api/app/models/party.py`,
`app/services/parties/`) is real and already the right shape. **No phase below creates a second
Party system.** Every phase either (a) runs existing code over more data, (b) adds small, additive
endpoints, or (c) fixes one specific, narrowly-scoped inconsistency found in the audit. Nothing
below touches `customer_id`/`supplier_id` on Sales, Purchase, CRM, RMA, Service, or POS models —
those keep meaning exactly what they mean today, in every phase.

---

## Phase 0 — Audit

**Status: COMPLETE.** See `PARTY_ARCHITECTURE_AUDIT.md`.

---

## Phase 1 — Party Backfill

**Objective**: every existing `CommerceCustomer`, `CommerceSupplier`, and `Vendor` row gets a
linked `Party` + `PartyRole`, using the code that already does this for new rows.

- **Files likely affected**: one new one-off script,
  `apps/api/scripts/backfill_party_links.py`, calling the existing
  `ensure_party_for_customer()` / `ensure_party_for_supplier()` / `ensure_party_for_vendor()`
  (`app/services/parties/commerce_party_bridge.py`) over every row with `party_id IS NULL`,
  batched per `company_id`.
- **Database changes**: none (writes into the already-nullable `party_id` column only).
- **API changes**: none.
- **UI changes**: none.
- **Dependencies**: none — can run independently of every later phase.
- **Risks**: low. The bridge function is idempotent and already exercised in production request
  paths (customer/supplier create) and in `import_moharaz_contacts.py` this session. Main risk is
  scale (running over every historical row) — mitigate by batching and logging progress per
  `company_id`, resumable if interrupted.
- **Testing**: `SELECT count(*) FROM commerce_customers WHERE party_id IS NULL` (and suppliers,
  vendors) reaches 0 per company after running. Spot-check a handful of resulting `PartyRole` rows
  match the expected role.
- **Rollback**: set `party_id` back to NULL for affected rows (or simply leave as-is — a populated
  `party_id` is harmless even if later phases don't proceed).

---

## Phase 2 — Tighten `party_id` (NOT NULL + FK)

**Objective**: once Phase 1 backfill is verified complete, make `party_id` a real, enforced
foreign key on `commerce_customers`, `commerce_suppliers`, `vendors` — so every future row is
guaranteed a Party link at creation time (it already is, via the live `ensure_party_*` calls; this
phase just makes the guarantee structural instead of behavioral).

- **Files likely affected**: `app/models/commerce_customer.py`, `app/models/commerce_supplier.py`,
  `app/models/vendor/vendor.py` (column definition change), one Alembic-equivalent migration
  (check this repo's migration mechanism — `ensure_*_columns()` bootstrap pattern observed
  elsewhere in `finance_service.py` is the likely house convention, not a separate migrations
  framework).
- **Database changes**: `ALTER TABLE ... ALTER COLUMN party_id SET NOT NULL`, add
  `FOREIGN KEY (party_id) REFERENCES parties(id)`.
- **API changes**: none (the field already exists in every read/write schema).
- **UI changes**: none.
- **Dependencies**: Phase 1 must show 100% backfill coverage first, per `company_id` (this is
  multi-tenant — don't let one company's incomplete backfill block the constraint for everyone;
  either verify globally or add the constraint with a per-tenant staged rollout if the bootstrap
  mechanism supports it).
- **Risks**: medium — a NOT NULL constraint on a live table is the one genuinely blocking change
  in this whole plan. Run in a maintenance window; verify create-flows still populate `party_id`
  correctly (they already do, this just stops silently allowing the alternative).
- **Testing**: full regression on customer create, supplier create, vendor create; confirm
  existing Sales/Purchase/CRM/RMA/Service flows (which never read or write `party_id` directly)
  are unaffected.
- **Rollback**: drop the NOT NULL constraint and the FK — data is untouched either way.

---

## Phase 3 — Party Resolution + Consolidated Ledger Endpoints

**Objective**: add the two new, additive endpoints the audit identified as the actual missing
capability — entity resolution (name/phone/email/code → party_id + roles) and a consolidated
AR+AP view for a party with more than one linked role.

- **Files likely affected**:
  - `app/routers/parties.py` — add `GET /parties/resolve?q=...` and `GET /parties/{id}/ledger`.
  - New `app/services/parties/party_resolution_service.py` — search across `commerce_customers`/
    `commerce_suppliers`/`vendors` by name/phone/email/code, resolve to `party_id` via the
    existing `party_id` link (fast now that Phase 2 guarantees it's always populated).
  - `party_ledger` logic should reuse `partner_trading_service.py`'s existing join approach
    (it already proves customer_id + supplier_id can be combined for one entity) rather than
    reimplementing from scratch.
- **Database changes**: none — read-only endpoints over existing tables.
- **API changes**: two new additive endpoints, following the existing `parties.py`/
  `party_workspace.py` convention of splitting one resource across router files under a shared
  `/api/v1/parties` prefix.
- **UI changes**: none yet (Phase 4).
- **Dependencies**: Phase 2 (relies on `party_id` always being populated to keep resolution simple
  and reliable — technically could ship before Phase 2 using a `party_id IS NOT NULL` filter, but
  Phase 2 first is cleaner).
- **Risks**: low — additive, read-only, no existing behavior changes.
- **Testing**: unit tests for `/parties/resolve` against known name/phone/email/code collisions
  (including a party linked to more than one role); `/parties/{id}/ledger` output must match the
  sum of the separate existing customer and supplier ledger views for a manually-linked test
  party (exact reconciliation, not approximate).
- **Rollback**: delete the two endpoints and the new service file — nothing else depends on them
  yet.

---

## Phase 4 — UI: Consolidated Ledger Surface

**Objective**: surface Phase 3's consolidated ledger wherever a dual-role party is already
visible today.

- **Files likely affected**: `apps/web/src/components/shared/party-role-connections.tsx` (already
  shows linked roles — add a "View combined ledger" action when more than one commerce role is
  linked), `apps/web/src/components/customers/customer-ledger-panel.tsx` and
  `apps/web/src/components/suppliers/supplier-ledger-panel.tsx` (add the cross-link banner), new
  `apps/web/src/lib/api/party-ledger.ts` client for the Phase 3 endpoint.
- **Database changes**: none.
- **API changes**: none (consumes Phase 3).
- **UI changes**: as above — additive banner/tab, not a redesign of either existing ledger panel.
- **Dependencies**: Phase 3.
- **Risks**: low — purely additive UI, existing single-role ledger views are untouched for
  parties that aren't linked to a second role.
- **Testing**: manual verification with a real dual-role test party (link a customer to a new
  supplier role via the existing "Also a supplier" flow, confirm the banner and combined ledger
  appear and reconcile).
- **Rollback**: remove the added UI elements; underlying ledger panels are unmodified.

---

## Phase 5 — Finance Naming Collision Fix

**Objective**: eliminate the `party_id`/`party_type` naming collision between Finance's internal
counterparty convention and the real `Party` model, found in the audit as a migration footgun.

- **Files likely affected**: `app/models/finance.py` (`FinanceJournalLine`, `FinancePayment` —
  rename `party_id`/`party_type` → `counterparty_id`/`counterparty_type`), every call site:
  `app/services/finance/finance_service.py`, `app/services/finance/posting.py`,
  `app/services/customer/customer_ledger_service.py`,
  `app/services/supplier/supplier_ledger_service.py`, and any report code in
  `app/services/finance/finance_reports.py` that reads these fields.
- **Database changes**: column rename on `finance_journal_lines` and `finance_payments`.
- **API changes**: any Pydantic schema exposing these field names externally needs the matching
  rename (check `app/schemas/finance.py`).
- **UI changes**: only if any frontend code reads the raw field name directly (grep before
  starting — likely none, since these are typically summarized before reaching the client).
- **Dependencies**: none — independent of Phases 1-4, can be done in parallel or any time.
- **Risks**: medium — this is a mechanical but wide rename; must move all call sites together in
  one change (a half-renamed state would break ledger posting silently, per the audit's risk
  note). Not a semantic change (values and meaning are identical), which limits the actual risk
  once the rename is complete and consistent.
- **Testing**: full regression on invoice posting, GRN posting, receivable/payable settlement, and
  every Finance report endpoint (Partner Ledger, Aged Receivable/Payable, General Ledger) —
  diff output before/after the rename to confirm zero behavioral change.
- **Rollback**: one migration-down + one code revert (do this as a single deploy, not
  incrementally, exactly as the audit recommends).

---

## Phase 6 — AI Entity Resolution Tool

**Objective**: give the AI OS a tool that resolves "Rahim" / a phone number / an email / a
customer or supplier code to a `party_id` and its linked roles, then answers cross-module
questions by delegating to each module's existing per-role query logic.

- **Files likely affected**: new `app/services/ai/tools/party_tools.py`, following the same shape
  as the existing `get_product_profit`-style tools built earlier this session (resolve identity →
  delegate to existing per-module logic, don't reimplement it).
- **Database changes**: none.
- **API changes**: none (AI tools call the Phase 3 `/parties/resolve` and `/parties/{id}/ledger`
  endpoints, or the underlying service functions directly).
- **UI changes**: none directly (surfaces through the existing AI chat UI).
- **Dependencies**: Phase 3.
- **Risks**: low — additive, and the resolution step is a thin wrapper over already-tested Phase 3
  logic.
- **Testing**: exercise the exact example questions from the audit brief — *"How much does Rahim
  owe us?"*, *"Show all purchases from Rahim"*, *"Find customers who are also suppliers"* — through
  the real chat tool, not just the underlying endpoint.
- **Rollback**: remove the tool registration; no data or schema impact.

---

## Phase 7 (Optional, evaluate later) — Downstream Document Tightening

**Objective**: extend `party_id`-backed integrity to the currently-unconstrained downstream
documents found in the audit (`SalesDelivery`, `SalesReturn`, `PurchaseReceipt`, `PurchaseBill`,
`PurchaseReturn`, and CRM/RMA/Service's `customer_id` fields).

- **Files likely affected**: TBD per module — this phase is intentionally left unscoped until
  Phases 1-6 are complete and in production, since it touches many more tables and the audit found
  no urgent correctness problem caused by today's denormalized-but-unconstrained pattern (only a
  theoretical drift risk).
- **Database changes**: potentially adding FK constraints to already-existing columns — no new
  columns.
- **Risks**: higher than any earlier phase, precisely because it touches more surface area (CRM,
  RMA, Service, Sales returns/deliveries, Purchase receipts/bills/returns) — evaluate module by
  module, not as one change.
- **Recommendation**: revisit after Phases 1-6 ship and prove out the pattern; not part of this
  implementation's committed scope.

---

## Summary table

| Phase | Adds risk of breaking existing behavior? | Touches `customer_id`/`supplier_id` on any transactional table? | New tables? |
|---|---|---|---|
| 1 — Backfill | No | No | No |
| 2 — NOT NULL + FK on party_id | Only if run before backfill is verified | No | No |
| 3 — Resolution + consolidated ledger endpoints | No (additive) | No | No |
| 4 — UI surface | No (additive) | No | No |
| 5 — Finance rename | Yes, if call sites aren't moved together | No | No |
| 6 — AI tool | No (additive) | No | No |
| 7 — Downstream tightening (optional) | Deferred, unscoped | Potentially (FK addition only) | No |

**Implementation Status: NOT STARTED — audit and planning only, per the brief's instruction.**
