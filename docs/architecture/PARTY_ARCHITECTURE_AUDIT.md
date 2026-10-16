# AgainERP — Customer, Vendor, Supplier & Unified Party Architecture: Audit

Status: **AUDIT ONLY — no code, schema, or data changed.**
Scope: `apps/api` (FastAPI/SQLAlchemy/Postgres) + `apps/web` (Next.js).

---

## 1. Executive Summary

This is **not a greenfield design problem**. AgainERP already contains a real, partially-built
Universal Party system — `Party` + `PartyRole` + satellite tables (`party_contacts`,
`party_addresses`, `party_bank_accounts`, `party_notes`, `party_documents`) — that is structurally
very close to the SAP Business Partner / Odoo Contact pattern the target architecture asks for. It
is wired into the **admin UI's identity-linking layer** (a customer/supplier/vendor create/edit
form can say "this is also a supplier" and it really creates the link), and every new
Customer/Supplier record created through the live API automatically gets a shadow `Party` +
`PartyRole` row.

What it is **not** wired into is the **transactional and reporting backbone**. Sales, Purchase,
CRM, RMA, Service, POS, Inventory, and Finance all still reference `commerce_customers.id`,
`commerce_suppliers.id`, or `vendors.id` directly — none of them join through `party_id`. The
double-entry ledger (`FinanceReceivable`/`FinancePayable`/journal lines) does the same, and worse,
Finance has its **own**, unrelated `party_id`/`party_type` convention (a same-name, different-thing
column with no FK to the real `Party` model) — a naming collision that any migration must not
confuse itself with. The deep parts of the Party system (contacts, addresses, documents, bank
accounts, module-summary widgets) have zero frontend consumers — dead backend infrastructure, the
same "scaffolded once, never finished" pattern found elsewhere in this codebase (e.g. an unused
generic dashboard-widget system found in an unrelated earlier audit this session).

**Bottom line**: the exact scenario the target architecture describes — "Rahim is both a customer
and a supplier" — is *already partially solved for identity* (you can link one Party to both
roles today) but *not solved for reporting* (his Aged Receivable and Aged Payable rows are still
two disconnected records, keyed by `commerce_customers.id` and `commerce_suppliers.id`
respectively, with no visual or data linkage between them in the main ledger reports). The
recommended path is to **finish and tighten what exists**, not to build a second, competing Party
system or to rip `customer_id`/`supplier_id` out of the ~15 modules that depend on them today.

Migration complexity: **Medium.** The hard, expensive part (a working identity/role model with a
sane ID scheme) is already done. The remaining work is real but incremental: backfill
`party_id`, make ledger reads join through it, and gradually tighten what is currently optional.

---

## 2. Current Architecture (as-built)

```
Party (identity SSOT — id, company_id, type, display_name, legal_name, status)
   │
   ├── PartyRole (party_id, role: customer|supplier|vendor|..., unique per role)
   │
   ├── party_contacts / party_addresses / party_bank_accounts / party_notes / party_documents
   │        (real, but ZERO frontend consumers today — see §4)
   │
   └── party_id (nullable, no FK constraint) referenced FROM:
            │
            ├── CommerceCustomer ── owns its OWN name/phone/email/addresses_json
            │        └── Sales, Service, RMA(customer leg), CRM, POS, Storefront/Website
            │              all reference commerce_customers.id directly (NOT party_id)
            │
            ├── CommerceSupplier ── owns its OWN name/phone/contacts_json/addresses_json
            │        └── Purchase, RMA(supplier leg) all reference commerce_suppliers.id
            │              directly (NOT party_id)
            │
            └── Vendor ── owns its OWN name/phone/addresses_json; distinct self-service
                     B2B-reseller portal (buys FROM AgainERP — opposite direction of Supplier)
                     └── commerce_orders (B2B) reference vendors.id directly (NOT party_id)

Finance (separate, unrelated "party_id"/"party_type" naming convention — NOT the Party model above)
   │
   ├── FinanceReceivable.customer_id  ──▶ commerce_customers.id (no FK)
   ├── FinancePayable.supplier_id     ──▶ commerce_suppliers.id (no FK)
   └── FinanceJournalLine/FinancePayment.party_id/.party_type ──▶ raw copy of
            customer_id/supplier_id, no relation to parties.id
```

Party exists **beside** the transactional graph, linked only through an optional, nullable,
FK-less `party_id` column that gets populated lazily by an explicit "ensure party" call —
triggered today only by (a) the admin create-customer/create-supplier API path, and (b) offline
seed/import scripts. It is not yet the thing anything else is *built on*.

---

## 3. Customer Architecture

