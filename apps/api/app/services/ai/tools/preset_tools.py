"""save_ai_preset — lets an administrator turn something said in chat into a company preset
("eta description er niyom hishebe save koro" → the `catalog.product.description` rule).

Writes through preset_service (same table, version history and audit as AI → Settings →
Presets), so a chat save can be rolled back from the Presets tab like any other edit. Same
two-step flow as every action tool: the first call returns a preview of the exact text that
will be saved, and only confirm=true saves it. Same gate as the Presets tab: workspace write.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.services.ai import preset_service
from app.services.ai.orchestrator import OrchestratorTool, RiskTier
from app.services.ai.providers.base import AIToolDefinition

CONFIRM_NOTE = (
    "Nothing was saved. Show the user the rule exactly as it will be saved (new_rule) and ask "
    "them to confirm; call again with the same arguments and confirm=true only after they "
    "explicitly agree."
)


def _can_manage_presets(db: Session | None, user: Any) -> bool:
    if db is None or user is None:
        return False
    if str(getattr(user, "role", "") or "").lower() in ("admin", "system_manager"):
        return True
    from app.services.rbac import has_permission, is_system_manager

    try:
        return is_system_manager(db, user) or has_permission(db, user, "workspace", "write")
    except Exception:  # noqa: BLE001
        return False


def build_preset_tools(
    *,
    db: Session | None = None,
    company_id: str | None = None,
    user: Any | None = None,
) -> list[OrchestratorTool]:
    """db/company_id/user are None only when building for tool_catalog() metadata."""

    def save_ai_preset(inp: dict) -> dict:
        if not _can_manage_presets(db, user):
            return {"error": "Only an administrator (workspace write) can change AI presets."}
        try:
            spec = preset_service.get_target(str(inp.get("target") or ""))
        except HTTPException as exc:
            return {"error": exc.detail}
        rule = str(inp.get("rule") or "").strip()
        if not rule:
            return {"error": "rule is empty — ask the user which rule to save."}
        mode = inp.get("mode") or "add"
        if mode not in ("add", "replace"):
            return {"error": "mode must be 'add' or 'replace'"}

        current = preset_service.get_preset(db, company_id, spec.key)  # type: ignore[arg-type]
        current_text = (current.instruction or "").strip() if current else ""
        if mode == "add" and current_text:
            if rule in current_text:
                return {"status": "unchanged", "note": "This rule is already part of the preset."}
            new_text = f"{current_text}\n{rule}"
        else:
            new_text = rule
        if len(new_text) > preset_service.MAX_INSTRUCTION_CHARS:
            return {"error": f"The preset would exceed {preset_service.MAX_INSTRUCTION_CHARS} characters."}

        summary = {
            "action": "Save AI preset" if current is None else f"Update AI preset ({mode})",
            "preset": spec.label,
            "target": spec.key,
            "used_by": spec.used_by,
            "current_rule": current_text or None,
            "current_status": None if current is None else ("on" if current.is_active else "off"),
            "new_rule": new_text,
            "status_after_save": "on",
        }
        if not inp.get("confirm"):
            return {"status": "preview", "preview": summary, "note": CONFIRM_NOTE}

        try:
            row = preset_service.upsert_preset(
                db,  # type: ignore[arg-type]
                company_id=company_id,  # type: ignore[arg-type]
                target=spec.key,
                instruction=new_text,
                title=current.title if current else "",
                examples=current.examples if current else None,
                is_active=True,
                user=user,
            )
            db.commit()  # type: ignore[union-attr]
        except HTTPException as exc:
            db.rollback()  # type: ignore[union-attr]
            return {"error": exc.detail}
        return {
            "status": "saved",
            "preset": spec.label,
            "target": spec.key,
            "version": row.version,
            "rule": row.instruction,
            "note": "Saved and switched on. It can be edited or rolled back in AI → Settings → Presets.",
        }

    targets = "\n".join(f"- {t.key}: {t.label} (used by: {t.used_by})" for t in preset_service.PRESET_TARGETS)
    return [
        OrchestratorTool(
            definition=AIToolDefinition(
                name="save_ai_preset",
                description=(
                    "Save a company-wide AI rule (preset) that the AI follows whenever it writes a "
                    "given field, e.g. product descriptions. Use ONLY when the user explicitly asks to "
                    "save something as a rule/preset/niyom — e.g. 'save this as the description rule', "
                    "'eta description er niyom hishebe save koro'. If they say 'this'/'eta', the rule is "
                    "the instruction they gave earlier in this conversation — restate it as a clear, "
                    "standalone instruction in the language they wrote it, without adding anything. "
                    "Two steps: call without confirm to get a preview, show new_rule to the user, and "
                    "call again with the same arguments and confirm=true only after they agree. "
                    "mode 'add' (default) appends to the existing rule; 'replace' only when the user "
                    "says to replace it. Targets:\n" + targets
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "target": {
                            "type": "string",
                            "enum": [t.key for t in preset_service.PRESET_TARGETS],
                            "description": "Which field/job the rule applies to",
                        },
                        "rule": {"type": "string", "description": "The rule, as a standalone instruction"},
                        "mode": {"type": "string", "enum": ["add", "replace"], "description": "Default: add"},
                        "confirm": {"type": "boolean", "description": "true only after the user approved the preview"},
                    },
                    "required": ["target", "rule"],
                },
            ),
            handler=save_ai_preset,
            risk_tier=RiskTier.WRITE,
            module="workspace",
        ),
    ]
