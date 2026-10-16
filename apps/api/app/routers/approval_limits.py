from __future__ import annotations

from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, require_permission
from app.models.approval_limit import ApprovalLimit
from app.models.auth_role import AuthRole
from app.models.auth_user import AuthUser
from app.services.core.approval_service import APPROVAL_DOCUMENTS

router = APIRouter(prefix="/workspace/approval-limits", tags=["workspace-approvals"])


class LimitRead(BaseModel):
    id: Optional[str] = None
    role_slug: str
    role_name: str
    document_type: str
    document_label: str
    max_amount: Optional[Decimal] = None
    is_active: bool = True


class LimitListResponse(BaseModel):
    data: List[LimitRead]
    meta: dict


class LimitResponse(BaseModel):
    data: LimitRead


class LimitUpsert(BaseModel):
    role_slug: str = Field(min_length=1, max_length=64)
    document_type: str = Field(min_length=1, max_length=64)
    # null clears the limit — that role becomes unlimited again.
    max_amount: Optional[Decimal] = Field(default=None, ge=0)
    is_active: bool = True


@router.get("", response_model=LimitListResponse)
def list_limits(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("workspace", "read")),
    company_id: str = Depends(get_current_company_id),
) -> LimitListResponse:
    """Every role × document combination, with the ceiling where one is set."""
    roles = db.query(AuthRole).filter(AuthRole.is_active.is_(True)).order_by(AuthRole.slug).all()
    rows = {
        (r.role_slug, r.document_type): r
        for r in db.query(ApprovalLimit).filter(ApprovalLimit.company_id == company_id).all()
    }
    data: List[LimitRead] = []
    for role in roles:
        for doc, label in APPROVAL_DOCUMENTS.items():
            row = rows.get((role.slug, doc))
            data.append(
                LimitRead(
                    id=row.id if row else None,
                    role_slug=role.slug,
                    role_name=role.name,
                    document_type=doc,
                    document_label=label,
                    max_amount=row.max_amount if row else None,
                    is_active=row.is_active if row else True,
                )
            )
    return LimitListResponse(
        data=data,
        meta={
            "count": len(data),
            "documents": [{"value": k, "label": v} for k, v in APPROVAL_DOCUMENTS.items()],
            "roles": [{"value": r.slug, "label": r.name} for r in roles],
        },
    )


@router.put("", response_model=LimitResponse)
def upsert_limit(
    payload: LimitUpsert,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("workspace", "write")),
    company_id: str = Depends(get_current_company_id),
) -> LimitResponse:
    if payload.document_type not in APPROVAL_DOCUMENTS:
        raise HTTPException(status_code=422, detail="Unknown document type")
    role = db.query(AuthRole).filter(AuthRole.slug == payload.role_slug).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    row = (
        db.query(ApprovalLimit)
        .filter(
            ApprovalLimit.company_id == company_id,
            ApprovalLimit.role_slug == payload.role_slug,
            ApprovalLimit.document_type == payload.document_type,
        )
        .first()
    )

    if payload.max_amount is None:
        # Clearing the ceiling means "unlimited", which is the absence of a row.
        if row:
            db.delete(row)
            db.commit()
        return LimitResponse(
            data=LimitRead(
                role_slug=payload.role_slug,
                role_name=role.name,
                document_type=payload.document_type,
                document_label=APPROVAL_DOCUMENTS[payload.document_type],
                max_amount=None,
            )
        )

    if row is None:
        row = ApprovalLimit(
            company_id=company_id,
            role_slug=payload.role_slug,
            document_type=payload.document_type,
        )
        db.add(row)
    row.max_amount = payload.max_amount
    row.is_active = payload.is_active
    db.commit()
    db.refresh(row)
    return LimitResponse(
        data=LimitRead(
            id=row.id,
            role_slug=row.role_slug,
            role_name=role.name,
            document_type=row.document_type,
            document_label=APPROVAL_DOCUMENTS[row.document_type],
            max_amount=row.max_amount,
            is_active=row.is_active,
        )
    )