| | |
|---|---|
| Model | `Party` — `apps/api/app/models/commerce_customer.py:68`, class `CommerceCustomer` |
| Table | `commerce_customers` (+ `commerce_customer_contacts`) |
| Primary Key | `id: String(36)`, `default=uuid4()` — plain UUID string, no prefix |
| Own identity fields | `customer_code`, `name`, `phone`, `email`, `city`, `region`, `country`, `addresses_json`, `notes`, `timeline_json` — a full, independent copy of identity/contact data (`commerce_customer.py:76-112`) |
| `party_id` | `Mapped[Optional[str]]`, **nullable, no FK constraint** (`commerce_customer.py:77`) |
| `company_id` | `String(36)`, `nullable=False`, `default="default"` (`commerce_customer.py:76`) |
| Foreign Keys pointing at it | Real FK: `SalesQuotation.customer_id`, `SalesOrder.customer_id`, `SalesInvoice.customer_id`, `CustomerItemPrice.customer_id` — all `ForeignKey("commerce_customers.id", ondelete="RESTRICT")` (`sales.py:23,114,187,417`). **Unconstrained** string copies: `SalesDelivery.customer_id`, `SalesReturn.customer_id`, `FinanceReceivable.customer_id`, `CrmDeal/CrmProject/CrmTicket.customer_id`, `RmaTicket.customer_id`, `ServiceJob.customer_id`, `commerce_orders.customer_id`, plus website/storefront chat, wishlist, auth tables. |
| API | `apps/api/app/routers/commerce_customers.py`, own prefix `/customers`, mounted at `prefix="/api/v1/commerce"` (`main.py:565`) → real path is **`/api/v1/commerce/customers/...`** (not `/api/v1/customers/...` — a real gotcha this audit hit and corrected during unrelated dashboard work this session). ~20 endpoints: list, CRUD, `/crm-summary`, `/{id}/orders`, `/{id}/payments`, `/{id}/ledger` + invoice/payment posting, `/{id}/contacts`, `/{id}/cases`, wallet recharge. |
| UI | `apps/web/src/app/(admin)/customers/` list/detail/ledger; `components/customers/partner-form-sheet.tsx` (create/edit, embeds the Party-role-linking UI — see §6); `customer-ledger-panel.tsx` (balance/ledger). |
| Ledger | `apps/api/app/services/customer/customer_ledger_service.py` — `ledger()`, `raise_invoice()`, `record_payment()`. Note: sets `FinancePayment.party_id = customer_id` directly (`:288`) — this is Finance's unrelated `party_id` convention, not a link to the real `Party` model. |

---

## 4. Vendor Architecture

| | |
|---|---|
| Model | `Vendor` — `apps/api/app/models/vendor/vendor.py:40` |
| Design intent (quoted from code) | *"B2B vendor/dealer/reseller master profile — SPEC.md §4. This is the buyer-side counterpart to CommerceCustomer, not a rename of CommerceSupplier (which is who AgainERP buys FROM). A Vendor buys FROM AgainERP through the vendor portal."* (`vendor.py:41-46`) |
| Table | `vendors` (+ `vendor_types`, `vendor_groups`, `vendor_users`, `vendor_sessions`, `vendor_price_lists`, `vendor_cart`, `vendor_order_request`, `vendor_quotation`, `vendor_invoice`, `vendor_notification`) |
| Primary Key | `id: String(36)`, `uuid4()` |
| Own identity fields | `vendor_code`, `company_name`, `legal_name`, `display_name`, `contact_person`, `phone`, `email`, `website`, `addresses_json` — deliberately its **own** JSON blob, not the normalized `party_addresses` table (code comment explicitly notes this mirrors the `CommerceCustomer` pattern, `vendor.py:77-79`). |
| `party_id` | Nullable, no FK (`vendor.py:52`) |
| Self-service portal | Confirmed real — `VendorUser`/`VendorSession` are deliberately isolated from `AuthUser` and from `SupplierUser`: *"admin staff, suppliers, and vendors must never share an identity table or a session table"* (`vendor_user.py:20-25`). Separate portal API (`app/routers/vendor_portal*.py`, prefix `/vendor-portal`) and separate frontend app segment `apps/web/src/app/(vendor-portal)/`. |
| API | `apps/api/app/routers/vendor_admin.py`, own prefix `/vendors`, mounted at `/api/v1` → `/api/v1/vendors/...`. |
| UI | `apps/web/src/app/(admin)/vendors/` — confirmed this session to already use the shared `AgainListGrid` datatable. |
| Relationship to Supplier | **Not the same entity.** Structurally distinct table, distinct purpose (downstream reseller vs. upstream source of goods), distinct portal, distinct users. `commerce_orders` has **both** a loose `customer_id` and a loose `vendor_id` on the same row (for B2B orders converted from an accepted vendor quotation) — direct proof the codebase already needs a 3-way role distinction (Customer / Supplier / Vendor) in at least one place today. |

