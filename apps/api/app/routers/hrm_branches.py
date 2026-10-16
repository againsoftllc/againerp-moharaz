from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.branch import (
    BranchCreate,
    BranchListMeta,
    BranchListResponse,
    BranchRead,
    BranchResponse,
    BranchUpdate,
)
from app.services.hrm import branch_service

router = APIRouter(prefix="/branches", tags=["hrm-branches"])


@router.get("", response_model=BranchListResponse)
def list_branches(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"),
    q: Optional[str] = Query(default=None, description="Search name, city, email, phone"),
) -> BranchListResponse:
    rows = branch_service.list_branches(db, company_id=company_id, status=status, q=q)
    data = [BranchRead.model_validate(r) for r in rows]
    return BranchListResponse(data=data, meta=BranchListMeta(count=len(data)))


@router.get("/{branch_id}", response_model=BranchResponse)
def get_branch(
    branch_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> BranchResponse:
    row = branch_service.get_branch(db, branch_id, company_id=company_id)
    return BranchResponse(data=BranchRead.model_validate(row))


@router.post("", response_model=BranchResponse, status_code=201)
def create_branch(
    payload: BranchCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
    company_id: str = Depends(get_current_company_id),
) -> BranchResponse:
    row = branch_service.create_branch(db, payload, company_id=company_id, created_by=user.id)
    return BranchResponse(data=BranchRead.model_validate(row))


@router.patch("/{branch_id}", response_model=BranchResponse)
def update_branch(
    branch_id: str,
    payload: BranchUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> BranchResponse:
    row = branch_service.update_branch(db, branch_id, payload, company_id=company_id)
    return BranchResponse(data=BranchRead.model_validate(row))


@router.delete("/{branch_id}", status_code=204)
def delete_branch(
    branch_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    branch_service.delete_branch(db, branch_id, company_id=company_id)
    return Response(status_code=204)
