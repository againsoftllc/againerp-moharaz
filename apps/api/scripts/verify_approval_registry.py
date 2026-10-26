"""Checks docs/approval.md's registry against the live app. Run after adding or moving an endpoint:

    docker exec -w /app againerp-moharaz-api python scripts/verify_approval_registry.py

Every action in app/services/core/approval_actions.py must match a real route (method + path), and the model attributes its
describer reads must exist. Exit code 1 when something is off.
"""

from __future__ import annotations

import importlib
import re
import sys
import warnings

sys.path.insert(0, ".")
warnings.filterwarnings("ignore")

from main import app  # noqa: E402
from app.services.core.approval_actions import ACTIONS  # noqa: E402

# model attributes the describers read: a rename in a model would silently blank the Approve list otherwise
DESCRIBER_ATTRS: dict[str, list[str]] = {
    "app.models.purchase_receipt.PurchaseReceipt": ["receipt_number", "purchase_order_id", "supplier_id", "warehouse_id"],
    "app.models.purchase_receipt.PurchaseReceiptLine": ["purchase_receipt_id", "purchase_order_line_id", "quantity_received"],
    "app.models.purchase_order.PurchaseOrder": ["po_number"],
    "app.models.purchase_order.PurchaseOrderLine": ["unit_cost", "quantity_ordered", "discount_amount", "tax_rate"],
    "app.models.purchase_return.PurchaseReturn": ["return_number", "supplier_id", "credit_amount", "warehouse_id"],
    "app.models.inventory_stock_adjustment.InventoryStockAdjustment": ["adjustment_number", "reason", "lines", "warehouse_id"],
    "app.models.sales.SalesQuotation": ["quotation_number", "customer_id", "total"],
    "app.models.sales.SalesOrder": ["order_number", "customer_id", "total"],
    "app.models.sales.SalesDelivery": ["delivery_number", "sales_order_id", "customer_id", "warehouse_id"],
    "app.models.sales_return.SalesReturn": ["return_number", "customer_id", "credit_amount"],
    "app.models.inventory_stock_transfer.InventoryStockTransfer": ["transfer_number", "from_warehouse_id", "to_warehouse_id"],
    "app.models.rma.RmaTicket": ["rma_number", "customer_name", "product_name", "serial_number"],
    "app.models.rma.RmaDelivery": ["delivery_number", "rma_id", "amount_total"],
    "app.models.rma.RmaSupplierClaim": ["claim_number", "supplier_name", "product_name", "serial_number"],
    "app.models.rma.RmaSupplierReceipt": ["receipt_number", "supplier_name"],
    "app.models.finance.FinanceReceivable": ["invoice_number", "customer_id"],
    "app.models.finance.FinancePayable": ["reference_number", "supplier_id"],
    "app.models.finance.FinanceExpense": ["expense_number", "description", "total"],
    "app.models.finance.FinancePaymentAccount": ["name"],
    "app.models.commerce_customer.CommerceCustomer": ["name"],
    "app.models.commerce_supplier.CommerceSupplier": ["name"],
    "app.models.inventory_warehouse.InventoryWarehouse": ["name"],
}


def main() -> int:
    problems = 0
    routes = []
    for path, item in app.openapi()["paths"].items():
        if path.startswith("/api/v1/"):
            pattern = re.sub(r"\{[^}]+\}", "[^/]+", path[len("/api/v1/") :])
            routes.append((pattern, {m.upper() for m in item}, path))

    for action in ACTIONS:
        sample = re.sub(r"\(\?P<\w+>\[\^/\]\+\)", "x", action.path)
        hits = [p for pattern, methods, p in routes if action.method in methods and re.fullmatch(pattern, sample)]
        print(f"{'OK     ' if hits else 'MISSING'} {action.key:34} {action.method:5} {hits[0] if hits else sample}")
        problems += 0 if hits else 1

    for dotted, names in DESCRIBER_ATTRS.items():
        module_name, cls_name = dotted.rsplit(".", 1)
        try:
            cls = getattr(importlib.import_module(module_name), cls_name)
        except Exception as exc:  # noqa: BLE001
            print(f"MISSING CLASS {dotted}: {exc}")
            problems += 1
            continue
        missing = [n for n in names if not hasattr(cls, n)]
        if missing:
            print(f"MISSING ATTR  {dotted}: {missing}")
            problems += 1

    print(f"\n{len(ACTIONS)} actions, {problems} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
