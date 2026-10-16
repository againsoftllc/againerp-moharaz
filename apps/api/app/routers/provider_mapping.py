from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_user
from app.models.auth_user import AuthUser
from app.models.provider_entity_mapping import ProviderEntityMapping, ProviderMappingHistory, ProviderMappingRule
from app.models.provider_import import ProviderImportItem
from app.schemas.provider_mapping import (
    EntityMappingListResponse,
    EntityMappingRead,
    EntityMappingResponse,
    MappingApproveInput,
    MappingConflictResolveInput,
    MappingDashboardMeta,
    MappingDashboardResponse,
    MappingHistoryRead,
    MappingManualInput,
    MappingMergeInput,
    MappingRejectInput,
    MappingRuleCreateInput,
    MappingRulePatchInput,
    MappingRuleRead,
    ScanItemInput,
    ScanUniversalInput,
)
from app.services.provider_import_service import loads_json
from app.services.provider_mapping_service import (
    approve_mapping,
    loads_json as mapping_loads_json,
    manual_mapping,
    mapping_dashboard_meta,
    merge_mappings,
    reject_mapping,
    resolve_conflict,
    scan_universal_product,
)

router = APIRouter(prefix="/mapping", tags=["china-import-mapping"])

MAPPER_ROLES = frozenset({"admin", "staff"})


def _role(user: AuthUser) -> str:
    return user.role or "viewer"


def require_mapper(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    if _role(user) not in MAPPER_ROLES:
        raise HTTPException(status_code=403, detail="Mapping permission required")
    return user


def _mapping_read(row: ProviderEntityMapping) -> EntityMappingRead:
    suggestions = mapping_loads_json(row.suggestion_json) or []
    conflicts = mapping_loads_json(row.conflict_json) or []
    path = mapping_loads_json(row.provider_path_json)
    return EntityMappingRead(
      id=row.id,
      provider=row.provider,
      entity_type=row.entity_type,
      provider_entity_id=row.provider_entity_id,
      provider_name=row.provider_name,
      provider_path=path if isinstance(path, list) else None,
      erp_entity_id=row.erp_entity_id,
      erp_entity_name=row.erp_entity_name,
      status=row.status,
      match_method=row.match_method,
      confidence=row.confidence,
      suggestions=suggestions if isinstance(suggestions, list) else [],
      conflicts=conflicts if isinstance(conflicts, list) else [],
      metadata=mapping_loads_json(row.metadata_json),
      source_item_id=row.source_item_id,
      merged_into_id=row.merged_into_id,
      approved_by=row.approved_by,
      approved_at=row.approved_at,
      review_notes=row.review_notes,
      created_at=row.created_at,
      updated_at=row.updated_at,
  )


def _rule_read(row: ProviderMappingRule) -> MappingRuleRead:
    return MappingRuleRead(
        id=row.id,
        entity_type=row.entity_type,
        provider=row.provider,
        pattern_type=row.pattern_type,
        pattern_value=row.pattern_value,
        erp_entity_id=row.erp_entity_id,
        erp_entity_name=row.erp_entity_name,
        priority=row.priority,
        is_active=row.is_active,
        notes=row.notes,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/dashboard", response_model=MappingDashboardResponse)
def get_dashboard(db: Session = Depends(get_db), _user: AuthUser = Depends(require_mapper)):
    meta = mapping_dashboard_meta(db)
    return MappingDashboardResponse(meta=MappingDashboardMeta(**meta))


@router.get("/mappings", response_model=EntityMappingListResponse)
def list_mappings(
    entity_type: Optional[str] = Query(None),
    provider: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_mapper),
):
    query = db.query(ProviderEntityMapping).order_by(ProviderEntityMapping.updated_at.desc())
    if entity_type:
        query = query.filter(ProviderEntityMapping.entity_type == entity_type)
    if provider:
        query = query.filter(ProviderEntityMapping.provider == provider)
    if status:
        query = query.filter(ProviderEntityMapping.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (ProviderEntityMapping.provider_name.ilike(like))
            | (ProviderEntityMapping.erp_entity_name.ilike(like))
            | (ProviderEntityMapping.provider_entity_id.ilike(like))
        )
    rows = query.limit(500).all()
    meta = mapping_dashboard_meta(db)
    return EntityMappingListResponse(data=[_mapping_read(r) for r in rows], meta=meta)


@router.get("/mappings/{mapping_id}", response_model=EntityMappingResponse)
def get_mapping(
    mapping_id: str,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_mapper),
):
    row = db.get(ProviderEntityMapping, mapping_id)
    if not row:
        raise HTTPException(status_code=404, detail="Mapping not found")
    return EntityMappingResponse(data=_mapping_read(row))


@router.post("/mappings/scan", response_model=EntityMappingListResponse)
def scan_universal(
    body: ScanUniversalInput,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_mapper),
):
    rows = scan_universal_product(
        db,
        body.universal,
        source_item_id=body.source_item_id,
        actor_email=user.email,
        actor_role=_role(user),
    )
    db.commit()
    meta = mapping_dashboard_meta(db)
    return EntityMappingListResponse(data=[_mapping_read(r) for r in rows], meta=meta)


