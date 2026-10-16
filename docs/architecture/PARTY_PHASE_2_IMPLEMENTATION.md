# AgainERP — Party Architecture: Phase 2 Implementation Report

Status: **Phase 2 complete.** `party_id` is now `NOT NULL` with a real
`FOREIGN KEY ... REFERENCES parties(id) ON DELETE RESTRICT` on `commerce_customers`,
`commerce_suppliers`, and `vendors`. No `customer_id`/`supplier_id`/`vendor_id` transactional
relationship was touched. No Finance field was touched.

Companion documents: `PARTY_ARCHITECTURE_AUDIT.md`, `PARTY_IMPLEMENTATION_PLAN.md`,
`PARTY_PHASE_1_IMPLEMENTATION.md`.

---

## 1. The blocker the original Phase 2 plan missed

The implementation plan (written during the audit, before tracing exact code paths) assumed the
`party_id` guarantee was "already established behaviorally" and this phase would just make it
"structural." That assumption was wrong in one specific, important way, found by tracing the
actual create-endpoints line by line before touching the schema:

**Every one of the three live creation endpoints inserted the Customer/Supplier/Vendor row *before*
linking its Party — not after.**

| Endpoint | Old order |
|---|---|
| `POST /api/v1/commerce/customers` (`commerce_customers.py::create_customer`) | `db.add(row); db.commit()` → *then* `ensure_party_for_customer(db, row)` |
| `POST /api/v1/commerce/suppliers` (`supplier_service.py::create_supplier`) | `db.add(row); db.commit()` → *then* `ensure_party(db, row)` |
| `POST /api/v1/vendors` (`vendor_admin.py::create_vendor`) | `db.add(row); db.flush()` → *then* `ensure_party_for_vendor(db, row)` |

Postgres checks `NOT NULL` at statement-execution time (the `INSERT`, which both `db.commit()`
and `db.flush()` trigger immediately) — not at transaction-commit time. Adding the constraint
without reordering these would have broken customer, supplier, and vendor creation outright,
the moment this migration ran.

This is exactly the kind of thing "audit says X is already guaranteed" can miss without tracing
call order — worth recording so the same mistake isn't repeated in a future phase.

---

## 2. Fix — reorder to link-before-insert (6 files)

Same fix shape everywhere: generate the row's `id` explicitly (instead of leaving it to the
column's lazy Python-side default, which doesn't populate until flush), call the existing
`ensure_party_for_customer/supplier/vendor` bridge function *before* `db.add()`, then insert.
**No Party-creation logic was duplicated or reimplemented** — every fix just reordered two
existing calls.

**Live request-path endpoints (the ones that mattered most):**
- `apps/api/app/routers/commerce_customers.py::create_customer`
- `apps/api/app/services/supplier/supplier_service.py::create_supplier`
- `apps/api/app/routers/vendor_admin.py::create_vendor`

**Also found and fixed — two customer-facing storefront flows that had never linked a Party at
all** (not merely wrong order — no `ensure_party_for_customer` call existed on either path):
- `apps/api/app/services/ecommerce/storefront_customer_auth_service.py` — OTP-based storefront
  signup.
- `apps/api/app/services/ecommerce/storefront_checkout_service.py` — guest checkout. (When the
  buyer is a logged-in storefront user with their own `party_id`, that's reused directly; a true
  guest still gets `ensure_party_for_customer` called before their first order.)

**One supporting fix inside the bridge itself**: `supplier_service.py`'s local `ensure_party()`
helper ended with `db.refresh(supplier)`, which requires the row to already be a persistent,
inserted instance — calling it *before* the row's first insert (as the fix now does) would have
raised its own error. Guarded with `sqlalchemy.inspect(supplier).persistent` so it only refreshes
when there's something to refresh.

**Seed/import scripts, fixed for consistency** (not live request path, but would otherwise break
on a future fresh-database bootstrap or re-run):
- `apps/api/scripts/init_db.py` — `seed_customers()`, `seed_suppliers()`, `seed_pos()`'s walk-in
  customer.
- `apps/api/scripts/seed_live_accounting_demo.py` — customer and supplier seeding.
- `apps/api/scripts/import_moharaz_contacts.py` — checked, **needed no fix**: it already calls
  its own `ensure_party()` before constructing the Customer/Supplier row with `party_id` already
  set, which is why its data uses the `mhz-p-*` id scheme (see §3).

---

## 3. A second, unrelated finding along the way: `id == party_id` is the minority case

Phase 1's report stated the invariant "`entity.id == entity.party_id` holds for every naturally-
created link" as if it were near-universal. Checking the real data before applying the FK showed
that's **not actually true in practice**:

