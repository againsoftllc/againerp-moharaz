"""Sales return, end to end, through the real HTTP routes - order -> payment -> return -> refund -> ledger.

Runs against the DATABASE the API is configured for, inside ONE transaction that is rolled back at the end (nothing is saved):

    docker exec -i againerp-moharaz-api python - < apps/api/scripts/e2e_sales_return.py

Checks: stock goes back to the right warehouse (a faulty return into the RMA store, not into sellable stock), the credit note is
balanced and nets the order-level discount, an unpaid invoice is offset, the refund settles the credit, the customer ledger returns
to zero, and over-returning / a bad warehouse are refused.
"""
from datetime import date
from decimal import Decimal

import main  # noqa: F401 - registers every model and builds the app
from fastapi.testclient import TestClient

from app.database import SessionLocal, get_db
from app.deps.auth import get_current_user
from app.models.auth_user import AuthUser
from app.models.catalog_product import CatalogProduct
from app.models.commerce_customer import CommerceCustomer
from app.models.finance import FinanceAccount, FinanceJournalEntry, FinanceJournalLine, FinanceReceivable
from app.models.inventory_stock_level import InventoryStockLevel
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.sales import SalesOrder, SalesOrderLine
from app.services.customer import customer_ledger_service as ledger
from app.services.sales.sales_service import SalesService

db = SessionLocal()
db.commit = db.flush  # one transaction, rolled back at the end
admin = db.query(AuthUser).filter(AuthUser.is_active.is_(True)).order_by(AuthUser.created_at).first()
main.app.dependency_overrides[get_current_user] = lambda: admin
main.app.dependency_overrides[get_db] = lambda: db
client = TestClient(main.app, raise_server_exceptions=False)
CID = admin.company_id
svc = SalesService(db, company_id=CID)
cust = db.query(CommerceCustomer).filter(CommerceCustomer.company_id == CID).order_by(CommerceCustomer.created_at).first()
rma = db.query(InventoryWarehouse).filter(InventoryWarehouse.company_id == CID, InventoryWarehouse.is_rma_store.is_(True)).first()
prod, lvl = (
    db.query(CatalogProduct, InventoryStockLevel)
    .join(InventoryStockLevel, InventoryStockLevel.product_id == CatalogProduct.id)
    .filter(CatalogProduct.company_id == CID, CatalogProduct.price > 0, CatalogProduct.item_id.isnot(None), CatalogProduct.track_quantity.is_(True), InventoryStockLevel.on_hand >= 10)
    .order_by(InventoryStockLevel.on_hand.desc())
    .first()
)
WH = lvl.warehouse_id


def api(method, path, **kw):
    r = client.request(method, "/api/v1" + path, **kw)
    return r.status_code, r.json()


def stock(warehouse_id=WH):
    row = db.query(InventoryStockLevel).filter(InventoryStockLevel.product_id == prod.id, InventoryStockLevel.warehouse_id == warehouse_id).first()
    if row is None:
        return 0
    db.refresh(row)
    return row.on_hand


def make_order(qty=3, order_discount=None, shipping=None, pay=False, customer=None):
    body = {"customer_id": (customer or cust).id, "warehouse_id": WH, "order_date": str(date.today()),
            "lines": [{"item_id": prod.item_id, "quantity": qty, "unit_price": str(prod.price), "tax_rate": "5", "discount_amount": "100"}]}
    if order_discount is not None:
        body["order_discount"] = str(order_discount)
    if shipping is not None:
        body["shipping_charge"] = str(shipping)
    st, b = api("POST", "/sales/orders", json=body)
    assert st < 300, b
    oid = b["data"]["id"]
    assert api("POST", f"/sales/orders/{oid}/confirm")[0] < 300
    order = db.get(SalesOrder, oid)
    rec = db.query(FinanceReceivable).filter(FinanceReceivable.source_type == "sales_order", FinanceReceivable.source_id == oid).first()
    if pay:
        meta = SalesService._load_payment_meta(order.notes) or {}
        meta["history"] = [{"id": "pay1", "kind": "payment", "amount": str(rec.amount), "method": "Cash", "status": "completed", "at": str(date.today()), "label": "Cash"}]
        order.notes = SalesService._write_payment_meta(order.notes, meta)
        db.flush()
        svc.sync_order_payments(order)
        db.refresh(rec)
    line = db.query(SalesOrderLine).filter(SalesOrderLine.sales_order_id == oid).first()
    return oid, order, rec, line


