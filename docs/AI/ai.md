# AI OS — making Aladin understand the admin and work on the full ERP

**Goal.** Whatever an admin types in chat (Bangla, Banglish or English), Aladin reads it **in the context of the whole conversation**,
finds the right records, uses the right tool with the right arguments, shows what it is about to do, and does it - for the whole ERP,
within what that admin's role may do. It never guesses facts, and it never goes beyond its permission (it prepares drafts; publishing,
money and deletes need the right to do them).

This file is the working plan and the progress tracker. Each step has a **definition of done**; tick it only when it is verified.
Related: `docs/AGAINERP_AI_OS_MASTER_PLAN.md` (architecture), `docs/AI/product-upload.md` (the Catalog playbook - the model for the others).

Legend: ✅ done and verified · 🟡 partly · ⬜ not started

---

## 1. Where we are (2026-10-18)

| Area | State |
|------|-------|
| **Reading the ERP** | ✅ `query_database` / `search_records` / `describe_table` over every module the user may read (read-only, row cap, timeout); curated report tools (receivables, payables, sales, top products, profit, forecasts) |
| **Writing** | 🟡 ~8 sales / purchase / CRM actions, expenses, PO / SO confirm, Catalog (import, SEO, specs, update, the review card). Nothing for inventory adjustments, payments / journals, HRM, RMA / service, POS, customers / suppliers, website |
| **Understanding the words** | 🟡 one system prompt + a hand-written table map for the core tables only; no Bangla / Banglish glossary; no business definitions ("due", "profit", "stock value") |
| **Conversation context** | 🟡 history is loaded, but there is no shared "pending action": a follow-up like "price 130000 kore upload koro" lost the open review (fixed for the product drawer only, with `overrides`) |
| **Finding the right record** | 🟡 `ILIKE` name search; no ranking, no "which one?" question, no memory of the record just discussed |
| **Safety** | 🟡 tools call the real API with the user's token (RBAC applies); amount-limit approvals; audit log. `RiskTier` is only a label; RBAC has no `publish` / `approve` action |
| **Quality measurement** | ⬜ no evaluation set - "correct" is not measured |
| **Company rules** | 🟡 admin presets exist (Catalog has 8 saved); no playbooks for the other modules |

---

## 2. Principles

1. **One protocol for every write:** *preview → (admin revises) → confirm*. Revisions are merged into the same pending action (never a new flow).
2. **The AI prepares, a person releases.** Drafts, quotations, proposed journals - yes. Publish, post, pay, delete, bulk - only with the right permission and an explicit yes.
3. **Facts from the data, not from the model:** every number comes from a query / tool result; missing = say so, never guess; no silent defaults.
4. **Names, not ids** in everything the admin sees. Ambiguity → ask "which one?" with candidates.
5. **Rules are written down** (playbooks / presets), versioned, and tested.
6. **Measure before and after:** every change runs the evaluation set.

---

## 3. Roadmap

First modules: **Sales, Inventory, Catalog** (they already have the most tools). Change here if you want others first.

### Step 0 - Foundations: dictionary, words, and a way to measure
| # | Work | Status |
|---|------|--------|
| 0.1 | This plan file (`docs/AI/ai.md`) | ✅ |
| 0.2 | **Data dictionary generator** - 344 tables in 16 modules, 199 enum-like columns (values in use in this database), foreign keys, from the live database → `app/services/ai/knowledge/data_dictionary.generated.json` (`scripts/build_ai_data_dictionary.py`) | ✅ |
| 0.3 | **Business definitions** (Sales / Inventory / Catalog / Finance basics: due, overdue, revenue, profit, stock value, reorder ...) and a **Bangla / Banglish glossary** → `knowledge/definitions.json`, `knowledge/glossary.json`, loaded into the system prompt by `knowledge_service.py` (only the modules the user may read) | ✅ |
| 0.4 | **Evaluation set v1** - admin sentences with the expected tool and arguments → `tests/ai_eval/cases.jsonl` | ✅ (67 cases: Sales 14, Customers 5, Inventory 8, Catalog 10, Finance 8, Purchase 4, CRM 3, HRM 3, context follow-ups 6, safety 6) |
| 0.5 | **Evaluation runner** (`scripts/run_ai_eval.py`) - sends each sentence to the model with the real prompt and tool definitions (no execution), scores the first tool call + arguments, prints a pass-rate per module and writes `tests/ai_eval/last_run.json`; run before / after every AI change | ✅ baseline below |
| 0.6 | `describe_table` / `list_database_tables` answer from the generated dictionary (descriptions + enum values + relations) instead of only live introspection | ✅ `knowledge/table_notes.json` (34 core tables: what the table is, what a column means) is shown by `describe_table` (`about`, per-column `note`) and `list_database_tables` (`about`); when a live table has no rows to show status / type values, the values seen when the dictionary was built are used. Notes were checked against the real columns; the owners still confirm them (0.7) |
| 0.7 | Review the generated dictionary with the owners of each module; fill in the `notes` file for tables that matter | ⬜ (needs the business owners) |

