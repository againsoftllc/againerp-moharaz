# AgainERP — Audit, Fixes and Open Issues

> **Living document.** Every change made from the audit work updates this file in the same change: the finding's row moves from *Open findings* to *Fixed*, the *Changelog* gets an entry, and *How things work now* is corrected if the behaviour changed. Findings keep their ID (for example `INV-07`) for good, so commits and discussions can refer to them.
>
> Interactive version of the same report (filters by module, severity and status): [AgainERP Module Audit](https://claude.ai/artifact/San7qih1HBp2NjNAoDwYhw).

**Last updated:** 28 Oct 2026 · **Latest commit covered:** `52900d9`

## 1. Scope and method

- **Modules audited:** Inventory (incl. Purchase, RMA, Reports, Approvals mounted under it), Workspace, Finance (incl. Accounting and Expenses). A second pass looked wider: other modules, API role checks, type checking and tests.
- **What counts as a finding:** dummy or mock code shown as real; drawers, dialogs and buttons that aren't connected; broken links; frontend ↔ backend API gaps; security gaps; code-health problems that hide bugs.
- **How:** every finding was checked in the file it cites. All 66 static pages of the three modules were also opened in the running app (`localhost:3270`, dev admin): every page loaded, no API call failed (4xx/5xx) and no 404 or error screen appeared. The crawl covers page loads only; saves and clicks come from the code review and the live tests listed in the changelog.
- **Severity:** **High** = looks like it works but doesn't (fake save, fake data, toast-only action) or a security gap; **Medium** = partly wired or silently loses data; **Low** = cosmetic, dead code or an unused endpoint.

## 2. Status

| Module | Open High | Open Medium | Open Low | Fixed |
|---|---|---|---|---|
| Inventory | 0 | 4 | 10 | 6 |
| Workspace | 0 | 3 | 8 | 6 |
| Finance | 0 | 5 | 9 | 1 |
| Platform | 0 | 2 | 1 | 1 |
| Other modules | 0 | 1 | 1 | 1 |
| **All** | **0** | **15** | **29** | **15** |

There are no open High findings.

## 3. Changelog

### Masters from OnerERP roadmap §14 Phase 2
New features, not audit fixes. Parts done so far are listed below; details in §4.7.

**Part A: customer credit control** (spec §15.2, §15.11)
- **Credit control at sale:** before, a customer's credit limit was stored but nothing checked it. Now confirming a sales order (which issues its invoice) is refused (409, with the reason) in these cases:
  - the customer is **locked for sales** (Oner IsLocked). This also applies to a paid POS counter sale;
  - the customer is **cash only** and part of the order is still unpaid;
  - with a credit limit, what the customer owes + confirmed orders not invoiced yet + this order's unpaid part would be over the limit. Until its *valid till* date, a higher **conditional limit** replaces the credit limit.
  - A credit limit of 0 means no limit. The checks run in `confirm_order`, so they also cover bulk confirm and an approver's replay.
- **New customer fields** (Profile → Accounting): *Sells on* (Cash & credit / Credit / Cash only), *Credit days*, *Conditional limit* + *Valid till*, *Security money*, *Opening date*, and the *Sales* Open / Locked switch with a reason.
  - The section also shows the customer's credit position: owes or advance, open orders, the limit in force and what is still available (`GET /commerce/customers/{id}/credit`).
  - Every field change is written to the customer's timeline like the other fields.
- **Verified:**
  - 6 new unit tests (`services/customer/test_credit_control.py`) pass, and the sales and POS tests still pass.
  - Type check: no new errors (121).
  - Tested live on SO-00001 (Rakibul Hasan, ৳5,45,991, draft). The customer was given a limit of 1,000, then made cash only, then locked. Each confirm was refused with its reason (409), and the order stayed a draft.
  - The Accounting section shows "Advance ৳2,65,125 · no limit" and the new fields. *Credit days* saved from the drawer.
  - Clean-up: the customer's limit, mode, lock and credit days are back to what they were. A passing confirm was not tried live, so that no stock would move; the unit tests cover it.
- **Not built:** customer group and grade masters (moved to Part D, where prices and discounts use them), ledger limit, cheque-dishonour opening, the control-account override, and a credit check on stand-alone invoices and party adjustments (they do not go through `confirm_order`).

**Part B: finance masters** (spec §16.2, §16.3, §8.1 Bank)
- **Group accounts:** Chart of accounts → an account can be ticked *Group account (no direct postings)*.
  - Journals, vouchers and opening balances then refuse it with a reason; its child accounts take the postings.
  - System accounts must stay postable, because the ERP posts to them (6000, for example, has children and still takes expense postings).
  - The level was already shown as the tree depth.
- **Check balance (Oner CheckAccountsBalance):** a cash / bank account can be marked *Check balance*. Money can then not go out of it beyond what it holds. This applies to:
  - debit and contra vouchers
  - supplier payments (from the ledger)
  - bill settle and expense pay
  - outbound party payments
  - Transfers already checked the balance.
- **Banks and branches (Oner Bank → Branch → Account):** Finance → Payments → **Banks & branches** (`/finance/banks`).
  - It is seeded with the 61 banks the cheque picker already listed. Each bank has branches with routing number, address and phone.
  - The payment-account drawer is now a common drawer with **create and edit** (this fixes FIN-10 for payment accounts). A bank account picks its bank and branch and keeps its account number and title.
  - Each **new** bank account gets its own GL ledger under 1010 Bank (1011, 1012, …). Accounts made earlier keep 1010.
- **Opening balances (Oner OpeningBalance + IsOpeningBalanceFinalized):** Finance → Accounting → **Opening balances** (`/finance/opening-balances`).
  - A batch of GL openings is kept as a draft until *Finalize & post*. That posts one journal on its date (the period must be open), with the difference to the new **3900 Opening Balance Equity**, and locks the batch.
  - AR / AP control, cash / bank heads and group accounts are refused, each with where its opening comes from instead.
- **Verified:**
  - 5 new unit tests (`test_finance_masters.py`) pass. Finance (117), RMA (175), core (13) and customer (6) tests pass too.
  - Type check: no new errors (121).
  - Tested live:
    - 61 banks are seeded. A *QA Gulshan* branch was added to City Bank (routing 225261725).
    - A bank account *QA City Bank Gulshan* got GL **1011** and the label "City Bank · QA Gulshan". With *Check balance* on, approving a ৳5 debit voucher from it was refused, because it holds 0.
    - A group account 6990 was refused on a voucher line. Making 1000 Cash a group was refused.
    - Opening balances: AR was refused. A ৳10 opening for a test asset 1590 was finalized as JE-00094 (3900 credited ৳10). Editing it afterwards was refused. JV-2026-00001 then took both back to 0.
    - The Banks page and drawer, the opening batch drawer and the new payment-account drawer load.
  - Clean-up: the test bank account, 1590, 6990, GL 1011 and the QA branch were made inactive. JE-00094 and JV-2026-00001 stay in the journal and cancel out.
- **Not built:**
  - Location-wise openings (journal lines have no location yet).
  - A categorization table for report lines (balance sheet and P&L still bucket by code range).
  - Cheque and party-bank pickers still use the static bank list, not the new master. The names match.

**Part D: price and discount masters** (spec §8.1 Price/Discount, §14 item 9)
- **Before:** the sales form took the product's catalog price, and the server only filled a price when the line came in at 0. Customer groups were free text, and custom groups lived only in the browser. Nothing limited the price or the discount a seller gave.
- **Sales → Pricing** (new menu) has four pages, each a list with the common drawer:
  - **Price types** (Oner Price Type): a named price list. Each product can have quantity slabs (from 10 up: a lower price) and dated prices. *Fixed* means a sales line must use the listed price. *Within limits* lets the seller go a set % below and above it (lower / upper limit).
  - **Discount types** (Oner Discount Type): a default % for a product, a brand or a category, from a quantity up. The product line wins, then the brand, then the category. *Max discount %* caps what a seller may give on a line.
  - **Pricing rules** (Oner Price & Discount Configuration): which price type and discount type apply. A rule can be limited by customer group, warehouse, salesperson, brand, category and a date range. Every condition filled in must match. The rule with the most conditions wins, then the higher priority.
  - **Customer groups** (Oner CustomerGroup): now a server master. It is seeded with the 7 built-in groups plus any group code a customer already has. A group can carry a default price type and discount type, used when no rule matches.
- **What a line gets:** the customer's own price (the existing customer price list) comes first. Next is the first matching price type that has a price for the product at that quantity. Otherwise the catalog price. The discount % comes from the matching discount type.
  - The **sales order form** asks for this (`GET /sales/pricing/quote`) when a product is added. It fills the price and the % discount, with a toast naming the price type. It only does so while the line still shows the product's own price.
- **Checked on save:** sales order and quotation lines are refused (400, with the bounds) when the price is outside the price type's limits or the discount is over the cap. A line edited without changing its price, quantity or discount saves as before, so older orders still save. Storefront orders are taken at the price the shop charged.
- **Verified:**
  - 5 new unit tests (`services/sales/test_pricing.py`) pass. Customer (6) and finance (117) tests pass too.
  - Type check: no new errors (121).
  - Tested live:
    - Customer groups: the 7 groups show with their customer counts (Retail 1,868).
    - Price type *QA Dealer* (Dell Inspiron 15 at ৳60,000, −5% / +10%) was made in the drawer. Rule *QA retail Dhaka* (group Retail, warehouse Dhaka HQ) was made in the drawer. A *QA Promo* discount type (2%, max 5%) was attached to the rule.
    - Quote for retail customer A K Azad at Dhaka HQ: ৳60,000, bounds 57,000–66,000, 2%. For Rakibul Hasan the customer's own price (৳61,749.05) still wins.
    - New orders at ৳50,000 and ৳70,000, and one with a ৳3,500 discount (over 5%), were each refused with the bound. No order was created.
    - New sales order form, Walk-in (Retail): adding SKU-DELL-15 filled ৳60,000 and 2% (৳58,800). The order was discarded.
  - Clean-up: the QA rule, price type and discount type were made inactive. The quote is back to the catalog price.
- **Fixed on the way:** the server's catalog fallback looked up the catalog product by the item id. A product whose catalog id differs from its item id got no price. It now maps item → catalog product (`product_for_item`). An item with no catalog product at all can still be priced.
- **Not built:**
  - Re-quoting a line when its quantity or the order's customer changes (only on adding a product).
  - The quote in POS and the quotation form.
  - The header (order-level) discount is not capped.
  - Oner's "Configured Price Info" popup and per-product upper/lower limits (`ProductWiseUpperLowerPriceSetup`).
  - The customer drawer still offers the groups from the browser list. Switching it to the server master is a follow-up.

**Part C: product master rules** (spec §8.1 Product, §14 item 7, §18.5)
- **Not for selling is enforced:** before, the flag only hid the product from POS. Now a sales order or quotation line, and a POS cart line, for such a product is refused with the reason (400). The sales form refuses it too.
- **Negative sales per product (Oner IsAllowNegativeSales):** a new *Negative sales — sell even when out of stock* tick on the product. It lets that one product be sold and delivered past its stock while the company keeps *Allow negative stock* off. The stock-out check, the sales reserve, the POS check and the sales form all honour it.
- **Products that keep no stock (IsStockMaintain off):** a product with *Track quantity* off is now handed over without a stock movement, like a service. Before, its delivery tried to take stock and failed. Unticking *Track quantity* now also updates the product's inventory record, which before stayed on.
- **Serial tracking is locked once used:** switching a product to or from serial tracking is refused (409) once it has stock movements or serials. The serial registry and the stock count would otherwise no longer match.
- **Structured warranty and return days:** new fields *Warranty days* (or *Lifetime*), *Service warranty days* and *Return days*. When set, warranty days win over the free-text warranty for every warranty check: serial lookup, POS, RMA intake and tickets (`warranty.product_warranty_text`). A sales return past the product's return days is refused, pointing to RMA.
- **HS code** on the product (Oner HSCodeId; no duty table yet).
- **Related / spare products (Oner RelatedOrSpareProduct):** a new *Related / Spare* tab in the product drawer. Search, add as related or as a spare part, then Save (`/catalog/products/{id}/relations`).
- **Unit types and warehouse types on the server (fixes INV-08):** `/inventory/unit-types` and `/inventory/warehouse-types`.
  - Units carry a decimals setting (Oner FractionalLength).
  - The product form and the warehouse form load the list from the server when they open, and every add, rename, delete or default change is saved there.
  - A browser's own custom units and types are sent up once, the first time it loads the list.
  - A unit still used by a product cannot be removed (409, naming the units).
- **Verified:**
  - 6 new unit tests (`services/inventory/test_product_master.py`) pass. Inventory (20 in all), sales (5), POS (9), RMA (175), customer (6) and finance (117) tests pass too.
  - Type check: no new errors (121).
  - Tested live:
    - Unit types: removing *ea* and *pcs* (used by products) was refused, naming both. Warehouse types: the presets plus the existing *Regional* type.
    - SKU-053024 (serial laptop, sold on SO-00035 on 26 Oct):
      - With *Return days* 1, a return was refused ("allowed for 1 day(s) after the sale").
      - Turning serial tracking off was refused (409).
      - Marked not for selling, a new order with it was refused.
      - Each setting was put back.
    - Product drawer: the *Related / Spare* tab added a battery as a spare part and saved it (checked through the API, then cleared).
    - Edit form: the new fields show, and an HS code saved from it (then cleared).
  - Not tried live: a confirm that sells past stock under *Negative sales*, because it would move real stock. The unit tests cover the rule, and the same check is used at every stock-out.
- **Not built:**
  - **Category-wise GL heads.** Sales revenue posts to one 4000 line from the invoice total, and there is no cost-of-goods posting at sale. Splitting revenue and COGS by category needs the invoice journal, its adjustments and its reversals to work by line first. That is a separate finance piece.
  - Three-level unit conversion (secondary / tertiary units).
  - RMA picking parts from the spare list.
  - The govt duty table behind the HS code.

### `52900d9` — vendor API role check; Website settings made real
- **PLT-01** `rbac_guard.py` maps `vendors/` → `purchase`. Every write to `/api/v1/vendors/*` now needs purchase permission. Verified: the seed `viewer` user gets 403 on create/delete; admin passes; reads unchanged.
- **OTH-01** Website → Settings (catalog) saves per company (`module-settings/catalog`). Kept only settings that are enforced (see §4.1); removed ~22 toggles with no feature behind them; the page links to where reviews on/off, SEO defaults and category-page options live. Verified live: publish rules, SKU rules and Q&A toggle via the API; save + reload in the UI. All settings were returned to defaults afterwards.

### `9da1604` — the 12 High findings of the first pass
- **Settings on the server** (INV-01, INV-02, WS-02, FIN-01): new company-scoped store; Finance, RMA, Media and Inventory settings save there and each remaining field is enforced (see §4.1). Fields with no feature behind them were removed.
- **Import / Export** (INV-03, INV-04, INV-05): Catalog gets real Excel/PDF export and the product importer; Customers get an Excel import and export; Sales/Quotations get export (order import removed: no backend).
- **Media AI Upload** (WS-01): reads the page's real images through `POST /api/v1/media/page-images` (public hosts only) instead of generating picsum photos.
- **Plugin install** (WS-03): Apps grid and plugin page share `lib/plugins/plugin-install.ts`; the server is called first, so an install no longer reverts on reload.
- **Plugins without backend** (WS-04): Steadfast and WhatsApp removed from the registry.
- **Bank EMI** (WS-05): banks/plans saved to platform setting `plugin.bank_emi.banks`; checkout serves them (only while the plugin is installed) instead of a hard-coded list.
- **AI billing** (WS-06): companies can't mark their own invoices paid or switch to a pricier plan; super admin records payments and switches plans (new section in the company panel).
- Verified: type check (no new errors), backend imports, live API tests, rebuilt containers.

## 4. How things work now

### 4.1 Company module settings
- Table `company_module_settings` (`company_id`, `module_id`, `values_json`), API `GET/PUT /api/v1/module-settings/{module}`, service `app/services/core/module_settings.py` (`get_module_setting`, backend defaults per key).
- Frontend: `lib/api/module-settings.ts`, hook `lib/workspace/use-module-settings.ts`, shared form `components/workspace/simple-module-settings-form.tsx`. Values a browser kept in localStorage before the move are offered once, then cleared on save.
- Permission: read/write of a module's settings needs that module's RBAC read/write (`vendors` uses `purchase`).

| Module id | Page | Enforced where |
|---|---|---|
| `finance` | `/finance/settings` | `requirePaymentAccount` → settle receivable/payable, pay expense (400 without an account) |
| `rma` | `/inventory/rma/settings` | `defaultResolution` → preset in Set resolution drawer |
| `media` | `/workspace/media/settings` | `maxUploadMb` → upload panel + `POST /media/upload` (413); `defaultType` → library's first filter; `showUsedIn` → details panel |
| `inventory` | `/inventory/settings` (Product Settings) | `product_field_*` → Add Product drawer fields |
| `catalog` | `/website/settings` | SKU auto/prefix → product create + AI importer; require brand/category → publish (400); default status → product form; review auto-approve, Q&A on/visibility → storefront API |
| `crm`, `dashboard`, `service`, `vendors` | their settings pages | **saved, but nothing reads them yet** (WS-17) |

### 4.2 Other mechanisms added
- **RBAC guard** `apps/api/app/middleware/rbac_guard.py`: maps mutation paths to RBAC modules; anything unmapped only needs a login, so new admin routers must be added here or use `require_permission`.
- **Platform settings** are global (no `company_id`); see PLT-02 before a second company signs up.
- **List export**: `lib/list-io/grid-table.ts` (`gridToTable`) + `lib/list-io/export-list.ts` (`exportListTable`); server-paged lists export the page on screen.
- **AI billing (super admin)**: `/api/v1/super-admin/companies/{id}/ai-billing` (get, record-payment, package).

### 4.7 Masters (OnerERP roadmap §14 Phase 2)
- **Customer credit control:** `services/customer/credit_control.py`.
  - `ensure_customer_credit_columns()` runs right after `create_all` in `main.py`. It adds `commerce_customers.sales_locked`, `sales_lock_reason`, `trade_mode` (both / credit / cash), `credit_days`, `conditional_limit`, `conditional_valid_till`, `security_money` and `opening_date`.
  - `credit_position()`: ledger balance (billed − net paid, from the customer ledger) + unsettled orders (confirmed / processing / packed / shipped with no invoice: total − paid).
  - `effective_limit()`: the conditional limit while valid and higher, otherwise the credit limit.
  - `check_order_confirm()` is called at the top of `SalesService.confirm_order`. POS's `complete_instant_sale` passes `paid_at_counter=True`, so a POS sale only checks the lock.
  - UI: `CustomerCreditFields` in `components/customers/partner-form-sheet.tsx` (Accounting group), and `fetchCustomerCreditPosition` in `lib/api/commerce-customers.ts`.
- **Finance masters:** `services/finance/master_service.py`, models in `models/finance_master.py` (`finance_banks`, `finance_bank_branches`, `finance_opening_batches`, `finance_opening_lines`), routes in `routers/finance_masters.py` (`/finance/banks`, `/finance/bank-branches/{id}`, `/finance/opening-balances` + `/finalize`).
  - `ensure_finance_master_columns()` runs after `create_all`. It adds `finance_accounts.is_postable` and, on `finance_payment_accounts`: `check_balance`, `bank_branch_id`, `account_number`, `account_title`.
  - `is_postable` is checked in `_post_journal`, in voucher lines and in opening lines. `set_postable` refuses system accounts.
  - `assert_can_pay_out` is called from `settle_payable`, `pay_expense`, `post_party_payment` (outbound), `post_ledger_payment_journal` (outbound, after the payment row exists) and voucher approve (debit, contra).
  - `create_payment_account(kind="bank")` gets its ledger from `next_bank_ledger` (1011–1019 under 1010).
  - Opening batch: `save_batch` refuses `opening_restricted_codes`. `finalize_batch` posts source type `opening_balance`, puts the difference on 3900 (created on first use) and then the batch can no longer be edited or deleted.
  - UI:
    - Pages: `app/(admin)/finance/banks`, `app/(admin)/finance/opening-balances`.
    - Components: `components/finance/bank-drawer.tsx`, `opening-batch-drawer.tsx`, and a rewritten `payment-account-drawer.tsx` (create and edit).
    - API client: `lib/api/finance-masters.ts`.
    - Also: *Group account* on the account form, and *Edit* in the payment-account row menu.
- **Price and discount masters:** models in `models/sales_pricing.py` (`customer_groups`, `sales_price_types` + `sales_price_type_items`, `sales_discount_types` + `sales_discount_type_items`, `sales_pricing_rules`). Logic is in `services/sales/pricing_service.py`, routes in `routers/sales_pricing.py` (`/sales/pricing/customer-groups|price-types|discount-types|rules|quote`).
  - Price rows are kept against the **item id** (what sales lines carry). `product_for_item()` finds the catalog product (price, brand, category) by `catalog_products.item_id`.
  - `quote()`: customer price (`CustomerItemPrice`) → matching rules (most conditions, then priority) → the customer group's defaults → catalog. `check_line()` raises 400 on the bounds or the discount cap.
  - `SalesService._price_line()` is called from `_add_quotation_lines`, `_add_order_lines` and `_replace_order_lines`. It fills a 0 price and checks the rest. `_replace_order_lines` skips the check for an unchanged line. The storefront import passes `check_prices=False`.
  - `ensure_customer_groups()` seeds the groups when the list is first read.
  - UI:
    - Pages: `app/(admin)/sales/pricing/{price-types,discount-types,rules,customer-groups}`, all rendering `components/sales/pricing/sales-pricing-page.tsx`.
    - Drawers: `components/sales/pricing/*-drawer.tsx`.
    - Menu: *Pricing* in `components/sales/sales-module-chrome.tsx`.
    - API client: `lib/api/sales-pricing.ts`.
    - Order form: `applyPriceQuote` in `sales-order-form-drawer.tsx`.
- **Product master rules:** `services/inventory/product_master.py`, with models in `models/product_master.py` (`inventory_unit_types`, `inventory_warehouse_types`, `catalog_product_relations`) and routes in `routers/product_masters.py`.
  - `ensure_product_master_columns()` runs after `create_all`. It adds `catalog_products.allow_negative_sales`, `warranty_days`, `lifetime_warranty`, `service_warranty_days`, `return_days` and `hs_code`.
  - `require_sellable()` is called from `SalesService._price_line` (on checked lines) and `PosService.add_line`.
  - `moves_stock()` (non-stock item types and `inventory_items.track_stock` off) replaces the item-type checks in sales delivery, reserve and cancel-restock.
  - `allows_negative()` (company setting or the product flag) is used by `StockMovementService.apply_movement` (stock-out), the sales reserve and the POS check.
  - `guard_serial_change()` is called in `_apply_product_inventory_fields` (catalog product create / update).
  - `SalesReturnService._check_return_window()` checks return days against the order's confirm date (else the order date).
  - Web:
    - `lib/inventory/unit-types.ts` and `warehouse-type-options.ts` keep a localStorage copy. `syncUnitTypes()` and `syncWarehouseTypes()` load the server list, and every write is sent to the server.
    - `lib/api/product-masters.ts` is the API client.
    - `components/products/product-drawer/product-relations-panel.tsx` is the Related / Spare tab.
    - The new fields are in `inventory-product-quick-add.tsx` and the overview panel.

## 5. Open findings

### Inventory

| ID | Severity | Type | Page | Problem | Where |
|---|---|---|---|---|---|
| INV-06 | Medium | Broken link | `/inventory/dashboard → /inventory/stock` | **The 'Low stock' and 'Out of stock' tiles open the unfiltered stock list.** The dashboard links to /inventory/stock?status=low_stock and ?status=out_of_stock, but neither the stock page nor the stock grid reads search params. Filters always start at 'all'. | `app/(admin)/inventory/dashboard/page.tsx:232,233,289 · app/(admin)/inventory/stock/page.tsx:20` |
| INV-07 | Medium | API/Data | `/inventory/purchase/receipts · /returns` | **Purchase receipts and returns stop at 50 rows.** fetchPurchaseReceipts() and fetchPurchaseReturns() send no page or per_page, so the backend default of 50 applies. The page has no paging, so older documents never appear. | `lib/api/purchase-receipts.ts:96 · lib/api/purchase-returns.ts:118 · routers/purchase_receipts.py:38` |
| INV-09 | Medium | Dummy | `/inventory/rma · /inventory/serials (customer drawer)` | **The customer drawer opened from RMA or Serials starts from placeholder values.** buildMinimalPartnerFromSales hard-codes loyaltyTier 'silver' and zero totals. The shared partner drawer falls back to AGAIN_DEMO_PARTNER (demo seed data) when no customer is passed. Open it from an RMA row to confirm what the user actually sees. *(Needs check)* | `lib/mock-data/partner-drawer-seed.ts:176 · components/shared/again-partner-drawer.tsx:42,92,298 · components/rma/rma-grid.tsx:236` |
| INV-20 | Medium | Drawer/Button | `/inventory/orders (bulk select)` | **Bulk 'Export' on selected orders only shows a toast.** Select orders → Export toasts 'Export selected (mock)'. The list's own Export menu is real now; the bulk-bar button is still fake. | `apps/web/src/components/sales/sales-order-grid.tsx:963` |
| INV-10 | Low | API/Data | `/inventory/transfers · /inventory/adjustments` | **Transfers and adjustments stop at 200 rows.** Both send per_page=200 with no paging control, so anything older than the latest 200 is invisible. | `lib/api/stock-transfers.ts:106 · lib/api/stock-adjustments.ts:107` |
| INV-11 | Low | API/Data | `/inventory/movements` | **Movements load at most 1,000 rows and filter in the browser.** limit: 1000 with no paging. | `app/(admin)/inventory/movements/page.tsx:44` |
| INV-12 | Low | Drawer/Button | `/inventory/movements` | **A movement row can't open its source document.** The movement grid has no row-click handler and no row menu. | `components/inventory/movement-grid.tsx` |
| INV-13 | Low | Drawer/Button | `/inventory/stock (row menu)` | **'Create adjustment' and 'Create transfer' only navigate to the list.** They don't open the drawer and don't pre-fill the SKU or warehouse. | `components/inventory/stock-grid.tsx:208,213` |
| INV-14 | Low | Broken link | `/inventory/purchase/*` | **Purchase screens inside Inventory jump to the Purchase module.** Paths are hard-coded to /purchase/*: closing the create drawer, 'Return', and Reorder suggestions → 'Create PO'. The routes exist, but the user leaves the Inventory menu. | `lib/purchase/purchase-paths.ts · app/(admin)/inventory/purchase/orders/page.tsx:136,247` |
| INV-15 | Low | API/Data | `/inventory/rma/dashboard` | **RMA dashboard counts are calculated from at most 500 tickets.** Period numbers and stage counts are computed in the browser from fetchRmaTickets(limit: 500). With more than 500 tickets, the dashboard undercounts. | `lib/api/rma.ts:338` |
| INV-16 | Low | Dead code | `(not routed)` | **Unused Odoo-style stock layer with demo seed data and calls to missing endpoints.** The use-stock-report/lots/move-history/move-analysis/quants/pickings/replenishment/scraps hooks have no importers. They fall back to 'Demo Wireless Kit' seeds and call /inventory/quants, /pickings, replenishment and scraps, which don't exist on the backend. | `lib/api/use-stock-*.ts · lib/api/stock-quants.ts:94 · stock-pickings.ts:162 · lib/stock/*.ts` |
| INV-17 | Low | Dead code | `(not routed)` | **Route helpers point to pages that don't exist.** /inventory/receipts, /deliveries, /physical-inventory, /scraps, /replenishment, /stock-report, /moves-history, /moves-analysis, /products, /lots. No code imports these helpers. | `lib/inventory/ops-routes.ts · reporting-routes.ts · products-routes.ts` |
| INV-18 | Low | Dead code | `(not routed)` | **Unused drawers and dialogs.** StockAdjustDialog calls a retired endpoint that returns 410. service-job-drawer is a re-export nothing imports. unit-type-form-drawer and pickings-api-health have no importers. lib/api/rma-settlements.ts is unused; the settlement UI was deliberately removed. | `components/inventory/stock-adjust-dialog.tsx · components/rma/service-job-drawer.tsx · lib/api/rma-settlements.ts` |
| INV-19 | Low | API/Data | `backend` | **Backend endpoints with no UI.** GET /commerce/inventory/history, /alerts/low-stock, GET and DELETE /purchase/bills/{id}, POST /rma/tickets/{id}/warranty, /warranty/recheck, PUT /supplier-job, POST /bill. | `apps/api/app/routers/*` |

### Workspace

| ID | Severity | Type | Page | Problem | Where |
|---|---|---|---|---|---|
| WS-07 | Medium | Dummy | `/workspace/apps (module toggles)` | **Enabling or disabling a module applies to one browser only.** setModuleEnabled persists to localStorage key 'againerp-modules'. Other users and devices of the same company aren't affected. | `lib/store/module-settings-store.ts:69-72,101` |
| WS-08 | Medium | Dummy | `/workspace/setup?tab=localization` | **Custom currencies are saved only in the browser.** Adding, renaming or deleting a currency and changing its symbol or position write to localStorage. Only currency_code is saved with the company. | `components/workspace/company-setup-panel.tsx:2448-2480 · lib/localisation/currency-options.ts:125-145` |
| WS-17 | Medium | Dummy | `/crm/settings · /dashboard/settings · /service/settings · /vendors/settings` | **Four more module settings pages save but change nothing.** These now save on the server (same form as Finance/RMA/Media), but no feature reads their values: capture web leads, deal owner, KPI tiles, auto-refresh, technician required, SLA, invoice on complete, vendor tax ID, portal quotes, payment terms. | `apps/web/src/lib/workspace/simple-module-settings.ts (dashboard, service, vendors, crm)` |
| WS-09 | Low | Broken link | `/workspace/permission` | **/workspace/permission returns 404 instead of redirecting to Users.** [category]/page.tsx calls notFound() before it checks MOVED_BUSINESS_TABS, so the permission → /workspace/users redirect never runs. | `app/(admin)/workspace/[category]/page.tsx:16-19 · lib/settings/business-settings-tabs.ts:30-33` |
| WS-10 | Low | Broken link | `/workspace/{store,catalog,sales,orders,seo,…}` | **9 of 12 category URLs all land on the Customers tab.** Only customers, payments and shipping map to real tabs. store, catalog, sales, orders, checkout, pcbuilder, marketing, seo and notifications silently redirect to /website/settings/checkout. | `app/(admin)/workspace/[category]/page.tsx:20` |
| WS-11 | Low | Drawer/Button | `all workspace pages` | **The utility panel is mounted but nothing can open it, and it holds fake activity.** No code calls openUtilityPanel or toggleUtilityPanel. It contains hard-coded entries like 'Sadia updated price on SKU-0042' and the text 'prototype placeholder'. | `components/workspace/workspace-utility-panel.tsx:8-12,65` |
| WS-12 | Low | Broken link | `/workspace/users · /workspace/roles` | **'Back to workspace' goes through a redirect chain.** It links to /workspace/modules, which redirects to /workspace/apps. | `workspace-users-panel.tsx:255 · workspace-roles-panel.tsx:327` |
| WS-13 | Low | Broken link | `Apps → Catalog settings` | **Settings link maps catalog to /catalog/settings, which doesn't exist.** Not visible today because 'catalog' isn't in workspaceNavItems. | `lib/workspace/module-settings-href.ts:4` |
| WS-14 | Low | API/Data | `/workspace/media (delete)` | **Failed R2 deletes are silently ignored.** A bare except: pass hides Cloudflare R2 delete errors, while the confirm dialog promises the file will be removed from R2. | `apps/api/app/routers/media.py:358` |
| WS-15 | Low | API/Data | `backend` | **Endpoints with no UI, plus a hard-coded value.** Sites can't be deleted (DELETE /workspace/sites/{id} is unused). branches=1 is hard-coded in the sites response. GET /approvals/actions and PATCH /billing/bills/{id} (updateBill) are unused. | `routers/workspace_sites.py:141,412 · routers/approvals.py:296 · lib/api/erp-billing.ts:88` |
| WS-16 | Low | Dead code | `(not routed)` | **Placeholder and mock components left in the tree.** placeholders/ (says 'Prototype dashboard · mock KPIs'), states/, connected-websites/, modules-panel, workspace-branches-panel (imports HRM mock data), store-settings-form (toasts 'settings saved (mock)'), settings-launcher, and localisation-list-page (renders LOCALISATION_MOCK_DATA). | `components/workspace/placeholders · components/settings/store-settings-form.tsx:251 · components/localisation/localisation-list-page.tsx` |

### Finance

| ID | Severity | Type | Page | Problem | Where |
|---|---|---|---|---|---|
| FIN-02 | Medium | Drawer/Button | `/finance/payments` | **Most payment rows look clickable but open nothing.** openSourceDrawer only handles sales_order, commerce_order, purchase_order and purchase_receipt. Every other source type shows 'No document linked to this payment': sales invoices, settlements, expenses, cheques, POS payments and transfers. | `components/finance/payment-grid.tsx:205-229,422` |
| FIN-03 | Medium | Drawer/Button | `/finance/dashboard` | **'Failed postings' can be counted but not viewed or retried.** The KPI links to /finance/reports, which has no posting-health view. fetchFinancePostingHealth and retryFinancePosting exist but are never called. | `app/(admin)/finance/dashboard/page.tsx:317 · lib/api/finance.ts:413-421` |
| FIN-04 | Medium | Drawer/Button | `/finance/reports/[slug]` | **Report filters are built but never shown for the 6 statement reports.** Account, Account type, Source and Payment-account selects are only rendered in the AG-grid branch. Trial balance, P&L, balance sheet, general ledger and cash flow render through FinancialStatement without them. The filters only work if you edit the URL by hand. | `app/(admin)/finance/reports/[slug]/page.tsx:507-530,553-621,671` |
| FIN-05 | Medium | API/Data | `journal · payments · receivables · payables · expenses` | **Finance lists load one page and never paginate.** The backend caps them at 500 (expenses at 1000). Search and filters run in the browser, and the footer shows the count loaded rather than the real total. | `journal/page.tsx:61 · payments/page.tsx:85,101 · receivables/page.tsx:58 · payables/page.tsx:58 · expenses/page.tsx:73` |
| FIN-06 | Medium | Drawer/Button | `/finance/payments (print)` | **Real payments can't be printed as a slip.** The payment-slip print layout is only ever rendered with samplePaymentPrintPayload in the settings previews. | `components/finance/payment-slip-print-document.tsx · lib/finance/payment-print.ts` |
| FIN-07 | Low | Broken link | `/finance/dashboard` | **'Cheques moving' opens the Payments tab instead of the Cheques tab.** The page always starts on the 'payments' tab, and there's no query parameter for Cheques. | `finance/dashboard/page.tsx:318 · payments/page.tsx:75` |
| FIN-08 | Low | Broken link | `/finance/dashboard` | **'Expenses to approve' opens a report instead of /expenses.** It links to the expense-by-cost-center report. | `finance/dashboard/page.tsx:319` |
| FIN-09 | Low | Drawer/Button | `/finance/payments (cheque form)` | **The cheque party picker only offers the first 500 customers.** It loads /commerce/customers?limit=500 with no server-side search. | `components/finance/cheque-form-drawer.tsx:38` |
| FIN-10 | Low | Drawer/Button | `/finance/payment-accounts · /expenses` | **Payment accounts and expense categories can't be renamed.** updatePaymentAccount and updateExpenseCategory exist and the API supports them, but no UI calls them. | `lib/api/finance.ts · lib/api/expenses` |
| FIN-11 | Low | API/Data | `/finance/reports (analytic)` | **The analytic report has no cost-center filter.** The backend accepts cost_center_id, but the frontend never sends it. | `apps/api/app/routers/finance.py:876` |
| FIN-12 | Low | Dead code | `/accounting (redirects)` | **Legacy Accounting shell with a mock dashboard.** accounting-dashboard.tsx renders KPIs from mock-data/accounting-dashboard, accounting-journal-store is seeded from mock data, and Favorites/Recent have no onClick. None of it is reachable because /accounting redirects to /finance/dashboard. The accounting settings block (multi-currency, auto-post) can't be reached either. | `components/accounting/accounting-dashboard.tsx:30-38 · accounting-module-chrome.tsx:40-53 · lib/workspace/module-nav.ts:58-61` |
| FIN-13 | Low | Dead code | `/finance/reports/[slug]` | **Unreachable report code.** exportCsv() is never called. The receivable-aging and payable-aging branches can't run because those slugs aren't in FINANCE_REPORTS. expense-list.tsx is never imported. | `reports/[slug]/page.tsx:201-238,458,483-500 · components/expenses/expense-list.tsx` |
| FIN-14 | Low | API/Data | `backend` | **Backend endpoints with no UI.** GET /finance/tax-summary, the receivable/payable aging reports, postings health and retry, POST /finance/payables/from-purchase, GET /cost-centers/{id}/accounts, PATCH /expense-categories/{id}. | `apps/api/app/routers/finance*.py` |
| FIN-15 | Low | Broken link | `/finance/settings` | **Fiscal periods are only reachable from Company setup.** Period management works, but Finance settings doesn't link to it. You can only reach it from Workspace → Company setup → Periods. | `components/workspace/company-setup-panel.tsx:1379` |

### Platform

| ID | Severity | Type | Page | Problem | Where |
|---|---|---|---|---|---|
| PLT-02 | Medium | Security | `/api/v1/platform-settings · /billing/settings` | **Platform settings are global, not per company.** platform_settings has no company_id, so a workspace admin of any company changes tax, shipping, SMTP, the OpenAI key, the billing gateway and EMI banks for every company. The moharaz database has 1 company today, so there's no impact yet; it matters once a second company signs up. | `apps/api/app/models/platform_setting.py:13 · routers/platform_settings.py:392 · routers/erp_billing.py:55` |
| PLT-03 | Medium | Code health | `apps/web` | **Type errors don't block the build: 121 open TypeScript errors.** next.config sets typescript.ignoreBuildErrors, so 121 errors ship unnoticed (65 type mismatches). Most are typing drift (ag-grid generics, Partial<Category>.status), but some point at real drift: the supplier-sourcing table reads supplierName/marginPct/retailPrice that the mapping type doesn't have, and tsconfig lacks the china-import /app path that next.config aliases. | `apps/web/next.config.ts:24 · components/products/product-supplier-sourcing.tsx:217-226 · tsconfig.json:23` |
| PLT-04 | Low | Code health | `apps/api tests` | **14 of 51 finance unit tests error out.** Run on their own, the tests fail to set up SQLAlchemy mappers (Party → 'PartyRole' not registered). The same 14 fail on the code before this work, so it's a test-import problem, not a finance bug, but it hides real regressions. | `apps/api/app/services/finance/test_finance_unit.py · test_cheque_service.py` |

### Other modules

| ID | Severity | Type | Page | Problem | Where |
|---|---|---|---|---|---|
| OTH-02 | Medium | Dummy | `/website/* · /dropshipping/* · /blog · /vendors/catalog · /hrm/employees` | **About 30 more fake Import/Export menus outside the three modules.** The same 'Import — prototype' / 'Export started (mock CSV)' toasts remain on 10 Website pages (attributes, brands, bundles, categories, collections, pages, qa, reviews, variants, specification profiles), 8 Dropshipping pages, Blog articles, Vendors catalog and HRM Employees. The catalog/customers fix (gridToTable + exportListTable) can be reused. | `grep: toast("Import — prototype") / "Export started (mock CSV)"` |
| OTH-03 | Low | Dead code | `(not routed)` | **More unused components with mock behaviour.** SalesModuleChrome, CustomersModuleChrome and DashboardModuleChrome (mock toasts) are not imported anywhere; neither is HrmEntityPage ('Reset to mock seed') or StoreSettingsForm. The sales order drawer's handleSend ('Email sent (mock)') isn't wired to any button. | `components/sales/sales-module-chrome.tsx · customers-module-chrome.tsx · dashboard-module-chrome.tsx · hrm/hrm-entity-page.tsx · sales-order-form-drawer.tsx:4115` |

## 6. Fixed

| ID | Was | Page | Problem | Fixed in |
|---|---|---|---|---|
| INV-01 | High | `/inventory/settings` | About 20 Odoo-style setting toggles are saved only in the browser and have no effect | `9da1604` |
| INV-02 | High | `/inventory/rma/settings` | RMA settings say 'saved' but nothing ever reads them | `9da1604` |
| INV-03 | High | `/inventory/catalog` | Import and Export only show a toast | `9da1604` |
| INV-04 | High | `/inventory/orders · /inventory/quotations` | Import and Export only show a toast (Sales list reused here) | `9da1604` |
| INV-05 | High | `/inventory/customers` | Import and Export only show a toast | `9da1604` |
| WS-01 | High | `/workspace/media → Upload → AI Upload` | AI Upload stores random stock photos in the real media library | `9da1604` |
| WS-02 | High | `/workspace/media/settings` | Media settings are saved only in the browser and have no effect | `9da1604` |
| WS-03 | High | `/workspace/apps → Install` | Installing some plugins from the Apps grid doesn't save, and the install undoes itself on reload | `9da1604` |
| WS-04 | High | `/workspace/plugins/steadfast · /whatsapp` | Steadfast and WhatsApp plugins have no backend at all | `9da1604` |
| WS-05 | High | `/workspace/plugins/bank-emi` | EMI banks and plans never reach the server or checkout | `9da1604` |
| WS-06 | High | `/workspace/ai-usage` | 'Pay invoice' marks the invoice paid without collecting money | `9da1604` |
| FIN-01 | High | `/finance/settings` | Finance settings are saved only in the browser and have no effect | `9da1604` |
| PLT-01 | High | `/api/v1/vendors/*` | Any logged-in user can change vendors, vendor portal users and price lists | `52900d9` |
| OTH-01 | High | `/website/settings` | Website catalog settings: Save stores nothing | `52900d9` |
| INV-08 | Medium | `/inventory/warehouses · catalog quick-add` | Custom warehouse types and unit types are kept only in the browser | Masters (Part C) |