---

## 5. Supplier Architecture

| | |
|---|---|
| Model | `CommerceSupplier` — `apps/api/app/models/commerce_supplier.py:28` |
| Table | `commerce_suppliers` (+ `supplier_users`/`supplier_sessions`, `supplier_price_lists`, `supplier_product`, `supplier_link`) |
| Primary Key | `id: String(36)`, `uuid4()` |
| Own identity fields | `name`, `email`, `phone`, `payment_terms`, `lead_time_days`, `tax_id`, `contacts_json`, `addresses_json`. Field is confusingly named `vendor_code` (`commerce_supplier.py:39`) even though this table is *not* the Vendor entity — a real naming footgun worth fixing. |
| `party_id` | Nullable, no FK (`commerce_supplier.py:37`). `ensure_party()` **is called live** on supplier create (`commerce_suppliers.py:61`: `supplier_service.ensure_party(db, row)`). |
| Two competing UIs? | **No** — resolved. `apps/web/src/app/(admin)/suppliers/page.tsx` is a pure legacy redirect (`redirect(purchasePaths.suppliers)`) to `/purchase/suppliers`, the live implementation. `/suppliers/[id]` and a couple of sibling routes still exist and share the same module chrome — one module, reachable at two URL prefixes, not two independent supplier systems. |
| API | `apps/api/app/routers/commerce_suppliers.py`, own prefix `/suppliers`, mounted at `/api/v1/commerce` → `/api/v1/commerce/suppliers/...`. |
| UI | `apps/web/src/app/(admin)/purchase/suppliers/` (canonical); `components/suppliers/supplier-grid.tsx`, `supplier-form-drawer.tsx` (embeds Party-role-linking UI), `supplier-ledger-panel.tsx`. |
| Foreign Keys pointing at it | Real FK: `PurchaseOrder.supplier_id` (`ForeignKey("commerce_suppliers.id", ondelete="RESTRICT")`). Unconstrained: `PurchaseOrderLine`, `PurchaseReceipt`, `PurchaseBill`, `PurchaseReturn`, `RmaSupplierJob`, `FinancePayable`. |

**Confirmed answer to "is Supplier separate from Vendor?"**: Yes, unambiguously — separate table,
separate model, separate portal, and a design-intent docstring that explicitly disclaims the
opposite assumption.

---

## 6. Contact / Party Architecture

| | |
|---|---|
| Identity model | `Party` — `apps/api/app/models/party.py:16`. Docstring: *"Universal Party Master (SSOT) — identity fields only."* Fields: `id`, `company_id`, `type` (person/organization), `display_name`, `legal_name`, `status`. |
| Role model | `PartyRole` — `apps/api/app/models/party_role.py`, table `party_roles`, unique on `(party_id, role)`. Roles observed in code: `customer`, `supplier`, `vendor` (generic string, not a hard enum — extensible). |
| Satellite tables | `party_contacts`, `party_addresses`, `party_bank_accounts`, `party_notes`, `party_documents` — each FK `party_id → parties.id ON DELETE CASCADE`, each with its own `company_id`. |
| ID scheme | Same `String(36)` UUID as every other entity. **Critically**, the bridge functions (`ensure_party_for_customer/supplier/vendor`, `apps/api/app/services/parties/commerce_party_bridge.py:41,79,170`) set `party_id = <source row's own id>` — i.e. Party reuses the Commerce record's own UUID as its own primary key for a stable 1:1 mapping, explicitly commented as **"during migration"**. This matters a lot: it means, for every record that already has a Party link, `party_id == commerce_customers.id` (or `.suppliers.id`/`.vendors.id`) — no ID-translation table is needed for those rows. |
| Live wiring (real, confirmed) | Customer create → `ensure_party_for_customer` runs (`commerce_customers.py:1115,1133-1136`). Supplier create → `supplier_service.ensure_party()` runs (`commerce_suppliers.py:61`). Frontend: `components/shared/party-role-connections.tsx` — literal UI copy *"Also a…"* / *"One company can be a supplier, a customer, and a B2B vendor at the same time"* — embedded in customer, supplier, and vendor create/edit forms, backed by `GET/POST /api/v1/parties/{id}/commerce-links` (`app/routers/parties.py:227-261`), which will either link an existing Customer/Supplier/Vendor row (explicit id, or auto-matched by phone/email) or create a brand-new one and re-point its `party_id`. |
| **Not** wired (dead code) | `party_workspace.py`'s deep endpoints (`/{id}/workspace`, `/{id}/modules`, contacts/addresses/bank-accounts/notes/documents CRUD) have **zero** frontend call sites — grep of `apps/web/src` for `party_id`/`partyId`/`party-workspace`/`PartyWorkspace` finds only the role-linking feature above, nothing that touches these endpoints. `module_registry.py`'s per-module "summary" services (Crm/Hr/Purchase/Sales/Service/...) are stubs: `get_summary()` just returns `{"module": key, "party_id": ..., "ready": True}` with no real data. The bulk sync/backfill functions (`sync_workspace_from_customer/supplier`) are called only from `apps/api/scripts/init_db.py` (seed data) and `apps/api/scripts/import_moharaz_contacts.py` (a one-off data import script run this session) — offline tooling, never the live request path. |
| Finance's false cognate | `FinanceJournalLine.party_id`/`FinancePayment.party_id` (`app/models/finance.py:106,128`) are loosely-typed `String(36)` columns with **no FK to `parties.id`** and **no relation to the `Party` model** — a same-name, unrelated, older convention (populated by copying `customer_id`/`supplier_id` directly, e.g. `customer_ledger_service.py:288`). Any future migration must not conflate this with the real Party system, and ideally should rename one of the two to remove the collision. |
| Other parallel/dead concepts found | `apps/web/src/lib/mock-data/business-partners.ts` + `lib/store/business-partner-store.ts` define a "business partner" concept with **zero importers anywhere else** — frontend-only dead mock code, unrelated to the backend Party system. No separate `contact_id`/`person`/`organization` entity found outside the `party_*` files themselves. |