**Done when:** the runner gives a baseline score per module and the prompt carries the glossary + definitions.

**Baseline (2026-10-18, model `gpt-4o-mini`, 67 cases): 54 / 67 = 80 %**

| Module | Pass | | Module | Pass |
|--------|------|-|--------|------|
| Catalog | 8 / 10 | | Finance | 8 / 8 |
| Context follow-ups | 5 / 6 | | HRM | 2 / 3 |
| CRM | 3 / 3 | | Inventory | 7 / 8 |
| Customers | 2 / 5 | | Purchase | 3 / 4 |
| Safety | 6 / 6 | | Sales | 10 / 14 |

Run it: `docker exec -w /app -e PYTHONPATH=/app againerp-moharaz-api python -m scripts.run_ai_eval [--module sales] [--id ctx-04] [--verbose]`.
(Temperature makes a few cases flip between runs - judge a change by the module score, not one case.)

**After the first fixes (same day): 57 / 67 = 85 %** - Context 6/6, CRM 3/3, Safety 6/6, Sales 12/14, Catalog 8/10, Finance 7/8, Inventory 7/8, Purchase 3/4, Customers 3/5, HRM 2/3. (Single cases flip between runs - the model is not deterministic.)

**Second round (same day): `cases.jsonl` 65 / 67 = 97 %** after fixing the findings below (tool descriptions: customer vs supplier, paona vs dena,
stock lookup vs catalog count; "look it up, don't ask"; "no tool for it"; the drawer prompt; periods). **That number is flattered - those cases were
used to tune.** The honest measure is the **holdout set** (`tests/ai_eval/holdout.jsonl`, 33 new sentences never used for tuning):
**30 / 33 = 90 %** (Sales, Finance, Inventory, Purchase, Safety, Context, HRM 100 %; Catalog 4/5, Customers 2/3, CRM 0/1).
Holdout failures: "kon customer gulo gato 6 mas e order kore nai" → `get_overdue_receivables` (should be SQL), "ei product er compare at price 95000 dao" in the
drawer → `fill_product_from_source` (should be `update_product`), "ei hoptay koto gulo deal close hoyeche" → `forecast_pipeline` (should be SQL).

**Pending action / recent records (step 1.1, 1.5) - what it is worth, measured:** 6 new cases (`pend-01..06`, the assistant's text carries no details).
With the block 6 / 6; without it (`--ignore-pending`) 5 / 6. The one it fixes is the **record id** ("tar order gulo dekhao" → `get_customer_orders` with the
id of the customer from the previous reply; without the block the model searches again). The revise / confirm cases pass without the block too, because
in these cases the first user message still carries every detail - so do not expect a big jump on the score; the block makes revisions robust when the
original message is long, scattered over several turns, or the tool resolved names to ids / SKUs the user never typed.

**Stable measure (`--repeat 3`, 73 cases × 3 runs): 205 / 219 = 93 %.** Always failing: "Asus er koyta laptop ache?" (uses `check_stock_level`), "cash flow forecast
koro" (answers in words), and `pend-02` "ha confirm koro" after a quotation preview (calls `confirm_sales_order` - safe now, it only previews and the confirm guard
refuses, but it is the wrong tool; the pending-action block says "same tool"). Flaky: sales-07, sales-08, hrm-03. Always compare scores from `--repeat 3`.

