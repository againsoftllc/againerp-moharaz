from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.models.seo_audit_issue import SeoAuditIssue
from app.models.seo_audit_run import SeoAuditRun
from app.models.seo_meta_record import SeoMetaRecord
from app.models.seo_redirect import SeoRedirect
from app.models.seo_url_record import SeoUrlRecord
from app.schemas.seo.audit import (
    SeoAuditIssueListMeta,
    SeoAuditIssueListResponse,
    SeoAuditIssueRead,
    SeoAuditIssueResponse,
    SeoAuditIssueUpdate,
    SeoAuditRunListResponse,
    SeoAuditRunRead,
    SeoAuditRunRequest,
    SeoAuditRunResponse,
    SeoDashboard,
)
from app.schemas.seo.meta import (
    SeoMetaListMeta,
    SeoMetaListResponse,
    SeoMetaRead,
    SeoMetaResponse,
    SeoMetaUpdate,
)
from app.schemas.seo.redirect import (
    SeoRedirectCreate,
    SeoRedirectListMeta,
    SeoRedirectListResponse,
    SeoRedirectRead,
    SeoRedirectResponse,
    SeoRedirectUpdate,
)
from app.schemas.seo.url import (
    SeoUrlListMeta,
    SeoUrlListResponse,
    SeoUrlRead,
    SeoUrlResponse,
    SeoUrlSyncResponse,
    SeoUrlUpdate,
)
from app.services.seo_audit_analyzer import run_seo_audit
from app.services.seo_url_sync import normalize_path, sync_seo_url_records

# SEO is website configuration, so it rides the existing `website` RBAC module
# rather than introducing one that no seeded role would grant.
RBAC_MODULE = "website"

URL_STATUSES = {"active", "redirect", "noindex", "draft"}
REDIRECT_TYPES = {"301", "302", "307", "308", "410"}
REDIRECT_STATUSES = {"active", "draft", "disabled"}

router = APIRouter(prefix="/seo", tags=["seo"])


def _like(value: str) -> str:
    return f"%{value.strip().lower()}%"


# ------------------------------------------------------------------- URLs


@router.get("/urls", response_model=SeoUrlListResponse)
def list_urls(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission(RBAC_MODULE, "read")),
    company_id: str = Depends(get_current_company_id),
    search: Optional[str] = Query(default=None),
    entity_type: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
) -> SeoUrlListResponse:
    query = db.query(SeoUrlRecord).filter(SeoUrlRecord.company_id == company_id)
    if entity_type:
        query = query.filter(SeoUrlRecord.entity_type == entity_type)
    if status_filter:
        query = query.filter(SeoUrlRecord.status == status_filter)
    if search:
        term = _like(search)
        query = query.filter(
            func.lower(SeoUrlRecord.title).like(term) | func.lower(SeoUrlRecord.slug).like(term)
        )
    rows = query.order_by(SeoUrlRecord.entity_type, SeoUrlRecord.slug).all()

    return SeoUrlListResponse(
        data=[SeoUrlRead.model_validate(row) for row in rows],
        meta=SeoUrlListMeta(
            count=len(rows),
            active_count=sum(1 for row in rows if row.status == "active"),
            redirect_count=sum(1 for row in rows if row.status == "redirect"),
            noindex_count=sum(1 for row in rows if row.status == "noindex"),
            draft_count=sum(1 for row in rows if row.status == "draft"),
            views_30d_total=sum(row.views_30d for row in rows),
        ),
    )


@router.patch("/urls/{url_id}", response_model=SeoUrlResponse)
def update_url(
    url_id: str,
    payload: SeoUrlUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission(RBAC_MODULE, "write")),
    company_id: str = Depends(get_current_company_id),
) -> SeoUrlResponse:
    row = (
        db.query(SeoUrlRecord)
        .filter(SeoUrlRecord.id == url_id, SeoUrlRecord.company_id == company_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="URL record not found")

    data = payload.model_dump(exclude_unset=True)

    if "status" in data and data["status"] not in URL_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"status must be one of {sorted(URL_STATUSES)}",
        )

    if "slug" in data:
        slug = normalize_path(data["slug"])
        if not slug:
            raise HTTPException(status_code=400, detail="slug cannot be empty")
        clash = (
            db.query(SeoUrlRecord)
            .filter(SeoUrlRecord.slug == slug, SeoUrlRecord.id != url_id)
            .first()
        )
        if clash is not None:
            raise HTTPException(status_code=409, detail=f"{slug} is already used by {clash.title}")
        data["slug"] = slug

    if "redirect_to" in data:
        data["redirect_to"] = normalize_path(data["redirect_to"])
    if "canonical_url" in data and data["canonical_url"] is None:
        data["canonical_url"] = ""

    # Touching either derived field means the user is overriding the sync, so
    # lock the pair — unless they explicitly asked to hand it back.
    if ("status" in data or "indexable" in data) and "status_locked" not in data:
        data["status_locked"] = True

    for field, value in data.items():
        setattr(row, field, value)

    db.commit()
    db.refresh(row)
    return SeoUrlResponse(data=SeoUrlRead.model_validate(row))


