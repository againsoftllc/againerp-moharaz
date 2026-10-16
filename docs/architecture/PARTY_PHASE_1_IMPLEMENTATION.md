# AgainERP — Party Architecture: Phase 1 Implementation Report

Status: **Phase 1 complete.** No `customer_id`/`supplier_id`/`vendor_id` transactional
relationship was touched. No Finance field was touched. `party_id` was **not** made `NOT NULL`
and **no** foreign key constraint was added — per the phase's explicit rules, that is Phase 2's
decision to make, later, after this report is reviewed.

Companion documents: `PARTY_ARCHITECTURE_AUDIT.md`, `PARTY_IMPLEMENTATION_PLAN.md`,
`PARTY_PHASE_2_IMPLEMENTATION.md`.

> **Correction from Phase 2**: §1 below states `entity.id == entity.party_id` "holds for every
> record created through this natural path," based on reading `commerce_party_bridge.py`'s code.
> That's true of *that specific function*, but checking real data before Phase 2's migration
> showed it is **not** the majority case overall — most existing links (from
> `import_moharaz_contacts.py`'s own, separate Party-linking code) use an independent id scheme.
> See `PARTY_PHASE_2_IMPLEMENTATION.md` §3 for the full correction. It doesn't change anything
> else in this report — all counts, tests, and the backfill result below are still accurate.

---

## 1. What was discovered

Re-verified directly against the actual code (not assumed from the earlier audit):

- `apps/api/app/models/party.py` — `Party`, identity-only, exactly as the audit described.
- `apps/api/app/models/party_role.py` — `PartyRole`, with a real DB-level
  `UniqueConstraint("party_id", "role")`. Confirmed by test — see §10.
- `apps/api/app/services/parties/commerce_party_bridge.py` —
  `ensure_party_for_customer()` / `ensure_party_for_supplier()` / `ensure_party_for_vendor()`
  read in full. All three, on every code path (including the "found an existing Party by id"
  fallback), set `party_id = <source row's own id>`. **Confirmed: `customer.id == customer.party_id`
  holds for every record created through this natural path — preserved, not changed.**
- **The one documented exception**: `apps/api/app/services/parties/party_commerce_links.py`'s
  `_retarget()` (called from `enable_commerce_role`, the real "Also a customer/supplier/vendor"
  UI action) deliberately re-points an existing row's `party_id` at a **different**, already-
  existing Party — this is what makes a dual-role link possible. A row with
  `party_id != row.id` is therefore not a bug; it means that row was intentionally linked to
  someone else's identity. Every script in this phase treats `party_id` correctness as
  "does it point at a real, same-company Party with the right role" — never "does it equal the
  row's own id."

---

## 2-4. Customer / Supplier / Vendor relationship to Party

Unchanged from the audit, reconfirmed: all three carry a nullable, unconstrained
`party_id: String(36)`. No schema change was made to any of the three models in this phase.

---

## 5. Multi-role behavior

Verified live, both by automated test and against real data:

- A Party can hold `customer` + `supplier` + `vendor` roles simultaneously — confirmed by test
  (`test_multi_role_customer_supplier`) and found **already occurring in real data**: 2 parties
  in the `default` company hold all three roles today (e.g. `mhz-p-18` / "Adventure Works Dist."),
  4 hold Customer+Supplier, and one interesting real case surfaced by the duplicate-candidate
  report below (`MHZ-6050` "Againsoft" as a customer vs. `VEN-00001` "Againsoft" as a vendor —
  same name, not yet linked as one Party — a genuine candidate for manual review, not
  auto-merged, per the rules).
- `enable_commerce_role()` correctly refuses to link a Party from another company
  (`party.company_id != company_id` → 404) — confirmed by test (`test_tenant_isolation`).

---

## 6. Backfill design

Two new scripts, both under `apps/api/scripts/`:

- **`party_audit_lib.py`** — shared, read-only counting and duplicate-detection logic. Imported
  by both scripts below so the "before" and "after" counts in the backfill report are computed
  by the exact same code as the standalone audit, not a second implementation.
- **`audit_party_links.py`** — read-only CLI. Never calls `db.flush()`/`db.commit()`. Reports
  per-entity totals/linked/unlinked/dangling/cross-company/missing-role, a company-wise unlinked
  breakdown, a Party role-consistency breakdown (Step 16), and (with `--show-duplicates`) the
  cross-role duplicate-candidate report (Step 6).
- **`backfill_party_links.py`** — reuses `ensure_party_for_customer/supplier/vendor` directly;
  writes **no new Party-creation logic** of its own. Defaults to dry-run; `--execute` is required
  to persist. Dry-run is not a simulation — it runs the real function inside a transaction and
  always rolls back at the end, so the preview is a genuine "what would happen," not a guess.
  Per-row failures are isolated with `db.begin_nested()` (a SAVEPOINT), so one bad row cannot
  abort the rest of the batch.

---

## 7. Duplicate detection — and a real false-positive found and fixed

Cross-role matching (customer vs. supplier vs. vendor, within the same company, excluding pairs
already linked to the same Party) on tax id / phone / email / normalized name, per the priority
order in the spec.

**A real issue was found and fixed during this phase**, not merely theoretical: an early run
against the actual local database surfaced 13 "STRONG (phone match)" candidates that were all
false positives — one phone number (`01642324294`) turned out to be shared by **7 unrelated**
demo/seed records across all three entity types (almost certainly whoever set up the seed data
used their own number as a placeholder on many rows). Matching naively on it produced noise, not
signal. Fixed by adding a "common value" guard to `party_audit_lib.py`: any phone/email/tax-id
value shared by 3 or more otherwise-unrelated records within a company is treated as a likely
shared placeholder and excluded from STRONG/EXACT matching (name-only POSSIBLE matches are
unaffected, since a genuinely common name is a weaker signal to begin with and is already
reported at lower confidence). After the fix, the same run against the same data produced exactly
**2** candidates — both plausible:

```
Match confidence: STRONG  (phone match)
  Customer: MHZ-89  SHOPZ
  Supplier: MHZ-V-524  Quartz Hardware Co

Match confidence: POSSIBLE  (normalized name match only)
  Customer: MHZ-6050  Againsoft
  Vendor: VEN-00001  Againsoft
```

Neither was merged. Both are reported for manual review, per the rules.

---

## 8. Tenant isolation

`party_audit_lib.py` never queries across `company_id` boundaries implicitly — every counting and
matching function accepts an optional `company_id` filter and, when duplicate-matching, groups
records by company before comparing, so no candidate is ever proposed across two different
companies. `enable_commerce_role`'s existing company check (§5) was exercised by an automated
test, not just read.

---

## 9. Validation rules implemented

`party_audit_lib.audit_entity()` implements exactly the four checks the phase asked for, applied
per row with a `party_id`:

1. Does `parties.id = party_id` exist? If not → **dangling**.
2. Does that Party's `company_id` match the entity's own `company_id`? If not →
   **cross_company / CRITICAL_INVALID_LINK**.
3. Does a `PartyRole(party_id, role=<customer|supplier|vendor>)` row exist? If not →
   **missing_role**.
4. None of the above are auto-repaired by the audit script — only reported. The backfill script
   only ever *creates* a missing link for a row that has `party_id IS NULL`; it never touches a
   row that already has a (even if broken) `party_id`, since repairing a broken link is a
   judgment call the phase's rules reserve for manual review, not an automated fix.

---

## 10. Test coverage

`apps/api/scripts/test_party_backfill.py` — DB-backed, follows this repo's existing script-test
convention (same shape as `scripts/test_ai_os_rbac.py`), creates its own tagged throwaway fixture
data (`company_id` prefixed `test-party-phase1-`) and deletes all of it in a `finally` block
regardless of outcome. Run inside the API container:

```
docker exec againerp-api python3 scripts/test_party_backfill.py
```

Result: **20/20 assertions passed.** Covers, exactly per the spec: Customer/Supplier/Vendor Party
creation, multi-role linking (customer+supplier, then +vendor), idempotency (running
`ensure_party_for_customer` twice yields one Party and one role, not two), tenant isolation
(cross-company linking is refused), backfill dry-run non-persistence (verified by actually
committing an unlinked row, running the link logic, rolling back, then re-querying to confirm
`party_id` is `NULL` again), backfill repeatability (running the link logic twice commits without
duplicating), and the `PartyRole` unique-constraint itself (a direct duplicate insert raises
`IntegrityError`, proving the DB — not just application code — enforces uniqueness).

---

## 11. Remaining unlinked records

**Zero**, as of this report. The real backfill (`--execute`, no filters) was run against the local
database as part of this phase and reached 100% coverage:

```
Before:  customers 6112/6127 linked (15 missing) · suppliers 28/30 linked (2 missing) · vendors 5/5 linked (0 missing)
After:   customers 6127/6127 linked            · suppliers 30/30 linked            · vendors 5/5 linked
Failed:  0 (all three entity types)
```

Re-running `--execute` immediately afterward confirmed the expected idempotent no-op (0
backfilled, 0 failed, coverage unchanged) — see §10 for the same guarantee under automated test.

---

## 12. Known conflicts

- The 2 duplicate candidates in §7 are unresolved by design — flagged for manual review, not
  auto-merged.
- No dangling links, no cross-company links, and no missing-role records were found in the real
  data at any point in this phase (all three counts were 0 both before and after the backfill).
- The Finance `party_id`/`party_type` naming collision documented in the main audit still exists
  — untouched, per the rules for this phase.

---

## 13. Phase 2 prerequisites

Phase 2 (making `party_id` `NOT NULL` + adding the FK constraint) needs, per the implementation
plan:

1. ✅ 100% backfill coverage per company — **met** for the `default` company (the only company
   with data in this environment). If additional companies exist with their own data before
   Phase 2 begins, re-run `audit_party_links.py --company-id <id>` for each one first.
2. ✅ Zero dangling/cross-company links — **met**.
3. ⚠️ The 2 open duplicate candidates (§7) should be reviewed by a human before Phase 2, since
   adding a strict FK doesn't resolve them either way — they're an identity-quality question, not
   a schema question.
4. Not evaluated in this phase (per the explicit rules): whether every *future* customer/
   supplier/vendor creation path reliably calls `ensure_party_for_*` (it does today, on the two
   live API create paths already audited) — worth a final sweep immediately before Phase 2, not
   as part of Phase 1's scope.

---

## Appendix — exact commands used

```bash
# Read-only audit
docker exec againerp-api python3 scripts/audit_party_links.py --show-duplicates

# Dry-run preview (guaranteed no writes — rolled back internally)
docker exec againerp-api python3 scripts/backfill_party_links.py --dry-run

# Real backfill (this phase's actual execution)
docker exec againerp-api python3 scripts/backfill_party_links.py --execute

# Tests
docker exec againerp-api python3 scripts/test_party_backfill.py
```