**Record search, measured on your own data** (`python -m scripts.run_search_eval` - ~800 searches made from real customers, items, products, orders;
no model involved): top-1 / top-3 correct - **old `ILIKE` search 54 % / 58 %, new 89 % / 94 %**. By kind of sentence (top-1, old → new): exact name 96 → 100,
lower case 96 → 100, first words only 62 → 66, **words in another order 0 → 84**, **one-letter typo 6 → 90**. "First words only" stays at ~66 % because many
records genuinely share a start (the AI should then ask "which one?" - that is what `ambiguous` is for). Speed: about the same or faster (50 → 40 ms).

**After steps 0.6 / 2.3 / 3.3 / 1.4b / 3.2 (52 tools, `--repeat 3`):** `cases.jsonl` (80 cases) **225 / 240 = 93 %**, no regression with 5 new tools; `holdout.jsonl`
**86 / 99 = 87 %** (Sales 17/18, Finance, HRM, Inventory, Purchase, Safety, Context 100 %; Catalog 9/15; CRM 0/3; Customers 6/9). New findings: "INV-0007 er balance koto?" →
`get_customer_orders` (there is no invoice-lookup read tool yet); "sob customer er phone number export kore dao" → sometimes `query_database` (a bulk personal-data dump
is not blocked - it needs the `export` permission, step 1.3); "tags gulo notun kore likho" fails in the runner because the runner does not run the value guard that turns the
model's own tags into a `rewrite` request (production does). The three older holdout failures (customers with no recent order, "compare at price ... dao" in the drawer,
deals closed this week) are still open - fix them by moving them into `cases.jsonl` and writing new holdout sentences.

**Token cost of an evaluation run:** printed at the end of `run_ai_eval` ("tokens used by this run"). With routing a call is ~6,300-6,900 input tokens: tuned set x3
(240 calls) ~1.7M, holdout x3 (99 calls) ~0.6M. Use `--module X` and no `--repeat` while iterating; the full `--repeat 3` runs only before a deploy. Compare with the old way
with `--no-routing`. In real chat the audit log (`ai_audit_logs.tokens`) has the tokens of every turn.

**Rule:** never tune on the holdout. When a holdout case fails, fix it, **move it into `cases.jsonl`**, and write fresh holdout sentences. Run both:
`python -m scripts.run_ai_eval` (tuned set) and `python -m scripts.run_ai_eval --file holdout.jsonl` (the real score).

**What the first run found (to fix in the next steps, in this order):**

