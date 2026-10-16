"""Read-only: report row counts and finance totals for whatever DATABASE_URL points at.
No writes. Used to check the live DB's current state before deciding on any seed/cleanup."""

from __future__ import annotations

import os
from urllib.parse import urlsplit

_public = (
    os.environ.get("DATABASE_PUBLIC_URL")
    or os.environ.get("POSTGRES_PUBLIC_URL")
    or os.environ.get("DATABASE_URL_PUBLIC")
)
if _public:
    os.environ["DATABASE_URL"] = _public
_host = urlsplit(os.environ.get("DATABASE_URL", "")).hostname
print(f"connecting via host = {_host}")

from app.database import SessionLocal  # noqa: E402
from app.models.commerce_customer import CommerceCustomer
from app.models.commerce_supplier import CommerceSupplier
from app.models.finance import FinancePayable, FinanceReceivable, FinanceExpense
from app.models.auth_user import AuthUser
from sqlalchemy import func, text


def main() -> None:
    db = SessionLocal()
    try:
        company_row = db.query(AuthUser.company_id).filter(AuthUser.company_id.isnot(None)).first()
        company_id = company_row[0] if company_row else "default"
        print(f"company_id = {company_id}")

        print("customers:", db.query(func.count(CommerceCustomer.id)).filter_by(company_id=company_id).scalar())
        print("suppliers:", db.query(func.count(CommerceSupplier.id)).filter_by(company_id=company_id).scalar())

        print("--- payables by source_type / posting_status ---")
        rows = db.execute(
            text(
                "SELECT source_type, posting_status, count(*), sum(amount) "
                "FROM finance_payables WHERE company_id=:c GROUP BY source_type, posting_status ORDER BY 1,2"
            ),
            {"c": company_id},
        ).fetchall()
        for r in rows:
            print(" ", r)

        print("--- receivables by source_type / posting_status ---")
        rows = db.execute(
            text(
                "SELECT source_type, posting_status, count(*), sum(amount) "
                "FROM finance_receivables WHERE company_id=:c GROUP BY source_type, posting_status ORDER BY 1,2"
            ),
            {"c": company_id},
        ).fetchall()
        for r in rows:
            print(" ", r)

        print("--- expenses ---")
        print("count:", db.query(func.count(FinanceExpense.id)).filter_by(company_id=company_id).scalar())

        print("--- journal totals by account code (posted only) ---")
        rows = db.execute(
            text(
                """
                SELECT a.code, a.name, a.account_type,
                       sum(l.debit) as debit, sum(l.credit) as credit
                FROM finance_journal_lines l
                JOIN finance_journal_entries e ON e.id = l.journal_entry_id
                JOIN finance_accounts a ON a.id = l.account_id
                WHERE e.company_id=:c AND a.account_type IN ('revenue','expense')
                GROUP BY a.code, a.name, a.account_type
                ORDER BY a.code
                """
            ),
            {"c": company_id},
        ).fetchall()
        for r in rows:
            print(" ", r)

        print("--- sample recent journal entries (last 10) ---")
        rows = db.execute(
            text(
                "SELECT entry_date, source_type, source_id, description "
                "FROM finance_journal_entries WHERE company_id=:c ORDER BY entry_date DESC LIMIT 10"
            ),
            {"c": company_id},
        ).fetchall()
        for r in rows:
            print(" ", r)
    finally:
        db.close()


if __name__ == "__main__":
    main()
