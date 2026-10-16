"""Module-level RBAC — roles grant read/create/write/delete per ERP module."""

from __future__ import annotations

from typing import Iterable

from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models.auth_role import AuthRole
from app.models.auth_role_permission import AuthRolePermission
from app.models.auth_user import AuthUser
from app.models.auth_user_role import AuthUserRole

RBAC_MODULES: tuple[str, ...] = (
    "dashboard",
    "catalog",
    "dropshipping",
    "hrm",
    "sales",
    "customers",
    "inventory",
    "purchase",
    "rma",
    "service",
    "finance",
    "crm",
    "media",
    "blog",
    "website",
    "workspace",
    "plugins",
    "pos",
)

RBAC_ACTIONS: tuple[str, ...] = ("read", "create", "write", "delete")

SYSTEM_MANAGER_SLUG = "system_manager"

# Legacy AuthUser.role string ↔ system role slug
LEGACY_ROLE_TO_SLUG = {
    "admin": SYSTEM_MANAGER_SLUG,
    "system_manager": SYSTEM_MANAGER_SLUG,
    "staff": "staff",
    "viewer": "viewer",
}
SLUG_TO_LEGACY_ROLE = {
    SYSTEM_MANAGER_SLUG: "admin",
    "staff": "staff",
    "viewer": "viewer",
}

BUSINESS_MODULES = (
    "dashboard",
    "catalog",
    "dropshipping",
    "hrm",
    "sales",
    "customers",
    "inventory",
    "purchase",
    "rma",
    "service",
    "finance",
    "crm",
    "media",
    "blog",
    "website",
    "pos",
)


def module_registry() -> list[dict[str, str]]:
    labels = {
        "dashboard": "Dashboard",
        "catalog": "Catalog",
        "dropshipping": "Dropshipping",
        "hrm": "HRM",
        "sales": "Sales",
        "customers": "Customers",
        "inventory": "Inventory",
        "purchase": "Purchase & Suppliers",
        "rma": "RMA & Warranty",
        "service": "Service",
        "finance": "Finance",
        "crm": "CRM",
        "media": "Media",
        "blog": "Blog",
        "website": "Website",
        "workspace": "Workspace",
        "plugins": "Plugins",
        "pos": "POS",
    }
    return [{"id": m, "label": labels.get(m, m.title())} for m in RBAC_MODULES]


def _empty_matrix() -> dict[str, set[str]]:
    return {m: set() for m in RBAC_MODULES}


def _full_matrix() -> dict[str, set[str]]:
    return {m: set(RBAC_ACTIONS) for m in RBAC_MODULES}


def visible_roles_query(db: Session, company_id: str):
    """Roles a company may see and assign.

    System roles are seeded once and shared by every company; custom roles
    belong to the company that created them. Without this filter one tenant
    could list, edit and assign another tenant's roles.
    """
    return db.query(AuthRole).filter(
        or_(AuthRole.is_system.is_(True), AuthRole.company_id == company_id)
    )


def role_visible_to(role: AuthRole, company_id: str) -> bool:
    return bool(role.is_system) or role.company_id == company_id


def user_role_rows(db: Session, user_id: str) -> list[AuthRole]:
    links = (
        db.query(AuthUserRole)
        .filter(AuthUserRole.user_id == user_id)
        .all()
    )
    roles: list[AuthRole] = []
    for link in links:
        role = link.role if link.role is not None else db.get(AuthRole, link.role_id)
        if role and role.is_active:
            roles.append(role)
    return roles


def user_permissions(db: Session, user: AuthUser) -> dict[str, set[str]]:
    """Union of permissions across all assigned roles. System Manager → all."""
    roles = user_role_rows(db, user.id)
    if not roles:
        # Fallback: derive from legacy AuthUser.role until backfill runs
        slug = LEGACY_ROLE_TO_SLUG.get(user.role, user.role)
        role = db.query(AuthRole).filter(AuthRole.slug == slug).first()
        if role:
            roles = [role]

    if any(r.slug == SYSTEM_MANAGER_SLUG for r in roles):
        return _full_matrix()

    matrix = _empty_matrix()
    role_ids = [r.id for r in roles]
    if not role_ids:
        return matrix

    rows = (
        db.query(AuthRolePermission)
        .filter(AuthRolePermission.role_id.in_(role_ids))
        .all()
    )
    for row in rows:
        if row.module not in matrix:
            matrix[row.module] = set()
        if row.can_read:
            matrix[row.module].add("read")
        if row.can_create:
            matrix[row.module].add("create")
        if row.can_write:
            matrix[row.module].add("write")
        if row.can_delete:
            matrix[row.module].add("delete")
    return matrix


def permissions_for_api(db: Session, user: AuthUser) -> dict[str, list[str]]:
    raw = user_permissions(db, user)
    return {module: sorted(actions) for module, actions in raw.items() if actions}


def has_permission(db: Session, user: AuthUser, module: str, action: str) -> bool:
    if action not in RBAC_ACTIONS:
        return False
    perms = user_permissions(db, user)
    return action in perms.get(module, set())