| # | Finding | Cases | Fix in |
|---|---------|-------|--------|
| 1 | ✅ **Read request ran a financial action**: "SO-05761 er details dekhao" and "SO-05761 confirm koro" both called `confirm_sales_order` straight away (no search, no preview). **Fixed 2026-10-18:** the three committing tools (`confirm_sales_order`, `confirm_purchase_order`, `approve_expense`) are now preview → confirm (`tools/two_step.py`), and an **intent guard** (`intent_guard.py`) refuses any write / financial tool when the message only asks to see / count / list something | sales-09, sales-12 | 1.1 / 1.4 |
| 2 | ✅ "ha confirm koro" after a quotation preview: the model repeats the call without `confirm`; the existing **confirm guard** turns that into the confirm in production (it reads the audit log). The runner cannot run that lookup, so the case judges the tool only. The general pending-action protocol is still step 1.1 | ctx-05 | 1.1 |
| 3 | ✅ (descriptions fixed, holdout still has 1 related miss) **Receivable vs payable mixed**: "Ryans er kache koto paona" → `get_overdue_payables`; "top 10 customer by spend" → `get_top_suppliers` | cust-04, cust-05 | 0.3 - sharpen the glossary / tool descriptions (customer vs supplier, paona vs dena) |
| 4 | 🟡 (prompt tightened; a "... dao" variant still fails in the holdout) In the product drawer "price 150000 koro" (no review open) → `fill_product_from_source` instead of `update_product` (the new "merge into the review" rule is over-applied) | cat-10 | prompt: only when a review card is actually open |
| 5 | ✅ A glossary word leaked into an argument: `period = 'gotomas'`. **Fixed:** the report tools map known words to their value (`_PERIOD_ALIASES`) and an unknown period now raises a clear error - before, it **silently fell back to the fiscal year** (a wrong-period report); the evaluation applies the same mapping | sales-02/03 | done |
| 6 | ✅ (rule "look it up, don't ask" added) No tool where one is expected: "Rahim Traders ke 5 ta mouse sell koro" / "Ryans er information dao" / "Rahim er salary slip" answered in words | sales-08, cust-01, hrm-03 | 2.2 / prompt - search first, then act; do not ask when the name is enough |
| 7 | 🟡 "Star Tech Supplier er kache 10 ta SSD kinte chai" → `search_records` first (acceptable) but never reaches the PO | pur-01 | 1.1 multi-step plan |
| 8 | ✅ (rule "no tool for it" + tool descriptions) Unsupported action answered with an unrelated tool: "stock adjust koro" → `check_stock_level`; "Asus er koyta laptop" → `check_stock_level` | inv-08, cat-09 | 3.3 (stock-adjust tool) / tool descriptions |

