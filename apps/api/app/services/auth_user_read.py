from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.auth_user import AuthUser
from app.models.company import Company
from app.schemas.auth import RoleSummary, UserRead
from app.services import rbac as rbac_service
from app.services.auth_user_warehouses import user_warehouse_access


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
    )
