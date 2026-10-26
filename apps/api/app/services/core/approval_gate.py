"""Maker-checker gate for the finalizing actions listed in docs/approval.md.

Who may finalize a document without asking is the **Approve** permission on its module (System Manager always). Anyone
else who presses Finalize / Confirm / Post does not run the action: the call is stored as an `ApprovalRequest` and the
client is told "sent for approval" (HTTP 202). An approver then opens Inventory > Approve; approving replays the stored
call as the approver, so the real endpoint still enforces stock, ledger, limits and its own permissions at that moment.

This module holds the registry-independent pieces: matching a request to an action, deciding whether it must be held,
and storing it. The registry of actions lives in `approval_actions.py`.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any, Callable, Optional

from sqlalchemy.orm import Session

from app.models.approval_request import ApprovalRequest
from app.models.auth_user import AuthUser
from app.services import rbac as rbac_service

API_PREFIX = "/api/v1/"

# The groups of the Approve screen, in the order the user listed them. The key is also the RBAC module whose Approve
# permission decides who may finalize that group's documents without asking.
GROUPS: dict[str, str] = {
    "purchase": "Purchase",
    "sales": "Sales",
    "rma": "RMA",
    "finance": "Accounts & Finance",
}


@dataclass
class Described:
    """What the Approve list shows for a held call, worked out from the call itself and the record it targets."""

    reference: Optional[str] = None
    party: Optional[str] = None
    amount: Optional[Decimal] = None
    summary: Optional[str] = None
    entity_id: Optional[str] = None


# describe(db, path_params, body) -> Described. It must never raise: a failed lookup just leaves the fields blank.
Describer = Callable[[Session, dict[str, str], dict[str, Any]], Described]


@dataclass(frozen=True)
class ApprovalAction:
    key: str
    group: str
    label: str
    method: str
    """Regex over the path after /api/v1/ (named groups become path params)."""
    path: str
    """Body predicate: only some calls of an endpoint are the finalizing one. None = every call."""
    when: Optional[Callable[[dict[str, Any]], bool]] = None
    describe: Optional[Describer] = None
    """RBAC modules whose create/write grant lets the maker submit the call at all (default: the group's module).
    Anyone without one keeps the endpoint's plain 403."""
    base_modules: tuple[str, ...] = ()
    """Privileged RBAC modules (the RMA ones) whose write grant also lets a user finalize / approve this action, so the
    rights people already hold are kept."""
    alt_modules: tuple[str, ...] = ()
    """The call moves one document forward (the path names it), so when an approver finalizes that document directly, from its
    own drawer, the request waiting for it is closed. False for calls that carry their own values (a payment)."""
    closes_on_direct: bool = False

    @property
    def module(self) -> str:
        return self.group

    def compiled(self) -> "re.Pattern[str]":
        return re.compile(self.path)

    def makers_modules(self) -> tuple[str, ...]:
        return self.base_modules or (self.group,)


def tail_of(path: str) -> Optional[str]:
    if not path.startswith(API_PREFIX):
        return None
    return path[len(API_PREFIX) :].strip("/")


def match_action(
    actions: list[ApprovalAction],
    compiled: dict[str, "re.Pattern[str]"],
    method: str,
    path: str,
    body: dict[str, Any],
) -> tuple[Optional[ApprovalAction], dict[str, str]]:
    tail = tail_of(path)
    if tail is None:
        return None, {}
    for action in actions:
        if action.method != method:
            continue
        m = compiled[action.key].fullmatch(tail)
        if not m:
            continue
        if action.when is not None:
            try:
                if not action.when(body):
                    continue
            except Exception:
                continue
        return action, {k: v for k, v in m.groupdict().items() if v is not None}
    return None, {}


def parse_body(raw: bytes) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


class Rights:
    """One user's approval rights, with their permission matrix read once (a list can hold dozens of rows)."""

    def __init__(self, db: Session, user: AuthUser):
        self.system_manager = rbac_service.is_system_manager(db, user)
        self.perms = {} if self.system_manager else rbac_service.user_permissions(db, user)

    def _has(self, module: str, action: str) -> bool:
        return self.system_manager or action in self.perms.get(module, set())

    def can_approve(self, action: ApprovalAction) -> bool:
        """May finalize `action` without asking, and approve other people's requests for it."""
        if self.system_manager or self._has(action.module, "approve"):
            return True
        return any(self._has(m, "write") for m in action.alt_modules)

    def can_submit(self, action: ApprovalAction) -> bool:
        """May the user send this call at all (create or write on the document's own module)?"""
        return any(self._has(m, a) for m in action.makers_modules() for a in ("create", "write"))

    def can_approve_group(self, group: str) -> bool:
        return self.system_manager or self._has(group, "approve")


def hold_call(
    db: Session,
    user: AuthUser,
    action: ApprovalAction,
    *,
    method: str,
    path: str,
    query_string: str,
    body_raw: bytes,
    path_params: dict[str, str],
) -> ApprovalRequest:
    body = parse_body(body_raw)
    described = Described()
    if action.describe is not None:
        try:
            described = action.describe(db, path_params, body) or Described()
        except Exception:  # a description is a convenience, never a reason to lose the request
            db.rollback()
            described = Described()
    target_kind: Optional[str] = None
    target_id: Optional[str] = None
    try:
        from app.services.core.approval_actions import resolve_target

        target_kind, target_id = resolve_target(db, action.key, path_params, body, described)
    except Exception:  # no drawer to open is fine: the Approve screen falls back to a review dialog
        db.rollback()
    row = ApprovalRequest(
        company_id=user.company_id or "default",
        action_key=action.key,
        group_key=action.group,
        label=action.label,
        reference=(described.reference or "")[:120] or None,
        party=(described.party or "")[:255] or None,
        amount=described.amount,
        summary=described.summary,
        entity_id=(described.entity_id or next(iter(path_params.values()), None)),
        target_kind=target_kind,
        target_id=target_id,
        http_method=method,
        http_path=path,
        query_string=query_string,
        body_json=body_raw.decode("utf-8", errors="replace") if body_raw else None,
        status="pending",
        requested_by=user.id,
        requested_by_name=user.name or user.username or "",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def close_requests_finalized_directly(
    db: Session, user: AuthUser, action: ApprovalAction, path_params: dict[str, str]
) -> int:
    """An approver finalized a document straight from its own drawer: the requests waiting for exactly that are done."""
    entity = next(iter(path_params.values()), None)
    if not action.closes_on_direct or not entity:
        return 0
    rows = (
        db.query(ApprovalRequest)
        .filter(
            ApprovalRequest.company_id == (user.company_id or "default"),
            ApprovalRequest.action_key == action.key,
            ApprovalRequest.entity_id == entity,
            ApprovalRequest.status == "pending",
        )
        .all()
    )
    for row in rows:
        row.status = "approved"
        row.decided_by = user.id
        row.decided_by_name = user.name or user.username
        row.decided_at = datetime.utcnow()
        row.decision_note = "Finalized directly from the document"
        row.last_error = None
    if rows:
        db.commit()
    return len(rows)


def pending_message(label: str) -> str:
    return f"Sent for approval — {label} will be finalized once an approver accepts it."
