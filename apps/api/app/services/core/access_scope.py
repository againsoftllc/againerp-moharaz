"""What a member may do and where, beyond their roles (OnerERP spec §3: L1 company modules, L3 user-wise permission, L4 location,
L5 accounts).

- **Company modules** (L1): a module the company does not have (super admin → company → module access) gives nobody any
  permission, so its API refuses everyone. Workspace and Dashboard always stay.
- **User overrides** (L3): per member, allow or deny one module × action on top of the roles. System Managers have everything
  and are not overridden.
- **Payment accounts** (L5): a member limited to some cash / bank accounts sees only those and can move money only through them.
- **Warehouses** (L4): a member limited to some warehouses (locations) works only there: new documents, actions on existing
  ones (sales / purchase orders, deliveries, receipts, returns, transfers, adjustments, counts), POS, and the lists and stock
  they see (`warehouse_scope`).
"""

from __future__ import annotations

import json
from typing import Iterable, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.auth_user import AuthUser
from app.models.auth_user_access import AuthUserPaymentAccount, AuthUserPermission
from app.models.company import Company

ALWAYS_ON_MODULES = frozenset({"workspace", "dashboard"})


# ── company modules (L1) ─────────────────────────────────────────────────────


def company_modules(db: Session, company_id: str) -> Optional[set[str]]:
    """The modules the company has, or None when it has every module."""
    company = db.get(Company, company_id) if company_id else None
    if not company or not company.enabled_modules:
        return None
    try:
        modules = json.loads(company.enabled_modules)
    except (TypeError, ValueError):
        return None
    return set(modules) if isinstance(modules, list) else None


def module_enabled(enabled: Optional[set[str]], module: str) -> bool:
    if enabled is None or module in ALWAYS_ON_MODULES:
        return True
    base = "rma" if module.startswith("rma_") else module  # the RMA special permissions belong to RMA
    return base in enabled


def restrict_to_company_modules(db: Session, company_id: str, matrix: dict[str, set[str]]) -> dict[str, set[str]]:
    enabled = company_modules(db, company_id)
    if enabled is None:
        return matrix
    return {module: (actions if module_enabled(enabled, module) else set()) for module, actions in matrix.items()}


# ── user overrides (L3) ──────────────────────────────────────────────────────


def user_overrides(db: Session, user_id: str) -> list[AuthUserPermission]:
    return (
        db.query(AuthUserPermission)
        .filter(AuthUserPermission.user_id == user_id)
        .order_by(AuthUserPermission.module, AuthUserPermission.action)
        .all()
    )


def apply_user_overrides(db: Session, user: AuthUser, matrix: dict[str, set[str]]) -> dict[str, set[str]]:
    rows = user_overrides(db, user.id)
    if not rows:
        return matrix
    out = {module: set(actions) for module, actions in matrix.items()}
    for row in rows:
        actions = out.setdefault(row.module, set())
        if row.allow:
            actions.add(row.action)
        else:
            actions.discard(row.action)
    return out


def set_user_overrides(db: Session, user: AuthUser, overrides: Iterable[tuple[str, str, bool]]) -> int:
    """Replace the member's overrides. Unknown modules or actions are refused (400)."""
    from app.services.rbac import RBAC_ACTIONS, RBAC_MODULES

    wanted: dict[tuple[str, str], bool] = {}
    for module, action, allow in overrides:
        if module not in RBAC_MODULES or action not in RBAC_ACTIONS:
            raise HTTPException(status_code=400, detail=f"Unknown permission {module}:{action}")
        wanted[(module, action)] = bool(allow)
    db.query(AuthUserPermission).filter(AuthUserPermission.user_id == user.id).delete(synchronize_session=False)
    for (module, action), allow in wanted.items():
        db.add(AuthUserPermission(user_id=user.id, module=module, action=action, allow=allow))
    db.flush()
    return len(wanted)


# ── payment accounts (L5) ────────────────────────────────────────────────────


def user_payment_account_ids(db: Session, user_id: str) -> list[str]:
    """Accounts the member is limited to; empty = every account."""
    rows = (
        db.query(AuthUserPaymentAccount)
        .filter(AuthUserPaymentAccount.user_id == user_id)
        .order_by(AuthUserPaymentAccount.created_at, AuthUserPaymentAccount.id)
        .all()
    )
    return [r.payment_account_id for r in rows]