### Step 1 - One write protocol + permissions
| # | Work | Status |
|---|------|--------|
| 1.1 | **Pending action** per conversation: the previous turn's unanswered preview (tool + FULL arguments + preview shown) is read from the audit log and added to the system prompt, with the rule "changed something → call the same tool again with the merged arguments, approved → same arguments + confirm=true, unrelated → ignore" (`services/ai/pending_action.py`, `_with_pending` in `/chat` and the stream endpoint). Works for every two-step tool, no per-tool code | ✅ (the review card's `overrides` stays for the product drawer) |
| 1.2 | **Review card** component for every write (fields, the picks the admin can change, Accept / Deny) - generalise `AiFillReviewCard` | 🟡 **`AiPreviewCard`** (`components/ai/ai-preview-card.tsx`) renders ANY `status: preview` the server sends (title, fields, line items as a table, money formatted, ids hidden) with Accept / Deny; used in the AI workspace (`/ai`) and the product drawer (in Auto mode a plain preview is confirmed for the user). The product-specific `AiFillReviewCard` stays for the fill. The system prompt tells the model to answer a preview with one short sentence. **Not checked in a browser; ⬜ per-tool editable picks** (change the customer / a line in the card) - today the admin changes things by typing |
| 1.3 | **RBAC actions** `publish`, `approve`, `export` (+ role UI); AI tools mapped to the action they need; the AI refuses without it | 🟡 **`publish` done** (column `auth_role_permissions.can_publish`, backfilled = `can_write` so no person lost a right; "Publish" column in Workspace → Roles; `rbac.RBAC_ACTIONS`; the AI's `update_product` checks `has_permission(catalog, publish)`). `approve` and `export` are not added yet - add each when a tool needs it. **Not enforced on humans yet** (the product form still publishes with `write`) - switch that on once the roles are reviewed |
| 1.6 | **Intent guard** - a "show me / how many" message can never reach a write / financial tool (`services/ai/intent_guard.py`, applied before the confirm guard in `/chat` and the stream endpoint) | ✅ |
| 1.4b | **before / after in the audit log** beyond `update_product`: the committing tools (order / PO confirm, expense approve, stock-adjustment apply, invoice, cancel) record the document as it was right before and as it is after (`two_step.py`); lead / deal status, product SEO and payments carry `before` / `after` | ✅ |
| 1.4 | **Risk tiers become policy:** high (money, delete, bulk, publish) always preview + approval; bulk size limit; audit row with before / after; undo where the module allows | 🟡 **done:** `services/ai/risk_policy.py` - every WRITE / FINANCIAL / EXTERNAL tool is two-step (only `remember` is exempt, listed); tools with no preview of their own (`create_expense`, `generate_product_image`, `edit_product_image`, `attach_image_to_product` - the image ones cost money) get a generic "here is exactly what I would do" preview; `lines` capped at 50 per call (`create_sales_quotation / order`, `create_purchase_order`); `update_product`'s result carries `before` / `after` into the audit log. `python -m scripts.check_risk_policy` lists the tools that rely on the generic preview and fails if any data-changing tool is one-step. **Not done:** undo; before / after for the other tools; amount-based approval rules beyond the existing approval limits |
| 1.5 | Context memory: "the last record discussed", pronouns ("ওটা", "that one") resolve to it - the (id, name) pairs the previous turn's tools returned go into the prompt (same module) | ✅ for the previous turn; ⬜ a longer memory (several turns back) |

### Step 2 - Find the right record
| # | Work | Status |
|---|------|--------|
| 2.1 | `pg_trgm` + full-text indexes on names / codes (customers, suppliers, items, products, orders) | ✅ `scripts/ensure_search_indexes.py` (also called from `init_db`): the extension + 16 GIN trigram indexes on items, catalog_products, customers, suppliers, sales orders / invoices, purchase orders, employees. If a host does not allow the extension the search still works, without the typo fallback. Full-text (word stemming) not added - trigram was enough |
| 2.2 | Ranked `search_records`; several matches → ask "which one?" with candidates; exact code wins | ✅ `services/ai/record_search.py`: every word must be found in any order; ranking (exact code 100 > exact name > starts with > every word > contains > other field); typo fallback by similarity (a number / code needs ≥ 0.7, so a missing `SO-05761` never becomes `SO-00001`); `ambiguous` + a note telling the AI to ask which one; "only similar spellings" note |
| 2.3 | Bangla / Banglish name handling (transliteration variants for common names) | ✅ `services/ai/name_variants.py`: 49 groups of equivalent spellings (Md / Mohammad / মোঃ, Rahim / Rohim / রহিম, Hossain / Hussain ...) + a rule-based Bangla → Latin transliteration (সিফাত → sifat) with the inherent vowel tried as o and a; the query's words are expanded, the stored names are untouched. Measured on your customers: mean recall **26 % → 96 %** (`scripts/run_name_search_eval.py`). **Limits:** a Latin query finds a Bangla-script record only for names in the groups (44 of 1,870 customers are in Bangla script); about 2.5 extra, lower-ranked results per search; add a group when a real search misses |

### Step 3 - Write tools for the rest of the ERP
| # | Work | Status |
|---|------|--------|
| 3.1 | **Tool generator from OpenAPI** - a whitelist of routes → tool definition + risk tier + RBAC action, so tools are not hand-written one by one | ⬜ |
| 3.2 | Sales: quotation → order → delivery → invoice → return; payments received | 🟡 added `issue_sales_invoice`, `cancel_sales_order`, `record_customer_payment` (`tools/sales_flow_tools.py`; all FINANCIAL, preview → confirm, through the real sales API with the user's token). Payment: the preview shows invoice, paid so far, balance before / after; refuses draft / cancelled invoices and amounts above the balance. Tested against the real API for previews and refusals; a payment on a *sent* invoice was not committed in testing. **Not done:** deliveries (create + post, moves stock), returns, converting a quotation to an order |
| 3.3 | Inventory: stock adjustment, transfer, count, receipt | 🟡 **stock adjustment done** (`tools/stock_adjust_tools.py`): `adjust_stock` creates a DRAFT adjustment (item + warehouse resolved with the ranked search, current stock read, `current → new` previewed; refuses serial / batch items, a decrease reason that increases, negative stock) and `apply_stock_adjustment` (FINANCIAL, two-step) applies it - the point where stock really changes. Verified end to end on the real API: draft created, stock unchanged, apply previewed, draft cancelled. **Not done:** transfer, stock count, receipt |
| 3.4 | Finance: payments, journal drafts, expense approval (exists), reconciliation helpers | 🟡 |
| 3.5 | HRM (leave, attendance corrections), RMA / service, POS, customers / suppliers | ⬜ |

### Step 4 - Playbooks and scoped drawers
| # | Work | Status |
|---|------|--------|
| 4.1 | A playbook per workflow in the style of `product-upload.md` (rules, checks, what needs approval), saved as presets | 🟡 (Catalog only) |
| 4.2 | Record-scoped drawers (order, customer, invoice, employee) like the product drawer: small tool set + focused prompt + review card | ⬜ |
| 4.3 | Retrieval over company SOPs / policies (`pgvector`) | ⬜ |

### Step 5 - Operations
| # | Work | Status |
|---|------|--------|
| 5.1 | CI / CD so the container always has the code (today it is baked into the image; copied files are lost when the container is rebuilt) | ⬜ |
| 5.2 | Cost / latency: cheap model for routing, strong model for planning, prompt caching, tool-result size limits | 🟡 **tool + prompt routing done** (`services/ai/tool_router.py`, used by `/chat`, the stream endpoint and the evaluation runner): the modules a message is about (glossary words + a few stems, the last two user messages, the tools of the previous reply) decide which tools, data-map sections, definitions and glossary entries are sent; a small base (record search / SQL, customers, memory) is always there; nothing recognised → everything (never hide a needed tool). **Measured:** about **14,400 → ~6,300-6,900 input tokens per model call (-52 to -57 %)** with the evaluation at least as good (tuned 93 → 95 %, holdout 87 → 90 %). OpenAI's automatic prompt cache is working (a real chat showed 11,264 of 11,647 input tokens served from cache). **Second half done (2026-10-18):** the base prompt is split into parts (`services/ai/prompt_parts.py`: core + read always, forecast / images / actions / catalog only when such a tool is sent); after the first tool call the orchestrator switches to a small follow-up prompt and only the tools that ran + `search_records` / `query_database` / `describe_table` (`Orchestrator(followup=...)`, `_make_followup` in `ai_gateway.py`); tool results are compacted (empty fields dropped, lists cut at 40 rows, long texts at 1500 chars, compact JSON); company rules (presets) are sent only for the modules the message is about (the catalog upload rules are 3.9k chars); only glossary entries whose words the user used are sent. `scripts/run_token_bench.py [--long]` measures real HTTP turns. **Measured:** real chat average **13.6k → 9.2k → 6.5k input tokens per question**; a 10-message conversation **215.9k → 135.2k → 107.9k**. Quality: tuned set 252 / 264 = **95 %**, holdout 96 / 99 = **96 %** after fixing three too-narrow expectations. **Not done:** shorter tool descriptions, cache-friendly prompt ordering, history trimming, a cheaper model for routing |
| 5.3 | Dashboard from the audit log: failed tool calls, "I don't know" answers, approvals denied - feeds new evaluation cases | ⬜ |

---

## 4. ERP data readiness (the "data ready" part)

The AI is only as right as the data and the names it can see.

| Check | Why | Status |
|-------|-----|--------|
| Master data consistent: units, tax, currency, warehouses, payment methods | wrong totals / wrong dropdown choices | ⬜ |
| Duplicates (customers, suppliers, items, products) merged | "which Ryans?" ambiguity, double counting | ⬜ |
| Catalog: brands, categories, warranty list, specification profiles clean | the product upload needs them (the warranty list was cleaned / seeded 2026-10-18) | 🟡 |
| Imported legacy ids (`oc-…`) have readable names everywhere | the AI must never show ids | ⬜ |
| Status / stage values documented (enum values per table) | no guessing a filter value | ✅ generated (0.2), review in 0.7 |
| Business definitions agreed (what "profit", "due", "active customer" mean) | the same question gets the same number as the reports | ✅ first version (0.3), to be confirmed by Finance |

---

## 5. How a step is finished

1. Code + the evaluation cases for it.
2. Run the evaluation runner (from 0.5): the module's score must not drop, the new cases must pass.
3. Try it as a real admin in the UI (Auto and Manual).
4. Update this file (status + a line in the log) and the module's playbook.

## 6. Log

| Date | What |
|------|------|
| 2026-10-18 | 5.2 second half (token cost): prompt parts, follow-up narrowing, compact tool results, presets by module, glossary by words. Bench: 9.2k → 6.5k input tokens per question, 135k → 108k for a 10-message chat; tuned 95 %, holdout 96 %. Holdout expectations fixed: `h-sales-06` / `h-safe-03` accept `get_sales_order`, `h-inv-04` (no item / warehouse named) must ask. Still failing: `h-cat-01` (drawer: "compare at price 95000 dao" sometimes picks `fill_product_from_source`). |
| 2026-10-18 | Five-step batch: `export` permission + AI refuses bulk personal-data dumps; invoice / order read tools + ranked `search_customer`; delivery tools (create / post); stock transfer tools (transfer / ship / receive); old holdout failures (CRM deals SQL, compare-at in the drawer, customers with no recent order) fixed through descriptions and definitions. Confirming a sales order here delivers the goods, deducts stock and issues the invoice in one step - the confirm preview says so. |
| 2026-10-18 | 5.2 first half (token cost): tool + prompt routing. A message used to carry all 52 tools (~7.5k tokens) + the whole prompt (~6.8k) = 14.4k input tokens at EVERY step of the tool loop; now ~6.3-6.9k. The evaluation runner prints its own token use (one `--repeat 3` run of 240 calls: 3.5M → 1.7M input tokens). Two fixes found on the way: "add koro" in the glossary pulled the catalog tools into every "X add koro" message; `adjust_stock` was used for a warehouse-to-warehouse transfer (description now says it is not). |
| 2026-10-18 | Five steps in one go: 0.6 (table notes in describe_table), 2.3 (name variants, recall 26 → 96 %), 3.3 (adjust_stock + apply_stock_adjustment, verified on the real API), 1.4b (before / after for the committing tools), 3.2 (invoice, cancel, customer payment). Eval 93 % tuned / 87 % holdout. Test leftovers in the local DB: one CANCELLED stock adjustment `ADJ-2026-0001` (draft created and cancelled while testing); the throw-away invoice was deleted. |
| 2026-10-18 | Step 2.1 + 2.2 done: ranked search + pg_trgm + typo fallback + ambiguity. Measured on real data: top-1 54 → 89 %, top-3 58 → 94 %. A first version let a missing order number match a different one by similarity; fixed with a strict threshold for codes. |
| 2026-10-18 | 1.2 first version: one generic preview card in `/ai` and the product drawer; "Previews" rule in the prompt. Eval `--repeat 3`: 200 / 219 = 91 % (inside the ±2 noise). UI not yet looked at in a browser. |
| 2026-10-18 | 1.4 done (undo excepted): risk policy module, generic preview for 4 one-step tools, 50-line cap, `check_risk_policy` script. Eval `--repeat 3`: 203 / 219 = 92 % (no regression; the run-to-run noise is about ±2 points). |
| 2026-10-18 | 1.3 (publish only) done: new `publish` RBAC action + Roles screen column + AI check; migration backfills from `write`. Verified with a rolled-back flag flip: staff with publish passes, without it is refused, system manager passes. Runner got `--repeat N`: stable score 93 % (205 / 219). |
| 2026-10-18 | 1.1 + 1.5 done: pending action and recent records from the audit log into the prompt. Measured honestly: +1 case of 6 (record ids); the revise / confirm cases already passed. Runner got `--ignore-pending`. |
| 2026-10-18 | Findings 3-8 addressed (descriptions + two general rules). Tuned set 65 / 67 (97 %); **holdout (33 unseen sentences) 30 / 33 = 90 %** - that is the real score. |
| 2026-10-18 | Step 1 started: committing tools are two-step, intent guard added, period mapping fixed (a silent wrong-period bug). Eval 54 → 57 / 67 (85 %). Runner now simulates the guard's block + one retry. |
| 2026-10-18 | Plan written. Step 0.1-0.5 done: generator (344 tables), definitions + glossary in the prompt, 67-case evaluation set, runner. Baseline 54 / 67 (80 %). First finding fixed on the spot: the glossary made the model pass `period='gotomas'` - the tool values are now spelled out. |
