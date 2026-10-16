"""Sales module permission helpers — delegates to central RBAC when db is available."""

from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.auth_user import AuthUser
from app.services import rbac as rbac_service

SALES_READ_ROLES = frozenset({"admin", "staff", "viewer", "system_manager"})
SALES_WRITE_ROLES = frozenset({"admin", "staff", "system_manager"})
SALES_MANAGER_ROLES = frozenset({"admin", "system_manager"})


def require_sales_read(user: AuthUser, db: Optional[Session] = None) -> AuthUser:
    if user.role in SALES_READ_ROLES:
        return user
    if db is not None and rbac_service.has_permission(db, user, "sales", "read"):
        return user
    raise HTTPException(status_code=403, detail="Sales read access required")


def require_sales_write(user: AuthUser, db: Optional[Session] = None) -> AuthUser:
    if user.role in SALES_WRITE_ROLES:
        return user
    if db is not None and (
        rbac_service.has_permission(db, user, "sales", "write")
        or rbac_service.has_permission(db, user, "sales", "create")
    ):
        return user
    raise HTTPException(status_code=403, detail="Sales write access required")


def require_sales_manager(user: AuthUser, db: Optional[Session] = None) -> AuthUser:
    if user.role in SALES_MANAGER_ROLES:
        return user
    if db is not None and (
        rbac_service.is_system_manager(db, user)
        or rbac_service.has_permission(db, user, "sales", "delete")
    ):
        return user
    raise HTTPException(status_code=403, detail="Sales manager access required")


def can_delete_sales_order(user: AuthUser, db: Optional[Session] = None) -> bool:
    if user.role in SALES_WRITE_ROLES or user.role in SALES_MANAGER_ROLES:
        return True
    if db is None:
        return False
    return rbac_service.has_permission(db, user, "sales", "delete") or rbac_service.has_permission(
        db, user, "sales", "write"
    )


def can_bulk_update_sales(user: AuthUser, db: Optional[Session] = None) -> bool:
    if user.role in SALES_WRITE_ROLES:
        return True
    if db is None:
        return False
    return rbac_service.has_permission(db, user, "sales", "write")