@router.post("/urls/sync", response_model=SeoUrlSyncResponse)
def resync_urls(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission(RBAC_MODULE, "write")),
    company_id: str = Depends(get_current_company_id),
) -> SeoUrlSyncResponse:
    synced = sync_seo_url_records(db, company_id=company_id)
    count = db.query(SeoUrlRecord).filter(SeoUrlRecord.company_id == company_id).count()
    return SeoUrlSyncResponse(synced=synced, count=count)


# -------------------------------------------------------------- redirects


@router.get("/redirects", response_model=SeoRedirectListResponse)
def list_redirects(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission(RBAC_MODULE, "read")),
    company_id: str = Depends(get_current_company_id),
    search: Optional[str] = Query(default=None),
    redirect_type: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
) -> SeoRedirectListResponse:
    query = db.query(SeoRedirect).filter(SeoRedirect.company_id == company_id)
    if redirect_type:
        query = query.filter(SeoRedirect.redirect_type == redirect_type)
    if status_filter:
        query = query.filter(SeoRedirect.status == status_filter)
    if search:
        term = _like(search)
        query = query.filter(
            func.lower(SeoRedirect.from_path).like(term)
            | func.lower(func.coalesce(SeoRedirect.to_path, "")).like(term)
        )
    rows = query.order_by(SeoRedirect.from_path).all()

    return SeoRedirectListResponse(
        data=[SeoRedirectRead.model_validate(row) for row in rows],
        meta=SeoRedirectListMeta(
            count=len(rows),
            active_count=sum(1 for row in rows if row.status == "active"),
            draft_count=sum(1 for row in rows if row.status == "draft"),
            disabled_count=sum(1 for row in rows if row.status == "disabled"),
            hits_30d_total=sum(row.hits_30d for row in rows),
        ),
    )


def _validate_redirect(from_path: str, to_path: Optional[str], redirect_type: str) -> None:
    if redirect_type not in REDIRECT_TYPES:
        raise HTTPException(
            status_code=400, detail=f"redirect_type must be one of {sorted(REDIRECT_TYPES)}"
        )
    if redirect_type != "410" and not to_path:
        raise HTTPException(
            status_code=400, detail="to_path is required for every type except 410"
        )
    if to_path and normalize_path(to_path) == from_path:
        raise HTTPException(status_code=400, detail="A redirect cannot point at itself")


