"""One-off: top up customers/suppliers/sales-invoices/purchase-bills/expenses so the
Finance reports (P&L, Executive Summary) show a coherent, positive-margin picture —
sized on top of whatever is already posted in the target DB, not blind to it.

Run inside the api container with DATABASE_URL pointed at the target DB:
    python3 scripts/seed_live_accounting_demo.py

Tags every row it creates with a "demo-2026" reference/note so a future cleanup
script can find and remove them by that tag. Existing posted revenue/COGS/opex
(legacy data already in the DB) is queried first and netted out of the targets
below, so re-running is safe and won't blow past the target.
"""

from __future__ import annotations

import random
import sys
import uuid
from datetime import date, timedelta
from decimal import Decimal

sys.path.insert(0, ".")

from sqlalchemy import text  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models.commerce_customer import CommerceCustomer  # noqa: E402
from app.models.commerce_supplier import CommerceSupplier  # noqa: E402
from app.models.finance import FinanceAccount  # noqa: E402
from app.models.auth_user import AuthUser  # noqa: E402
from app.models.crm import CrmProject  # noqa: E402,F401 — registers crm_projects for FK resolution
from app.services.finance.finance_service import FinanceService  # noqa: E402
from app.services.sales.invoice_service import InvoiceLineInput, InvoiceService  # noqa: E402

TAG = "demo-2026"
random.seed(42)

TARGET_REVENUE = Decimal("3000000")
TARGET_GROSS_MARGIN = Decimal("0.45")  # COGS = 55% of revenue
TARGET_NET_MARGIN = Decimal("0.20")  # opex = 35% - wait computed below


def pick_company_id(db) -> str:
    row = db.query(AuthUser.company_id).filter(AuthUser.company_id.isnot(None)).first()
    return row[0] if row else "default"


def account_id_by_code(db, company_id: str, code: str) -> str:
    acc = db.query(FinanceAccount).filter_by(company_id=company_id, code=code).first()
    if not acc:
        raise RuntimeError(f"Account {code} not found — did ensure_accounts run?")
    return acc.id


def posted_totals(db, company_id: str) -> dict:
    row = db.execute(
        text(
            """
            SELECT a.account_type, a.code,
                   coalesce(sum(l.debit), 0) as debit, coalesce(sum(l.credit), 0) as credit
            FROM finance_journal_lines l
            JOIN finance_journal_entries e ON e.id = l.journal_entry_id
            JOIN finance_accounts a ON a.id = l.account_id
            WHERE e.company_id = :c AND a.account_type IN ('revenue', 'expense')
            GROUP BY a.account_type, a.code
            """
        ),
        {"c": company_id},
    ).fetchall()
    revenue = Decimal("0")
    cogs = Decimal("0")
    opex = Decimal("0")
    for account_type, code, debit, credit in row:
        if account_type == "revenue":
            revenue += Decimal(credit) - Decimal(debit)
        elif code == "5000":
            cogs += Decimal(debit) - Decimal(credit)
        else:
            opex += Decimal(debit) - Decimal(credit)
    return {"revenue": revenue, "cogs": cogs, "opex": opex}


def today_capped(d: date) -> date:
    t = date.today()
    return d if d <= t else t


def month_dates(months_back: int, count: int) -> list[date]:
    today = date.today()
    out = []
    for _ in range(count):
        m_offset = random.randint(0, months_back)
        d = today.replace(day=1) - timedelta(days=m_offset * 30)
        day = random.randint(1, min(26, today.day if d.month == today.month and d.year == today.year else 26))
        out.append(today_capped(d.replace(day=day)))
    return sorted(out)


CUSTOMER_NAMES = [
    ("Doreen Fashion House", "retail", "Dhaka"),
    ("Bengal Digital Solutions Ltd", "wholesale", "Dhaka"),
    ("Chattogram Trading Co", "wholesale", "Chattogram"),
    ("Sylhet Home Interiors", "retail", "Sylhet"),
    ("Northlight Apparel", "retail", "Gazipur"),
    ("Green Valley Agro Ltd", "wholesale", "Rajshahi"),
]

SUPPLIER_NAMES = [
    "Padma Textile Mills",
    "Meghna Packaging Supplies",
    "Karnaphuli Raw Materials Ltd",
]

EXPENSE_PLAN = [
    ("6120", "Rent", "Property Management Ltd", Decimal("30000")),
    ("6130", "Salaries", "Payroll", Decimal("185000")),
    ("6110", "Electricity Bill", "DPDC", Decimal("14000")),
    ("6150", "Marketing", "AdReach BD", Decimal("22000")),
    ("6160", "Travel", "Various", Decimal("9000")),
    ("6140", "Office Supplies", "Office Mart", Decimal("6000")),
]