```
                 id == party_id     id != party_id
commerce_customers      21               6,106   (99.7% differ)
commerce_suppliers        2                  28   (93% differ)
vendors                    3                   2
```

The overwhelming majority came from `import_moharaz_contacts.py`'s own Party-creation path, which
generates its *own* `mhz-p-{n}` id rather than reusing the commerce row's id (`mhz-c-{n}` /
`mhz-s-{n}`) — a third, independent Party-linking implementation (alongside the bridge and
`supplier_service.py`'s local one), consistent with each other in *behavior* (a valid Party gets
created and linked) but not in *id scheme*. This doesn't affect Phase 2's constraint at all — the
FK only requires `party_id` to reference a real, existing `parties.id` row, not any particular
value — but it does correct Phase 1's documentation, and it's worth knowing the "id reuse"
convention was never as universal as first stated.

---

## 4. Migration

New idempotent script: `apps/api/scripts/tighten_party_fk.py`. Pre-flight-gated — refuses to run
if `audit_party_links`' own logic finds any unlinked, dangling, or cross-company record, for any
of the three tables. Follows this repo's existing raw-DDL convention
(`scripts/add_username_column.py`) rather than a new migrations framework.

```sql
ALTER TABLE commerce_customers ALTER COLUMN party_id SET NOT NULL;
ALTER TABLE commerce_customers ADD CONSTRAINT fk_commerce_customers_party_id
  FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE RESTRICT;
-- same for commerce_suppliers and vendors
```

`ON DELETE RESTRICT` was chosen to match the convention already used elsewhere for similar
party-reference FKs in this schema (`SalesOrder.customer_id`, `PurchaseOrder.supplier_id`) — a
Party can't be deleted out from under an existing Customer/Supplier/Vendor record that still
points at it.

Also verified before running: only the `default` company has any rows in these three tables today
(checked directly against `companies` and each table's distinct `company_id` values) — so this
was a single, global migration, not a staged per-tenant rollout.

---

## 5. Model changes

`party_id` on `CommerceCustomer`, `CommerceSupplier`, `Vendor` changed from
`Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)` to:

```python
party_id: Mapped[str] = mapped_column(
    String(36), ForeignKey("parties.id", ondelete="RESTRICT"), nullable=False, index=True
)
```

---

## 6. Verification

1. Migration applied cleanly; re-running it is a confirmed no-op (`DuplicateObject` caught and
   skipped for the FK, `SET NOT NULL` re-applied harmlessly).
2. `information_schema`/`pg_constraint` confirms `is_nullable = 'NO'` and a `contype = 'f'`
   constraint on all three tables.
3. A throwaway script exercising the exact reordered logic from all three live endpoints
   confirmed `party_id` is populated before the first insert, **under the live constraint**
   (not just in theory) — then deleted, not part of the shipped tooling.
4. `test_party_backfill.py` updated for Phase 2 and re-run: **19/19 passed.** Two tests
   (originally "backfill dry-run never persists" / "backfill repeatability" against an *unlinked*
   row) were rewritten rather than deleted — that exact scenario (a row existing without a Party
   link) is now structurally impossible, not merely discouraged, so the strongest version of that
   guarantee is proving the database itself now refuses to create such a row at all
   (`IntegrityError` on a bare `party_id IS NULL` insert attempt).
5. `audit_party_links.py` re-run after the migration: still 0 unlinked, 0 dangling, 0
   cross-company, 0 missing-role, across all three entity types — the migration changed no data,
   only constraints, exactly as designed.

---

## 7. What's explicitly still untouched

- `customer_id` / `supplier_id` / `vendor_id` on every Sales/Purchase/CRM/RMA/Service/POS table —
  unchanged, per the rules.
- Finance's `party_id`/`party_type` naming collision (documented in the main audit) — untouched.
- The two duplicate candidates flagged in Phase 1 — still unresolved, still not auto-merged.
- `import_moharaz_contacts.py`'s independent `mhz-p-*` id-generation convention — left as-is (see
  §3); it produces valid links, just not id-matching ones, and changing it now would only affect
  future re-imports, not existing data.

---

## Appendix — exact commands used

```bash
# Pre-flight + migration
docker exec againerp-api python3 scripts/tighten_party_fk.py

# Verify (idempotent re-run should show "skipped" for both DDL statements)
docker exec againerp-api python3 scripts/tighten_party_fk.py

# Regression
docker exec againerp-api python3 scripts/test_party_backfill.py
docker exec againerp-api python3 scripts/audit_party_links.py
```
