"""Workspace role + permission matrix API."""

from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, require_admin_user, require_system_manager
from app.models.auth_role import AuthRole
from app.models.auth_role_permission import AuthRolePermission
from app.models.auth_user import AuthUser
from app.models.auth_user_role import AuthUserRole
from app.schemas.auth_roles import (
    ModuleInfo,
    ModuleListResponse,
    RoleCreate,
    RoleListResponse,
    RolePermissionFlags,
    RolePermissionsPut,
    RoleRead,
    RoleResponse,
    RoleUpdate,
)
from app.services import rbac as rbac_service

router = APIRouter(prefix="/roles", tags=["auth-roles"])


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:64] or f"role-{uuid.uuid4().hex[:8]}"


def _role_read(db: Session, role: AuthRole) -> RoleRead:
    perms = (
        db.query(AuthRolePermission)
        .filter(AuthRolePermission.role_id == role.id)
        .order_by(AuthRolePermission.module)
        .all()
    )
    by_module = {p.module: p for p in perms}
    # Ensure every registry module appears in the response
    flags: list[RolePermissionFlags] = []
    for module in rbac_service.RBAC_MODULES:
        p = by_module.get(module)
        if p:
            flags.append(
                RolePermissionFlags(
                    module=module,
                    can_read=p.can_read,
                    can_create=p.can_create,
                    can_write=p.can_write,
                    can_delete=p.can_delete,
                    can_publish=bool(getattr(p, "can_publish", False)),
                    can_export=bool(getattr(p, "can_export", False)),
                    can_approve=bool(getattr(p, "can_approve", False)),
                )
            )
        else:
            flags.append(RolePermissionFlags(module=module))

    user_count = db.query(AuthUserRole).filter(AuthUserRole.role_id == role.id).count()
    return RoleRead(
        id=role.id,
        name=role.name,
        slug=role.slug,
        description=role.description,
        is_system=role.is_system,
        is_active=role.is_active,
        permissions=flags,
        user_count=user_count,
        created_at=role.created_at,
        updated_at=role.updated_at,
    )


def _require_role(db: Session, role_id: str, company_id: str) -> AuthRole:
    """Load a role the caller's company actually owns (or a shared system role)."""
    role = db.get(AuthRole, role_id)
    if not role or not rbac_service.role_visible_to(role, company_id):
        raise HTTPException(status_code=404, detail="Role not found")
    return role


@router.get("/modules", response_model=ModuleListResponse)
def list_modules(
    _: AuthUser = Depends(require_admin_user),
) -> ModuleListResponse:
    return ModuleListResponse(data=[ModuleInfo(**m) for m in rbac_service.module_registry()])


@router.get("", response_model=RoleListResponse)
def list_roles(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_admin_user),
    company_id: str = Depends(get_current_company_id),
) -> RoleListResponse:
    rows = (
        rbac_service.visible_roles_query(db, company_id)
        .order_by(AuthRole.is_system.desc(), AuthRole.name)
        .all()
    )
    return RoleListResponse(data=[_role_read(db, r) for r in rows])


@router.post("", response_model=RoleResponse, status_code=201)
def create_role(
    payload: RoleCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_system_manager),
    company_id: str = Depends(get_current_company_id),
) -> RoleResponse:
    slug = (payload.slug or _slugify(payload.name)).lower()
    # Slugs collide only within what this company can see — another tenant's
    # custom role of the same name is none of its business.
    taken = (
        rbac_service.visible_roles_query(db, company_id)
        .filter(AuthRole.slug == slug)
        .first()
    )
    if taken:
        raise HTTPException(status_code=409, detail="Role slug already exists")
    role = AuthRole(
        company_id=company_id,
        name=payload.name.strip(),
        slug=slug,
        description=(payload.description or "").strip() or None,
        is_system=False,
        is_active=True,
    )
    db.add(role)
    db.flush()
    rbac_service.ensure_role_permissions(db, role)
    db.commit()
    db.refresh(role)
    return RoleResponse(data=_role_read(db, role))


@router.get("/{role_id}", response_model=RoleResponse)
def get_role(
    role_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_admin_user),
    company_id: str = Depends(get_current_company_id),
) -> RoleResponse:
    role = _require_role(db, role_id, company_id)
    return RoleResponse(data=_role_read(db, role))


@router.patch("/{role_id}", response_model=RoleResponse)
def update_role(
    role_id: str,
    payload: RoleUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_system_manager),
    company_id: str = Depends(get_current_company_id),
) -> RoleResponse:
    role = _require_role(db, role_id, company_id)
    if payload.name is not None:
        role.name = payload.name.strip()
    if payload.description is not None:
        role.description = payload.description.strip() or None
    if payload.is_active is not None:
        if role.is_system and not payload.is_active:
            raise HTTPException(status_code=400, detail="Cannot deactivate a system role")
        role.is_active = payload.is_active
    db.commit()
    db.refresh(role)
    return RoleResponse(data=_role_read(db, role))


@router.delete("/{role_id}", status_code=204)
def delete_role(
    role_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_system_manager),
    company_id: str = Depends(get_current_company_id),
) -> None:
    role = _require_role(db, role_id, company_id)
    if role.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete a system role")
    in_use = db.query(AuthUserRole).filter(AuthUserRole.role_id == role.id).count()
    if in_use:
        raise HTTPException(status_code=400, detail="Role is assigned to users")
    db.delete(role)
    db.commit()


@router.put("/{role_id}/permissions", response_model=RoleResponse)
def put_role_permissions(
    role_id: str,
    payload: RolePermissionsPut,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_system_manager),
    company_id: str = Depends(get_current_company_id),
) -> RoleResponse:
    role = _require_role(db, role_id, company_id)
    if role.slug == rbac_service.SYSTEM_MANAGER_SLUG:
        raise HTTPException(status_code=400, detail="System Manager permissions are fixed")

    by_module = {p.module: p for p in payload.permissions}
    for module in rbac_service.RBAC_MODULES:
        flags = by_module.get(module) or RolePermissionFlags(module=module)
        row = (
            db.query(AuthRolePermission)
            .filter(AuthRolePermission.role_id == role.id, AuthRolePermission.module == module)
            .first()
        )
        if not row:
            row = AuthRolePermission(role_id=role.id, module=module)
            db.add(row)
        row.can_read = bool(flags.can_read)
        row.can_create = bool(flags.can_create)
        row.can_write = bool(flags.can_write)
        row.can_delete = bool(flags.can_delete)
        row.can_publish = bool(flags.can_publish)
        row.can_export = bool(flags.can_export)
        row.can_approve = bool(flags.can_approve)
        # create/write/delete/publish/approve imply read
        if row.can_create or row.can_write or row.can_delete or row.can_publish or row.can_export or row.can_approve:
            row.can_read = True

    db.commit()
    db.refresh(role)
    return RoleResponse(data=_role_read(db, role))