def main() -> None:
    db = SessionLocal()
    finance = FinanceService(db)
    invoices = InvoiceService(db)
    try:
        company_id = pick_company_id(db)
        print(f"company_id = {company_id}")
        finance.ensure_accounts(company_id)

        before = posted_totals(db, company_id)
        print(f"existing posted — revenue={before['revenue']} cogs={before['cogs']} opex={before['opex']}")

        revenue_needed = max(Decimal("0"), TARGET_REVENUE - before["revenue"])
        cogs_target_total = TARGET_REVENUE * (Decimal("1") - TARGET_GROSS_MARGIN)
        cogs_needed = max(Decimal("0"), cogs_target_total - before["cogs"])
        opex_pct = (Decimal("1") - TARGET_GROSS_MARGIN) - TARGET_NET_MARGIN  # opex as % of revenue
        opex_target_total = TARGET_REVENUE * opex_pct
        opex_needed = max(Decimal("0"), opex_target_total - before["opex"])
        print(f"top-up needed — revenue={revenue_needed} cogs={cogs_needed} opex={opex_needed}")

        # ---- Customers ----
        customers = []
        for i, (name, group, city) in enumerate(CUSTOMER_NAMES):
            existing = db.query(CommerceCustomer).filter_by(company_id=company_id, name=name).first()
            if existing:
                customers.append(existing)
                continue
            cust = CommerceCustomer(
                id=str(uuid.uuid4()),
                company_id=company_id,
                customer_code=f"C-{TAG}-{i+1:03d}",
                name=name,
                email=f"{name.lower().replace(' ', '.')[:30]}@example.com",
                phone=f"01{random.randint(700000000, 999999999)}",
                group=group,
                status="active",
                city=city,
                region=city,
                customer_since=date.today() - timedelta(days=random.randint(120, 900)),
            )
            from app.services.parties.commerce_party_bridge import ensure_party_for_customer

            ensure_party_for_customer(db, cust)
            db.add(cust)
            db.flush()
            customers.append(cust)
        print(f"customers: {len(customers)}")

        # ---- Suppliers ----
        suppliers = []
        for i, name in enumerate(SUPPLIER_NAMES):
            existing = db.query(CommerceSupplier).filter_by(company_id=company_id, name=name).first()
            if existing:
                suppliers.append(existing)
                continue
            sup = CommerceSupplier(
                id=str(uuid.uuid4()),
                company_id=company_id,
                vendor_code=f"VND-{TAG}-{i+1:03d}",
                name=name,
                email=f"{name.lower().replace(' ', '.')[:30]}@example.com",
                phone=f"01{random.randint(700000000, 999999999)}",
                payment_terms="Net 30",
                status="active",
            )
            from app.services.parties.commerce_party_bridge import ensure_party_for_supplier

            ensure_party_for_supplier(db, sup)
            db.add(sup)
            db.flush()
            suppliers.append(sup)
        print(f"suppliers: {len(suppliers)}")
        db.commit()

        # ---- Sales invoices (revenue), sized to hit revenue_needed ----
        item_catalog = [
            ("Custom Uniform Set", "Set", Decimal("2200")),
            ("Corporate Branding Package", "Package", Decimal("18500")),
            ("Bulk Fabric Order (100m)", "Order", Decimal("42000")),
            ("Furniture Assembly Service", "Service", Decimal("9500")),
            ("Office Interior Consultation", "Session", Decimal("15000")),
            ("Agro Equipment Rental", "Month", Decimal("27000")),
            ("Website & POS Setup", "Project", Decimal("65000")),
            ("Seasonal Apparel Batch", "Batch", Decimal("31000")),
        ]

        total_revenue = Decimal("0")
        created_invoices = []
        if revenue_needed > 0:
            n_invoices = 18
            invoice_dates = month_dates(8, n_invoices)
            per_invoice_target = revenue_needed / n_invoices
            for d in invoice_dates:
                customer = random.choice(customers)
                lines = []
                running = Decimal("0")
                while running < per_invoice_target * Decimal("0.8") and len(lines) < 4:
                    name, unit, rate = random.choice(item_catalog)
                    qty = Decimal(max(1, round(float(per_invoice_target * Decimal("0.4")) / float(rate))))
                    lines.append(
                        InvoiceLineInput(
                            name=name,
                            description=f"{TAG} demo line",
                            quantity=qty,
                            unit_type=unit,
                            rate=rate,
                            taxable=True,
                        )
                    )
                    running += qty * rate
                inv = invoices.create_invoice(
                    company_id=company_id,
                    customer_id=customer.id,
                    project_id=None,
                    bill_date=d,
                    due_date=today_capped(d + timedelta(days=14)),
                    tax_rate=Decimal("5"),
                    second_tax_rate=Decimal("0"),
                    tds_rate=Decimal("0"),
                    is_recurring=False,
                    notes=TAG,
                    created_by=None,
                    lines=lines,
                )
                receivable = finance.record_invoice_receivable(inv)
                total_revenue += inv.total
                created_invoices.append((inv, receivable))
            db.commit()
        print(f"sales invoices: {len(created_invoices)}, added revenue = {total_revenue}")

        # ---- Record payments on most invoices ----
        paid_total = Decimal("0")
        for inv, receivable in created_invoices:
            db.refresh(receivable)
            if random.random() < 0.75 and receivable.balance > 0:
                pct = Decimal(str(random.choice([1, 1, 1, 0.6, 0.5])))
                amount = (receivable.balance * pct).quantize(Decimal("1"))
                if amount <= 0:
                    continue
                finance.record_invoice_payment(
                    inv,
                    amount=amount,
                    payment_date=today_capped(inv.bill_date + timedelta(days=random.randint(1, 12))),
                    reference=TAG,
                )
                paid_total += amount
        db.commit()
        print(f"payments recorded, total paid = {paid_total}")

        # ---- Purchase bills (COGS), sized to hit cogs_needed ----
        added_cogs = Decimal("0")
        if cogs_needed > 0:
            n_bills = 6
            purchase_dates = month_dates(8, n_bills)
            remaining = cogs_needed
            for i, d in enumerate(purchase_dates):
                supplier = random.choice(suppliers)
                amount = (cogs_needed / n_bills).quantize(Decimal("1")) if i < n_bills - 1 else remaining
                remaining -= amount
                if amount <= 0:
                    continue
                finance.record_purchase_document(
                    company_id=company_id,
                    supplier_id=supplier.id,
                    reference_number=f"BILL-{TAG}-{i+1:03d}",
                    amount=amount,
                    tax_amount=Decimal("0"),
                    due_date=today_capped(d + timedelta(days=30)),
                    source_type="vendor_bill",
                    source_id=str(uuid.uuid4()),
                    description=f"{TAG} purchase bill",
                )
                added_cogs += amount
            db.commit()
        print(f"purchase bills added, COGS added ~= {added_cogs}")

        # ---- Operating expenses, sized to hit opex_needed ----
        added_opex = Decimal("0")
        if opex_needed > 0:
            base_cycle_sum = sum((amt for _, _, _, amt in EXPENSE_PLAN), Decimal("0"))
            n_cycles = 3
            scale = opex_needed / (base_cycle_sum * n_cycles)
            cat = finance.create_expense_category(company_id=company_id, name=TAG)
            expense_dates = month_dates(8, len(EXPENSE_PLAN) * n_cycles)
            idx = 0
            for _cycle in range(n_cycles):
                for code, _label, payee, base_amount in EXPENSE_PLAN:
                    variance = Decimal(str(round(random.uniform(0.9, 1.1), 2)))
                    amount = (base_amount * scale * variance).quantize(Decimal("1"))
                    if amount <= 0:
                        idx += 1
                        continue
                    acc_id = account_id_by_code(db, company_id, code)
                    d = expense_dates[idx % len(expense_dates)]
                    idx += 1
                    expense = finance.create_expense(
                        company_id=company_id,
                        category_id=cat.id,
                        payee=payee,
                        description=f"{TAG} expense",
                        expense_date=d,
                        amount=amount,
                        payment_method="bank",
                        reference=TAG,
                        account_id=acc_id,
                    )
                    finance.approve_expense(expense, actor=None)
                    finance.pay_expense(expense, payment_method="bank", payment_date=d)
                    added_opex += amount
            db.commit()
        print(f"expenses added, opex added = {added_opex}")

        after = posted_totals(db, company_id)
        gp = after["revenue"] - after["cogs"]
        np_ = gp - after["opex"]
        print("DONE")
        print(
            f"Final posted totals — revenue={after['revenue']} cogs={after['cogs']} opex={after['opex']} "
            f"gross_profit={gp} net_profit={np_} "
            f"gross_margin={(gp/after['revenue']*100).quantize(Decimal('0.1')) if after['revenue'] else 'n/a'}% "
            f"net_margin={(np_/after['revenue']*100).quantize(Decimal('0.1')) if after['revenue'] else 'n/a'}%"
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
