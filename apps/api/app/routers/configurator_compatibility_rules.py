from __future__ import annotations

import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_write_access
from app.models.configurator_compatibility_rule import (
    ConfiguratorCompatibilityRule,
    dump_json,
    load_json,
)
from app.schemas.configurator_compatibility_rule import (
    CompatibilityRuleCreate,
    CompatibilityRuleListMeta,
    CompatibilityRuleListResponse,
    CompatibilityRuleRead,
    CompatibilityRuleResponse,
    CompatibilityRuleUpdate,
)

router = APIRouter(prefix="/compatibility-rules", tags=["configurator-compatibility-rules"])


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")
    return slug or "rule"


def _to_read(row: ConfiguratorCompatibilityRule) -> CompatibilityRuleRead:
    return CompatibilityRuleRead(
        id=row.id,
        company_id=row.company_id,
        name=row.name,
        code=row.code,
        configurator_profile_id=row.configurator_profile_id,
        configurator_profile_name=row.configurator_profile_name,
        description=row.description,
        priority=row.priority,
        active=row.active,
        body=load_json(row.body_json, {}),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=CompatibilityRuleListResponse)
def list_compatibility_rules(
    configurator_profile_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
) -> CompatibilityRuleListResponse:
    from app.services.pc_builder_rules import ensure_pc_builder_rules, pc_builder_profile_ids

    ensure_pc_builder_rules(db)
    query = db.query(ConfiguratorCompatibilityRule)
    if configurator_profile_id:
        query = query.filter(
            ConfiguratorCompatibilityRule.configurator_profile_id.in_(
                pc_builder_profile_ids(configurator_profile_id)
            ),
        )
    rows = query.order_by(ConfiguratorCompatibilityRule.priority, ConfiguratorCompatibilityRule.name).all()
    data = [_to_read(r) for r in rows]
    return CompatibilityRuleListResponse(data=data, meta=CompatibilityRuleListMeta(count=len(data)))


@router.get("/{rule_id}", response_model=CompatibilityRuleResponse)
def get_compatibility_rule(rule_id: str, db: Session = Depends(get_db)) -> CompatibilityRuleResponse:
    row = db.get(ConfiguratorCompatibilityRule, rule_id)
    if not row:
        raise HTTPException(status_code=404, detail="Compatibility rule not found")
    return CompatibilityRuleResponse(data=_to_read(row))


@router.post("", response_model=CompatibilityRuleResponse, status_code=201)
def create_compatibility_rule(
    payload: CompatibilityRuleCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> CompatibilityRuleResponse:
    row = ConfiguratorCompatibilityRule(
        name=payload.name,
        code=payload.code or _slugify(payload.name),
        configurator_profile_id=payload.configurator_profile_id,
        configurator_profile_name=payload.configurator_profile_name,
        description=payload.description,
        priority=payload.priority,
        active=payload.active,
        body_json=dump_json(payload.body),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return CompatibilityRuleResponse(data=_to_read(row))


@router.patch("/{rule_id}", response_model=CompatibilityRuleResponse)
def update_compatibility_rule(
    rule_id: str,
    payload: CompatibilityRuleUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> CompatibilityRuleResponse:
    row = db.get(ConfiguratorCompatibilityRule, rule_id)
    if not row:
        raise HTTPException(status_code=404, detail="Compatibility rule not found")

    changes = payload.model_dump(exclude_unset=True)
    if "body" in changes:
        row.body_json = dump_json(changes.pop("body"))
    for key, value in changes.items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)
    return CompatibilityRuleResponse(data=_to_read(row))


@router.delete("/{rule_id}", status_code=204)
def delete_compatibility_rule(
    rule_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> None:
    row = db.get(ConfiguratorCompatibilityRule, rule_id)
    if not row:
        raise HTTPException(status_code=404, detail="Compatibility rule not found")
    db.delete(row)
    db.commit()
