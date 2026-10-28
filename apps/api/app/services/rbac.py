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
    # Privileged RMA actions: a role needs the matching `write` grant (System Manager has them all).
    "rma_approve",
    "rma_override",
    "rma_reprint",
    "rma_claim_approve",
    "rma_dispatch",
    "rma_receive_approve",
    "rma_serial_change",
    "rma_delivery_approve",
    "rma_payment",
    "rma_settlement_approve",
    "rma_stock_adjust",
)

# Not part of anyone's default access beyond System Manager — granted per role in the role editor.
PRIVILEGED_MODULES: frozenset[str] = frozenset(
    {
        "rma_approve",
        "rma_override",
        "rma_reprint",
        "rma_claim_approve",
        "rma_dispatch",
        "rma_receive_approve",
        "rma_serial_change",
        "rma_delivery_approve",
        "rma_payment",
        "rma_settlement_approve",
        "rma_stock_adjust",
    }
)

RBAC_ACTIONS: tuple[str, ...] = ("read", "create", "write", "delete", "publish", "export", "approve")

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


# How the role editor groups the module rows (Odoo shows access rights per application), and what each one opens.
MODULE_GROUPS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Sales & customers", ("sales", "customers", "crm", "pos")),
    ("Inventory & purchasing", ("inventory", "purchase", "catalog", "dropshipping")),
    ("Finance", ("finance",)),
    ("People", ("hrm",)),
    ("After-sales", ("rma", "service")),
    ("Website & content", ("website", "blog", "media")),
    ("Workspace", ("dashboard", "workspace", "plugins")),
)

MODULE_LABELS: dict[str, str] = {
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
    "rma_approve": "Approve / reject complaints",
    "rma_override": "Override protected fields (supplier, lookup exception)",
    "rma_reprint": "Reprint documents",
    "rma_claim_approve": "Approve supplier claims",
    "rma_dispatch": "Dispatch units to a supplier",
    "rma_receive_approve": "Approve supplier receipts",
    "rma_serial_change": "Change the actual received serial",
    "rma_delivery_approve": "Approve customer deliveries",
    "rma_payment": "Record settlements (money in / money out)",
    "rma_settlement_approve": "Approve and post settlements",
    "rma_stock_adjust": "Release to stock, scrap, issue a replacement from stock",
}

MODULE_HINTS: dict[str, str] = {
    "dashboard": "The home dashboards and KPI widgets.",
    "catalog": "Products, brands, categories, prices and images.",
    "dropshipping": "Supplier-shipped orders and the 1688 import.",
    "hrm": "Employees, payroll, attendance, leave and recruitment — sensitive personal data.",
    "sales": "Quotations, sales orders, deliveries and sales returns.",
    "customers": "Customer records, groups, wallets and loyalty points.",
    "inventory": "Stock levels, transfers, adjustments, counts and serial numbers.",
    "purchase": "Suppliers, purchase orders, receipts and purchase returns.",
    "rma": "Warranty complaints, supplier claims and settlements.",
    "service": "Service jobs and repair work orders.",
    "finance": "Journals, payments, expenses, cheques, ledgers and reports — money data.",
    "crm": "Leads, tickets and follow-ups.",
    "media": "The shared image and file library.",
    "blog": "Blog articles.",
    "website": "Website pages, menus and storefront content.",
    "workspace": "Company setup, users, roles and settings. Write access here is administration.",
    "plugins": "Plugin settings and keys.",
    "pos": "The point-of-sale screen and cash sessions.",
}


def module_registry() -> list[dict[str, str]]:
    group_of = {m: g for g, mods in MODULE_GROUPS for m in mods}
    out: list[dict[str, str]] = []
    for m in RBAC_MODULES:
        privileged = m in PRIVILEGED_MODULES
        out.append(
            {
                "id": m,
                "label": MODULE_LABELS.get(m, m.title()),
                "group": "RMA special permissions" if privileged else group_of.get(m, "Other"),
                "hint": "Needs the Write box: a role can do this only when it is ticked." if privileged else MODULE_HINTS.get(m, ""),
            }
        )
    return out