def set_user_payment_accounts(db: Session, user: AuthUser, account_ids: list[str]) -> None:
    from app.models.finance import FinancePaymentAccount

    unique = list(dict.fromkeys(account_ids))
    if unique:
        found = {
            a.id
            for a in db.query(FinancePaymentAccount)
            .filter(FinancePaymentAccount.id.in_(unique), FinancePaymentAccount.company_id == user.company_id)
            .all()
        }
        if len(found) != len(unique):
            raise HTTPException(status_code=400, detail="One or more cash / bank accounts are invalid")
    db.query(AuthUserPaymentAccount).filter(AuthUserPaymentAccount.user_id == user.id).delete(synchronize_session=False)
    for account_id in unique:
        db.add(AuthUserPaymentAccount(user_id=user.id, payment_account_id=account_id))
    db.flush()


def assert_payment_account(db: Session, user: AuthUser, account_id: Optional[str]) -> None:
    allowed = user_payment_account_ids(db, user.id)
    if allowed and account_id and account_id not in allowed:
        raise HTTPException(status_code=403, detail="You do not have access to this cash / bank account")


def pick_payment_account(db: Session, user: AuthUser, requested_id: Optional[str]) -> Optional[str]:
    """The account a money movement of this member uses: what they asked for when allowed, their first allowed account when
    they named none (instead of the company default, which may not be theirs), unchanged when they are not limited."""
    allowed = user_payment_account_ids(db, user.id)
    if not allowed:
        return requested_id
    if not requested_id:
        return allowed[0]
    if requested_id not in allowed:
        raise HTTPException(status_code=403, detail="You do not have access to this cash / bank account")
    return requested_id


# ── warehouses (L4) ──────────────────────────────────────────────────────────


def assert_warehouse_access(db: Session, user: AuthUser, *warehouse_ids: Optional[str]) -> None:
    from app.services.auth_user_warehouses import user_warehouse_access

    allowed, _default = user_warehouse_access(db, user.id)
    if not allowed:
        return
    for warehouse_id in warehouse_ids:
        if warehouse_id and warehouse_id not in allowed:
            raise HTTPException(status_code=403, detail="You do not have access to this warehouse")


def warehouse_scope(db: Session, user: Optional[AuthUser]) -> Optional[list[str]]:
    """The warehouses the member may see and work in; None = every warehouse (no limit set)."""
    if user is None:
        return None
    from app.services.auth_user_warehouses import user_warehouse_access

    allowed, _default = user_warehouse_access(db, user.id)
    return allowed or None


def scope_query(query, column, scope: Optional[list[str]], *, keep_null: bool = False):
    """Limit a list query to the member's warehouses (`keep_null`: also rows with no warehouse, e.g. a quotation)."""
    if scope is None:
        return query
    from sqlalchemy import or_

    condition = column.in_(scope)
    return query.filter(or_(condition, column.is_(None)) if keep_null else condition)


def assert_document_warehouse(db: Session, user: AuthUser, model, doc_id: str, *fields: str) -> None:
    """The stock document's own warehouse(s) must be among the member's (transfer: from on ship / cancel, to on receive)."""
    row = db.get(model, doc_id)
    if row is not None:
        assert_warehouse_access(db, user, *(getattr(row, field, None) for field in fields))


def assert_documents_warehouse(db: Session, user: AuthUser, model, doc_ids: Iterable[str], *fields: str) -> None:
    """Every document of a bulk action must be in the member's warehouses."""
    if warehouse_scope(db, user) is None:
        return
    for doc_id in doc_ids:
        assert_document_warehouse(db, user, model, doc_id, *fields)


# ── calls held for approval ──────────────────────────────────────────────────

# Held calls that move money through the body's `payment_account_id`.
_HELD_MONEY_ACTIONS = frozenset(
    {
        "finance.collection",
        "finance.collection_receivable",
        "finance.collection_invoice",
        "finance.payment",
        "finance.payment_payable",
        "finance.payment_expense",
    }
)


