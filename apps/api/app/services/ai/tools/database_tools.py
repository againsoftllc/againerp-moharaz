"""Read-only database access for the AI — the "ask anything about our data" layer.

Curated tools (customers, stock, finance reports, sales summary) stay the first choice: they
encode business rules. For everything else — any module, any table — the model can orient
itself with the ERP data map, search for a record by name, browse the schema
(`list_database_tables`, `describe_table`) and run a guarded `query_database`:

- SELECT / WITH only, single statement — anything else is rejected before it reaches Postgres.
- Executed inside a `READ ONLY` transaction with a statement timeout and a hard row cap, so a
  bad query can neither change data nor hang the API.
- Auth, session, plugin-credential and secret-bearing tables/columns are invisible: not listed,
  not describable, and any SQL that names them is refused.
- **Permission-scoped, per table.** Every table belongs to an RBAC module (sales, purchase,
  hrm, finance, …). A user only sees, describes or queries tables of modules they can *read*;
  system managers see every business table. So the AI can answer questions about the whole
  ERP for an admin, and exactly the user's own modules for everyone else — never more than the
  person asking could open in the UI themselves.
"""

from __future__ import annotations

import re
import time
from decimal import Decimal
from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.ai.orchestrator import OrchestratorTool, RiskTier
from app.services.ai.providers.base import AIToolDefinition

MAX_ROWS = 200
STATEMENT_TIMEOUT_MS = 8000

BLOCKED_TABLE_PATTERNS = (
    r"^auth_", r"_sessions$", r"^super_admin_", r"^plugin_", r"^ai_api_connections$",
    r"^storefront_otp_challenges$", r"^storefront_customer_identities$", r"^platform_settings$",
    r"^supplier_users$", r"^vendor_users$", r"^alembic_version$", r"^ephemeral_blobs$",
)
BLOCKED_COLUMN_RE = re.compile(r"password|secret|token|api_key|apikey|_hash\b|private_key|\botp\b|pin_hash", re.I)
FORBIDDEN_SQL_RE = re.compile(
    r"\b(insert|update|delete|drop|alter|truncate|grant|revoke|create|copy|vacuum|analyze|lock|call|do|execute|merge|refresh|reindex|cluster|comment|security|set|reset|listen|notify|pg_sleep|pg_read_file|pg_ls_dir|lo_import|lo_export|dblink|current_setting|set_config)\b",
    re.I,
)

# Table name pattern → RBAC module(s). First match wins; a tuple means "readable with any of
# these". Tables matching nothing are only available to system managers.
TABLE_MODULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    (r"^(sales_|invoices$|invoice_items$|customer_item_prices$)", ("sales",)),
    (r"^(parties$|party_)", ("customers", "purchase")),
    (r"^(commerce_customer|commerce_order|storefront_)", ("customers",)),
    (r"^(commerce_suppliers$|supplier_|purchase_|vendors$|vendor_)", ("purchase",)),
    (r"^(inventory_|items$|manufacturing_items$)", ("inventory",)),
    (r"^(catalog_|ecommerce_item|configurator_)", ("catalog",)),
    (r"^(crm_|collab_)", ("crm",)),
    (r"^(hrm_|zkteco_)", ("hrm",)),
    (r"^(finance_|(bkash|stripe|paypal|sslcommerz)_payments$)", ("finance",)),
    (r"^pos_", ("pos",)),
    (r"^rma_", ("rma",)),
    (r"^service_", ("service",)),
    (r"^blog_", ("blog",)),
    (r"^(website_|seo_|marketing_|workspace_sites$)", ("website",)),
    (r"^media$", ("media",)),
    (r"^provider_", ("dropshipping",)),
    (r"^(companies$|core_sequences$|approval_limits$|subscription_plans$|ai_)", ("workspace",)),
)

