from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.models.auth_user import AuthUser
from app.models.company import Company
from app.schemas.auth import PermissionOverride, RoleSummary, UserRead
from app.services import rbac as rbac_service
from app.services.auth_user_warehouses import user_warehouse_access
from app.services.core.access_scope import user_overrides, user_payment_account_ids
from app.services.core.auth_security import password_change_due, password_expires_at


def user_read(db: Session, user: AuthUser) -> UserRead:
    roles = rbac_service.user_role_rows(db, user.id)
    company = db.get(Company, user.company_id) if user.company_id else None
    warehouse_ids, default_warehouse_id = user_warehouse_access(db, user.id)
    return UserRead(
        id=user.id,
        email=user.email,
        username=user.username,
        name=user.name,
        role=user.role,
        is_active=user.is_active,
        role_ids=[r.id for r in roles],
        roles=[RoleSummary(id=r.id, name=r.name, slug=r.slug) for r in roles],
        warehouse_ids=warehouse_ids,
        default_warehouse_id=default_warehouse_id,
        company_id=user.company_id,
        company_name=company.name if company else None,
        company_slug=company.slug if company else None,
        must_change_password=bool(user.must_change_password),
        password_change_due=password_change_due(db, user),
        password_changed_at=user.password_changed_at,
        password_expires_at=password_expires_at(db, user),
        last_login_at=user.last_login_at,
        locked_until=user.locked_until if user.locked_until and user.locked_until > datetime.utcnow() else None,
        permission_overrides=[PermissionOverride(module=o.module, action=o.action, allow=o.allow) for o in user_overrides(db, user.id)],
        payment_account_ids=user_payment_account_ids(db, user.id),
    )