**Is it actually used? Verdict: partially.** Real, wired identity-linking at the admin-UI layer;
completely unused (dead) for deep workspace features; **not used at all** by any transactional or
reporting module.

---

## 7. Database Analysis

Multi-tenancy: plain `company_id: String(36)` column (`default="default"`) on every business
table, filtered by application code only — **no Postgres RLS, no schema-per-tenant**. Confirmed
zero hits for `ROW LEVEL SECURITY`, `search_path`, `CREATE SCHEMA`, `tenant_schema` anywhere in the
codebase. `company_id` is derived server-side from the authenticated user's own row
(`get_current_company_id`, `deps/auth.py:66-67`), not client-supplied — this is the actual
tenant-isolation boundary. `_check_company_active()` additionally gates on subscription status
(`trialing`/`active`/`suspended`/`cancelled`).

ID scheme: **universally** `String(36)` UUID primary keys (`default=lambda: str(uuid.uuid4())`) —
confirmed across `Party`, `PartyRole`, `CommerceCustomer`, `CommerceSupplier`, `Vendor`,
`CrmLead/Deal/Project/Ticket`, `RmaTicket`, `ServiceJob`, `SalesOrder`, `PurchaseOrder`, `Company`.
No auto-increment integer PKs anywhere in this part of the schema. Human-facing business numbers
(`po_number`, `order_number`, `rma_number`, `customer_code`, `vendor_code`) are **separate,
non-PK columns**, generated by a shared `sequence_service.py` (`CoreSequence` per
`(company_id, code)`, `allocate_number()`/`next_number()`).

**Duplicate master data confirmed:**

| Field | Duplicated in |
|---|---|
| name | `CommerceCustomer.name`, `CommerceSupplier.name`, `Vendor.company_name/display_name`, `VendorUser.name`, `SupplierUser.name`, `party_contacts`/`Party.display_name` (when linked) |
| phone | `CommerceCustomer.phone`, `CommerceSupplier.phone`, `Vendor.phone`, `VendorUser.phone`, `SupplierUser.phone` |
| email | Same set as phone |
| address | `CommerceCustomer.addresses_json`, `CommerceSupplier.addresses_json`, `Vendor.addresses_json` — each its **own JSON blob**, independent of the normalized `party_addresses` table even when `party_id` is populated |

`party_id` is **nullable everywhere** and populated only by an explicit bridge call — so for any
record created before the bridge existed, or created by a path that doesn't call it (e.g. bulk
import scripts unless they call it explicitly), duplication with no Party link at all is the
**default state**, not an edge case.

---

## 8. Transaction Dependency Map