# Job-based starting points for a new role. The letters are the boxes ticked per module:
# R read · C create · W write · D delete · P publish · E export · A approve. A module not listed gets nothing.
_ROLE_TEMPLATES: dict[str, dict] = {
    "operations-manager": {
        "name": "Operations Manager",
        "description": "Runs day-to-day operations across sales, stock, purchasing and after-sales, and approves what staff prepare. No delete, no workspace or plugin administration.",
        "grants": {
            "dashboard": "RE", "catalog": "RCWPE", "dropshipping": "RCWPE", "sales": "RCWPEA", "customers": "RCWPEA",
            "inventory": "RCWPEA", "purchase": "RCWPEA", "rma": "RCWPEA", "service": "RCWPE", "finance": "RCWEA",
            "crm": "RCWPE", "pos": "RCWE", "media": "RCWPE", "blog": "RCWPE", "website": "RCWPE", "hrm": "R", "workspace": "R",
            "rma_approve": "RW", "rma_claim_approve": "RW", "rma_delivery_approve": "RW", "rma_receive_approve": "RW",
            "rma_settlement_approve": "RW", "rma_dispatch": "RW", "rma_reprint": "RW",
        },
    },
    "sales-executive": {
        "name": "Sales Executive",
        "description": "Quotes and sells: sales orders, customers, leads and the POS. Sees stock and the catalog but cannot change them; sees finance but cannot post to it.",
        "grants": {
            "dashboard": "R", "sales": "RCWPE", "customers": "RCWE", "crm": "RCWPE", "pos": "RCW", "catalog": "R",
            "inventory": "R", "finance": "R", "rma": "RC",
        },
    },
    "purchase-officer": {
        "name": "Purchase Officer",
        "description": "Manages suppliers and purchase orders and receives goods into stock. Reads the catalog and finance.",
        "grants": {
            "dashboard": "R", "purchase": "RCWPE", "inventory": "RCWE", "catalog": "R", "finance": "R", "dropshipping": "R",
        },
    },
    "warehouse-keeper": {
        "name": "Warehouse Keeper",
        "description": "Owns stock: transfers, adjustments, counts and serial numbers. Reads orders and purchases to pick and receive; no prices, no finance.",
        "grants": {
            "dashboard": "R", "inventory": "RCWPE", "purchase": "R", "sales": "R", "catalog": "R", "rma": "R", "dropshipping": "R",
        },
    },
    "accountant": {
        "name": "Accountant",
        "description": "Keeps the books: journals, payments, expenses, cheques and reports, with approval. Reads sales, purchases and stock to reconcile; no HR, no delete.",
        "grants": {
            "dashboard": "R", "finance": "RCWEA", "sales": "RE", "purchase": "RE", "customers": "RE", "inventory": "RE",
            "catalog": "R", "workspace": "R",
        },
    },
    "hr-officer": {
        "name": "HR Officer",
        "description": "People records: employees, attendance, leave, payroll and recruitment. Nothing else.",
        "grants": {"dashboard": "R", "hrm": "RCWDEA", "workspace": "R"},
    },
    "service-technician": {
        "name": "Service Technician",
        "description": "Works service jobs and RMA complaints. Reads customers, sales and stock; cannot approve or settle anything.",
        "grants": {
            "dashboard": "R", "service": "RCW", "rma": "RCW", "customers": "R", "sales": "R", "inventory": "R", "catalog": "R",
            "rma_reprint": "RW",
        },
    },
    "rma-manager": {
        "name": "RMA Manager",
        "description": "Owns warranty and supplier claims end to end: approves complaints, claims, deliveries and settlements, dispatches to suppliers, and releases stock. Cannot override protected fields or change a received serial.",
        "grants": {
            "dashboard": "R", "rma": "RCWPEA", "service": "RCWE", "customers": "R", "sales": "R", "inventory": "R",
            "purchase": "R", "finance": "R", "catalog": "R",
            "rma_approve": "RW", "rma_claim_approve": "RW", "rma_dispatch": "RW", "rma_receive_approve": "RW",
            "rma_delivery_approve": "RW", "rma_payment": "RW", "rma_settlement_approve": "RW", "rma_stock_adjust": "RW",
            "rma_reprint": "RW",
        },
    },
    "content-editor": {
        "name": "Content Editor",
        "description": "Website, blog and media, plus product descriptions and images. Nothing that touches money or stock.",
        "grants": {"dashboard": "R", "website": "RCWPE", "blog": "RCWPE", "media": "RCWPE", "catalog": "RCWP"},
    },
    "pos-cashier": {
        "name": "POS Cashier",
        "description": "Sells at the till and registers walk-in customers. Reads the catalog and stock; no reports, no returns approval.",
        "grants": {"pos": "RCW", "customers": "RC", "catalog": "R", "inventory": "R", "rma": "R"},
    },
    "auditor": {
        "name": "Auditor",
        "description": "Reads and exports everything the business records — including finance and HR — and changes nothing.",
        "grants": {m: "RE" for m in BUSINESS_MODULES} | {"workspace": "R"},
    },
}