MODULE_LABELS = {
    "sales": "Sales — orders, quotations, invoices, deliveries, returns",
    "customers": "Customers — customer master, online (storefront) orders, partner ledger",
    "purchase": "Purchase — suppliers/vendors, purchase orders, receipts, supplier bills",
    "inventory": "Inventory — items, stock levels per warehouse, stock movements, transfers",
    "catalog": "Catalog — products, categories, brands, attributes",
    "crm": "CRM — leads, deals, projects, tasks, tickets, time entries",
    "hrm": "HR — employees, attendance, leave, payroll, recruitment, assets",
    "finance": "Finance — chart of accounts, journal, receivables (AR), payables (AP), payments, expenses",
    "pos": "Point of sale — sessions, receipts, payments, returns",
    "rma": "Returns (RMA)",
    "service": "Service jobs / repairs",
    "blog": "Blog",
    "website": "Website, SEO, marketing",
    "media": "Media library",
    "dropshipping": "Dropshipping / supplier imports",
    "workspace": "Workspace — companies, sequences, AI usage",
}

# Curated column hints for the tables people actually ask about. Goes into the system prompt
# (filtered by what the user may read) so the model can write a correct query first time.
CORE_TABLE_HINTS: dict[str, list[str]] = {
    "sales": [
        "sales_orders(order_number, customer_id→commerce_customers.id, warehouse_id, status[draft|confirmed|processing|completed|cancelled], delivery_status, order_date, subtotal, tax_total, discount_total, total, invoice_number, invoiced_at, sales_rep, created_at)",
        "sales_order_lines(sales_order_id, item_id, sku, name, quantity_ordered, quantity_delivered, quantity_returned, unit_price, discount_amount, line_total)",
        "sales_invoices(invoice_number, customer_id, status, bill_date, due_date, subtotal, tax_total, total)",
        "sales_quotations(quotation_number, customer_id, status, quote_date, valid_until, total, sales_order_id)",
        "sales_deliveries(delivery_number, sales_order_id, customer_id, status, delivery_date)",
        "sales_returns(return_number, sales_order_id, customer_id, status, reason, return_date, credit_amount)",
    ],
    "customers": [
        "commerce_customers(customer_code, name, phone, email, \"group\", status, loyalty_tier, city, total_orders, total_spend, avg_order_value, last_order_date, credit_limit, party_id)",
        "commerce_orders — online/storefront orders (order_number, order_date, status, payment_status, shipment_status, customer_id, customer_name, grand_total, paid_amount, due_amount, courier)",
        "parties(display_name, legal_name, type[customer|vendor|both], status) — shared partner master behind customers and suppliers",
    ],
    "purchase": [
        "commerce_suppliers(vendor_code, name, email, phone, payment_terms, status, spend_ytd, open_pos, rating, party_id)",
        "purchase_orders(po_number, supplier_id→commerce_suppliers.id, warehouse_id, status[draft|confirmed|partial_received|completed|cancelled], order_date, expected_date, subtotal, tax_total, total, buyer_name)",
        "purchase_order_lines(purchase_order_id, item_id, sku, name, quantity_ordered, quantity_received, quantity_returned, unit_cost, line_total)",
        "purchase_receipts(receipt_number, purchase_order_id, supplier_id, warehouse_id, status, receipt_date)",
        "purchase_bills(bill_number, vendor_invoice_number, supplier_id, purchase_order_id, bill_date, due_date, status, match_status, subtotal, total)",
        "vendors — B2B dealer/vendor portal accounts (vendor_code, display_name, company_name, status, vendor_type_id, vendor_group_id, credit_limit, payment_terms, last_order_date)",
    ],
    "inventory": [
        "items(sku, barcode, name, item_type, status) — item master",
        "inventory_stock_levels(item_id, product_id, sku, name, warehouse_id, on_hand, reserved, incoming, min_qty, reorder_level, unit_cost, status) — stock value = sum(on_hand * unit_cost) from here, not from catalog prices",
        "inventory_stock_movements(item_id, warehouse_id, movement_type, quantity, qty_before, qty_after, reference, source_type, unit_cost, created_at)",
        "inventory_warehouses(code, name, type, city, is_active, is_default)",
        "inventory_stock_transfers / inventory_stock_adjustments / inventory_stock_counts (header + *_lines)",
    ],
    "catalog": [
        "catalog_products(name, sku, price, compare_at_price, purchase_price, stock, stock_status, status, brand, category, brand_id, category_id, item_id)",
        "catalog_categories(name), catalog_brands(name), catalog_product_variants(product_id, sku, price)",
    ],
    "crm": [
        "crm_leads(name, company_name, email, phone, source, status, estimated_value, lead_score, owner_id, next_follow_up_at, created_at)",
        "crm_deals(title, lead_id, customer_id, stage, value, probability, expected_close_date, owner_id, closed_at)",
        "crm_projects(name, customer_id, deal_id, status, start_date, due_date, budget, owner_id)",
        "crm_tasks(title, project_id, status[todo|in_progress|done], priority, due_date, assignee_id, completed_at, total_time_seconds)",
        "crm_tickets(ticket_number, subject, customer_id, category, priority, status, assignee_id)",
    ],
    "hrm": [
        "hrm_employees(employee_code, name, email, phone, gender, branch_id→hrm_branches.id, department_id→hrm_departments.id, designation_id→hrm_designations.id, reporting_to, date_of_joining, base_salary, employment_type, employee_status[active|…])",
        "hrm_departments(name, branch_id), hrm_designations(name), hrm_branches(name)",
        "hrm_attendance_records(employee_id, date, clock_in, clock_out, total_hours, overtime_hours, is_late, is_absent, status)",
        "hrm_leave_applications(employee_id, leave_type_id, start_date, end_date, total_days, status), hrm_leave_balances, hrm_leave_types(name)",
        "hrm_payroll_runs(title, pay_period_start, pay_period_end, pay_date, total_gross_pay, total_deductions, total_net_pay, employee_count, status), hrm_payroll_entries, hrm_payslips(employee_id, payslip_number, pay_date, status)",
        "hrm_job_postings, hrm_candidates, hrm_interviews, hrm_assets, hrm_holidays, hrm_announcements",
    ],
    "finance": [
        "finance_accounts(code, name, account_type, parent_id, is_active) — chart of accounts",
        "finance_journal_entries(entry_number, entry_date, description, source_type, source_id, status) + finance_journal_lines(journal_entry_id, account_id, debit, credit, party_type, party_id)",
        "finance_receivables(invoice_number, customer_id, amount, amount_paid, balance, due_date, status) — AR; overdue = balance > 0 and due_date < today",
        "finance_payables(reference_number, supplier_id, amount, amount_paid, balance, due_date, status) — AP",
        "finance_payments(payment_number, payment_date, amount, direction[in|out], payment_method, party_type, party_id, payment_account_id)",
        "finance_expenses(expense_number, category_id, payee, expense_date, amount, tax_amount, total, status, payment_method)",
    ],
    "pos": [
        "pos_sessions(register_name, cashier_name, warehouse_id, status, opening_float, closing_cash, expected_cash, cash_variance, total_sales, total_returns, sale_count, opened_at, closed_at)",
        "pos_receipts(receipt_number, session_id, sales_order_id, invoice_number, created_at), pos_payments, pos_returns",
    ],
    "rma": ["rma_tickets(rma_number, customer_name, order_number, product_name, sku, rma_type, status, priority, resolution_type, warranty_status, total, created_at, closed_at)"],
    "service": ["service_jobs(job_number, status, service_type, customer_name, product_name, sku, technician_name, priority, labour_total, parts_total, total, created_at, completed_at)"],
    "website": ["website_pages, website_contact_submissions, seo_url_records, marketing_campaigns, marketing_coupons"],
    "blog": ["blog_posts(title, status, created_at), blog_categories(name)"],
    "media": ["media(file_name, mime_type, size, created_at)"],
    "dropshipping": ["provider_import_jobs, provider_import_items, supplier_products, supplier_price_lists"],
    "workspace": ["companies(name), core_sequences(prefix, next_number)"],
}


