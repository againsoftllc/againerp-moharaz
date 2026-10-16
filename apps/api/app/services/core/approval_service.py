"""Amount-based approval limits.

A limit answers one question: may *this* user approve a document worth *this*
much? Roles with no row are unlimited, so the feature is opt-in and an ERP that
never configures it behaves exactly as before.

A user with several roles gets the most permissive limit — the same way access
rights add up rather than intersect.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Dict, Iterable, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.approval_limit import ApprovalLimit

# Document types that carry an approval ceiling, with the label shown in Workspace.
APPROVAL_DOCUMENTS: Dict[str, str] = {
    "finance.expense": "Expense approval",
    "finance.payment": "Payment",
    "purchase.order": "Purchase order confirmation",
    "sales.order": "Sales order confirmation",
    "purchase.return": "Purchase return",
    "sales.return": "Sales return",
}


def _role_slugs(db: Session, user) -> List[str]:
    """Assigned role slugs, falling back to the legacy `AuthUser.role` string —
    the same resolution order RBAC itself uses."""
    from app.services.rbac import LEGACY_ROLE_TO_SLUG, user_role_rows

    slugs = [r.slug for r in user_role_rows(db, user.id) if r.slug]
    if not slugs:
        legacy = (getattr(user, "role", "") or "").strip()
        if legacy:
            slugs = [LEGACY_ROLE_TO_SLUG.get(legacy, legacy)]
    return slugs


def effective_limit(
    db: Session,
    company_id: str,
    role_slugs: Iterable[str],
    document_type: str,
) -> Optional[Decimal]:
    """Highest ceiling across the user's roles, or None when unlimited."""
    slugs = [s for s in role_slugs if s]
    if not slugs:
        return None
    rows = (
        db.query(ApprovalLimit)
        .filter(
            ApprovalLimit.company_id == company_id,
            ApprovalLimit.document_type == document_type,
            ApprovalLimit.role_slug.in_(slugs),
            ApprovalLimit.is_active.is_(True),
        )
        .all()
    )
    if not rows:
        return None
    # A role without a row is unlimited, so any such role lifts the ceiling.
    if len(rows) < len(set(slugs)):
        return None
    return max(Decimal(str(r.max_amount)) for r in rows)


def assert_can_approve(
    db: Session,
    company_id: str,
    user,
    document_type: str,
    amount,
    *,
    what: Optional[str] = None,
) -> None:
    """Reject an approval that exceeds the user's ceiling for this document."""
    if amount is None:
        return
    limit = effective_limit(db, company_id, _role_slugs(db, user), document_type)
    if limit is None:
        return
    value = Decimal(str(amount))
    if value > limit:
        label = what or APPROVAL_DOCUMENTS.get(document_type, "document")
        raise HTTPException(
            status_code=403,
            detail=(
                f"Your approval limit for {label} is {limit:,.2f}. "
                f"This document is {value:,.2f} — ask someone with a higher limit to approve it."
            ),
        )
