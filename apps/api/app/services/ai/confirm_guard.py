"""Confirm guard — make "yes, confirm" actually confirm a two-step action tool.

Every action tool is preview → confirm (`confirm=true`). Smaller models (verified live with
gpt-4o-mini on add_product_seo) often answer the user's "Yes, confirm." by calling the same
tool again *without* `confirm`, so the user just gets the identical preview back and nothing
is ever saved — including when they press the Accept button, which sends that same text.

Models also go wrong the other way — confirming with drifted arguments, or calling some other
tool with confirm=true that was never previewed. So this wraps every two-step tool:

* `confirm=true` runs only when the user's message is a bare confirmation ("yes", "confirm",
  "ha", "ঠিক আছে", Accept …) AND that same tool returned a preview in the previous reply —
  and it runs with the arguments of the preview the user saw, never re-sent drifted ones.
  Otherwise it is refused with an instruction to preview first (so no chaining preview +
  confirm inside one reply, and no confirming an action nobody saw).
* On a bare confirmation, a repeat of the shown preview call (same arguments, or a fresh
  preview identical to the shown one) is treated as the confirm.
* At most one confirmed action per reply.

The user can therefore only ever confirm what they actually saw.
"""

from __future__ import annotations

import json
from dataclasses import replace
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.ai_audit_log import AiAuditLog
from app.services.ai.orchestrator import OrchestratorTool

_AFFIRMATIVE = {
    "yes", "y", "yeah", "yep", "yup", "ok", "okay", "sure", "confirm", "confirmed", "accept",
    "approve", "approved", "proceed", "go", "ahead", "do", "it", "please", "save", "create",
    "ha", "haa", "han", "hae", "hya", "hyan", "ji", "jee", "thik", "ache", "korun", "koro",
    "kore", "dao", "din", "hobe",
    "হ্যাঁ", "হ্যা", "হা", "জি", "ঠিক", "আছে", "করুন", "করো", "কনফার্ম", "দাও", "দিন",
}
_TRIGGERS = {
    "yes", "y", "yeah", "yep", "yup", "ok", "okay", "sure", "confirm", "confirmed", "accept",
    "approve", "approved", "proceed", "ahead", "ha", "haa", "han", "hae", "hya", "hyan", "ji", "jee",
    "হ্যাঁ", "হ্যা", "হা", "জি", "ঠিক", "কনফার্ম",
    # common typos of "confirm" seen in real chats
    "confrim", "comfirm", "conform", "cofirm", "confirmm",
}
_AFFIRMATIVE |= _TRIGGERS
_NEGATIVE = {"no", "not", "dont", "don't", "cancel", "deny", "stop", "wait", "na", "nah", "না", "বাতিল"}
_MAX_WORDS = 6


def is_bare_confirmation(message: str) -> bool:
    # Split on whitespace and strip punctuation per word — not a \w regex, which would break
    # Bangla words apart at their vowel signs (e.g. "হ্যাঁ").
    words = [w.strip(".,!?;:\"()[]।") for w in (message or "").lower().split()]
    words = [w for w in words if w]
    if not words or len(words) > _MAX_WORDS:
        return False
    if any(w in _NEGATIVE for w in words):
        return False
    return all(w in _AFFIRMATIVE for w in words) and any(w in _TRIGGERS for w in words)


def _canon(value: Any) -> str:
    return json.dumps(value, sort_keys=True, default=str)


def _without_confirm(inp: dict) -> dict:
    """Arguments that define the action — `confirm` and empty values (rewrite: [], "") dropped,
    since models add or omit those freely between the preview and the confirm call."""
    return {k: v for k, v in (inp or {}).items() if k != "confirm" and v not in (None, "", [], {})}


def _parse_preview_row(row: AiAuditLog) -> Optional[tuple[dict, Optional[dict]]]:
    """(input, preview-or-None) when this audit row is a successful preview call."""
    if row.status != "success" or not row.tool_name:
        return None
    try:
        output = json.loads(row.tool_output_json or "")
    except (TypeError, ValueError):
        # Output column is bounded at 8000 chars — a large preview may not round-trip. Only
        # the "status" marker matters for detection; fall back to argument matching below.
        output = None
        if '"status": "preview"' not in (row.tool_output_json or ""):
            return None
    if output is not None and not (isinstance(output, dict) and output.get("status") == "preview"):
        return None
    try:
        tool_input = json.loads(row.tool_input_json or "{}")
    except (TypeError, ValueError):
        return None
    preview = output.get("preview") if isinstance(output, dict) else None
    return (tool_input if isinstance(tool_input, dict) else {}), preview


def _previous_turn_previews(db: Session, conversation_id: str) -> dict[str, list[tuple[dict, Optional[dict]]]]:
    """{tool_name: [(input, preview), …]} for the preview calls made in the conversation's
    previous turn — the reply the user is now answering. Every audit row a turn writes shares
    one created_at (the request's transaction start), which is what delimits the turn."""
    latest = (
        db.query(func.max(AiAuditLog.created_at))
        .filter(AiAuditLog.conversation_id == conversation_id, AiAuditLog.action.in_(("ai_tool_call", "ai_chat")))
        .scalar()
    )
    if latest is None:
        return {}
    rows = (
        db.query(AiAuditLog)
        .filter(
            AiAuditLog.conversation_id == conversation_id,
            AiAuditLog.action == "ai_tool_call",
            AiAuditLog.created_at == latest,
        )
        .order_by(AiAuditLog.logged_at.desc())
        .all()
    )
    out: dict[str, list[tuple[dict, Optional[dict]]]] = {}
    for row in rows:
        parsed = _parse_preview_row(row)
        if parsed is not None:
            out.setdefault(row.tool_name, []).append(parsed)
    return out


