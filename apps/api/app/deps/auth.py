from __future__ import annotations

from datetime import datetime
from typing import Callable, Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.auth_session import AuthSession
from app.models.auth_user import AuthUser
from app.models.company import Company
from app.services import audit_actor  # noqa: F401 - registers the 'updated by' hook
from app.services import rbac as rbac_service

WRITE_ROLES = frozenset({"admin", "staff", "system_manager"})
ADMIN_ROLES = frozenset({"admin", "system_manager"})
INACTIVE_COMPANY_STATUSES = frozenset({"suspended", "cancelled"})


def _check_company_active(db: Session, company_id: str) -> None:
    company = db.get(Company, company_id)
    if not company:
        return
    if company.status in INACTIVE_COMPANY_STATUSES:
        raise HTTPException(
            status_code=402,
            detail={"code": "subscription_inactive", "status": company.status},
        )
    if company.status == "trialing" and company.trial_ends_at and company.trial_ends_at < datetime.utcnow():
        raise HTTPException(
            status_code=402,
            detail={"code": "subscription_inactive", "status": "trial_expired"},
        )
    if (
        company.status == "active"
        and company.subscription_ends_at
        and company.subscription_ends_at < datetime.utcnow()
    ):
        raise HTTPException(
            status_code=402,
            detail={"code": "subscription_inactive", "status": "subscription_expired"},
        )


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> AuthUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.removeprefix("Bearer ").strip()
    session = (
        db.query(AuthSession)
        .filter(AuthSession.token == token, AuthSession.expires_at > datetime.utcnow())
        .first()
    )
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    user = db.get(AuthUser, session.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User inactive")
    _check_company_active(db, user.company_id)
    db.info["actor"] = (user.id, user.name)  # the "updated by" stamp of this request's saves (services/audit_actor.py)
    return user


def get_current_company_id(user: AuthUser = Depends(get_current_user)) -> str:
    return user.company_id


def require_permission(module: str, action: str) -> Callable[..., AuthUser]:
    """FastAPI dependency factory — require module×action permission."""

    def _dep(
        user: AuthUser = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> AuthUser:
        if not rbac_service.has_permission(db, user, module, action):
            raise HTTPException(status_code=403, detail=f"Missing permission {module}:{action}")
        return user

    return _dep


def require_write_access(
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuthUser:
    """Compat: any business-module write OR legacy admin/staff role."""
    if user.role in WRITE_ROLES:
        return user
    if rbac_service.has_any_module_action(db, user, "write", rbac_service.BUSINESS_MODULES):
        return user
    if rbac_service.has_any_module_action(db, user, "create", rbac_service.BUSINESS_MODULES):
        return user
    raise HTTPException(status_code=403, detail="Read-only access")


def require_admin_user(
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuthUser:
    """Compat: workspace:write or system manager / legacy admin."""
    if user.role in ADMIN_ROLES:
        return user
    if rbac_service.is_system_manager(db, user):
        return user
    if rbac_service.has_permission(db, user, "workspace", "write"):
        return user
    raise HTTPException(status_code=403, detail="Admin access required")


def require_system_manager(
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuthUser:
    """Only the System Manager role — used for account administration."""
    if not rbac_service.is_system_manager(db, user):
        raise HTTPException(status_code=403, detail="System Manager access required")
    return user


def get_optional_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> Optional[AuthUser]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ").strip()
    session = (
        db.query(AuthSession)
        .filter(AuthSession.token == token, AuthSession.expires_at > datetime.utcnow())
        .first()
    )
    if not session:
        return None
    user = db.get(AuthUser, session.user_id)
    if not user or not user.is_active:
        return None
    return user
