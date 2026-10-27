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
| Inventory | 0 | 5 | 10 | 5 |
| Workspace | 0 | 3 | 8 | 6 |
| Finance | 0 | 5 | 9 | 1 |
| Platform | 0 | 2 | 1 | 1 |
| Other modules | 0 | 1 | 1 | 1 |
| **All** | **0** | **16** | **29** | **14** |

There are no open High findings.

## 3. Changelog

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

## 5. Open findings

### Inventory

| ID | Severity | Type | Page | Problem | Where |
|---|---|---|---|---|---|
| INV-06 | Medium | Broken link | `/inventory/dashboard → /inventory/stock` | **The 'Low stock' and 'Out of stock' tiles open the unfiltered stock list.** The dashboard links to /inventory/stock?status=low_stock and ?status=out_of_stock, but neither the stock page nor the stock grid reads search params. Filters always start at 'all'. | `app/(admin)/inventory/dashboard/page.tsx:232,233,289 · app/(admin)/inventory/stock/page.tsx:20` |
| INV-07 | Medium | API/Data | `/inventory/purchase/receipts · /returns` | **Purchase receipts and returns stop at 50 rows.** fetchPurchaseReceipts() and fetchPurchaseReturns() send no page or per_page, so the backend default of 50 applies. The page has no paging, so older documents never appear. | `lib/api/purchase-receipts.ts:96 · lib/api/purchase-returns.ts:118 · routers/purchase_receipts.py:38` |
| INV-08 | Medium | Dummy | `/inventory/warehouses · catalog quick-add` | **Custom warehouse types and unit types are kept only in the browser.** Custom types are saved to each user's localStorage, so other users and devices never see them. | `lib/inventory/warehouse-type-options.ts:3,22,38 · lib/inventory/unit-types.ts:21` |
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
