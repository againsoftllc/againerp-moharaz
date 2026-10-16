"""AI access gate — Center is source of truth (master plan §6, Option C hybrid).

Reuses storefront_feature_flags's existing Center /client/entitlements fetch + cache
(already load-bearing for pc_builder/wishlist/emi/china_import) rather than a second
HTTP round-trip against the same payload — see that module's ai_enabled/ai_access_status
fields. Unbound deployments (no AGAINERP_CLIENT_* configured — single-tenant local) stay
permissive, matching every other flag resolved there.
"""

from __future__ import annotations

from app.services.ecommerce.storefront_feature_flags import resolve_storefront_feature_flags


def ai_access_allowed() -> tuple[bool, str]:
    """(allowed, status). status is Center's access_status when bound, else 'unbound'."""
    resolved = resolve_storefront_feature_flags()
    if not resolved.get("bound"):
        return True, "unbound"
    if not resolved.get("ai_enabled", True):
        return False, resolved.get("ai_access_status") or "disabled"
    return True, resolved.get("ai_access_status") or "active"