def _blocked_table(name: str) -> bool:
    return any(re.search(p, name) for p in BLOCKED_TABLE_PATTERNS)


def table_modules(name: str) -> tuple[str, ...]:
    for pattern, modules in TABLE_MODULES:
        if re.search(pattern, name):
            return modules
    return ()


def _jsonable(v: Any) -> Any:
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    if isinstance(v, (bytes, bytearray)):
        return "<binary>"
    return v


class _Access:
    """What the calling user may read, resolved once per request."""

    def __init__(self, db: Optional[Session], user: Any):
        self.db = db
        self.user = user
        self.is_admin = False
        self.modules: set[str] = set()
        if db is None or user is None:
            return
        role = str(getattr(user, "role", "") or "").lower()
        try:
            from app.services import rbac as rbac_service

            if role in ("admin", "system_manager") or rbac_service.is_system_manager(db, user):
                self.is_admin = True
                self.modules = set(rbac_service.RBAC_MODULES)
                return
            perms = rbac_service.user_permissions(db, user)
            self.modules = {m for m, actions in perms.items() if "read" in actions}
        except Exception:
            self.is_admin = role in ("admin", "system_manager")
            self.modules = set()

    def can_read_table(self, name: str) -> bool:
        if _blocked_table(name):
            return False
        if self.is_admin:
            return True
        mods = table_modules(name)
        return bool(mods) and any(m in self.modules for m in mods)

    def readable_modules(self) -> list[str]:
        return [m for m in MODULE_LABELS if self.is_admin or m in self.modules]