# Held calls on one stock document: (model, path parameter, warehouse field; "@field" = the sales order it belongs to).
_HELD_DOCUMENT_ACTIONS = {
    "purchase.goods_receive": ("app.models.purchase_receipt.PurchaseReceipt", "receipt_id", "warehouse_id"),
    "purchase.purchase_return": ("app.models.purchase_return.PurchaseReturn", "return_id", "warehouse_id"),
    "sales.quotation": ("app.models.sales.SalesQuotation", "quotation_id", "warehouse_id"),
    "sales.sales_order": ("app.models.sales.SalesOrder", "order_id", "warehouse_id"),
    "sales.invoice": ("app.models.sales.SalesOrder", "order_id", "warehouse_id"),
    "sales.invoice_link": ("app.models.sales.SalesOrder", "order_id", "warehouse_id"),
    "sales.delivery_challan": ("app.models.sales.SalesDelivery", "delivery_id", "@sales_order_id"),
    "sales.sales_return": ("app.models.sales_return.SalesReturn", "return_id", "@sales_order_id"),
}


def scope_held_call(db: Session, user: AuthUser, action_key: str, path_params: dict, body: dict) -> dict:
    """The maker's own limits, checked before a call is held for approval. An approver later replays the call as
    themselves, so without this a member limited to one cash account or one warehouse could ask for anything.

    Raises 403 on a cash / bank account or warehouse outside the maker's; fills in the maker's own account when the body names
    none (the approver's default could be another). Returns the body to keep.
    """
    if action_key in _HELD_MONEY_ACTIONS:
        if action_key == "finance.payment_expense" and not body.get("payment_account_id"):
            from app.models.finance import FinanceExpense

            expense = db.get(FinanceExpense, path_params.get("expense_id", ""))
            if expense is not None and expense.payment_account_id:
                assert_payment_account(db, user, expense.payment_account_id)
                return body
        picked = pick_payment_account(db, user, body.get("payment_account_id"))
        if picked and picked != body.get("payment_account_id"):
            body = {**body, "payment_account_id": picked}
        return body
    if action_key == "finance.voucher":  # payment-account transfer
        assert_payment_account(db, user, body.get("from_account_id"))
        assert_payment_account(db, user, body.get("to_account_id"))
        return body
    if action_key in _HELD_DOCUMENT_ACTIONS:
        model_path, param, field = _HELD_DOCUMENT_ACTIONS[action_key]
        module_name, class_name = model_path.rsplit(".", 1)
        model = getattr(__import__(module_name, fromlist=[class_name]), class_name)
        doc_id = path_params.get(param)
        row = db.get(model, doc_id) if doc_id else None
        if row is not None:
            if field.startswith("@"):  # the document hangs off a sales order: its warehouse decides
                from app.models.sales import SalesOrder

                assert_document_warehouse(db, user, SalesOrder, getattr(row, field[1:]), "warehouse_id")
            else:
                assert_warehouse_access(db, user, getattr(row, field, None))
        return body
    if action_key == "sales.sales_order_bulk":
        from app.models.sales import SalesOrder

        assert_documents_warehouse(db, user, SalesOrder, body.get("ids") or [], "warehouse_id")
        return body
    if action_key == "sales.sales_return_create":
        from app.models.sales import SalesOrder

        assert_document_warehouse(db, user, SalesOrder, body.get("sales_order_id", ""), "warehouse_id")
        assert_warehouse_access(db, user, body.get("warehouse_id"))
        return body
    if action_key == "purchase.stock_adjustment":
        from app.models.inventory_stock_adjustment import InventoryStockAdjustment

        assert_document_warehouse(db, user, InventoryStockAdjustment, path_params.get("adjustment_id", ""), "warehouse_id")
    elif action_key in ("sales.product_transfer_ship", "sales.product_transfer_receive"):
        from app.models.inventory_stock_transfer import InventoryStockTransfer

        side = "from_warehouse_id" if action_key.endswith("_ship") else "to_warehouse_id"
        assert_document_warehouse(db, user, InventoryStockTransfer, path_params.get("transfer_id", ""), side)
    return body