@router.post("/mappings/scan-item", response_model=EntityMappingListResponse)
def scan_staging_item(
    body: ScanItemInput,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_mapper),
):
    item = db.get(ProviderImportItem, body.item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Staging item not found")
    universal = loads_json(item.draft_json) or loads_json(item.universal_json)
    if not universal:
        raise HTTPException(status_code=400, detail="Item has no universal JSON")
    rows = scan_universal_product(
        db,
        universal,
        source_item_id=item.id,
        actor_email=user.email,
        actor_role=_role(user),
    )
    db.commit()
    meta = mapping_dashboard_meta(db)
    return EntityMappingListResponse(data=[_mapping_read(r) for r in rows], meta=meta)


@router.patch("/mappings/{mapping_id}/approve", response_model=EntityMappingResponse)
def approve(
    mapping_id: str,
    body: MappingApproveInput,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_mapper),
):
    row = db.get(ProviderEntityMapping, mapping_id)
    if not row:
        raise HTTPException(status_code=404, detail="Mapping not found")
    try:
        approve_mapping(
            db,
            row,
            user.email,
            _role(user),
            erp_entity_id=body.erp_entity_id,
            erp_entity_name=body.erp_entity_name,
            review_notes=body.review_notes,
        )
        db.commit()
        db.refresh(row)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return EntityMappingResponse(data=_mapping_read(row))


@router.patch("/mappings/{mapping_id}/reject", response_model=EntityMappingResponse)
def reject(
    mapping_id: str,
    body: MappingRejectInput,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_mapper),
):
    row = db.get(ProviderEntityMapping, mapping_id)
    if not row:
        raise HTTPException(status_code=404, detail="Mapping not found")
    reject_mapping(db, row, user.email, _role(user), review_notes=body.review_notes)
    db.commit()
    db.refresh(row)
    return EntityMappingResponse(data=_mapping_read(row))


@router.patch("/mappings/{mapping_id}/manual", response_model=EntityMappingResponse)
def set_manual(
    mapping_id: str,
    body: MappingManualInput,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_mapper),
):
    row = db.get(ProviderEntityMapping, mapping_id)
    if not row:
        raise HTTPException(status_code=404, detail="Mapping not found")
    manual_mapping(
        db,
        row,
        body.erp_entity_id,
        body.erp_entity_name,
        user.email,
        _role(user),
        review_notes=body.review_notes,
    )
    db.commit()
    db.refresh(row)
    return EntityMappingResponse(data=_mapping_read(row))


@router.patch("/mappings/{mapping_id}/resolve", response_model=EntityMappingResponse)
def resolve(
    mapping_id: str,
    body: MappingConflictResolveInput,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_mapper),
):
    row = db.get(ProviderEntityMapping, mapping_id)
    if not row:
        raise HTTPException(status_code=404, detail="Mapping not found")
    if row.status != "conflict":
        raise HTTPException(status_code=400, detail="Mapping is not in conflict status")
    resolve_conflict(
        db,
        row,
        body.erp_entity_id,
        body.erp_entity_name,
        user.email,
        _role(user),
        review_notes=body.review_notes,
    )
    db.commit()
    db.refresh(row)
    return EntityMappingResponse(data=_mapping_read(row))


@router.post("/mappings/merge", response_model=EntityMappingResponse)
def merge(
    body: MappingMergeInput,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_mapper),
):
    try:
        target = merge_mappings(db, body.target_id, body.source_ids, user.email, _role(user))
        db.commit()
        db.refresh(target)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return EntityMappingResponse(data=_mapping_read(target))


@router.get("/rules", response_model=List[MappingRuleRead])
def list_rules(
    entity_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_mapper),
):
    query = db.query(ProviderMappingRule).order_by(ProviderMappingRule.priority.asc())
    if entity_type:
        query = query.filter(ProviderMappingRule.entity_type == entity_type)
    return [_rule_read(r) for r in query.all()]


@router.post("/rules", response_model=MappingRuleRead)
def create_rule(
    body: MappingRuleCreateInput,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_mapper),
):
    row = ProviderMappingRule(
        entity_type=body.entity_type,
        provider=body.provider,
        pattern_type=body.pattern_type,
        pattern_value=body.pattern_value,
        erp_entity_id=body.erp_entity_id,
        erp_entity_name=body.erp_entity_name,
        priority=body.priority,
        is_active=body.is_active,
        notes=body.notes,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _rule_read(row)


@router.patch("/rules/{rule_id}", response_model=MappingRuleRead)
def patch_rule(
    rule_id: str,
    body: MappingRulePatchInput,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_mapper),
):
    row = db.get(ProviderMappingRule, rule_id)
    if not row:
        raise HTTPException(status_code=404, detail="Rule not found")
    for field in ("pattern_type", "pattern_value", "erp_entity_id", "erp_entity_name", "priority", "is_active", "notes"):
        value = getattr(body, field)
        if value is not None:
            setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return _rule_read(row)


@router.delete("/rules/{rule_id}")
def delete_rule(
    rule_id: str,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_mapper),
):
    row = db.get(ProviderMappingRule, rule_id)
    if not row:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/history/{mapping_id}", response_model=List[MappingHistoryRead])
def mapping_history(
    mapping_id: str,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_mapper),
):
    rows = (
        db.query(ProviderMappingHistory)
        .filter(ProviderMappingHistory.mapping_id == mapping_id)
        .order_by(ProviderMappingHistory.created_at.desc())
        .all()
    )
    return [
        MappingHistoryRead(
            id=r.id,
            mapping_id=r.mapping_id,
            action=r.action,
            actor_email=r.actor_email,
            actor_role=r.actor_role,
            from_status=r.from_status,
            to_status=r.to_status,
            detail=mapping_loads_json(r.detail_json),
            created_at=r.created_at,
        )
        for r in rows
    ]
