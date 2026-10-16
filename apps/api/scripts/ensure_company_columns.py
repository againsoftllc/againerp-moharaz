from sqlalchemy import text

from app.database import engine

COMPANY_PROFILE_COLUMNS = {
    "legal_name": "VARCHAR(255)",
    "email": "VARCHAR(255)",
    "phone": "VARCHAR(50)",
    "mobile": "VARCHAR(50)",
    "website": "VARCHAR(255)",
    "logo_url": "VARCHAR(500)",
    "street": "VARCHAR(255)",
    "street2": "VARCHAR(255)",
    "city": "VARCHAR(100)",
    "state": "VARCHAR(100)",
    "zip_code": "VARCHAR(32)",
    "country": "VARCHAR(100)",
    "tax_id": "VARCHAR(64)",
    "vat_number": "VARCHAR(64)",
    "registration_no": "VARCHAR(64)",
    "currency_code": "VARCHAR(8)",
    "language_code": "VARCHAR(8)",
    "timezone": "VARCHAR(64)",
    "date_format": "VARCHAR(24)",
    "time_format": "VARCHAR(24)",
    "decimal_places": "INTEGER",
    "number_grouping": "VARCHAR(24)",
    "fiscal_year_start_month": "INTEGER",
    "bank_name": "VARCHAR(255)",
    "bank_account": "VARCHAR(64)",
    "bank_branch": "VARCHAR(255)",
    "bank_routing": "VARCHAR(64)",
    "invoice_prefix": "VARCHAR(32)",
    "invoice_include_year": "BOOLEAN",
    "invoice_padding": "INTEGER",
    "invoice_next_sequence": "INTEGER",
    "invoice_due_days": "INTEGER",
    "invoice_payment_terms": "VARCHAR(64)",
    "invoice_tax_rate": "NUMERIC(5,2)",
    "invoice_prices_include_tax": "BOOLEAN",
    "tax_enabled": "BOOLEAN",
    "invoice_footer": "TEXT",
    "credit_note_prefix": "VARCHAR(32)",
    "invoice_layout": "TEXT",
    "packing_layout": "TEXT",
    "purchase_layout": "TEXT",
    "payment_layout": "TEXT",
}


def ensure_company_columns() -> None:
    with engine.begin() as conn:
        cols = {
            r[0]
            for r in conn.execute(
                text("SELECT column_name FROM information_schema.columns WHERE table_name = 'companies'")
            ).fetchall()
        }
        if "enabled_modules" not in cols:
            conn.execute(text("ALTER TABLE companies ADD COLUMN enabled_modules TEXT NULL"))
            print("added companies.enabled_modules")
            cols.add("enabled_modules")
        for name, ddl in COMPANY_PROFILE_COLUMNS.items():
            if name not in cols:
                conn.execute(text(f"ALTER TABLE companies ADD COLUMN {name} {ddl} NULL"))
                print(f"added companies.{name}")


if __name__ == "__main__":
    ensure_company_columns()