@router.post("/redirects", response_model=SeoRedirectResponse, status_code=status.HTTP_201_CREATED)
def create_redirect(
    payload: SeoRedirectCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission(RBAC_MODULE, "create")),
    company_id: str = Depends(get_current_company_id),
) -> SeoRedirectResponse:
    from_path = normalize_path(payload.from_path)
    to_path = normalize_path(payload.to_path) or None
    _validate_redirect(from_path, to_path, payload.redirect_type)

    if payload.status not in REDIRECT_STATUSES:
        raise HTTPException(
            status_code=400, detail=f"status must be one of {sorted(REDIRECT_STATUSES)}"
        )

    existing = (
        db.query(SeoRedirect)
        .filter(SeoRedirect.company_id == company_id, SeoRedirect.from_path == from_path)
        .first()
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail=f"A rule for {from_path} already exists")

    row = SeoRedirect(
        company_id=company_id,
        from_path=from_path,
        to_path=to_path,
        redirect_type=payload.redirect_type,
        status=payload.status,
        note=payload.note,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return SeoRedirectResponse(data=SeoRedirectRead.model_validate(row))


@router.patch("/redirects/{redirect_id}", response_model=SeoRedirectResponse)
def update_redirect(
    redirect_id: str,
    payload: SeoRedirectUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission(RBAC_MODULE, "write")),
    company_id: str = Depends(get_current_company_id),
) -> SeoRedirectResponse:
    row = (
        db.query(SeoRedirect)
        .filter(SeoRedirect.id == redirect_id, SeoRedirect.company_id == company_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Redirect not found")

    data = payload.model_dump(exclude_unset=True)
    if "from_path" in data:
        data["from_path"] = normalize_path(data["from_path"])
    if "to_path" in data:
        data["to_path"] = normalize_path(data["to_path"]) or None
    if "status" in data and data["status"] not in REDIRECT_STATUSES:
        raise HTTPException(
            status_code=400, detail=f"status must be one of {sorted(REDIRECT_STATUSES)}"
        )

    _validate_redirect(
        data.get("from_path", row.from_path),
        data.get("to_path", row.to_path),
        data.get("redirect_type", row.redirect_type),
    )

    for field, value in data.items():
        setattr(row, field, value)

    db.commit()
    db.refresh(row)
    return SeoRedirectResponse(data=SeoRedirectRead.model_validate(row))


@router.delete("/redirects/{redirect_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_redirect(
    redirect_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission(RBAC_MODULE, "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    row = (
        db.query(SeoRedirect)
        .filter(SeoRedirect.id == redirect_id, SeoRedirect.company_id == company_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Redirect not found")
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ------------------------------------------------------------ meta records


@router.get("/meta", response_model=SeoMetaListResponse)
def list_meta(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission(RBAC_MODULE, "read")),
    company_id: str = Depends(get_current_company_id),
    search: Optional[str] = Query(default=None),
    entity_type: Optional[str] = Query(default=None),
) -> SeoMetaListResponse:
    query = db.query(SeoMetaRecord).filter(SeoMetaRecord.company_id == company_id)
    if entity_type:
        query = query.filter(SeoMetaRecord.entity_type == entity_type)
    if search:
        term = _like(search)
        query = query.filter(
            func.lower(SeoMetaRecord.title).like(term) | func.lower(SeoMetaRecord.url).like(term)
        )
    rows = query.order_by(SeoMetaRecord.url).all()

    avg = int(round(sum(row.score for row in rows) / len(rows))) if rows else 0
    return SeoMetaListResponse(
        data=[SeoMetaRead.model_validate(row) for row in rows],
        meta=SeoMetaListMeta(count=len(rows), avg_score=avg),
    )


@router.patch("/meta/{meta_id}", response_model=SeoMetaResponse)
def update_meta(
    meta_id: str,
    payload: SeoMetaUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission(RBAC_MODULE, "write")),
    company_id: str = Depends(get_current_company_id),
) -> SeoMetaResponse:
    row = (
        db.query(SeoMetaRecord)
        .filter(SeoMetaRecord.id == meta_id, SeoMetaRecord.company_id == company_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Meta record not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)

    db.commit()
    db.refresh(row)
    return SeoMetaResponse(data=SeoMetaRead.model_validate(row))


# ------------------------------------------------------------------ audit


@router.get("/audit/runs", response_model=SeoAuditRunListResponse)
def list_audit_runs(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission(RBAC_MODULE, "read")),
    company_id: str = Depends(get_current_company_id),
    limit: int = Query(default=20, ge=1, le=100),
) -> SeoAuditRunListResponse:
    rows = (
        db.query(SeoAuditRun)
        .filter(SeoAuditRun.company_id == company_id)
        .order_by(SeoAuditRun.started_at.desc())
        .limit(limit)
        .all()
    )
    return SeoAuditRunListResponse(data=[SeoAuditRunRead.model_validate(row) for row in rows])


def _latest_run(db: Session, company_id: str) -> Optional[SeoAuditRun]:
    return (
        db.query(SeoAuditRun)
        .filter(SeoAuditRun.company_id == company_id)
        .order_by(SeoAuditRun.started_at.desc())
        .first()
    )


@router.get("/audit/latest", response_model=SeoAuditRunResponse)
def latest_audit_run(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission(RBAC_MODULE, "read")),
    company_id: str = Depends(get_current_company_id),
) -> SeoAuditRunResponse:
    row = _latest_run(db, company_id)
    return SeoAuditRunResponse(data=SeoAuditRunRead.model_validate(row) if row else None)


@router.post("/audit/run", response_model=SeoAuditRunResponse)
def start_audit_run(
    payload: SeoAuditRunRequest,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission(RBAC_MODULE, "write")),
    company_id: str = Depends(get_current_company_id),
) -> SeoAuditRunResponse:
    run = run_seo_audit(
        db,
        company_id=company_id,
        probe_live=payload.probe_live,
        live_sample=payload.live_sample,
    )
    return SeoAuditRunResponse(data=SeoAuditRunRead.model_validate(run))


@router.get("/audit/issues", response_model=SeoAuditIssueListResponse)
def list_audit_issues(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission(RBAC_MODULE, "read")),
    company_id: str = Depends(get_current_company_id),
    search: Optional[str] = Query(default=None),
    category: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    limit: int = Query(default=500, ge=1, le=2000),
) -> SeoAuditIssueListResponse:
    query = db.query(SeoAuditIssue).filter(SeoAuditIssue.company_id == company_id)
    if category:
        query = query.filter(SeoAuditIssue.category == category)
    if severity:
        query = query.filter(SeoAuditIssue.severity == severity)
    if status_filter:
        query = query.filter(SeoAuditIssue.status == status_filter)
    if search:
        term = _like(search)
        query = query.filter(
            func.lower(SeoAuditIssue.url).like(term)
            | func.lower(SeoAuditIssue.entity).like(term)
            | func.lower(SeoAuditIssue.issue_type).like(term)
        )

    # Severity is stored as text, so order it by weight rather than alphabet.
    weight = case(
        (SeoAuditIssue.severity == "high", 0),
        (SeoAuditIssue.severity == "medium", 1),
        else_=2,
    )
    rows = query.order_by(weight, SeoAuditIssue.category, SeoAuditIssue.url).limit(limit).all()

    return SeoAuditIssueListResponse(
        data=[SeoAuditIssueRead.model_validate(row) for row in rows],
        meta=SeoAuditIssueListMeta(
            count=len(rows),
            open_count=sum(1 for row in rows if row.status == "open"),
            fixed_count=sum(1 for row in rows if row.status == "fixed"),
            ignored_count=sum(1 for row in rows if row.status == "ignored"),
            high_count=sum(1 for row in rows if row.severity == "high"),
            medium_count=sum(1 for row in rows if row.severity == "medium"),
            low_count=sum(1 for row in rows if row.severity == "low"),
        ),
    )