def data_map_text(db: Optional[Session], user: Any) -> str:
    """The ERP data map for the system prompt — modules and key tables this user may read."""
    access = _Access(db, user)
    mods = access.readable_modules()
    if not mods:
        return ""
    lines = ["# ERP data map (tables you may query; columns in parentheses)"]
    for m in mods:
        lines.append(f"## {m}: {MODULE_LABELS[m]}")
        for hint in CORE_TABLE_HINTS.get(m, []):
            lines.append(f"- {hint}")
    lines.append(
        "Conventions: every business table has id, company_id, created_at, updated_at; foreign keys end in _id; "
        "money is numeric in BDT; dates are timestamps. More tables exist per module — list_database_tables shows them.\n"
        "Rules: never show raw ids to the user — join to the name table (department_id→hrm_departments.name, "
        "customer_id→commerce_customers.name, supplier_id→commerce_suppliers.name, item_id→items.name, "
        "warehouse_id→inventory_warehouses.name, owner_id/assignee_id→auth user name is unavailable, say 'user <id>'). "
        "When filtering by a status/stage/type value not listed above, check describe_table's enum_like_values first "
        "instead of guessing. Group-by results should be labelled with names, not ids."
    )
    return "\n".join(lines)


def build_database_tools(*, db: Session | None, company_id: str | None, user: Any | None) -> list[OrchestratorTool]:
    access = _Access(db, user)
    _known_tables: dict[str, tuple[str, ...]] = {}

    def _conn():
        return db.get_bind().connect()  # type: ignore[union-attr]

    def _tables() -> dict[str, tuple[str, ...]]:
        """{table: modules} for every public table, fetched once per request."""
        if _known_tables:
            return _known_tables
        with _conn() as conn:
            rows = conn.execute(
                text(
                    "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace "
                    "where n.nspname = 'public' and c.relkind = 'r'"
                )
            ).all()
        for (name,) in rows:
            _known_tables[name] = table_modules(name)
        return _known_tables

    def _denied(table: str) -> dict:
        mods = table_modules(table)
        need = " or ".join(mods) if mods else "system manager"
        return {"error": f"You do not have read access to '{table}' (needs {need} permission). Ask about data in your own modules instead."}

    def list_database_tables(inp: dict) -> dict:
        if db is None:
            return {"error": "Database browsing is unavailable."}
        search = str(inp.get("search") or "").strip().lower()
        with _conn() as conn:
            rows = conn.execute(
                text(
                    """
                    select c.relname as table_name, greatest(c.reltuples::bigint, 0) as approx_rows
                    from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relkind = 'r'
                    order by c.relname
                    """
                )
            ).all()
        grouped: dict[str, list[dict]] = {}
        hidden = 0
        for name, approx in rows:
            if not access.can_read_table(name):
                if not _blocked_table(name):
                    hidden += 1
                continue
            mods = table_modules(name)
            module = mods[0] if mods else "other"
            label = MODULE_LABELS.get(module, "Other")
            if search and search not in name.lower() and search not in module and search not in label.lower():
                continue
            grouped.setdefault(module, []).append({"table": name, "approx_rows": int(approx)})
        return {
            "company_id": company_id,
            "modules": {m: {"label": MODULE_LABELS.get(m, "Other"), "tables": t} for m, t in grouped.items()},
            "table_count": sum(len(t) for t in grouped.values()),
            "hidden_by_permissions": hidden,
            "note": f"Always filter company_id = '{company_id}'. Call describe_table before querying a table you have not seen.",
        }

    def describe_table(inp: dict) -> dict:
        if db is None:
            return {"error": "Database browsing is unavailable."}
        table = str(inp.get("table") or "").strip()
        if not re.fullmatch(r"[a-z0-9_]+", table) or _blocked_table(table):
            return {"error": f"Table '{table}' is not available."}
        if not access.can_read_table(table):
            return _denied(table)
        with _conn() as conn:
            cols = conn.execute(
                text(
                    """
                    select column_name, data_type, is_nullable, column_default
                    from information_schema.columns
                    where table_schema = 'public' and table_name = :t
                    order by ordinal_position
                    """
                ),
                {"t": table},
            ).all()
            if not cols:
                return {"error": f"Table '{table}' does not exist."}
            fks = conn.execute(
                text(
                    """
                    select kcu.column_name, ccu.table_name as ref_table, ccu.column_name as ref_column
                    from information_schema.table_constraints tc
                    join information_schema.key_column_usage kcu
                      on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
                    join information_schema.constraint_column_usage ccu
                      on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
                    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public' and tc.table_name = :t
                    """
                ),
                {"t": table},
            ).all()
            has_company = any(c[0] == "company_id" for c in cols)
            if has_company and company_id:
                count = conn.execute(text(f'select count(*) from "{table}" where company_id = :c'), {"c": company_id}).scalar()
            else:
                count = conn.execute(text(f'select count(*) from "{table}"')).scalar()
            hidden = [c[0] for c in cols if BLOCKED_COLUMN_RE.search(c[0])]
            visible_cols = [c for c in cols if not BLOCKED_COLUMN_RE.search(c[0])]
            enums: dict[str, list] = {}
            for name, dtype, _n, _d in visible_cols:
                if dtype in ("character varying", "text") and re.search(r"status|type|kind|role|stage|channel|method|direction|source|priority", name):
                    vals = conn.execute(text(f'select distinct "{name}" from "{table}" where "{name}" is not null limit 12')).all()
                    enums[name] = [v[0] for v in vals]
        mods = table_modules(table)
        return {
            "table": table,
            "module": mods[0] if mods else "other",
            "rows_in_company": int(count or 0),
            "columns": [{"name": n, "type": t, "nullable": nn == "YES"} for n, t, nn, _d in visible_cols],
            "foreign_keys": [{"column": c, "references": f"{rt}.{rc}"} for c, rt, rc in fks],
            "enum_like_values": enums,
            "hidden_columns": hidden,
        }

    def query_database(inp: dict) -> dict:
        if db is None:
            return {"error": "Database queries are unavailable."}
        sql = str(inp.get("sql") or "").strip()
        sql = re.sub(r"--[^\n]*", " ", sql)
        sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.S).strip().rstrip(";").strip()
        if not sql:
            return {"error": "sql is required"}
        if ";" in sql:
            return {"error": "Only a single SELECT statement is allowed."}
        if not re.match(r"^(select|with)\b", sql, re.I):
            return {"error": "Only SELECT (or WITH ... SELECT) queries are allowed."}
        if FORBIDDEN_SQL_RE.search(sql):
            return {
                "error": (
                    "Query contains a keyword that is not allowed in read-only mode. Use a plain SELECT with "
                    f"literal values only (e.g. company_id = '{company_id}'), then call query_database again."
                )
            }
        identifiers = set(re.findall(r"[a-zA-Z_][a-zA-Z0-9_]*", sql))
        blocked_tables = sorted(i for i in identifiers if _blocked_table(i))
        blocked_cols = sorted(i for i in identifiers if BLOCKED_COLUMN_RE.search(i))
        if blocked_tables or blocked_cols:
            return {"error": f"Query references restricted objects: {', '.join(blocked_tables + blocked_cols)}"}
        # Per-table permission check: every identifier that names a real table must be readable.
        known = _tables()
        referenced = sorted(i for i in identifiers if i in known)
        forbidden = [t for t in referenced if not access.can_read_table(t)]
        if forbidden:
            return _denied(forbidden[0])
        wrapped = f"select * from ({sql}) as ai_q limit {MAX_ROWS + 1}"
        started = time.perf_counter()
        try:
            with _conn() as conn:
                tx = conn.begin()
                try:
                    conn.execute(text("SET TRANSACTION READ ONLY"))
                    conn.execute(text(f"SET LOCAL statement_timeout = {STATEMENT_TIMEOUT_MS}"))
                    result = conn.execute(text(wrapped))
                    columns = list(result.keys())
                    rows = [dict(zip(columns, (_jsonable(v) for v in r))) for r in result.fetchmany(MAX_ROWS + 1)]
                finally:
                    tx.rollback()
        except Exception as exc:  # surface Postgres' message, not a stack trace
            msg = str(getattr(exc, "orig", exc)).split("\n")[0]
            return {"error": f"Query failed: {msg[:400]}"}
        elapsed = int((time.perf_counter() - started) * 1000)
        truncated = len(rows) > MAX_ROWS
        rows = rows[:MAX_ROWS]
        note = None
        if company_id and "company_id" not in sql.lower():
            note = f"Query did not filter company_id — results may mix companies. Current company_id is '{company_id}'."
        return {
            "columns": columns,
            "row_count": len(rows),
            "truncated": truncated,
            "elapsed_ms": elapsed,
            "tables": referenced,
            "rows": rows,
            **({"note": note} if note else {}),
        }

    # (label, table, module, id column, label columns, searchable columns, extra columns)
    SEARCH_TARGETS = (
        ("customer", "commerce_customers", "customers", "id", ("name",), ("name", "customer_code", "phone", "email"), ("customer_code", "phone", "status", "total_spend")),
        ("supplier", "commerce_suppliers", "purchase", "id", ("name",), ("name", "vendor_code", "email", "phone"), ("vendor_code", "status", "spend_ytd")),
        ("vendor_account", "vendors", "purchase", "id", ("display_name",), ("display_name", "company_name", "vendor_code", "email"), ("vendor_code", "status")),
        ("item", "items", "inventory", "id", ("name",), ("name", "sku", "barcode"), ("sku", "item_type", "status")),
        ("product", "catalog_products", "catalog", "id", ("name",), ("name", "sku", "brand", "category"), ("sku", "price", "stock_status", "status")),
        ("employee", "hrm_employees", "hrm", "id", ("name",), ("name", "employee_code", "email", "phone"), ("employee_code", "employment_type", "employee_status")),
        ("lead", "crm_leads", "crm", "id", ("name",), ("name", "company_name", "email", "phone"), ("company_name", "status", "estimated_value")),
        ("deal", "crm_deals", "crm", "id", ("title",), ("title", "contact_name", "contact_company"), ("stage", "value")),
        ("project", "crm_projects", "crm", "id", ("name",), ("name",), ("status", "due_date")),
        ("sales_order", "sales_orders", "sales", "id", ("order_number",), ("order_number", "invoice_number"), ("status", "order_date", "total")),
        ("sales_invoice", "sales_invoices", "sales", "id", ("invoice_number",), ("invoice_number",), ("status", "due_date", "total")),
        ("purchase_order", "purchase_orders", "purchase", "id", ("po_number",), ("po_number",), ("status", "order_date", "total")),
        ("rma", "rma_tickets", "rma", "id", ("rma_number",), ("rma_number", "customer_name", "product_name"), ("status", "total")),
        ("service_job", "service_jobs", "service", "id", ("job_number",), ("job_number", "customer_name", "product_name"), ("status", "total")),
        ("account", "finance_accounts", "finance", "id", ("name",), ("name", "code"), ("code", "account_type")),
    )

    def search_records(inp: dict) -> dict:
        if db is None:
            return {"error": "Search is unavailable."}
        q = str(inp.get("query") or "").strip()
        if len(q) < 2:
            return {"error": "query must be at least 2 characters"}
        limit = max(1, min(int(inp.get("limit") or 5), 20))
        kinds = inp.get("types") or []
        like = f"%{q}%"
        results: list[dict] = []
        skipped: list[str] = []
        known = _tables()
        with _conn() as conn:
            for kind, table, module, id_col, label_cols, search_cols, extra_cols in SEARCH_TARGETS:
                if kinds and kind not in kinds:
                    continue
                if table not in known:
                    continue
                if not access.can_read_table(table):
                    skipped.append(kind)
                    continue
                where = " or ".join(f'"{c}"::text ilike :q' for c in search_cols)
                cols = ", ".join(f'"{c}"' for c in (id_col, *label_cols, *extra_cols))
                stmt = f'select {cols} from "{table}" where company_id = :c and ({where}) limit {limit}'
                try:
                    rows = conn.execute(text(stmt), {"q": like, "c": company_id}).all()
                except Exception:
                    continue
                for r in rows:
                    rec = dict(zip((id_col, *label_cols, *extra_cols), (_jsonable(v) for v in r)))
                    results.append({"type": kind, "table": table, "module": module, **rec})
        return {"query": q, "count": len(results), "results": results, **({"not_searched": skipped} if skipped else {})}

    def get_erp_data_map(inp: dict) -> dict:
        return {"data_map": data_map_text(db, user), "modules": access.readable_modules()}

    return [
        OrchestratorTool(
            definition=AIToolDefinition(
                name="search_records",
                description=(
                    "Find records anywhere in the ERP by name, code or number — customers, suppliers, vendors, items, "
                    "products, employees, leads, deals, projects, sales/purchase orders, invoices, RMAs, service jobs, "
                    "accounts. Returns ids you can then use in query_database. Only searches modules you may read."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Name / code / number fragment, e.g. 'Ryans', 'SO-05761', 'PO-2026'"},
                        "types": {"type": "array", "items": {"type": "string"}, "description": "Optional: limit to types such as customer, supplier, item, product, employee, lead, deal, project, sales_order, sales_invoice, purchase_order, rma, service_job, account"},
                        "limit": {"type": "integer", "description": "Max hits per type (default 5, max 20)"},
                    },
                    "required": ["query"],
                },
            ),
            handler=search_records,
            risk_tier=RiskTier.READ,
            module="database",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="get_erp_data_map",
                description="The ERP data map: every module you may read with its key tables and columns. Use when unsure where some data lives.",
                input_schema={"type": "object", "properties": {}},
            ),
            handler=get_erp_data_map,
            risk_tier=RiskTier.READ,
            module="database",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="list_database_tables",
                description=(
                    "List the ERP database tables you may read, grouped by module (with approximate rows). "
                    "Use to discover tables beyond the data map."
                ),
                input_schema={"type": "object", "properties": {"search": {"type": "string", "description": "Filter by table name or module, e.g. 'sales', 'stock', 'hrm'"}}},
            ),
            handler=list_database_tables,
            risk_tier=RiskTier.READ,
            module="database",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="describe_table",
                description="Columns, types, foreign keys, row count and status-like values of one table. Call before querying a table you have not seen in the data map.",
                input_schema={"type": "object", "properties": {"table": {"type": "string"}}, "required": ["table"]},
            ),
            handler=describe_table,
            risk_tier=RiskTier.READ,
            module="database",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="query_database",
                description=(
                    "Run one read-only SQL SELECT against the ERP Postgres database (PostgreSQL syntax) — the way to "
                    "answer any data question about any module (sales, purchase, inventory, catalog, CRM, HR, finance, "
                    f"POS, RMA, service …) within your permissions. The current company_id is '{company_id}': where a "
                    f"table has a company_id column, write the literal filter company_id = '{company_id}' (no session "
                    "variables or functions). Join through *_id columns; aggregate in SQL (sum/count/group by/order by/"
                    f"limit) instead of pulling raw rows; at most {MAX_ROWS} rows are returned."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "sql": {"type": "string", "description": "A single SELECT statement"},
                        "purpose": {"type": "string", "description": "One line: what question this answers (for the audit log)"},
                    },
                    "required": ["sql"],
                },
            ),
            handler=query_database,
            risk_tier=RiskTier.READ,
            module="database",
        ),
    ]
