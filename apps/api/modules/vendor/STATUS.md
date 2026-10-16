# Vendor module — implementation status

Read this before picking up more work here — it says what's actually built
vs. what SPEC.md merely describes.

## Done (Steps 01–18 of SPEC.md §60's dev order)

Vendor master, groups, portal users + role permissions, portal auth
(invite/login/sessions), product catalog integration, stock visibility
(exact/availability/threshold/hidden), pricing engine (vendor override →
vendor price list → group price list → product default, with quantity
breaks), cart, order request (price-snapshotted on submit), admin
review/edit + status workflow, quotation (create/view/accept/reject),
final order conversion (reuses `CommerceOrder`, not a parallel table),
basic invoice (reuses `FinanceReceivable`, not the legacy `Invoice` model),
credit management (non-blocking over-limit flag), in-app notifications,
audit log view (reuses `collab_activity`), vendor analytics
(overview/ranking/score), quotation revision chains + negotiation
(gated by `vendor_groups.negotiation_enabled`).

53 API endpoints. Admin UI live at `/vendors` (list, groups, price lists,
detail — apps/web). No vendor-portal-facing UI yet (API only).

## Explicitly not built

- **Step 19 — AI Vendor Assistant (SPEC §44-45, §58).** Skipped by
  explicit user decision on 2026-08-18: no working LLM integration exists
  inside `apps/api` to build on (checked — only an external "Center"
  gateway called from the Next.js side, plus unwired dead-code
  scaffolding: `chat_order_service.py`'s `CHAT_ORDER_TOOLS`, the
  `AiApproval` model). Building it for real means picking an LLM
  provider, wiring a server-side client + tool-calling loop, and a
  draft/confirm gate before any transaction executes — a genuinely
  different kind of build from everything else here. Revisit only if the
  user asks for it again; don't build a fake/mocked version.
- **Vendor Branches** (§9, Phase 2 §57) — `vendor_branches` table was
  deliberately deferred at Step 01 (see `app/models/vendor/vendor.py`
  history); a vendor currently has one implicit location.
- **Discount Rule engine** (§16) beyond the flat
  `vendor_groups.default_discount_percent` — no per-product/category/
  brand/campaign discount rules table.
- Bulk/Quick Order (§19-20), Availability Requests (§34), Vendor
  Documents (§40), Partial Delivery (§33), Payment recording (§32 — the
  `FinanceReceivable` rows exist and are readable, but nothing marks one
  paid yet).
- Vendor-portal-facing UI (the actual dealer-facing pages, as opposed to
  the admin screens under `apps/web/src/app/(admin)/vendors`).

## Conventions if you continue this

- Route registration order in `main.py` matters: any router with a
  literal path segment under `/vendors/...` (e.g. `/vendors/price-lists`)
  must be registered **before** `vendor_admin.router`, or FastAPI matches
  `/vendors/{vendor_id}` first and 404s. See the comment above that
  include_router block.
- `unit_price` on order-request/quotation line items is always
  **net-of-discount** (final price to charge); `discount_amount` is
  informational only — never subtract it again when computing totals
  (house convention, matches `chat_order_service.py`). This bit us once
  in Step 11 — see git history if it happens again.
- `PATCH /vendors/{id}` only writes fields present in the request body
  (`payload.model_fields_set`) — don't revert to unconditional field
  assignment, it silently nulls out anything the caller omitted.
