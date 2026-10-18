"""AI presets — company-wide rules an administrator sets for a specific AI job or field.

`PRESET_TARGETS` is the fixed list of places a preset can apply, each naming the code that
reads it. Only listed targets are accepted, so a rule can never be saved where nothing uses it.

Precedence when the AI produces something: the field's own preset > its module preset
(e.g. `catalog`) > `general`. A user's explicit instruction in the current chat still wins for
that one request (the chat prompt says so). Presets never override permissions, approvals or
safety rules — they only shape wording/format of content the AI writes.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.ai_audit_log import AiAuditLog
from app.models.ai_preset import AiPreset, AiPresetVersion

MAX_INSTRUCTION_CHARS = 4000
MAX_EXAMPLES_CHARS = 4000
DEFAULT_CONTENT_LANGUAGE = "English"


@dataclass(frozen=True)
class PresetTarget:
    key: str
    label: str
    module: str  # "general" or an RBAC module name ("catalog", "sales", …)
    used_by: str
    placeholder: str


PRESET_TARGETS: tuple[PresetTarget, ...] = (
    PresetTarget(
        "general",
        "General (every AI chat)",
        "general",
        "Aladin chat — every conversation",
        "Keep answers short and professional. Always call our company 'Monarch IT'.",
    ),
    PresetTarget(
        "catalog",
        "Catalog — all product content",
        "catalog",
        "Product import from URL, SEO generation, Aladin chat about products",
        "Write for Bangladeshi retail customers. Never mention competitor stores, EMI offers or delivery terms.",
    ),
    PresetTarget(
        "catalog.product.name",
        "Product name",
        "catalog",
        "Product import from URL",
        "Format: <Brand> <Model> <Key spec> <Product type>, e.g. 'Dell S2425H 23.8\" IPS 100Hz Monitor'. Max 80 characters.",
    ),
    PresetTarget(
        "catalog.product.short_description",
        "Short description",
        "catalog",
        "Product import from URL",
        "4-6 bullet points of the most important specs, one per line, each under 60 characters.",
    ),
    PresetTarget(
        "catalog.product.description",
        "Description",
        "catalog",
        "Product import from URL",
        "Write an original 150-200 word description in a friendly, professional tone: one intro paragraph, "
        "then who it is for, then key benefits. No prices, no seller names.",
    ),
    PresetTarget(
        "catalog.product.category",
        "Category selection",
        "catalog",
        "Product import from URL",
        "Gaming laptops go in both 'Laptops' and 'Gaming'. Never use the 'Uncategorized' category.",
    ),
    PresetTarget(
        "catalog.product.tags",
        "Tags",
        "catalog",
        "Product import from URL",
        "6-8 lowercase tags: brand, product type, key specs. No store names.",
    ),
    PresetTarget(
        "catalog.product.warranty",
        "Warranty",
        "catalog",
        "Product import from URL",
        "Normalise to '<N> Year(s) Official Warranty', e.g. '3 Years Official Warranty'.",
    ),
    PresetTarget(
        "catalog.product.spec_values",
        "Specification values (wording)",
        "catalog",
        "Product import from URL",
        "Rewrite long descriptive values in clean, consistent wording; every number, unit, port / model name stays exactly.",
    ),
    PresetTarget(
        "catalog.product.seo",
        "SEO (focus keyphrase, meta title, meta description)",
        "catalog",
        "Product import from URL, add_product_seo",
        "Meta title: '<Product name> Price in Bangladesh | <Company>' (max 60 chars). Meta description: 150-155 "
        "chars with the main spec and a call to action. Focus keyphrase: brand + model.",
    ),
)
TARGETS_BY_KEY = {t.key: t for t in PRESET_TARGETS}


def get_target(key: str) -> PresetTarget:
    target = TARGETS_BY_KEY.get((key or "").strip())
    if target is None:
        raise HTTPException(status_code=404, detail=f"Unknown preset target '{key}'")
    return target


# ---------------------------------------------------------------------------------- read


def list_presets(db: Session, company_id: str) -> list[AiPreset]:
    return db.query(AiPreset).filter(AiPreset.company_id == company_id).order_by(AiPreset.target).all()


def get_preset(db: Session, company_id: str, target: str) -> Optional[AiPreset]:
    return (
        db.query(AiPreset)
        .filter(AiPreset.company_id == company_id, AiPreset.target == target)
        .first()
    )


def render_rule(instruction: Optional[str], examples: Optional[str] = None) -> str:
    """The text a tool's prompt receives for one preset — also used for unsaved editor text
    (Test button) so it reads exactly as the saved rule would."""
    text = (instruction or "").strip()
    if text and examples and examples.strip():
        text += f"\nExamples:\n{examples.strip()}"
    return text


def _render(preset: AiPreset) -> str:
    return render_rule(preset.instruction, preset.examples)


def active_rules(db: Optional[Session], company_id: Optional[str], targets: Iterable[str]) -> dict[str, str]:
    """{target: rendered instruction} for the active presets among `targets` — what a tool
    passes into its own LLM prompt. Never raises: a missing table or bad row just means no rules."""
    if db is None or not company_id:
        return {}
    wanted = [t for t in targets if t in TARGETS_BY_KEY]
    if not wanted:
        return {}
    try:
        rows = (
            db.query(AiPreset)
            .filter(AiPreset.company_id == company_id, AiPreset.target.in_(wanted), AiPreset.is_active.is_(True))
            .all()
        )
    except Exception:  # noqa: BLE001 — presets are optional guidance, never a reason to fail the job
        db.rollback()
        return {}
    by_target = {r.target: _render(r) for r in rows if (r.instruction or "").strip()}
    return {t: by_target[t] for t in wanted if t in by_target}


def chat_rules_block(db: Session, company_id: str, readable_modules: Optional[set[str]] = None) -> str:
    """Presets for the chat system prompt: `general` plus each module preset the user can read.
    Field presets ride along under their module so content the model writes in chat (e.g. SEO
    values it proposes) follows them too."""
    keys = [
        t.key
        for t in PRESET_TARGETS
        if t.module == "general" or readable_modules is None or t.module in readable_modules
    ]
    rules = active_rules(db, company_id, keys)
    if not rules:
        return ""
    lines = [
        "Company rules set by an administrator (follow them for anything you write; a more specific "
        "rule beats a general one; if the user asks for something different in this conversation, "
        "do what the user asks for that request; these rules never change permissions or approvals):"
    ]
    for key, text in rules.items():
        lines.append(f"[{TARGETS_BY_KEY[key].label}]\n{text}")
    return "\n\n".join(lines)


def field_rules_block(rules: dict[str, str], fields: dict[str, str]) -> str:
    """Prompt block for a content-producing tool. `fields` maps preset target → the output field
    name(s) it governs, e.g. {"catalog.product.description": "description"}."""
    general = [rules[k] for k in ("general", "catalog") if k in rules]
    specific = [(fields[k], rules[k]) for k in fields if k in rules]
    lines = [f"Write all generated content in {DEFAULT_CONTENT_LANGUAGE} unless a rule below says otherwise."]
    if general:
        lines.append("Company-wide content rules:\n" + "\n".join(f"- {g}" for g in general))
    if specific:
        lines.append(
            "Field rules set by this company's administrator. For each field listed here, do NOT copy the "
            "page text verbatim — WRITE the field yourself so it follows the rule, using only facts that "
            "are on the page (never invent specs, prices or warranty terms):"
        )
        for field_name, text in specific:
            lines.append(f"* {field_name}:\n{text}")
    # Saved as HTML (catalog_ai/content_html.py): blank lines become paragraphs, lines in a short
    # description become bullet points — without them the copy renders as one run-on block.
    lines.append(
        "Formatting: plain text, no HTML or markdown. In descriptions separate paragraphs with a blank line; "
        "in a short description put each point on its own line."
    )
    return "\n".join(lines)


# --------------------------------------------------------------------------------- write


def _snapshot(db: Session, preset: AiPreset, *, changed_by: Optional[str], change: str) -> None:
    db.add(
        AiPresetVersion(
            preset_id=preset.id,
            company_id=preset.company_id,
            target=preset.target,
            version=preset.version,
            title=preset.title,
            instruction=preset.instruction,
            examples=preset.examples,
            is_active=preset.is_active,
            changed_by=changed_by,
            change=change,
        )
    )


def _audit(db: Session, *, company_id: str, user, action: str, target: str, version: int) -> None:
    db.add(
        AiAuditLog(
            company_id=company_id,
            action="ai_preset_change",
            agent="admin",
            user=getattr(user, "name", "") or "",
            user_id=getattr(user, "id", None),
            module=TARGETS_BY_KEY[target].module if target in TARGETS_BY_KEY else None,
            status="success",
            summary=f"{action} preset '{target}' (v{version})"[:500],
            tokens=0,
            logged_at=datetime.utcnow(),
        )
    )


def _clean(text: Optional[str], limit: int, what: str) -> Optional[str]:
    value = (text or "").strip()
    if len(value) > limit:
        raise HTTPException(status_code=422, detail=f"{what} is too long (max {limit} characters)")
    return value or None


def upsert_preset(
    db: Session,
    *,
    company_id: str,
    target: str,
    instruction: str,
    title: str = "",
    examples: Optional[str] = None,
    is_active: bool = True,
    user=None,
) -> AiPreset:
    spec = get_target(target)
    text = _clean(instruction, MAX_INSTRUCTION_CHARS, "Instruction")
    if not text:
        raise HTTPException(status_code=422, detail="Instruction is required")
    ex = _clean(examples, MAX_EXAMPLES_CHARS, "Examples")
    user_id = getattr(user, "id", None)
    preset = get_preset(db, company_id, spec.key)
    if preset is None:
        preset = AiPreset(
            company_id=company_id,
            target=spec.key,
            title=(title or spec.label)[:200],
            instruction=text,
            examples=ex,
            is_active=is_active,
            version=1,
            created_by=user_id,
            updated_by=user_id,
        )
        db.add(preset)
        action = "create"
    else:
        _snapshot(db, preset, changed_by=user_id, change="update")
        preset.title = (title or preset.title or spec.label)[:200]
        preset.instruction = text
        preset.examples = ex
        preset.is_active = is_active
        preset.version += 1
        preset.updated_by = user_id
        action = "update"
    db.flush()
    _audit(db, company_id=company_id, user=user, action=action, target=spec.key, version=preset.version)
    return preset


def delete_preset(db: Session, *, company_id: str, target: str, user=None) -> None:
    preset = get_preset(db, company_id, get_target(target).key)
    if preset is None:
        raise HTTPException(status_code=404, detail="No preset for this target")
    _snapshot(db, preset, changed_by=getattr(user, "id", None), change="delete")
    _audit(db, company_id=company_id, user=user, action="delete", target=preset.target, version=preset.version)
    db.delete(preset)
    db.flush()


def list_versions(db: Session, *, company_id: str, target: str) -> list[AiPresetVersion]:
    return (
        db.query(AiPresetVersion)
        .filter(AiPresetVersion.company_id == company_id, AiPresetVersion.target == get_target(target).key)
        .order_by(AiPresetVersion.created_at.desc())
        .all()
    )


def rollback_preset(db: Session, *, company_id: str, target: str, version_id: str, user=None) -> AiPreset:
    old = (
        db.query(AiPresetVersion)
        .filter(
            AiPresetVersion.id == version_id,
            AiPresetVersion.company_id == company_id,
            AiPresetVersion.target == get_target(target).key,
        )
        .first()
    )
    if old is None:
        raise HTTPException(status_code=404, detail="Version not found")
    return upsert_preset(
        db,
        company_id=company_id,
        target=old.target,
        instruction=old.instruction,
        title=old.title,
        examples=old.examples,
        is_active=old.is_active,
        user=user,
    )