def has_any_module_action(
    db: Session,
    user: AuthUser,
    action: str,
    modules: Iterable[str] | None = None,
) -> bool:
    perms = user_permissions(db, user)
    targets = modules or RBAC_MODULES
    return any(action in perms.get(m, set()) for m in targets)


def is_system_manager(db: Session, user: AuthUser) -> bool:
    roles = user_role_rows(db, user.id)
    if roles:
        # Assigned roles are authoritative; a stale legacy role string must not
        # grant System Manager to someone who was demoted.
        return any(r.slug == SYSTEM_MANAGER_SLUG for r in roles)
    return user.role in {"admin", SYSTEM_MANAGER_SLUG}


def sync_legacy_role(user: AuthUser, roles: list[AuthRole]) -> None:
    """Keep AuthUser.role in sync for old clients / compat guards."""
    if not roles:
        return
    # Prefer system_manager > staff > viewer > first custom
    by_slug = {r.slug: r for r in roles}
    if SYSTEM_MANAGER_SLUG in by_slug:
        user.role = "admin"
        return
    if "staff" in by_slug:
        user.role = "staff"
        return
    if "viewer" in by_slug:
        user.role = "viewer"
        return
    user.role = roles[0].slug


def set_user_roles(db: Session, user: AuthUser, role_ids: list[str]) -> list[AuthRole]:
    """Replace user role assignments and sync legacy AuthUser.role."""
    unique_ids = list(dict.fromkeys(role_ids))
    if not unique_ids:
        raise ValueError("At least one role is required")

    query = db.query(AuthRole).filter(AuthRole.id.in_(unique_ids), AuthRole.is_active.is_(True))
    roles = [r for r in query.all() if role_visible_to(r, user.company_id)]
    if len(roles) != len(unique_ids):
        raise ValueError("One or more roles are invalid")

    db.query(AuthUserRole).filter(AuthUserRole.user_id == user.id).delete()
    for role in roles:
        db.add(AuthUserRole(user_id=user.id, role_id=role.id))
    sync_legacy_role(user, roles)
    return roles


def default_permission_flags(slug: str, module: str) -> dict[str, bool]:
    """Seed matrix for system roles."""
    if slug == SYSTEM_MANAGER_SLUG:
        return {"can_read": True, "can_create": True, "can_write": True, "can_delete": True}

    if slug == "viewer":
        return {
            "can_read": module != "plugins",
            "can_create": False,
            "can_write": False,
            "can_delete": False,
        }

    if slug == "staff":
        # Ops write; no workspace/plugins manage
        if module in {"workspace", "plugins"}:
            return {"can_read": module == "workspace", "can_create": False, "can_write": False, "can_delete": False}
        return {"can_read": True, "can_create": True, "can_write": True, "can_delete": False}

    # Custom role default: read-only business modules
    return {
        "can_read": module in BUSINESS_MODULES,
        "can_create": False,
        "can_write": False,
        "can_delete": False,
    }


def ensure_role_permissions(db: Session, role: AuthRole) -> None:
    existing = {p.module for p in role.permissions}
    for module in RBAC_MODULES:
        if module in existing:
            continue
        flags = default_permission_flags(role.slug, module)
        db.add(
            AuthRolePermission(
                role_id=role.id,
                module=module,
                **flags,
            )
        )


SYSTEM_ROLES_SEED = (
    {
        "id": "role_system_manager",
        "name": "System Manager",
        "slug": SYSTEM_MANAGER_SLUG,
        "description": "Full access to all modules",
    },
    {
        "id": "role_staff",
        "name": "Staff",
        "slug": "staff",
        "description": "Day-to-day operations without workspace/plugins admin",
    },
    {
        "id": "role_viewer",
        "name": "Viewer",
        "slug": "viewer",
        "description": "Read-only access across modules",
    },
)


def seed_rbac(db: Session) -> dict[str, int]:
    """Create system roles, permissions, and backfill user_roles from AuthUser.role."""
    created_roles = 0
    created_links = 0

    for item in SYSTEM_ROLES_SEED:
        role = db.get(AuthRole, item["id"]) or db.query(AuthRole).filter(AuthRole.slug == item["slug"]).first()
        if not role:
            role = AuthRole(
                id=item["id"],
                name=item["name"],
                slug=item["slug"],
                description=item["description"],
                is_system=True,
                is_active=True,
            )
            db.add(role)
            db.flush()
            created_roles += 1
        ensure_role_permissions(db, role)

    db.flush()

    slug_to_role = {r.slug: r for r in db.query(AuthRole).all()}
    users = db.query(AuthUser).all()
    for user in users:
        existing = db.query(AuthUserRole).filter(AuthUserRole.user_id == user.id).count()
        if existing:
            continue
        slug = LEGACY_ROLE_TO_SLUG.get(user.role, "viewer")
        role = slug_to_role.get(slug) or slug_to_role.get("viewer")
        if not role:
            continue
        db.add(AuthUserRole(user_id=user.id, role_id=role.id))
        sync_legacy_role(user, [role])
        created_links += 1

    if created_roles or created_links:
        db.commit()
    else:
        db.commit()  # permission rows may have been added

    return {"roles": created_roles, "links": created_links}