_ACTION_LETTERS = {
    "R": "can_read",
    "C": "can_create",
    "W": "can_write",
    "D": "can_delete",
    "P": "can_publish",
    "E": "can_export",
    "A": "can_approve",
}


def role_templates() -> list[dict]:
    return [
        {
            "id": tid,
            "name": t["name"],
            "description": t["description"],
            "permissions": [
                {"module": m, **template_flags(tid, m)} for m in RBAC_MODULES if t["grants"].get(m)
            ],
        }
        for tid, t in _ROLE_TEMPLATES.items()
    ]


def template_flags(template_id: str, module: str) -> dict[str, bool]:
    letters = _ROLE_TEMPLATES[template_id]["grants"].get(module, "")
    flags = {key: False for key in _ACTION_LETTERS.values()}
    for letter in letters:
        flags[_ACTION_LETTERS[letter]] = True
    if any(flags.values()):
        flags["can_read"] = True  # every other box needs Read
    return flags


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
    """What the member may do: their roles, then their own allow / deny overrides (not for a System Manager), then only the
    modules the company has (services/core/access_scope.py)."""
    from app.services.core.access_scope import apply_user_overrides, restrict_to_company_modules

    matrix, system_manager = _role_permissions(db, user)
    if not system_manager:
        matrix = apply_user_overrides(db, user, matrix)
    return restrict_to_company_modules(db, user.company_id, matrix)


def _role_permissions(db: Session, user: AuthUser) -> tuple[dict[str, set[str]], bool]:
    """Union of permissions across all assigned roles, and whether one of them is System Manager (→ all)."""
    roles = user_role_rows(db, user.id)
    if not roles:
        # Fallback: derive from legacy AuthUser.role until backfill runs
        slug = LEGACY_ROLE_TO_SLUG.get(user.role, user.role)
        role = db.query(AuthRole).filter(AuthRole.slug == slug).first()
        if role:
            roles = [role]

    if any(r.slug == SYSTEM_MANAGER_SLUG for r in roles):
        return _full_matrix(), True

    matrix = _empty_matrix()
    role_ids = [r.id for r in roles]
    if not role_ids:
        return matrix, False

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
        if getattr(row, "can_publish", False):
            matrix[row.module].add("publish")
        if getattr(row, "can_export", False):
            matrix[row.module].add("export")
        if getattr(row, "can_approve", False):
            matrix[row.module].add("approve")
    return matrix, False


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
        return {"can_read": True, "can_create": True, "can_write": True, "can_delete": True, "can_publish": True, "can_export": True, "can_approve": True}

    if module in PRIVILEGED_MODULES:
        return {"can_read": False, "can_create": False, "can_write": False, "can_delete": False, "can_publish": False, "can_export": False, "can_approve": False}

    if slug == "viewer":
        return {
            "can_read": module != "plugins",
            "can_create": False,
            "can_write": False,
            "can_delete": False,
            "can_publish": False,
            "can_export": False,
            "can_approve": False,
        }

    if slug == "staff":
        # Ops write; no workspace/plugins manage
        if module in {"workspace", "plugins"}:
            return {"can_read": module == "workspace", "can_create": False, "can_write": False, "can_delete": False, "can_publish": False, "can_export": False, "can_approve": False}
        return {"can_read": True, "can_create": True, "can_write": True, "can_delete": False, "can_publish": True, "can_export": True, "can_approve": False}

    # Custom role default: read-only on the business modules, except the two that hold money and personal data — a role gets
    # Finance or HR access only when someone ticks it.
    return {
        "can_read": module in BUSINESS_MODULES and module not in {"finance", "hrm"},
        "can_create": False,
        "can_write": False,
        "can_delete": False,
        "can_publish": False,
        "can_export": False,
        "can_approve": False,
    }


def apply_role_template(db: Session, role: AuthRole, template_id: str) -> None:
    """Fill a new role's matrix from one of the job-based templates."""
    if template_id not in _ROLE_TEMPLATES:
        raise ValueError("Unknown role template")
    for module in RBAC_MODULES:
        db.add(AuthRolePermission(role_id=role.id, module=module, **template_flags(template_id, module)))
    db.flush()


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