```
Sales
  SalesQuotation.customer_id  ──FK──▶ commerce_customers.id
  SalesOrder.customer_id      ──FK──▶ commerce_customers.id
  SalesInvoice.customer_id    ──FK──▶ commerce_customers.id
  SalesDelivery.customer_id   ──(no FK, denormalized copy)──▶ commerce_customers.id
  SalesReturn.customer_id     ──(no FK, denormalized copy)──▶ commerce_customers.id
  CustomerItemPrice.customer_id ──FK──▶ commerce_customers.id

Purchase
  PurchaseOrder.supplier_id     ──FK──▶ commerce_suppliers.id
  PurchaseOrderLine.supplier_id ──(no FK, denormalized)──▶ commerce_suppliers.id
  PurchaseReceipt.supplier_id   ──(no FK, denormalized)──▶ commerce_suppliers.id
  PurchaseBill.supplier_id      ──(no FK, denormalized)──▶ commerce_suppliers.id
  PurchaseReturn.supplier_id    ──(no FK, denormalized)──▶ commerce_suppliers.id

Finance
  FinanceReceivable.customer_id ──(no FK)──▶ commerce_customers.id
  FinancePayable.supplier_id    ──(no FK)──▶ commerce_suppliers.id
  FinanceJournalLine.party_id / FinancePayment.party_id
        ──(no FK; copied from the above at settlement time; UNRELATED to Party model)

CRM
  CrmDeal.customer_id / CrmProject.customer_id / CrmTicket.customer_id
        ──(no FK, resolved app-side via db.get(CommerceCustomer, id))──▶ commerce_customers.id
  CrmLead — no customer_id at all (pre-customer prospect; name/email/phone denormalized)

Service
  ServiceJob.customer_id ──(no FK)──▶ commerce_customers.id  (+ denormalized name/phone/email)
  ServiceJob.rma_id      ──FK──▶ rma_tickets.id

RMA  (the one module needing BOTH a customer and a supplier reference)
  RmaTicket.customer_id       ──(no FK, nullable — walk-ins allowed)──▶ commerce_customers.id
  RmaSupplierJob.supplier_id  ──(no FK, NOT nullable, on a separate 1:1 child table)
        ──▶ commerce_suppliers.id
  (Model docstring: "Deliberately not a purchase order — nothing is being bought.")

POS / Storefront / Website
  commerce_orders.customer_id ──(no FK)──▶ commerce_customers.id
  commerce_orders.vendor_id   ──(no FK)──▶ vendors.id   (B2B orders from accepted vendor quotes)
  website_chat / website_wishlist / storefront_customer_auth — all loose customer_id
```

**Pattern**: real DB-level foreign keys exist only on the *root* document of Sales
(Quotation/Order/Invoice) and Purchase (Order). Every downstream document, and every non-Sales/
Purchase module, uses an unconstrained denormalized copy resolved only in application code. Any
Party migration must design around this — it cannot assume a clean, universally-enforced FK graph
to convert.

---

## 9. Ledger Analysis

