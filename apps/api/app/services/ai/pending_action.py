"""Pending action + recent records - what the AI must remember from its previous reply (docs/AI/ai.md, steps 1.1 and 1.5).

The conversation history stores only the TEXT of each turn, not the tool calls. So after "Preview: quotation for Ryans, 2 x Vivobook.
Confirm?" the model has no exact arguments to revise ("quantity 3 koro") or to confirm, and no id behind "that customer" / "ota" / "tar".
Every tool call is already in the audit log, so this reads the previous turn's calls from there and puts two short blocks into the
system prompt:

* **Pending action(s)** - previews the user has not answered yet: the tool, its FULL arguments and the preview shown. The model is told to
  revise by calling the same tool again with the merged arguments, to confirm with the same arguments, or to ignore it.
* **Recent records** - the records (id + name) the previous turn's tools returned, so pronouns resolve to real ids.

Nothing here executes anything; it only makes the model's next call accurate. The confirm guard still decides what may be confirmed.
"""
from __future__ import annotations

import json
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.ai_audit_log import AiAuditLog

_NAME_KEYS = ("name", "display_name", "customer_name", "supplier_name", "title", "order_number", "po_number", "invoice_number", "sku", "product_name")
_MAX_PENDING = 3
_MAX_RECORDS = 6
_CLIP = 1400
_NL = chr(10)


def _clip(value: Any, n: int = _CLIP) -> str:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)
    return text if len(text) <= n else text[: n - 1] + "..."


def _previous_turn_rows(db: Session, conversation_id: str) -> list[AiAuditLog]:
    latest = (
        db.query(func.max(AiAuditLog.created_at))
        .filter(AiAuditLog.conversation_id == conversation_id, AiAuditLog.action.in_(("ai_tool_call", "ai_chat")))
        .scalar()
    )
    if latest is None:
        return []
    return (
        db.query(AiAuditLog)
        .filter(AiAuditLog.conversation_id == conversation_id, AiAuditLog.action == "ai_tool_call", AiAuditLog.created_at == latest)
        .order_by(AiAuditLog.logged_at.asc())
        .all()
    )


def _load(raw: Optional[str]) -> Any:
    try:
        return json.loads(raw or "")
    except (TypeError, ValueError):
        return None


def _entities(node: Any, out: list[tuple[str, str]], depth: int = 0) -> None:
    """(id, name) pairs found in a tool result: any object with an `id` and a name-like field."""
    if len(out) >= _MAX_RECORDS or depth > 5:
        return
    if isinstance(node, dict):
        rid = node.get("id") or node.get("customer_id") or node.get("order_id")
        name = next((str(node[k]) for k in _NAME_KEYS if node.get(k)), None)
        if rid and name and (str(rid), name) not in out:
            out.append((str(rid), name))
        for v in node.values():
            _entities(v, out, depth + 1)
    elif isinstance(node, list):
        for v in node[:8]:
            _entities(v, out, depth + 1)


def render(pending: list[tuple[str, dict, Any]], records: list[tuple[str, str]]) -> str:
    """Prompt text for pending previews ((tool, arguments, preview shown)) and recent records ((id, name)); "" when both are empty."""
    parts: list[str] = []
    if pending:
        lines = [
            f"- {tool}{_NL}  arguments: {_clip(args)}{_NL}  preview shown to the user: {_clip(shown if shown is not None else '', 900)}"
            for tool, args, shown in pending
        ]
        parts.append(
            "# Pending action (your previous reply showed a preview and the user has NOT confirmed it yet)" + _NL
            + _NL.join(lines) + _NL
            + "How to use it: if the user's new message CHANGES something about it (a quantity, price, customer, date ...), call the SAME tool "
            "again with the FULL arguments above, only the changed values replaced, WITHOUT confirm, so they see the updated preview. If it "
            "approves it (yes / ha / confirm), call the same tool with the same arguments and confirm=true. If the message is about something "
            "else, ignore the pending action. Never start a different flow for a change to it."
        )
    if records:
        parts.append(
            "# Records from your previous reply (so 'that customer', 'ota', 'tar', 'the same product' mean these - use their ids)" + _NL
            + _NL.join(f"- {name} (id {rid})" for rid, name in records[:_MAX_RECORDS])
        )
    return (_NL + _NL).join(parts)


def previous_tool_names(db: Session, conversation_id: Optional[str]) -> list[str]:
    """Names of the tools the previous reply used (so a follow-up keeps the same tools)."""
    if not conversation_id:
        return []
    try:
        return list(dict.fromkeys(r.tool_name for r in _previous_turn_rows(db, conversation_id) if r.tool_name))
    except Exception:  # noqa: BLE001
        db.rollback()
        return []


def pending_block(db: Session, conversation_id: Optional[str]) -> str:
    """Prompt text for the previous turn's unanswered previews and the records it touched; "" when there is nothing."""
    if not conversation_id:
        return ""
    try:
        rows = [r for r in _previous_turn_rows(db, conversation_id) if r.status == "success" and r.tool_name]
    except Exception:  # noqa: BLE001 - an aid: never break the chat
        db.rollback()
        return ""
    pending: list[tuple[str, dict, Any]] = []
    records: list[tuple[str, str]] = []
    for r in rows:
        out = _load(r.tool_output_json)
        args = _load(r.tool_input_json) or {}
        if isinstance(out, dict) and out.get("status") == "preview":
            if len(pending) < _MAX_PENDING:
                shown = out.get("preview") if out.get("preview") is not None else out.get("review")
                pending.append((r.tool_name, {k: v for k, v in args.items() if k != "confirm"}, shown))
        elif out is not None:
            _entities(out, records)
    return render(pending, records)
