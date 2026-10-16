from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.assets import (
    AssetAssignmentCreate,
    AssetAssignmentListResponse,
    AssetAssignmentRead,
    AssetAssignmentResponse,
    AssetAssignmentUpdate,
    AssetCheckinBody,
    AssetCreate,
    AssetDepreciationCreate,
    AssetDepreciationListResponse,
    AssetDepreciationRead,
    AssetDepreciationResponse,
    AssetDepreciationUpdate,
    AssetListResponse,
    AssetMaintenanceCreate,
    AssetMaintenanceListResponse,
    AssetMaintenanceRead,
    AssetMaintenanceResponse,
    AssetMaintenanceUpdate,
    AssetRead,
    AssetResponse,
    AssetTypeCreate,
    AssetTypeListResponse,
    AssetTypeRead,
    AssetTypeResponse,
    AssetTypeUpdate,
    AssetUpdate,
)
from app.services.hrm import assets_service as svc

asset_types_router = APIRouter(prefix="/asset-types", tags=["hrm-asset-types"])
assets_router = APIRouter(prefix="/assets", tags=["hrm-assets"])
assignments_router = APIRouter(prefix="/asset-assignments", tags=["hrm-asset-assignments"])
maintenances_router = APIRouter(prefix="/asset-maintenances", tags=["hrm-asset-maintenances"])
depreciations_router = APIRouter(prefix="/asset-depreciations", tags=["hrm-asset-depreciations"])


def _meta(rows):
    return {"count": len(rows)}


# asset types
@asset_types_router.get("", response_model=AssetTypeListResponse)
def list_asset_types(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "read")), company_id: str = Depends(get_current_company_id), q: Optional[str] = None):
    rows = svc.list_asset_types(db, company_id=company_id, q=q)
    data = [AssetTypeRead.model_validate(svc._to_asset_type_read(db, r)) for r in rows]
    return AssetTypeListResponse(data=data, meta=_meta(data))


@asset_types_router.post("", response_model=AssetTypeResponse, status_code=201)
def create_asset_type(payload: AssetTypeCreate, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "create"))):
    row = svc.create_asset_type(db, payload, created_by=user.id)
    return AssetTypeResponse(data=AssetTypeRead.model_validate(svc._to_asset_type_read(db, row)))


@asset_types_router.patch("/{row_id}", response_model=AssetTypeResponse)
def update_asset_type(row_id: str, payload: AssetTypeUpdate, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    row = svc.update_asset_type(db, row_id, payload, company_id=company_id)
    return AssetTypeResponse(data=AssetTypeRead.model_validate(svc._to_asset_type_read(db, row)))


@asset_types_router.delete("/{row_id}", status_code=204)
def delete_asset_type(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "delete")), company_id: str = Depends(get_current_company_id)):
    svc.delete_asset_type(db, row_id, company_id=company_id)
    return Response(status_code=204)


# assets
@assets_router.get("", response_model=AssetListResponse)
def list_assets(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "read")), company_id: str = Depends(get_current_company_id), asset_type_id: Optional[str] = None, status: Optional[str] = Query(default=None, pattern="^(available|assigned|under_maintenance|disposed)$"), q: Optional[str] = None):
    rows = svc.list_assets(db, company_id=company_id, asset_type_id=asset_type_id, status=status, q=q)
    data = [svc._to_asset_read(db, r) for r in rows]
    return AssetListResponse(data=data, meta=_meta(data))


@assets_router.post("", response_model=AssetResponse, status_code=201)
def create_asset(payload: AssetCreate, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "create"))):
    row = svc.create_asset(db, payload, created_by=user.id)
    return AssetResponse(data=svc._to_asset_read(db, row))


@assets_router.patch("/{row_id}", response_model=AssetResponse)
def update_asset(row_id: str, payload: AssetUpdate, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    row = svc.update_asset(db, row_id, payload, company_id=company_id)
    return AssetResponse(data=svc._to_asset_read(db, row))


@assets_router.post("/{row_id}/dispose", response_model=AssetResponse)
def dispose_asset(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    row = svc.dispose_asset(db, row_id, company_id=company_id)
    return AssetResponse(data=svc._to_asset_read(db, row))


@assets_router.delete("/{row_id}", status_code=204)
def delete_asset(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "delete")), company_id: str = Depends(get_current_company_id)):
    svc.delete_asset(db, row_id, company_id=company_id)
    return Response(status_code=204)


# assignments
@assignments_router.get("", response_model=AssetAssignmentListResponse)
def list_assignments(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "read")), company_id: str = Depends(get_current_company_id), asset_id: Optional[str] = None, employee_id: Optional[str] = None, active_only: bool = Query(default=False)):
    rows = svc.list_assignments(db, company_id=company_id, asset_id=asset_id, employee_id=employee_id, active_only=active_only)
    data = [AssetAssignmentRead.model_validate(r) for r in rows]
    return AssetAssignmentListResponse(data=data, meta=_meta(data))


@assignments_router.post("", response_model=AssetAssignmentResponse, status_code=201)
def checkout_asset(payload: AssetAssignmentCreate, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "create"))):
    return AssetAssignmentResponse(data=AssetAssignmentRead.model_validate(svc.checkout_asset(db, payload, assigned_by=user.id)))


