from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.models.service_category import ServiceCategory
from app.schemas.service_category import (
    ServiceCategoryCreate,
    ServiceCategoryListResponse,
    ServiceCategoryRead,
    ServiceCategoryResponse,
)

router = APIRouter(prefix="/service-categories", tags=["service-categories"])


@router.get("", response_model=ServiceCategoryListResponse)
def list_service_categories(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("service", "read")),
    company_id: str = Depends(get_current_company_id),
) -> ServiceCategoryListResponse:
    rows = (
        db.query(ServiceCategory)
        .filter(ServiceCategory.company_id == company_id)
        .order_by(ServiceCategory.name)
        .all()
    )
    return ServiceCategoryListResponse(data=[ServiceCategoryRead.model_validate(r) for r in rows])


@router.post("", response_model=ServiceCategoryResponse, status_code=201)
def create_service_category(
    payload: ServiceCategoryCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("service", "create")),
    company_id: str = Depends(get_current_company_id),
) -> ServiceCategoryResponse:
    row = ServiceCategory(
        company_id=company_id,
        name=payload.name.strip(),
        parent_id=payload.parent_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return ServiceCategoryResponse(data=ServiceCategoryRead.model_validate(row))
