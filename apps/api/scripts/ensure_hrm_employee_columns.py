from sqlalchemy import text

from app.database import engine


def ensure_hrm_employee_columns() -> None:
    with engine.begin() as conn:
        cols = {
            r[0]
            for r in conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'hrm_employees'"
                )
            ).fetchall()
        }
        if "name" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE hrm_employees "
                    "ADD COLUMN name VARCHAR(255) NOT NULL DEFAULT ''"
                )
            )
            print("added hrm_employees.name")
        if "email" not in cols:
            conn.execute(
                text("ALTER TABLE hrm_employees ADD COLUMN email VARCHAR(255) NULL")
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_hrm_employees_email "
                    "ON hrm_employees (email)"
                )
            )
            print("added hrm_employees.email")
        if "reporting_to" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE hrm_employees "
                    "ADD COLUMN reporting_to VARCHAR(36) NULL"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_hrm_employees_reporting_to "
                    "ON hrm_employees (reporting_to)"
                )
            )
            print("added hrm_employees.reporting_to")
        if "photo" not in cols:
            conn.execute(text("ALTER TABLE hrm_employees ADD COLUMN photo TEXT NULL"))
            print("added hrm_employees.photo")

        extras = [
            ("marital_status", "VARCHAR(50)"),
            ("nationality", "VARCHAR(100)"),
            ("blood_group", "VARCHAR(20)"),
            ("shift_name", "VARCHAR(100)"),
            ("probation_end_date", "DATE"),
            ("confirmation_date", "DATE"),
            ("last_working_day", "DATE"),
            ("hours_per_day", "NUMERIC(5,2)"),
            ("days_per_week", "NUMERIC(5,2)"),
            ("rate_per_hour", "NUMERIC(12,2)"),
            ("create_login", "BOOLEAN NOT NULL DEFAULT FALSE"),
            ("account_role", "VARCHAR(50)"),
            ("language", "VARCHAR(50)"),
            ("account_status", "VARCHAR(50)"),
        ]
        for col_name, col_type in extras:
            if col_name not in cols:
                conn.execute(
                    text(f"ALTER TABLE hrm_employees ADD COLUMN {col_name} {col_type}")
                )
                print(f"added hrm_employees.{col_name}")

        fk = conn.execute(
            text(
                "SELECT 1 FROM information_schema.table_constraints "
                "WHERE table_name = 'hrm_employees' "
                "AND constraint_name = 'fk_hrm_employees_reporting_to'"
            )
        ).fetchone()
        has_col = conn.execute(
            text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name = 'hrm_employees' AND column_name = 'reporting_to'"
            )
        ).fetchone()
        if has_col and not fk:
            conn.execute(
                text(
                    "ALTER TABLE hrm_employees "
                    "ADD CONSTRAINT fk_hrm_employees_reporting_to "
                    "FOREIGN KEY (reporting_to) REFERENCES hrm_employees(id) "
                    "ON DELETE SET NULL"
                )
            )
            print("added fk_hrm_employees_reporting_to")

        doc_cols = {
            r[0]
            for r in conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'hrm_employee_documents'"
                )
            ).fetchall()
        }
        if doc_cols and "file_name" not in doc_cols:
            conn.execute(
                text(
                    "ALTER TABLE hrm_employee_documents "
                    "ADD COLUMN file_name VARCHAR(255) NULL"
                )
            )
            print("added hrm_employee_documents.file_name")


if __name__ == "__main__":
    ensure_hrm_employee_columns()
