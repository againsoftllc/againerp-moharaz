from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.catalog_attribute import CatalogAttribute
from app.models.catalog_brand import CatalogBrand
from app.models.catalog_category import CatalogCategory
from app.models.commerce_supplier import CommerceSupplier
from app.models.provider_entity_mapping import (
    ENTITY_TYPES,
    MATCH_METHODS,
    MAPPING_STATUSES,
    ProviderEntityMapping,
    ProviderMappingHistory,
    ProviderMappingRule,
)

Candidate = Dict[str, Any]


def dumps_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


def loads_json(value: Optional[str]) -> Any:
    if not value:
        return None
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return None


def normalize_name(value: str) -> str:
    text = (value or "").strip().lower()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text


def slugify(value: str) -> str:
    text = normalize_name(value)
    return re.sub(r"[\s_]+", "-", text).strip("-")


def score_match(a: str, b: str) -> float:
    na = normalize_name(a)
    nb = normalize_name(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    return SequenceMatcher(None, na, nb).ratio()


@dataclass
class DetectResult:
    status: str
    match_method: str
    confidence: float
    erp_entity_id: Optional[str]
    erp_entity_name: Optional[str]
    suggestions: List[Candidate]
    conflicts: List[Candidate]
    metadata: Dict[str, Any]


def _find_brand_candidates(db: Session, name: str, provider_entity_id: str) -> List[Candidate]:
    rows = db.query(CatalogBrand).filter(CatalogBrand.is_active.is_(True)).all()
    candidates: List[Candidate] = []
    norm = normalize_name(name)
    slug = slugify(name)
    for row in rows:
        score = max(score_match(name, row.name), score_match(slug, row.slug))
        if row.slug == slug or normalize_name(row.name) == norm:
            score = 1.0
        if score >= 0.72:
            candidates.append(
                {
                    "id": row.id,
                    "name": row.name,
                    "slug": row.slug,
                    "score": round(score, 4),
                    "entity_type": "brand",
                }
            )
    candidates.sort(key=lambda c: c["score"], reverse=True)
    return candidates


def _find_category_candidates(db: Session, name: str, path: Optional[List[str]] = None) -> List[Candidate]:
    rows = db.query(CatalogCategory).filter(CatalogCategory.is_active.is_(True)).all()
    candidates: List[Candidate] = []
    norm = normalize_name(name)
    path_norm = " > ".join(normalize_name(p) for p in (path or []) if p)
    for row in rows:
        score = score_match(name, row.name)
        if normalize_name(row.name) == norm:
            score = 1.0
        if path_norm and path_norm in normalize_name(row.path or ""):
            score = max(score, 0.95)
        if score >= 0.72:
            candidates.append(
                {
                    "id": row.id,
                    "name": row.name,
                    "slug": row.slug,
                    "path": row.path,
                    "score": round(score, 4),
                    "entity_type": "category",
                }
            )
    candidates.sort(key=lambda c: c["score"], reverse=True)
    return candidates


def _find_attribute_candidates(db: Session, name: str) -> List[Candidate]:
    rows = db.query(CatalogAttribute).filter(CatalogAttribute.is_active.is_(True)).all()
    candidates: List[Candidate] = []
    norm = normalize_name(name)
    for row in rows:
        score = max(score_match(name, row.name), score_match(name, row.code))
        if normalize_name(row.name) == norm or normalize_name(row.code) == norm:
            score = 1.0
        if score >= 0.72:
            candidates.append(
                {
                    "id": row.id,
                    "name": row.name,
                    "code": row.code,
                    "score": round(score, 4),
                    "entity_type": "attribute",
                }
            )
    candidates.sort(key=lambda c: c["score"], reverse=True)
    return candidates


def _find_supplier_candidates(db: Session, name: str, provider_entity_id: str) -> List[Candidate]:
    rows = db.query(CommerceSupplier).filter(CommerceSupplier.status == "active").all()
    candidates: List[Candidate] = []
    norm = normalize_name(name)
    for row in rows:
        score = max(score_match(name, row.name), score_match(provider_entity_id, row.vendor_code))
        if normalize_name(row.name) == norm:
            score = 1.0
        if score >= 0.72:
            candidates.append(
                {
                    "id": row.id,
                    "name": row.name,
                    "vendor_code": row.vendor_code,
                    "score": round(score, 4),
                    "entity_type": "supplier",
                }
            )
    candidates.sort(key=lambda c: c["score"], reverse=True)
    return candidates


def find_erp_candidates(
    db: Session,
    entity_type: str,
    name: str,
    provider_entity_id: str = "",
    path: Optional[List[str]] = None,
) -> List[Candidate]:
    if entity_type == "brand":
        return _find_brand_candidates(db, name, provider_entity_id)
    if entity_type == "category":
        return _find_category_candidates(db, name, path)
    if entity_type == "attribute":
        return _find_attribute_candidates(db, name)
    if entity_type == "supplier":
        return _find_supplier_candidates(db, name, provider_entity_id)
    return []


def apply_rules(
    db: Session,
    entity_type: str,
    provider: str,
    provider_entity_id: str,
    name: str,
) -> Optional[Candidate]:
    rules = (
        db.query(ProviderMappingRule)
        .filter(
            ProviderMappingRule.entity_type == entity_type,
            ProviderMappingRule.is_active.is_(True),
            (ProviderMappingRule.provider.is_(None)) | (ProviderMappingRule.provider == provider),
        )
        .order_by(ProviderMappingRule.priority.asc())
        .all()
    )
    norm_name = normalize_name(name)
    for rule in rules:
        pattern = rule.pattern_value.strip()
        if rule.pattern_type == "exact":
            if normalize_name(pattern) == norm_name or pattern == provider_entity_id:
                return {
                    "id": rule.erp_entity_id,
                    "name": rule.erp_entity_name,
                    "score": 1.0,
                    "rule_id": rule.id,
                    "entity_type": entity_type,
                }
        elif rule.pattern_type == "contains":
            if normalize_name(pattern) in norm_name or norm_name in normalize_name(pattern):
                return {
                    "id": rule.erp_entity_id,
                    "name": rule.erp_entity_name,
                    "score": 0.98,
                    "rule_id": rule.id,
                    "entity_type": entity_type,
                }
        elif rule.pattern_type == "provider_id":
            if pattern == provider_entity_id:
                return {
                    "id": rule.erp_entity_id,
                    "name": rule.erp_entity_name,
                    "score": 1.0,
                    "rule_id": rule.id,
                    "entity_type": entity_type,
                }
    return None


def ai_suggest_candidates(candidates: List[Candidate], limit: int = 5) -> List[Candidate]:
    """Heuristic AI suggestion stub — future Center gateway hook."""
    ranked = sorted(candidates, key=lambda c: c.get("score", 0), reverse=True)
    return [
        {**c, "source": "ai_suggestion", "reason": "Similarity ranking (STEP-05 stub)"}
        for c in ranked[:limit]
    ]


def detect_mapping(
    db: Session,
    entity_type: str,
    provider: str,
    provider_entity_id: str,
    name: str,
    path: Optional[List[str]] = None,
) -> DetectResult:
    if entity_type not in ENTITY_TYPES:
        raise ValueError(f"Invalid entity_type: {entity_type}")

    rule_hit = apply_rules(db, entity_type, provider, provider_entity_id, name)
    if rule_hit:
        return DetectResult(
            status="auto_matched",
            match_method="rule",
            confidence=float(rule_hit.get("score", 1.0)),
            erp_entity_id=rule_hit["id"],
            erp_entity_name=rule_hit["name"],
            suggestions=[rule_hit],
            conflicts=[],
            metadata={"rule_id": rule_hit.get("rule_id")},
        )

    candidates = find_erp_candidates(db, entity_type, name, provider_entity_id, path)
    exact = [c for c in candidates if c.get("score", 0) >= 0.999]
    if len(exact) == 1:
        hit = exact[0]
        return DetectResult(
            status="auto_matched",
            match_method="exact",
            confidence=1.0,
            erp_entity_id=hit["id"],
            erp_entity_name=hit["name"],
            suggestions=[hit],
            conflicts=[],
            metadata={},
        )
    if len(exact) > 1:
        return DetectResult(
            status="conflict",
            match_method="exact",
            confidence=1.0,
            erp_entity_id=None,
            erp_entity_name=None,
            suggestions=exact,
            conflicts=exact,
            metadata={"reason": "multiple_exact_matches"},
        )

    fuzzy = [c for c in candidates if c.get("score", 0) >= 0.85]
    if len(fuzzy) == 1:
        hit = fuzzy[0]
        return DetectResult(
            status="suggested",
            match_method="fuzzy",
            confidence=float(hit["score"]),
            erp_entity_id=hit["id"],
            erp_entity_name=hit["name"],
            suggestions=[hit],
            conflicts=[],
            metadata={},
        )

    ai_candidates = ai_suggest_candidates(candidates)
    if ai_candidates:
        top = ai_candidates[0]
        return DetectResult(
            status="suggested",
            match_method="ai",
            confidence=float(top.get("score", 0)),
            erp_entity_id=top["id"] if top.get("score", 0) >= 0.9 else None,
            erp_entity_name=top.get("name"),
            suggestions=ai_candidates,
            conflicts=[],
            metadata={"ai_stub": True},
        )

    return DetectResult(
        status="suggested",
        match_method="none",
        confidence=0.0,
        erp_entity_id=None,
        erp_entity_name=None,
        suggestions=[],
        conflicts=[],
        metadata={"reason": "no_match_create_suggestion"},
    )


def _append_history(
    db: Session,
    mapping: ProviderEntityMapping,
    action: str,
    actor_email: str,
    actor_role: str,
    from_status: Optional[str],
    to_status: Optional[str],
    detail: Optional[Dict[str, Any]] = None,
) -> None:
    db.add(
        ProviderMappingHistory(
            mapping_id=mapping.id,
            action=action,
            actor_email=actor_email,
            actor_role=actor_role,
            from_status=from_status,
            to_status=to_status,
            detail_json=dumps_json(detail) if detail else None,
        )
    )


def get_existing_mapping(
    db: Session,
    provider: str,
    entity_type: str,
    provider_entity_id: str,
) -> Optional[ProviderEntityMapping]:
    return (
        db.query(ProviderEntityMapping)
        .filter(
            ProviderEntityMapping.provider == provider,
            ProviderEntityMapping.entity_type == entity_type,
            ProviderEntityMapping.provider_entity_id == provider_entity_id,
        )
        .first()
    )


def upsert_detected_mapping(
    db: Session,
    provider: str,
    entity_type: str,
    provider_entity_id: str,
    provider_name: str,
    path: Optional[List[str]] = None,
    source_item_id: Optional[str] = None,
    actor_email: str = "system",
    actor_role: str = "system",
) -> ProviderEntityMapping:
    existing = get_existing_mapping(db, provider, entity_type, provider_entity_id)
    if existing and existing.status in {"approved", "manual", "auto_matched"}:
        return existing

    result = detect_mapping(db, entity_type, provider, provider_entity_id, provider_name, path)
    payload = {
        "provider_name": provider_name,
        "provider_path_json": dumps_json(path) if path else None,
        "erp_entity_id": result.erp_entity_id,
        "erp_entity_name": result.erp_entity_name,
        "status": result.status if result.status != "pending" else "suggested",
        "match_method": result.match_method,
        "confidence": result.confidence,
        "suggestion_json": dumps_json(result.suggestions),
        "conflict_json": dumps_json(result.conflicts) if result.conflicts else None,
        "metadata_json": dumps_json(result.metadata),
        "source_item_id": source_item_id,
    }

    if existing:
        from_status = existing.status
        for key, value in payload.items():
            setattr(existing, key, value)
        mapping = existing
    else:
        from_status = None
        mapping = ProviderEntityMapping(
            id=str(uuid.uuid4()),
            provider=provider,
            entity_type=entity_type,
            provider_entity_id=provider_entity_id,
            **payload,
        )
        db.add(mapping)
        db.flush()

    _append_history(
        db,
        mapping,
        "detected" if from_status is None else "redetected",
        actor_email,
        actor_role,
        from_status,
        mapping.status,
        {"match_method": mapping.match_method, "confidence": mapping.confidence},
    )
    return mapping


def extract_entities_from_universal(universal: Dict[str, Any]) -> List[Dict[str, Any]]:
    entities: List[Dict[str, Any]] = []
    provider = str(universal.get("provider") or "unknown")

    brand = universal.get("brand")
    if isinstance(brand, dict) and brand.get("name"):
        entities.append(
            {
                "entity_type": "brand",
                "provider": provider,
                "provider_entity_id": str(brand.get("providerBrandId") or slugify(str(brand["name"]))),
                "provider_name": str(brand["name"]),
            }
        )

    category = universal.get("category")
    if isinstance(category, dict) and category.get("name"):
        path = category.get("path") if isinstance(category.get("path"), list) else []
        entities.append(
            {
                "entity_type": "category",
                "provider": provider,
                "provider_entity_id": str(category.get("providerCategoryId") or slugify(str(category["name"]))),
                "provider_name": str(category["name"]),
                "path": [str(p) for p in path],
            }
        )

    supplier = universal.get("supplier")
    if isinstance(supplier, dict) and supplier.get("name"):
        entities.append(
            {
                "entity_type": "supplier",
                "provider": provider,
                "provider_entity_id": str(supplier.get("supplierId") or slugify(str(supplier["name"]))),
                "provider_name": str(supplier["name"]),
            }
        )

    attributes = universal.get("attributes") or []
    seen: set[str] = set()
    for attr in attributes:
        if not isinstance(attr, dict):
            continue
        name = str(attr.get("name") or "").strip()
        if not name:
            continue
        key = normalize_name(name)
        if key in seen:
            continue
        seen.add(key)
        entities.append(
            {
                "entity_type": "attribute",
                "provider": provider,
                "provider_entity_id": str(attr.get("id") or slugify(name)),
                "provider_name": name,
            }
        )

    return entities


def scan_universal_product(
    db: Session,
    universal: Dict[str, Any],
    source_item_id: Optional[str] = None,
    actor_email: str = "system",
    actor_role: str = "system",
) -> List[ProviderEntityMapping]:
    mappings: List[ProviderEntityMapping] = []
    for entity in extract_entities_from_universal(universal):
        mapping = upsert_detected_mapping(
            db,
            provider=entity["provider"],
            entity_type=entity["entity_type"],
            provider_entity_id=entity["provider_entity_id"],
            provider_name=entity["provider_name"],
            path=entity.get("path"),
            source_item_id=source_item_id,
            actor_email=actor_email,
            actor_role=actor_role,
        )
        mappings.append(mapping)
    return mappings


def approve_mapping(
    db: Session,
    mapping: ProviderEntityMapping,
    actor_email: str,
    actor_role: str,
    erp_entity_id: Optional[str] = None,
    erp_entity_name: Optional[str] = None,
    review_notes: Optional[str] = None,
) -> ProviderEntityMapping:
    from_status = mapping.status
    if erp_entity_id:
        mapping.erp_entity_id = erp_entity_id
    if erp_entity_name:
        mapping.erp_entity_name = erp_entity_name
    if not mapping.erp_entity_id:
        raise ValueError("Cannot approve mapping without ERP target")
    mapping.status = "approved"
    mapping.match_method = mapping.match_method if mapping.match_method in MATCH_METHODS else "manual"
    mapping.approved_by = actor_email
    mapping.approved_at = datetime.utcnow()
    mapping.review_notes = review_notes
    _append_history(db, mapping, "approved", actor_email, actor_role, from_status, "approved", {"notes": review_notes})
    return mapping


def reject_mapping(
    db: Session,
    mapping: ProviderEntityMapping,
    actor_email: str,
    actor_role: str,
    review_notes: Optional[str] = None,
) -> ProviderEntityMapping:
    from_status = mapping.status
    mapping.status = "rejected"
    mapping.review_notes = review_notes
    _append_history(db, mapping, "rejected", actor_email, actor_role, from_status, "rejected", {"notes": review_notes})
    return mapping


def manual_mapping(
    db: Session,
    mapping: ProviderEntityMapping,
    erp_entity_id: str,
    erp_entity_name: str,
    actor_email: str,
    actor_role: str,
    review_notes: Optional[str] = None,
) -> ProviderEntityMapping:
    from_status = mapping.status
    mapping.erp_entity_id = erp_entity_id
    mapping.erp_entity_name = erp_entity_name
    mapping.status = "manual"
    mapping.match_method = "manual"
    mapping.confidence = 1.0
    mapping.review_notes = review_notes
    _append_history(
        db,
        mapping,
        "manual_set",
        actor_email,
        actor_role,
        from_status,
        "manual",
        {"erp_entity_id": erp_entity_id, "notes": review_notes},
    )
    return mapping


def resolve_conflict(
    db: Session,
    mapping: ProviderEntityMapping,
    erp_entity_id: str,
    erp_entity_name: str,
    actor_email: str,
    actor_role: str,
    review_notes: Optional[str] = None,
) -> ProviderEntityMapping:
    from_status = mapping.status
    mapping.erp_entity_id = erp_entity_id
    mapping.erp_entity_name = erp_entity_name
    mapping.status = "manual"
    mapping.match_method = "manual"
    mapping.conflict_json = None
    mapping.review_notes = review_notes
    _append_history(
        db,
        mapping,
        "conflict_resolved",
        actor_email,
        actor_role,
        from_status,
        "manual",
        {"erp_entity_id": erp_entity_id},
    )
    return mapping


def merge_mappings(
    db: Session,
    target_id: str,
    source_ids: List[str],
    actor_email: str,
    actor_role: str,
) -> ProviderEntityMapping:
    target = db.get(ProviderEntityMapping, target_id)
    if not target:
        raise ValueError("Target mapping not found")
    for sid in source_ids:
        if sid == target_id:
            continue
        source = db.get(ProviderEntityMapping, sid)
        if not source:
            continue
        from_status = source.status
        source.status = "merged"
        source.merged_into_id = target.id
        source.erp_entity_id = target.erp_entity_id
        source.erp_entity_name = target.erp_entity_name
        _append_history(
            db,
            source,
            "merged",
            actor_email,
            actor_role,
            from_status,
            "merged",
            {"merged_into": target.id},
        )
    _append_history(
        db,
        target,
        "merge_target",
        actor_email,
        actor_role,
        target.status,
        target.status,
        {"merged_sources": source_ids},
    )
    return target


def mapping_dashboard_meta(db: Session) -> Dict[str, Any]:
    rows = db.query(ProviderEntityMapping).all()
    by_type: Dict[str, int] = {t: 0 for t in ENTITY_TYPES}
    by_status: Dict[str, int] = {}
    for row in rows:
        by_type[row.entity_type] = by_type.get(row.entity_type, 0) + 1
        by_status[row.status] = by_status.get(row.status, 0) + 1
    return {
        "total": len(rows),
        "by_entity_type": by_type,
        "by_status": by_status,
        "pending_review": sum(
            1 for r in rows if r.status in {"suggested", "conflict", "auto_matched", "pending"}
        ),
        "approved": by_status.get("approved", 0) + by_status.get("manual", 0),
        "conflicts": by_status.get("conflict", 0),
        "rules": db.query(ProviderMappingRule).filter(ProviderMappingRule.is_active.is_(True)).count(),
    }
