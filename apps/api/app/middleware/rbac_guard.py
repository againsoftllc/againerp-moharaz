"""Module-scoped RBAC guard for admin mutations.

Most admin routers only carry the coarse `require_admin_user` / `require_write_access`
dependency, which cannot tell a delete from a write nor one module from another. This
middleware closes that gap centrally: it maps the request path to an RBAC module and
checks the caller's matrix before the route runs. Routers that already declare
`require_permission(...)` simply get the same answer twice.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.middleware.base import BaseHTTPMiddleware

from app.database import SessionLocal
from app.models.auth_session import AuthSession
from app.models.auth_user import AuthUser
from app.services import rbac as rbac_service

API_PREFIX = "/api/v1/"

MUTATION_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

# Paths that authenticate their own callers (storefront shoppers, supplier portal,
# device webhooks) or that must stay reachable to sign in at all.
EXEMPT_PREFIXES = (
    "auth/",
    "storefront/",
    "portal/",
    "ephemeral/",
    "plugins/cloudflare/",
    "plugins/alibaba/",
)

# Longest prefix wins, so "catalog/blog" beats "catalog".
PATH_MODULES: tuple[tuple[str, str], ...] = (
    ("catalog/blog", "blog"),
    ("catalog", "catalog"),
    ("items", "catalog"),
    ("ecommerce/items", "catalog"),
    ("configurator", "catalog"),
    ("commerce/dropship", "dropshipping"),
    ("dropship", "dropshipping"),
    ("hrm", "hrm"),
    ("sales", "sales"),
    ("pos", "sales"),
    ("commerce/orders", "sales"),
    ("commerce/returns", "sales"),
    ("commerce/refunds", "sales"),
    ("marketing", "sales"),
    ("commerce/customers", "customers"),
    ("parties", "customers"),
    ("party-workspace", "customers"),
    ("inventory", "inventory"),
    ("commerce/inventory", "inventory"),
    ("commerce/suppliers", "purchase"),
    ("commerce/supplier-portal", "purchase"),
    ("vendors", "purchase"),
    ("supplier-catalog", "purchase"),
    ("purchase-orders", "purchase"),
    ("purchase-receipts", "purchase"),
    ("rma", "rma"),
    ("media", "media"),
    ("digital-files", "media"),
    ("website", "website"),
    ("seo", "website"),
    ("workspace", "workspace"),
    ("platform-settings", "workspace"),
    ("plugins", "plugins"),
)

# A POST may create or update depending on the endpoint, so either grant passes.
METHOD_ACTIONS: dict[str, tuple[str, ...]] = {
    "POST": ("create", "write"),
    "PUT": ("write", "create"),
    "PATCH": ("write", "create"),
    "DELETE": ("delete",),
}


def resolve_module(path: str) -> str | None:
    """RBAC module for an /api/v1 path, or None when the path is not mapped."""
    if not path.startswith(API_PREFIX):
        return None
    tail = path[len(API_PREFIX) :]
    if tail.startswith(EXEMPT_PREFIXES):
        return None

    best: tuple[int, str] | None = None
    for prefix, module in PATH_MODULES:
        if tail == prefix or tail.startswith(f"{prefix}/"):
            if best is None or len(prefix) > best[0]:
                best = (len(prefix), module)
    return best[1] if best else None


class RbacGuardMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method not in MUTATION_METHODS:
            return await call_next(request)

        module = resolve_module(request.url.path)
        if module is None:
            return await call_next(request)

        authorization = request.headers.get("authorization") or ""
        if not authorization.startswith("Bearer "):
            # Unauthenticated: let the route's own dependency answer with 401.
            return await call_next(request)
        token = authorization.removeprefix("Bearer ").strip()

        actions = METHOD_ACTIONS[request.method]

        def check() -> bool | None:
            """None = no live session/user (the route answers 401 itself). Runs in a worker thread and closes its
            connection before the request goes on — a blocking query here would stall the whole event loop."""
            db = SessionLocal()
            try:
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
                return any(rbac_service.has_permission(db, user, module, action) for action in actions)
            finally:
                db.close()

        allowed = await run_in_threadpool(check)
        if allowed is None:
            return await call_next(request)
        if not allowed:
            return JSONResponse(
                status_code=403,
                content={"detail": f"Missing permission {module}:{actions[0]}"},
            )
        return await call_next(request)