@router.patch("/audit/issues/{issue_id}", response_model=SeoAuditIssueResponse)
def update_audit_issue(
    issue_id: str,
    payload: SeoAuditIssueUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission(RBAC_MODULE, "write")),
    company_id: str = Depends(get_current_company_id),
) -> SeoAuditIssueResponse:
    row = (
        db.query(SeoAuditIssue)
        .filter(SeoAuditIssue.id == issue_id, SeoAuditIssue.company_id == company_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    row.status = payload.status
    db.commit()
    db.refresh(row)
    return SeoAuditIssueResponse(data=SeoAuditIssueRead.model_validate(row))


# -------------------------------------------------------------- dashboard


@router.get("/dashboard", response_model=SeoDashboard)
def seo_dashboard(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission(RBAC_MODULE, "read")),
    company_id: str = Depends(get_current_company_id),
) -> SeoDashboard:
    run = _latest_run(db, company_id)

    issues = (
        db.query(SeoAuditIssue)
        .filter(SeoAuditIssue.company_id == company_id, SeoAuditIssue.status == "open")
        .all()
    )
    by_category: dict[str, int] = {}
    for issue in issues:
        by_category[issue.category] = by_category.get(issue.category, 0) + 1

    urls = db.query(SeoUrlRecord).filter(SeoUrlRecord.company_id == company_id).all()
    meta_scores = [
        row.score
        for row in db.query(SeoMetaRecord).filter(SeoMetaRecord.company_id == company_id).all()
    ]

    return SeoDashboard(
        health_score=run.health_score if run else 0,
        last_run=SeoAuditRunRead.model_validate(run) if run else None,
        open_issues=len(issues),
        high_issues=sum(1 for issue in issues if issue.severity == "high"),
        issues_by_category=by_category,
        url_count=len(urls),
        indexable_count=sum(1 for row in urls if row.indexable),
        redirect_count=db.query(SeoRedirect)
        .filter(SeoRedirect.company_id == company_id, SeoRedirect.status == "active")
        .count(),
        meta_count=len(meta_scores),
        avg_meta_score=int(round(sum(meta_scores) / len(meta_scores))) if meta_scores else 0,
    )
