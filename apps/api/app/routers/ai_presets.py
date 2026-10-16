"""Admin API for AI presets — mounted under the /ai prefix by ai_gateway.py (same as ai_voice).

Same gate as AI → Settings (workspace write): presets steer what the AI writes for the whole
company, so only administrators may read or change them.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, require_permission
from app.models.auth_user import AuthUser
from app.services.ai import preset_service
from app.services.ai.entitlements import ai_access_allowed
from app.services.ai.preset_service import MAX_EXAMPLES_CHARS, MAX_INSTRUCTION_CHARS
from app.services.catalog_ai.importer_service import extract_from_url

router = APIRouter(prefix="/presets", tags=["ai-presets"])
_admin = require_permission("workspace", "write")


class PresetTargetOut(BaseModel):
    key: str
    label: str
    module: str
    used_by: str
    placeholder: str


class PresetOut(BaseModel):
    id: str
    target: str
    title: str
    instruction: str
    examples: Optional[str] = None
    is_active: bool
    version: int
    updated_at: Optional[datetime] = None


class PresetIn(BaseModel):
    instruction: str = Field(min_length=1, max_length=MAX_INSTRUCTION_CHARS)
    title: str = Field(default="", max_length=200)
    examples: Optional[str] = Field(default=None, max_length=MAX_EXAMPLES_CHARS)
    is_active: bool = True


class PresetVersionOut(BaseModel):
    id: str
    version: int
    title: str
    instruction: str
    examples: Optional[str] = None
    is_active: bool
    change: str
    changed_by: Optional[str] = None
    created_at: Optional[datetime] = None


class RollbackIn(BaseModel):
    version_id: str


class PresetTestIn(BaseModel):
    url: str = Field(min_length=8, max_length=2048)
    # The editor's current (possibly unsaved) text — tested as-is, nothing is saved.
    instruction: str = Field(default="", max_length=MAX_INSTRUCTION_CHARS)
    examples: Optional[str] = Field(default=None, max_length=MAX_EXAMPLES_CHARS)
    is_active: bool = True


class PresetTestOut(BaseModel):
    url: str
    rule_applied: bool
    name: str
    short_description: Optional[str] = None
    description: Optional[str] = None
    category_name: Optional[str] = None
    category_names: list[str] = []
    tags: list[str] = []
    warranty: Optional[str] = None
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    warnings: list[str] = []


def _out(row) -> PresetOut:
    return PresetOut(
        id=row.id,
        target=row.target,
        title=row.title,
        instruction=row.instruction,
        examples=row.examples,
        is_active=row.is_active,
        version=row.version,
        updated_at=row.updated_at,
    )


@router.get("/targets", response_model=list[PresetTargetOut])
def list_targets(_: AuthUser = Depends(_admin)) -> list[PresetTargetOut]:
    return [PresetTargetOut(**t.__dict__) for t in preset_service.PRESET_TARGETS]


@router.get("", response_model=list[PresetOut])
def list_presets(
    _: AuthUser = Depends(_admin),
    company_id: str = Depends(get_current_company_id),
    db: Session = Depends(get_db),
) -> list[PresetOut]:
    return [_out(r) for r in preset_service.list_presets(db, company_id)]


@router.put("/{target}", response_model=PresetOut)
def save_preset(
    target: str,
    payload: PresetIn,
    user: AuthUser = Depends(_admin),
    company_id: str = Depends(get_current_company_id),
    db: Session = Depends(get_db),
) -> PresetOut:
    row = preset_service.upsert_preset(
        db,
        company_id=company_id,
        target=target,
        instruction=payload.instruction,
        title=payload.title,
        examples=payload.examples,
        is_active=payload.is_active,
        user=user,
    )
    db.commit()
    db.refresh(row)
    return _out(row)


@router.delete("/{target}", status_code=204)
def delete_preset(
    target: str,
    user: AuthUser = Depends(_admin),
    company_id: str = Depends(get_current_company_id),
    db: Session = Depends(get_db),
) -> None:
    preset_service.delete_preset(db, company_id=company_id, target=target, user=user)
    db.commit()


@router.get("/{target}/versions", response_model=list[PresetVersionOut])
def list_versions(
    target: str,
    _: AuthUser = Depends(_admin),
    company_id: str = Depends(get_current_company_id),
    db: Session = Depends(get_db),
) -> list[PresetVersionOut]:
    return [
        PresetVersionOut(
            id=v.id,
            version=v.version,
            title=v.title,
            instruction=v.instruction,
            examples=v.examples,
            is_active=v.is_active,
            change=v.change,
            changed_by=v.changed_by,
            created_at=v.created_at,
        )
        for v in preset_service.list_versions(db, company_id=company_id, target=target)
    ]


@router.post("/{target}/rollback", response_model=PresetOut)
def rollback(
    target: str,
    payload: RollbackIn,
    user: AuthUser = Depends(_admin),
    company_id: str = Depends(get_current_company_id),
    db: Session = Depends(get_db),
) -> PresetOut:
    row = preset_service.rollback_preset(
        db, company_id=company_id, target=target, version_id=payload.version_id, user=user
    )
    db.commit()
    db.refresh(row)
    return _out(row)


@router.post("/{target}/test", response_model=PresetTestOut)
def test_preset(
    target: str,
    payload: PresetTestIn,
    _: AuthUser = Depends(_admin),
    company_id: str = Depends(get_current_company_id),
    db: Session = Depends(get_db),
) -> PresetTestOut:
    """Run the real product-import extraction on `url` with the editor's text in place of the
    saved rule for this target. Nothing is saved — no product, no preset."""
    spec = preset_service.get_target(target)
    allowed, status = ai_access_allowed()
    if not allowed:
        raise HTTPException(status_code=403, detail=f"AI access is not enabled for this workspace ({status})")
    url = payload.url.strip()
    if not url.lower().startswith(("http://", "https://")):
        raise HTTPException(status_code=422, detail="Enter a full http(s) product page URL.")
    rule = preset_service.render_rule(payload.instruction, payload.examples) if payload.is_active else ""
    extracted = extract_from_url(db, url, company_id=company_id, rule_overrides={spec.key: rule or None})
    db.rollback()  # extraction is read-only; drop anything a lookup left in the session
    d = extracted.draft
    return PresetTestOut(
        url=d.source_url or url,
        rule_applied=bool(rule),
        name=d.name,
        short_description=d.short_description,
        description=d.description,
        category_name=d.category_name,
        category_names=d.category_names,
        tags=d.tags,
        warranty=d.warranty,
        seo_title=d.seo_title,
        seo_description=d.seo_description,
        warnings=extracted.warnings,
    )