def give_return(oid, line, qty, **extra):
    return api("POST", "/sales/returns", json={"sales_order_id": oid, "reason": extra.pop("reason", "other"), "auto_credit": True,
                                               "lines": [{"sales_order_line_id": line.id, "quantity_returned": qty}], **extra})


def balanced(source_type, source_id):
    e = db.query(FinanceJournalEntry).filter(FinanceJournalEntry.source_type == source_type, FinanceJournalEntry.source_id == source_id).first()
    assert e is not None, "no journal entry"
    lines = db.query(FinanceJournalLine).filter(FinanceJournalLine.journal_entry_id == e.id).all()
    assert sum(l.debit for l in lines) == sum(l.credit for l in lines), "journal not balanced"
    return {db.get(FinanceAccount, l.account_id).code: (l.debit, l.credit) for l in lines}


# 1. paid order, return 1 of 3 (line discount 100, order discount 500, shipping 120): stock back, credit nets the order discount
oid, order, rec, line = make_order(order_discount=500, shipping=120, pay=True)
before = stock()
st, b = give_return(oid, line, 1)
assert st == 201 and b["data"]["status"] == "credited", b
assert stock() == before + 1, "stock did not come back to the order's warehouse"
assert Decimal(b["data"]["credit_amount"]) == Decimal("1950.83"), b["data"]["credit_amount"]
journal = balanced("sales_return", b["data"]["id"])
assert "4200" in journal and "1100" in journal and "2210" in journal, journal
print("1 ok: stock back, credit", b["data"]["credit_amount"], "journal", sorted(journal))

# 2. the refund settles the credit and the customer ledger comes back to zero
refund = Decimal(b["data"]["credit_amount"])
db.refresh(order)
meta = SalesService._load_payment_meta(order.notes) or {}
meta["history"] = list(meta.get("history") or []) + [{"id": "ref1", "kind": "refund", "amount": str(refund), "method": "Cash", "status": "completed", "at": str(date.today()), "label": "Cash refund"}]
order.notes = SalesService._write_payment_meta(order.notes, meta)
db.flush()
svc.sync_order_payments(order)
_rows, summary = ledger.ledger(db, cust.id, company_id=CID)
assert Decimal(str(summary.outstanding)) == 0 and Decimal(str(summary.advance)) == 0, summary
print("2 ok: refund settled, ledger outstanding", summary.outstanding, "advance", summary.advance)

# 3. return the WHOLE paid order: never refund more than was paid minus shipping
oid, order, rec, line = make_order(order_discount=500, shipping=120, pay=True)
st, b = give_return(oid, line, 3)
assert st == 201
assert Decimal(b["data"]["credit_amount"]) == Decimal(str(rec.amount)) - Decimal("120"), (b["data"]["credit_amount"], rec.amount)
print("3 ok: full return credit", b["data"]["credit_amount"], "= paid", rec.amount, "- shipping 120")

# 4. unpaid order: the credit note offsets the open invoice (a customer with no leftover credit from the steps above)
other = db.query(CommerceCustomer).filter(CommerceCustomer.company_id == CID, CommerceCustomer.id != cust.id).order_by(CommerceCustomer.created_at).first() or cust
oid, order, rec, line = make_order(customer=other)
st, b = give_return(oid, line, 1)
db.refresh(rec)
assert st == 201 and rec.balance == Decimal(str(rec.amount)) - Decimal(b["data"]["credit_amount"]), (rec.balance, b["data"]["credit_amount"])
print("4 ok: unpaid invoice offset ->", rec.balance, rec.status)

# 5. a faulty return goes to the RMA store, not into sellable stock; the staff may choose another warehouse; a bad one is refused
if rma is not None:
    oid, order, rec, line = make_order(pay=True)
    sellable = stock()
    st, b = give_return(oid, line, 1, reason="defective")
    assert st == 201 and b["data"]["warehouse_name"] == rma.name, b
    assert stock() == sellable and stock(rma.id) >= 1
    db.refresh(prod)
    st, b = give_return(oid, line, 1, reason="defective", warehouse_id=WH)
    assert st == 201 and stock() == sellable + 1
    print("5 ok: defective -> RMA store, explicit warehouse honoured")
st, b = give_return(oid, line, 1, warehouse_id="no-such-warehouse")
assert st == 400, b
st, b = give_return(oid, line, 99)
assert st == 400, b
print("6 ok: bad warehouse and over-return refused")

db.rollback()
print("ALL OK - rolled back")
