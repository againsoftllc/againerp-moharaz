"""One-off: post an exact 1-quarter (last 3 months) inventory-sale scenario —
Month 1 = 1,00,000 / Month 2 = 1,20,000 / Month 3 = 1,80,000 revenue (৳4,00,000 total),
with expense (COGS) fixed at exactly 60% of each month's revenue and 40% left as profit.

Run inside the api container:
    python3 scripts/seed_quarter_exact.py
"""

from __future__ import annotations

import sys
import uuid
from datetime import date, timedelta
from decimal import Decimal

sys.path.insert(0, ".")

from app.database import SessionLocal  # noqa: E402
from app.models.commerce_customer import CommerceCustomer  # noqa: E402
from app.models.commerce_supplier import CommerceSupplier  # noqa: E402
from app.models.auth_user import AuthUser  # noqa: E402
from app.models.crm import CrmProject  # noqa: E402,F401 — registers crm_projects for FK resolution
from app.services.finance.finance_service import FinanceService  # noqa: E402
from app.services.sales.invoice_service import InvoiceLineInput, InvoiceService  # noqa: E402

TAG = "q3-2026"
EXPENSE_RATIO = Decimal("0.60")

# (month offset from current month, revenue)
MONTHS = [
    (2, Decimal("100000")),  # 2 months ago
    (1, Decimal("120000")),  # 1 month ago
    (0, Decimal("180000")),  # current month
]


def pick_company_id(db) -> str:
    row = db.query(AuthUser.company_id).filter(AuthUser.company_id.isnot(None)).first()
    return row[0] if row else "default"


def month_start(months_back: int) -> date:
    today = date.today()
    year = today.year
    month = today.month - months_back
    while month <= 0:
        month += 12
        year -= 1
    return date(year, month, 1)


def safe_day(base: date, day: int) -> date:
    d = base.replace(day=min(day, 28))
    today = date.today()
    return d if d <= today else today


def main() -> None:
    db = SessionLocal()
    finance = FinanceService(db)
    invoices = InvoiceService(db)
    try:
        company_id = pick_company_id(db)
        print(f"company_id = {company_id}")
        finance.ensure_accounts(company_id)

        customer = db.query(CommerceCustomer).filter_by(company_id=company_id, name="Doreen Fashion House").first()
        supplier = db.query(CommerceSupplier).filter_by(company_id=company_id, name="Padma Textile Mills").first()
        if not customer or not supplier:
            raise RuntimeError("Expected demo customer/supplier from the earlier seed run — not found.")

        total_revenue = Decimal("0")
        total_cogs = Decimal("0")
        for i, (months_back, revenue) in enumerate(MONTHS, start=1):
            base = month_start(months_back)
            bill_date = safe_day(base, 20)
            cogs_amount = (revenue * EXPENSE_RATIO).quantize(Decimal("1"))

            inv = invoices.create_invoice(
                company_id=company_id,
                customer_id=customer.id,
                project_id=None,
                bill_date=bill_date,
                due_date=safe_day(base, 28),
                tax_rate=Decimal("0"),
                second_tax_rate=Decimal("0"),
                tds_rate=Decimal("0"),
                is_recurring=False,
                notes=f"{TAG} month {i} inventory sale",
                created_by=None,
                lines=[
                    InvoiceLineInput(
                        name=f"Inventory sale — Month {i}",
                        description=f"{TAG} quarterly demo",
                        quantity=Decimal("1"),
                        unit_type="Lot",
                        rate=revenue,
                        taxable=False,
                    )
                ],
            )
            receivable = finance.record_invoice_receivable(inv)
            finance.record_invoice_payment(
                inv,
                amount=receivable.balance,
                payment_date=bill_date,
                reference=f"{TAG}-m{i}",
            )

            finance.record_purchase_document(
                company_id=company_id,
                supplier_id=supplier.id,
                reference_number=f"BILL-{TAG}-m{i}",
                amount=cogs_amount,
                tax_amount=Decimal("0"),
                due_date=safe_day(base, 28),
                source_type="vendor_bill",
                source_id=str(uuid.uuid4()),
                description=f"{TAG} month {i} inventory cost",
            )

            total_revenue += revenue
            total_cogs += cogs_amount
            print(f"Month {i} ({bill_date}): revenue={revenue} cogs={cogs_amount} profit={revenue - cogs_amount}")

        db.commit()
        gross_profit = total_revenue - total_cogs
        print("DONE")
        print(
            f"Quarter totals — revenue={total_revenue} cogs={total_cogs} profit={gross_profit} "
            f"expense_pct={(total_cogs/total_revenue*100).quantize(Decimal('0.1'))}% "
            f"profit_pct={(gross_profit/total_revenue*100).quantize(Decimal('0.1'))}%"
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
