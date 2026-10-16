from sqlalchemy import text

from app.database import Base, engine
from app.models.inventory_warehouse import InventoryWarehouse  # noqa: F401
from app.models.item import Item  # noqa: F401
from app.models.sales import SalesOrder, SalesOrderLine  # noqa: F401
from app.models.sales_return import SalesReturn, SalesReturnLine  # noqa: F401


def ensure_sales_return_schema() -> None:
    with engine.begin() as conn:
        cols = {
            r[0]
            for r in conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'sales_order_lines'"
                )
            ).fetchall()
        }
        if cols and "quantity_returned" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE sales_order_lines "
                    "ADD COLUMN quantity_returned INTEGER NOT NULL DEFAULT 0"
                )
            )
            print("added sales_order_lines.quantity_returned")
    Base.metadata.create_all(bind=engine, tables=[SalesReturn.__table__, SalesReturnLine.__table__])
    print("ensured sales_returns tables")


if __name__ == "__main__":
    ensure_sales_return_schema()
