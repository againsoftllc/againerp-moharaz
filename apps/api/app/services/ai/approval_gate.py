"""AI approval gate — STEP 15.

The AI-specific piece is intentionally small: `approval_service.py`'s
`effective_limit` already answers "may this user approve this much", live-tested
this session for human-originated purchase/sales/expense confirmation (commit
5b973f4). This reuses that same calculation rather than a parallel one — a tool
call whose amount exceeds the caller's limit creates an `ai_approvals` row
instead of executing, mirroring the ERP's own guardrail instead of reinventing
it (master plan §23). A limit-less role (no `approval_limits` row) stays
unlimited here too, same as the human-originated path.

Deliberately status-transition only: resolving a pending row (see the
`/approvals/{id}/resolve` route) records the decision for audit but does not
re-execute the original tool call — re-running a financial action from a
possibly-stale approval click without re-validating current state is a real
design question of its own, not assumed away here.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.ai_approval import AiApproval
from app.services.core.approval_service import _role_slugs, effective_limit


@dataclass
class ApprovalDecision:
    allowed: bool
    approval_id: Optional[str] = None
    limit: Optional[Decimal] = None


def check_or_create_approval(
    db: Session,
    *,
    company_id: str,
    user: Any,
    tool_name: str,
    document_type: str,
    amount,
    summary: str,
    risk: str = "high",
    entity: str = "",
) -> ApprovalDecision:
    """Mirrors assert_can_approve's own limit check, but on an over-limit amount
    creates a pending ai_approvals row instead of raising — the tool has no
    request to fail *back to*, only a result to hand the model."""
    limit = effective_limit(db, company_id, _role_slugs(db, user), document_type)
    if limit is None or Decimal(str(amount)) <= limit:
        return ApprovalDecision(allowed=True, limit=limit)

    approval = AiApproval(
        company_id=company_id,
        agent="ai_assistant",
        tool=tool_name,
        summary=summary,
        reason=(
            f"Exceeds {getattr(user, 'name', user)}'s approval limit of {limit:,.2f} "
            f"for {document_type}."
        ),
        risk=risk,
        status="pending",
        entity=entity,
        requested_at=datetime.utcnow(),
    )
    db.add(approval)
    db.flush()  # need approval.id now — session is autoflush=False; caller's request owns the commit
    return ApprovalDecision(allowed=False, approval_id=approval.id, limit=limit)
