from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.auth_user import AuthUser
from app.models.auth_user_warehouse import AuthUserWarehouse
from app.models.inventory_warehouse import InventoryWarehouse


def user_warehouse_access(db: Session, user_id: str) -> tuple[list[str], Optional[str]]:
    """(allowed warehouse ids, default id). An empty list means no restriction."""
    rows = (
        db.query(AuthUserWarehouse)
        .filter(AuthUserWarehouse.user_id == user_id)
        .order_by(AuthUserWarehouse.created_at, AuthUserWarehouse.id)
        .all()
    )
    ids = [r.warehouse_id for r in rows]
    default = next((r.warehouse_id for r in rows if r.is_default), ids[0] if ids else None)
    return ids, default


def set_user_warehouses(
    db: Session,
    user: AuthUser,
    warehouse_ids: list[str],
    default_warehouse_id: Optional[str] = None,
) -> None:
    """Replace the user's warehouse access. An empty list lifts the restriction."""
    unique_ids = list(dict.fromkeys(warehouse_ids))
    if unique_ids:
        found = {
            w.id
            for w in db.query(InventoryWarehouse)
            .filter(InventoryWarehouse.id.in_(unique_ids), InventoryWarehouse.company_id == user.company_id)
            .all()
        }
        if len(found) != len(unique_ids):
            raise ValueError("One or more warehouses are invalid")
    if default_warehouse_id and default_warehouse_id not in unique_ids:
        raise ValueError("The default warehouse must be one of the allowed warehouses")

    db.query(AuthUserWarehouse).filter(AuthUserWarehouse.user_id == user.id).delete(synchronize_session=False)
    default = default_warehouse_id or (unique_ids[0] if unique_ids else None)
    for wid in unique_ids:
        db.add(AuthUserWarehouse(user_id=user.id, warehouse_id=wid, is_default=(wid == default)))


def resolve_user_warehouse(
    db: Session,
    user: AuthUser,
    warehouse_id: Optional[str],
    current_warehouse_id: Optional[str] = None,
) -> Optional[str]:
    """Warehouse a document of this user may use.

    Unrestricted users keep whatever they asked for. Restricted users fall back to
    their default when none is given and are refused any warehouse outside their
    list — except the one the document already sits in, so editing a colleague's
    record elsewhere does not start failing.
    """
    allowed, default = user_warehouse_access(db, user.id)
    if not allowed:
        return warehouse_id
    if not warehouse_id:
        return default
    if warehouse_id != current_warehouse_id and warehouse_id not in allowed:
        raise HTTPException(status_code=403, detail="You do not have access to this warehouse")
    return warehouse_id