@assignments_router.patch("/{row_id}", response_model=AssetAssignmentResponse)
def update_assignment(row_id: str, payload: AssetAssignmentUpdate, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return AssetAssignmentResponse(data=AssetAssignmentRead.model_validate(svc.update_assignment(db, row_id, payload, company_id=company_id)))


@assignments_router.post("/{row_id}/checkin", response_model=AssetAssignmentResponse)
def checkin_asset(row_id: str, payload: AssetCheckinBody = AssetCheckinBody(), db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return AssetAssignmentResponse(data=AssetAssignmentRead.model_validate(svc.checkin_asset(db, row_id, payload, company_id=company_id, received_by=user.id)))


@assignments_router.post("/{row_id}/acknowledge", response_model=AssetAssignmentResponse)
def acknowledge_assignment(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return AssetAssignmentResponse(data=AssetAssignmentRead.model_validate(svc.acknowledge_assignment(db, row_id, company_id=company_id)))


@assignments_router.delete("/{row_id}", status_code=204)
def delete_assignment(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "delete")), company_id: str = Depends(get_current_company_id)):
    svc.delete_assignment(db, row_id, company_id=company_id)
    return Response(status_code=204)


# maintenances
@maintenances_router.get("", response_model=AssetMaintenanceListResponse)
def list_maintenances(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "read")), company_id: str = Depends(get_current_company_id), asset_id: Optional[str] = None, status: Optional[str] = Query(default=None, pattern="^(scheduled|in_progress|completed|cancelled)$")):
    rows = svc.list_maintenances(db, company_id=company_id, asset_id=asset_id, status=status)
    data = [AssetMaintenanceRead.model_validate(r) for r in rows]
    return AssetMaintenanceListResponse(data=data, meta=_meta(data))


@maintenances_router.post("", response_model=AssetMaintenanceResponse, status_code=201)
def create_maintenance(payload: AssetMaintenanceCreate, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "create"))):
    return AssetMaintenanceResponse(data=AssetMaintenanceRead.model_validate(svc.create_maintenance(db, payload, created_by=user.id)))


@maintenances_router.patch("/{row_id}", response_model=AssetMaintenanceResponse)
def update_maintenance(row_id: str, payload: AssetMaintenanceUpdate, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return AssetMaintenanceResponse(data=AssetMaintenanceRead.model_validate(svc.update_maintenance(db, row_id, payload, company_id=company_id)))


@maintenances_router.post("/{row_id}/start", response_model=AssetMaintenanceResponse)
def start_maintenance(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return AssetMaintenanceResponse(data=AssetMaintenanceRead.model_validate(svc.start_maintenance(db, row_id, company_id=company_id)))


@maintenances_router.post("/{row_id}/complete", response_model=AssetMaintenanceResponse)
def complete_maintenance(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return AssetMaintenanceResponse(data=AssetMaintenanceRead.model_validate(svc.complete_maintenance(db, row_id, company_id=company_id)))


@maintenances_router.post("/{row_id}/cancel", response_model=AssetMaintenanceResponse)
def cancel_maintenance(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return AssetMaintenanceResponse(data=AssetMaintenanceRead.model_validate(svc.cancel_maintenance(db, row_id, company_id=company_id)))


@maintenances_router.delete("/{row_id}", status_code=204)
def delete_maintenance(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "delete")), company_id: str = Depends(get_current_company_id)):
    svc.delete_maintenance(db, row_id, company_id=company_id)
    return Response(status_code=204)


# depreciations
@depreciations_router.get("", response_model=AssetDepreciationListResponse)
def list_depreciations(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "read")), company_id: str = Depends(get_current_company_id), asset_id: Optional[str] = None):
    rows = svc.list_depreciations(db, company_id=company_id, asset_id=asset_id)
    data = [AssetDepreciationRead.model_validate(r) for r in rows]
    return AssetDepreciationListResponse(data=data, meta=_meta(data))


@depreciations_router.post("", response_model=AssetDepreciationResponse, status_code=201)
def create_depreciation(payload: AssetDepreciationCreate, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "create"))):
    return AssetDepreciationResponse(data=AssetDepreciationRead.model_validate(svc.create_depreciation(db, payload, created_by=user.id)))


@depreciations_router.patch("/{row_id}", response_model=AssetDepreciationResponse)
def update_depreciation(row_id: str, payload: AssetDepreciationUpdate, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return AssetDepreciationResponse(data=AssetDepreciationRead.model_validate(svc.update_depreciation(db, row_id, payload, company_id=company_id)))


@depreciations_router.post("/{row_id}/calculate", response_model=AssetDepreciationResponse)
def calculate_depreciation(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return AssetDepreciationResponse(data=AssetDepreciationRead.model_validate(svc.calculate_depreciation(db, row_id, company_id=company_id)))


@depreciations_router.delete("/{row_id}", status_code=204)
def delete_depreciation(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "delete")), company_id: str = Depends(get_current_company_id)):
    svc.delete_depreciation(db, row_id, company_id=company_id)
    return Response(status_code=204)