`FinanceReceivable` (keyed `customer_id`) and `FinancePayable` (keyed `supplier_id`) are genuinely
**separate tables/models** — not a shared subledger — each with its own unique constraint on
`(company_id, source_type, source_id)`, and separate services (`customer_ledger_service.py` /
`supplier_ledger_service.py`, the latter's own docstring: *"Mirrors the supplier AP ledger, but the
direction is reversed"*). They converge only at the double-entry layer:

- **Sales invoice posting** (`posting.py:19-37`): Dr `1100 Accounts Receivable` (total), Cr
  `4000 Revenue` (net), Cr `2210 Output Tax` — lines stamped `party_type="customer", party_id=customer_id`.
- **Purchase GRN posting** (`finance_service.py:1301-1311`): Dr `1200 Inventory`, Dr `1310 Input Tax`,
  Cr `2100 Accounts Payable` — lines stamped `party_type="supplier", party_id=supplier_id`.
- **Receivable/Payable settlement** (`settle_receivable`/`settle_payable`): journal entry
  `source_type="receivable_settlement"`/`"payable_settlement"` with a **freshly generated
  `uuid4()`** as `source_id` (decoupled from the original invoice/bill id); the payment row and
  both journal lines are stamped with the same `party_type`/`party_id` pair, copied from the
  receivable/payable at settlement time.

**The gap this audit found**: `FinanceReportService.partner_ledger` / `aged_partner_balance`
(`finance_reports.py:1075-1311, 1834-1866`) key every row by
`f"{receivable|payable}:{customer_id|supplier_id}"` — **directly off `commerce_customers.id` /
`commerce_suppliers.id`, never through `party_id`.** So a real-world entity linked as both a
Customer and a Supplier via the Party system (§6) will *still* show up as two completely
disconnected rows in the Partner Ledger, Aged Receivable, and Aged Payable reports — there is no
visual or data linkage between them there.

**What already partially solves this**: `GET /api/v1/finance/partner-trading`
(`finance.py:247-261` → `partner_trading_service.py`) accepts **both** `customer_id` and
`supplier_id` as independent query params and returns combined purchase/sales totals and margin
for one real-world dual-role entity — proof the underlying data can be joined, but this exists
only as one bespoke report, not as a general capability the rest of the ledger inherits.

---

## 10. Duplicate Data Analysis

See §7 for the field-level table. Summary of *why* it's duplicated rather than normalized: Party
was added **after** Customer/Supplier/Vendor already existed with their own identity fields, and
was deliberately bolted on as an optional link (nullable `party_id`, lazy `ensure_party_*` calls)
rather than a data migration that would have moved identity fields onto `Party` and turned Commerce
tables into pure role/context records. That is precisely the target architecture's own recommended
shape (§12) — meaning the remaining work is to **finish the migration that was already started**,
not begin a new one.

---

## 11. Problems & Risks

| # | Problem | Location | Current behavior | Impact | Severity |
|---|---|---|---|---|---|
| 1 | Ledger reports don't consolidate a linked dual-role party | `finance_reports.py` partner_ledger / aged_partner_balance | Keys by `customer_id`/`supplier_id` directly, never `party_id` | A person/company linked as both Customer and Supplier shows as two unrelated ledger rows; "how much does Rahim owe us / do we owe Rahim" needs two separate lookups | **High** — directly blocks the exact scenario in this audit's brief |
| 2 | `party_id` nullable, populated only lazily | `commerce_customer.py`, `commerce_supplier.py`, `vendor.py` | Pre-bridge/imported records have no Party link at all | Duplication is the default state; AI/global search can't rely on `party_id` being present | **High** |
| 3 | Finance's `party_id`/`party_type` naming collision | `finance.py:106,128` | Same field name, unrelated meaning, no FK to `parties.id` | Real risk of a future migration (human or AI) conflating the two and writing bad data | **Medium-High** — a footgun, not yet a bug |
| 4 | FK strictness inconsistent | Sales/Purchase root docs vs. downstream docs vs. CRM/RMA/Service | Root docs FK-constrained; everything else is a denormalized, unconstrained copy | An edited/corrected customer record can silently drift from what a delivery/return/ticket already copied | **Medium** |
| 5 | Deep Party workspace features are dead code | `party_workspace.py`, `module_registry.py` | Backend endpoints exist, zero frontend consumers, module summaries return fake `{"ready": True}` placeholders | Maintenance burden; risk of building *another* unused layer if not addressed deliberately | **Medium** |
| 6 | No AI/global party resolution today | (absence) | CRM/RMA/Service/Sales/Purchase each query their own table by id only | AI cannot answer "find Rahim across all his roles" without bespoke per-module logic | **Medium** (this audit's own AI-OS requirement, §16 below) |
| 7 | Naming confusion: `CommerceSupplier.vendor_code` | `commerce_supplier.py:39` | A Supplier's own code field is named "vendor_code" despite Vendor being a separate entity | Ongoing developer/AI-agent confusion risk | **Low** |
| 8 | Two pagination idioms, inconsistent `meta` schemas | Cross-module | `page`/`per_page` vs `limit`/`offset`; every module's `meta` shape differs | Not identity-specific, but a new Party API must pick one deliberately | **Low** |
| 9 | `parties.py` uses the older `require_write_access` auth dependency, not the more precise `require_permission("parties", "write")` factory | `parties.py` | Coarser-grained permission check than the modern convention | Minor RBAC precision gap | **Low** |

No evidence found of literal duplicate *profiles* (the same person entered twice by mistake) —
the found duplication is **structural** (same identity, independently stored across
Customer/Supplier/Vendor tables), not user-error duplicate rows. Duplicate-detection logic (§16
of the target plan) is still valuable for onboarding/migration but is not fixing an existing mess
of accidental dupes — it's closing the loop on a pattern the architecture itself currently allows.

---

## 12. Proposed Party Architecture

Keep the existing shape — it is already the right shape — and reverse which side is authoritative:

```
                              PARTY  (parties — already exists, already SSOT-shaped)
                                │
                    ┌───────────┴───────────┐
                INDIVIDUAL               ORGANIZATION
                    │                        │
                    └───────────┬────────────┘
                                 │
                          PARTY ROLES  (party_roles — already exists)
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
          CUSTOMER            SUPPLIER            VENDOR
       (commerce_customers) (commerce_suppliers)  (vendors)
              │                  │                  │
      Sales / CRM / RMA /   Purchase / RMA      B2B portal /
      Service / POS /       supplier leg        commerce_orders.vendor_id
      Storefront
              │                  │                  │
              └────────┬─────────┴─────────┬────────┘
                        │                   │
                  Accounts Receivable  Accounts Payable
                  (FinanceReceivable)  (FinancePayable)
                        │                   │
                        └─────────┬─────────┘
                                  │
                   Double-entry Journal (FinanceJournalEntry/Line)
                   — rename its party_id/party_type to counterparty_id/
                     counterparty_type to remove the naming collision
```

Do **not** merge Customer/Supplier/Vendor row data into Party. Keep them as role-context tables —
this matches both the target architecture's own diagram (Party → Customer Context → AR, Party →
Supplier Context → AP) and the existing bridge's own design assumption (`party_id` already reuses
the Commerce row's own UUID 1:1). Rewriting Sales/Purchase/CRM/RMA/Service/Finance to point at
`party_id` instead of `customer_id`/`supplier_id` directly would be a much larger, riskier project
for no architectural gain — the role-context split already gives you AR/AP separation "for free."

---

## 13. Proposed Database Schema (incremental, not a rewrite)

No new tables are needed for the core model — `parties`, `party_roles`, and the satellite tables
already have the right shape. Changes recommended:

1. **Backfill**: run `ensure_party_for_customer/supplier/vendor` for every existing row with a
   NULL `party_id` (a one-time, idempotent, already-existing function — just needs to be run over
   all rows, not only new ones).
2. **Tighten `party_id`** on `commerce_customers`, `commerce_suppliers`, `vendors` from nullable/
   unconstrained to `NOT NULL` + real `ForeignKey("parties.id")`, once backfilled.
3. **Rename the Finance collision**: `FinanceJournalLine.party_id`/`party_type` and
   `FinancePayment.party_id`/`party_type` → `counterparty_id`/`counterparty_type` (a column rename,
   not a semantic change — they keep meaning "whoever the customer/supplier copy currently means",
   just without colliding with the real Party model's name).
4. **No changes** to `SalesOrder.customer_id`, `PurchaseOrder.supplier_id`, or any other
   transactional FK — they keep pointing at `commerce_customers`/`commerce_suppliers` exactly as
   today. Party stays the identity layer *underneath* those tables, not a replacement for them.

---

## 14. Proposed API Architecture

Reuse `apps/api/app/routers/parties.py` and `party_workspace.py` — they already exist, already
follow the house `{"data": ...}` / `{"data": [...], "meta": {...}}` envelope, and already split
one resource across two router files sharing one `/api/v1/parties` prefix (a pattern already used
elsewhere in this codebase — not something to invent). The gap is not new endpoints; it's that
nothing calls the ones that already answer §16's AI questions:

```
GET  /api/v1/parties/{id}/roles          — already exists
GET  /api/v1/parties/{id}/commerce-links — already exists (customer/supplier/vendor refs)

# New, additive only:
GET  /api/v1/parties/resolve?q=...       — name/phone/email/code → party_id + roles
                                            (the "AI entity resolution" endpoint, §16)
GET  /api/v1/parties/{id}/ledger         — NEW: consolidated AR+AP view, reusing
                                            partner_trading_service's join logic instead of
                                            each ledger report's separate customer_id/
                                            supplier_id keying
```

Migrate `parties.py`'s auth dependency from `require_write_access` to
`require_permission("parties", "write"/"read")` while touching this file anyway (§11, item 9).

---

## 15. Proposed UI/UX

The linking UI already exists and already works
(`components/shared/party-role-connections.tsx`) — extend it, don't replace it. The one missing
piece is a **consolidated ledger view** on the Party/Customer/Supplier detail screens: today
`customer-ledger-panel.tsx` and `supplier-ledger-panel.tsx` each show only their own side. Add a
"This party is also a Supplier — view combined ledger" banner/tab when `party-role-connections`
reports more than one linked role, pointing at the new consolidated `/parties/{id}/ledger`
endpoint from §14.

---

## 16. AI OS Integration

The existing bridge's design decision — Party reuses the Commerce row's own UUID — means an AI
entity-resolution tool can be built cheaply: resolve name/phone/email/customer_code/vendor_code to
a `party_id` (new `/parties/resolve` endpoint, §14), then fan out to whichever of
`commerce-links.customer`/`.supplier`/`.vendor` are present, using each linked id to query Sales/
Purchase/Service/RMA exactly as those modules already do internally. No new AI tool needs to learn
a new ID scheme — it needs one resolution step, then normal per-module lookups it can already do
today (e.g. `get_product_profit`-style tools built earlier this session follow exactly this
"resolve identity, then delegate to the module's existing query" shape).

"Find customers who are also suppliers" becomes: `PartyRole` rows grouped by `party_id` having
both `role="customer"` and `role="supplier"` — a single indexed query against a table that already
exists.

---

## 17. Multi-Tenant Considerations

Isolation is `company_id`-only, enforced entirely in application code (no RLS, no schema-per-
tenant) — confirmed zero hits for tenant-isolation SQL mechanisms anywhere in the codebase.
`company_id` is derived server-side from the authenticated user, never client-supplied. `Party`,
`PartyRole`, and every satellite table already carry their own `company_id` — no design change
needed here. No group/multi-company parent construct exists, and no cross-company sharing pattern
was found anywhere — Party data should remain strictly single-tenant, matching every other table
in the system. `HrmBranch`/`InventoryWarehouse` sub-tenant scoping does **not** extend to
Customer/Supplier/Vendor/Party today and this audit found no requirement to add it.

---

## 18. Migration Strategy

```
Phase 1  Backfill party_id for every existing Customer/Supplier/Vendor row (idempotent,
         reuses ensure_party_for_* — already-existing code, run once over all rows)
Phase 2  Add the NOT NULL + FK constraint on party_id (only after Phase 1 backfill is verified
         at 100% coverage per company_id)
Phase 3  Build /parties/resolve and /parties/{id}/ledger (additive, new endpoints only)
Phase 4  Wire party-role-connections' "also a supplier" banner to link to the new consolidated
         ledger view
Phase 5  Rename Finance's party_id/party_type → counterparty_id/counterparty_type (mechanical
         column rename + code references, isolated to app/models/finance.py and its call sites)
Phase 6  Build AI entity-resolution tool on top of Phase 3's /parties/resolve
Phase 7  (Optional, longer-term) Extend party_id NOT NULL+FK enforcement to downstream documents
         (SalesDelivery, SalesReturn, PurchaseReceipt/Bill/Return, CRM/RMA/Service) — evaluate
         per-module, not as one big-bang change
```

No phase requires touching `customer_id`/`supplier_id` on any transactional table — they keep
their current meaning and their current FK targets throughout.

---

## 19. Backward Compatibility

Every phase above is additive or backfills a nullable column — nothing removes or renames
`customer_id`/`supplier_id` anywhere. `SalesOrder.customer_id`, `PurchaseOrder.supplier_id`, and
every other existing reference keep working unmodified through every phase. The only rename
(§13.3, Finance's `party_id`→`counterparty_id`) is isolated to Finance's internal journal/payment
tables and does not touch any other module's schema or API contract.

---

## 20. Data Migration Risks

- Backfilling `party_id` (Phase 1) is read-mostly (only writes a new value into an already-nullable
  column) — low risk, fully reversible by setting the column back to NULL.
- Adding `NOT NULL`+FK (Phase 2) is the only genuinely blocking step — must not run until backfill
  coverage is verified at 100% per `company_id`, since AgainERP is multi-tenant and a partial
  backfill in one company must not block another company's migration.
- The Finance column rename (Phase 5) needs a careful grep-and-verify pass first — `party_id`/
  `party_type` appear in `finance_service.py`, `posting.py`, `customer_ledger_service.py`,
  `supplier_ledger_service.py`, and possibly report code; every call site must move together in
  one change, not incrementally (a half-renamed state would silently break ledger posting).

---

## 21. Testing Strategy

- Phase 1 backfill: verify `SELECT count(*) FROM commerce_customers WHERE party_id IS NULL` (and
  same for suppliers/vendors) reaches 0 per `company_id` before proceeding.
- Phase 2 constraint: add in a maintenance window, verify existing Sales/Purchase/CRM/RMA/Service
  flows (create order, receive goods, raise ticket) still succeed unmodified — they never touch
  `party_id` directly, so this should be a no-op for them by construction, but verify live.
- Phase 3-4 new endpoints: unit-test `/parties/resolve` against known name/phone/email/code
  collisions; verify `/parties/{id}/ledger` matches the sum of the existing separate customer and
  supplier ledger views for a manually-linked dual-role test party.
- Phase 5 rename: full regression on invoice posting, GRN posting, receivable/payable settlement,
  and every existing Finance report endpoint (Partner Ledger, Aged Receivable/Payable, General
  Ledger) before and after, diffing output.

---

## 22. Rollback Strategy

- Phases 1, 3, 4, 6: purely additive — rollback is deleting the new code/endpoints, no data
  cleanup needed (Phase 1's backfilled `party_id` values are harmless to leave in place even if
  later phases are abandoned).
- Phase 2 (NOT NULL + FK): rollback is dropping the constraint — the column and its data stay
  intact either way.
- Phase 5 (Finance rename): do behind a single migration + single deploy, not incrementally, so
  rollback is one migration-down + one revert, not a multi-step unwind.

---

## 23. Recommended Implementation Phases

See the companion document: `docs/architecture/PARTY_IMPLEMENTATION_PLAN.md`.
