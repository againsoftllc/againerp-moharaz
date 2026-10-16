from sqlalchemy import text

from app.database import engine


def ensure_hrm_asset_columns() -> None:
    with engine.begin() as conn:
        asset_type_cols = {
            r[0]
            for r in conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'hrm_asset_types'"
                )
            ).fetchall()
        }
        if "depreciation_rate" not in asset_type_cols:
            conn.execute(
                text(
                    "ALTER TABLE hrm_asset_types "
                    "ADD COLUMN depreciation_rate NUMERIC(8,2) NULL"
                )
            )
            print("added hrm_asset_types.depreciation_rate")
        if "status" not in asset_type_cols:
            conn.execute(
                text(
                    "ALTER TABLE hrm_asset_types "
                    "ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'active'"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_hrm_asset_types_status "
                    "ON hrm_asset_types (status)"
                )
            )
            print("added hrm_asset_types.status")

        asset_cols = {
            r[0]
            for r in conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'hrm_assets'"
                )
            ).fetchall()
        }
        if "secondary_code" not in asset_cols:
            conn.execute(
                text(
                    "ALTER TABLE hrm_assets "
                    "ADD COLUMN secondary_code VARCHAR(50) NULL"
                )
            )
            print("added hrm_assets.secondary_code")


if __name__ == "__main__":
    ensure_hrm_asset_columns()