def _has_confirm_step(tool: OrchestratorTool) -> bool:
    return "confirm" in ((tool.definition.input_schema or {}).get("properties") or {})


def apply_confirm_guard(
    db: Session,
    tools: list[OrchestratorTool],
    *,
    conversation_id: Optional[str],
    user_message: str,
) -> list[OrchestratorTool]:
    """Wraps every two-step tool. `confirm=true` only runs when the user's message is a bare
    confirmation AND that same tool returned a preview in the previous reply — and then it
    runs with that preview's own arguments. Verified live without this: on "Yes, confirm." a
    model skipped the pending update and called save_ai_preset with confirm=true and no
    preview at all, saving a rule nobody asked for."""
    bare_yes = bool(conversation_id) and is_bare_confirmation(user_message)
    previews = _previous_turn_previews(db, conversation_id) if conversation_id else {}
    used = {"done": False}

    def wrap(tool: OrchestratorTool) -> OrchestratorTool:
        original = tool.handler
        name = tool.definition.name
        shown = previews.get(name) or []
        distinct = {_canon(_without_confirm(i)): i for i, _ in shown}

        def handler(inp: dict) -> Any:
            inp = dict(inp or {})
            key = _canon(_without_confirm(inp))
            if inp.get("confirm"):
                if used["done"]:
                    return {"error": "Only one confirmed action per reply. Report what was saved and stop."}
                if not bare_yes or not distinct:
                    return {
                        "error": "Not confirmed: confirm=true is only allowed when the user's latest message "
                        f"approves a preview of {name} from your previous reply. Call {name} without confirm, "
                        "show its preview and wait for the user to confirm it."
                    }
                if key in distinct:
                    approved = distinct[key]
                elif len(distinct) == 1:
                    # Same action, drifted arguments (e.g. the product re-named) — run what was shown.
                    approved = next(iter(distinct.values()))
                else:
                    return {
                        "error": "Several different previews were shown and it is unclear which one the user "
                        "confirmed. Call the tool once more without confirm with the full change the user "
                        "wants, show that single preview, and ask them to confirm it."
                    }
                used["done"] = True
                return original({**approved, "confirm": True})
            if bare_yes and not used["done"] and key in distinct:
                # The model answered "yes" by repeating the preview call — that is the confirm.
                used["done"] = True
                return original({**distinct[key], "confirm": True})
            result = original(inp)
            if (
                bare_yes
                and not used["done"]
                and len(shown) == 1
                and shown[0][1] is not None
                and isinstance(result, dict)
                and result.get("status") == "preview"
                and _canon(result.get("preview")) == _canon(shown[0][1])
            ):
                used["done"] = True
                return original({**inp, "confirm": True})
            return result

        return replace(tool, handler=handler)

    return [wrap(t) if _has_confirm_step(t) else t for t in tools]


# Content fields a tool writes itself (from presets / built-in rules) unless the user dictated
# them. Smaller models fill these with their own generic copy (verified live: gpt-4o-mini sent
# "Lenovo Yoga 7 - The Ultimate 2-in-1 Laptop Experience" as meta_title), which skips the
# admin's SEO rule entirely.
_TOOL_WRITTEN_FIELDS = {"add_product_seo": ("focus_keyphrase", "meta_title", "meta_description")}


def _squash(text: str) -> str:
    return " ".join((text or "").lower().split())


def apply_user_value_guard(tools: list[OrchestratorTool], *, user_texts: list[str]) -> list[OrchestratorTool]:
    """Drop a tool-written field unless its value appears in what the user actually typed in
    this conversation — then the tool generates it following the preset instead."""
    said = _squash("\n".join(user_texts))

    def wrap(tool: OrchestratorTool, fields: tuple[str, ...]) -> OrchestratorTool:
        original = tool.handler

        def handler(inp: dict) -> Any:
            inp = dict(inp or {})
            for name in fields:
                value = _squash(str(inp.get(name) or ""))
                if value and value not in said:
                    inp.pop(name, None)
            return original(inp)

        return replace(tool, handler=handler)

    def digits(text: str) -> str:
        return "".join(ch for ch in text if ch.isdigit())

    said_digits = " ".join(digits(w) for w in said.split())

    def wrap_update(tool: OrchestratorTool) -> OrchestratorTool:
        """update_product: copy the model wrote itself for name/descriptions/tags becomes a
        `rewrite` request (written by the tool under the presets); a price the user never typed
        is dropped — prices are never invented."""
        original = tool.handler

        def handler(inp: dict) -> Any:
            inp = dict(inp or {})
            changes = dict(inp.get("changes") or {})
            rewrite = list(inp.get("rewrite") or [])
            for name in ("name", "short_description", "description", "tags"):
                if name not in changes:
                    continue
                value = changes[name]
                parts = value if isinstance(value, list) else [value]
                if any(_squash(str(p)) and _squash(str(p)) not in said for p in parts):
                    changes.pop(name)
                    if name not in rewrite:
                        rewrite.append(name)
            for name in ("price", "compare_at_price"):
                if name in changes and digits(str(changes[name]).split(".")[0]) not in said_digits.split():
                    changes.pop(name)
            inp["changes"], inp["rewrite"] = changes, rewrite
            return original(inp)

        return replace(tool, handler=handler)

    out = []
    for t in tools:
        if t.definition.name in _TOOL_WRITTEN_FIELDS:
            out.append(wrap(t, _TOOL_WRITTEN_FIELDS[t.definition.name]))
        elif t.definition.name == "update_product":
            out.append(wrap_update(t))
        else:
            out.append(t)
    return out
