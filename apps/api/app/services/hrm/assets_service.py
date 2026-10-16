from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional, Type, TypeVar

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.hrm.assets import (
    HrmAsset,
    HrmAssetAssignment,
    HrmAssetDepreciation,
    HrmAssetMaintenance,
    HrmAssetType,
)
from app.models.hrm.org import HrmEmployee
from app.schemas.hrm.assets import (
    AssetRead,
    AssetAssignmentCreate,
    AssetAssignmentUpdate,
    AssetCheckinBody,
    AssetCreate,
    AssetDepreciationCreate,
    AssetDepreciationUpdate,
    AssetMaintenanceCreate,
    AssetMaintenanceUpdate,
    AssetTypeCreate,
    AssetTypeUpdate,
    AssetUpdate,
)
from app.services.core.sequence_service import next_number as allocate_number

T = TypeVar("T")
ZERO = Decimal("0")


def _asset_type_assets_count(db: Session, row_id: str, company_id: str) -> int:
    return (
        db.query(HrmAsset)
        .filter(HrmAsset.company_id == company_id, HrmAsset.asset_type_id == row_id)
        .count()
    )


def _to_asset_type_read(db: Session, row: HrmAssetType):
    data = {
        "id": row.id,
        "company_id": row.company_id,
        "name": row.name,
        "description": row.description,
        "depreciation_rate": row.depreciation_rate,
        "status": row.status,
        "assets_count": _asset_type_assets_count(db, row.id, row.company_id),
        "created_by": row.created_by,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }
    return data


def _asset_type_name(db: Session, type_id: Optional[str], company_id: Optional[str]) -> Optional[str]:
    if not type_id:
        return None
    row = db.get(HrmAssetType, type_id)
    if not row or (company_id and row.company_id != company_id):
        return None
    return row.name


def _to_asset_read(db: Session, row: HrmAsset) -> AssetRead:
    data = AssetRead.model_validate(row)
    data.asset_type_name = _asset_type_name(db, row.asset_type_id, row.company_id)
    return data


def _get(db: Session, model: Type[T], row_id: str, company_id: Optional[str], label: str) -> T:
    row = db.get(model, row_id)
    if not row or (company_id and getattr(row, "company_id", None) != company_id):
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return row


def _require_employee(db: Session, employee_id: str, company_id: str) -> HrmEmployee:
    row = db.get(HrmEmployee, employee_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid employee_id")
    return row


def _require_asset(db: Session, asset_id: str, company_id: str) -> HrmAsset:
    return _get(db, HrmAsset, asset_id, company_id, "Asset")


def _require_asset_type(db: Session, type_id: str, company_id: str) -> HrmAssetType:
    return _get(db, HrmAssetType, type_id, company_id, "Asset type")


def _active_assignment(db: Session, asset_id: str, company_id: str) -> Optional[HrmAssetAssignment]:
    return (
        db.query(HrmAssetAssignment)
        .filter(
            HrmAssetAssignment.company_id == company_id,
            HrmAssetAssignment.asset_id == asset_id,
            HrmAssetAssignment.checkin_date.is_(None),
        )
        .first()
    )


def _open_maintenance(db: Session, asset_id: str, company_id: str) -> Optional[HrmAssetMaintenance]:
    return (
        db.query(HrmAssetMaintenance)
        .filter(
            HrmAssetMaintenance.company_id == company_id,
            HrmAssetMaintenance.asset_id == asset_id,
            HrmAssetMaintenance.status.in_(("scheduled", "in_progress")),
        )
        .first()
    )


def _restore_asset_status(db: Session, asset: HrmAsset):
    if asset.status == "disposed":
        return
    if _open_maintenance(db, asset.id, asset.company_id):
        asset.status = "under_maintenance"
    elif _active_assignment(db, asset.id, asset.company_id):
        asset.status = "assigned"
    else:
        asset.status = "available"


def _next_asset_code(db: Session, company_id: str) -> str:
    return allocate_number(
        db,
        company_id,
        "hrm.asset",
        initial=lambda: db.query(HrmAsset).filter(HrmAsset.company_id == company_id).count() + 1,
    )


# --- asset types ---

def list_asset_types(db: Session, *, company_id: str, q: Optional[str] = None):
    query = db.query(HrmAssetType).filter(HrmAssetType.company_id == company_id)
    if q:
        query = query.filter(HrmAssetType.name.ilike(f"%{q.strip()}%"))
    return query.order_by(HrmAssetType.name.asc()).all()


def get_asset_type(db: Session, row_id: str, *, company_id: str):
    return _get(db, HrmAssetType, row_id, company_id, "Asset type")


def create_asset_type(db: Session, payload: AssetTypeCreate, *, created_by: Optional[str]):
    row = HrmAssetType(
        company_id=payload.company_id,
        name=payload.name.strip(),
        description=payload.description,
        depreciation_rate=payload.depreciation_rate,
        status=payload.status,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_asset_type(db: Session, row_id: str, payload: AssetTypeUpdate, *, company_id: str):
    row = get_asset_type(db, row_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def delete_asset_type(db: Session, row_id: str, *, company_id: str):
    row = get_asset_type(db, row_id, company_id=company_id)
    in_use = db.query(HrmAsset).filter(HrmAsset.asset_type_id == row_id).first()
    if in_use:
        raise HTTPException(status_code=409, detail="Asset type is in use")
    db.delete(row)
    db.commit()


# --- assets ---

def list_assets(
    db: Session,
    *,
    company_id: str,
    asset_type_id: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
):
    query = db.query(HrmAsset).filter(HrmAsset.company_id == company_id)
    if asset_type_id:
        query = query.filter(HrmAsset.asset_type_id == asset_type_id)
    if status:
        query = query.filter(HrmAsset.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (HrmAsset.name.ilike(like))
            | (HrmAsset.asset_code.ilike(like))
            | (HrmAsset.serial_number.ilike(like))
        )
    return query.order_by(HrmAsset.created_at.desc()).all()


def get_asset(db: Session, row_id: str, *, company_id: str):
    return _get(db, HrmAsset, row_id, company_id, "Asset")


def create_asset(db: Session, payload: AssetCreate, *, created_by: Optional[str]):
    if payload.asset_type_id:
        _require_asset_type(db, payload.asset_type_id, payload.company_id)
    code = (payload.asset_code or "").strip() or _next_asset_code(db, payload.company_id)
    if (
        db.query(HrmAsset)
        .filter(HrmAsset.company_id == payload.company_id, HrmAsset.asset_code == code)
        .first()
    ):
        raise HTTPException(status_code=409, detail="asset_code already exists")
    data = payload.model_dump()
    data["name"] = payload.name.strip()
    data["asset_code"] = code
    if data.get("secondary_code"):
        data["secondary_code"] = data["secondary_code"].strip()
    data["status"] = "available"
    data["created_by"] = created_by
    row = HrmAsset(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_asset(db: Session, row_id: str, payload: AssetUpdate, *, company_id: str):
    row = get_asset(db, row_id, company_id=company_id)
    if row.status == "disposed":
        raise HTTPException(status_code=409, detail="Disposed assets cannot be edited")
    data = payload.model_dump(exclude_unset=True)
    if "asset_type_id" in data and data["asset_type_id"]:
        _require_asset_type(db, data["asset_type_id"], company_id)
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    if "asset_code" in data and data["asset_code"]:
        code = data["asset_code"].strip()
        dup = (
            db.query(HrmAsset)
            .filter(
                HrmAsset.company_id == company_id,
                HrmAsset.asset_code == code,
                HrmAsset.id != row_id,
            )
            .first()
        )
        if dup:
            raise HTTPException(status_code=409, detail="asset_code already exists")
        data["asset_code"] = code
    if "secondary_code" in data and data["secondary_code"] is not None:
        data["secondary_code"] = data["secondary_code"].strip()
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def dispose_asset(db: Session, row_id: str, *, company_id: str):
    row = get_asset(db, row_id, company_id=company_id)
    if row.status == "disposed":
        raise HTTPException(status_code=409, detail="Asset already disposed")
    if _active_assignment(db, row.id, company_id):
        raise HTTPException(status_code=409, detail="Return asset before disposing")
    if _open_maintenance(db, row.id, company_id):
        raise HTTPException(status_code=409, detail="Close maintenance before disposing")
    row.status = "disposed"
    db.commit()
    db.refresh(row)
    return row


def delete_asset(db: Session, row_id: str, *, company_id: str):
    row = get_asset(db, row_id, company_id=company_id)
    if row.status not in ("available", "disposed"):
        raise HTTPException(status_code=409, detail="Only available/disposed assets can be deleted")
    db.delete(row)
    db.commit()


# --- assignments ---

def list_assignments(
    db: Session,
    *,
    company_id: str,
    asset_id: Optional[str] = None,
    employee_id: Optional[str] = None,
    active_only: bool = False,
):
    query = db.query(HrmAssetAssignment).filter(HrmAssetAssignment.company_id == company_id)
    if asset_id:
        query = query.filter(HrmAssetAssignment.asset_id == asset_id)
    if employee_id:
        query = query.filter(HrmAssetAssignment.employee_id == employee_id)
    if active_only:
        query = query.filter(HrmAssetAssignment.checkin_date.is_(None))
    return query.order_by(HrmAssetAssignment.created_at.desc()).all()


def get_assignment(db: Session, row_id: str, *, company_id: str):
    return _get(db, HrmAssetAssignment, row_id, company_id, "Asset assignment")


def checkout_asset(db: Session, payload: AssetAssignmentCreate, *, assigned_by: Optional[str]):
    asset = _require_asset(db, payload.asset_id, payload.company_id)
    if asset.status != "available":
        raise HTTPException(status_code=409, detail="Asset is not available for checkout")
    _require_employee(db, payload.employee_id, payload.company_id)
    if _active_assignment(db, asset.id, payload.company_id):
        raise HTTPException(status_code=409, detail="Asset already has an active assignment")
    row = HrmAssetAssignment(
        company_id=payload.company_id,
        asset_id=payload.asset_id,
        employee_id=payload.employee_id,
        checkout_date=payload.checkout_date or date.today(),
        expected_return_date=payload.expected_return_date,
        checkout_condition=payload.checkout_condition or asset.condition,
        notes=payload.notes,
        assigned_by=assigned_by,
    )
    asset.status = "assigned"
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_assignment(db: Session, row_id: str, payload: AssetAssignmentUpdate, *, company_id: str):
    row = get_assignment(db, row_id, company_id=company_id)
    if row.checkin_date is not None:
        raise HTTPException(status_code=409, detail="Closed assignments cannot be edited")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def checkin_asset(db: Session, row_id: str, payload: AssetCheckinBody, *, company_id: str, received_by: Optional[str]):
    row = get_assignment(db, row_id, company_id=company_id)
    if row.checkin_date is not None:
        raise HTTPException(status_code=409, detail="Assignment already checked in")
    row.checkin_date = payload.checkin_date or date.today()
    if payload.checkin_condition is not None:
        row.checkin_condition = payload.checkin_condition
    if payload.notes is not None:
        row.notes = payload.notes
    row.received_by = received_by
    asset = _require_asset(db, row.asset_id, company_id)
    if payload.checkin_condition:
        asset.condition = payload.checkin_condition
    db.flush()
    _restore_asset_status(db, asset)
    db.commit()
    db.refresh(row)
    return row


def acknowledge_assignment(db: Session, row_id: str, *, company_id: str):
    row = get_assignment(db, row_id, company_id=company_id)
    if row.checkin_date is not None:
        raise HTTPException(status_code=409, detail="Closed assignments cannot be acknowledged")
    if row.is_acknowledged:
        raise HTTPException(status_code=409, detail="Already acknowledged")
    row.is_acknowledged = True
    row.acknowledged_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


def delete_assignment(db: Session, row_id: str, *, company_id: str):
    row = get_assignment(db, row_id, company_id=company_id)
    if row.checkin_date is None:
        raise HTTPException(status_code=409, detail="Check in before deleting an active assignment")
    db.delete(row)
    db.commit()


# --- maintenances ---

def list_maintenances(
    db: Session,
    *,
    company_id: str,
    asset_id: Optional[str] = None,
    status: Optional[str] = None,
):
    query = db.query(HrmAssetMaintenance).filter(HrmAssetMaintenance.company_id == company_id)
    if asset_id:
        query = query.filter(HrmAssetMaintenance.asset_id == asset_id)
    if status:
        query = query.filter(HrmAssetMaintenance.status == status)
    return query.order_by(HrmAssetMaintenance.created_at.desc()).all()


def get_maintenance(db: Session, row_id: str, *, company_id: str):
    return _get(db, HrmAssetMaintenance, row_id, company_id, "Asset maintenance")


def create_maintenance(db: Session, payload: AssetMaintenanceCreate, *, created_by: Optional[str]):
    asset = _require_asset(db, payload.asset_id, payload.company_id)
    if asset.status == "disposed":
        raise HTTPException(status_code=409, detail="Cannot schedule maintenance for disposed asset")
    if asset.status == "under_maintenance":
        raise HTTPException(status_code=409, detail="Asset already under maintenance")
    data = payload.model_dump()
    data["status"] = "scheduled"
    data["start_date"] = payload.start_date or date.today()
    data["created_by"] = created_by
    row = HrmAssetMaintenance(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_maintenance(db: Session, row_id: str, payload: AssetMaintenanceUpdate, *, company_id: str):
    row = get_maintenance(db, row_id, company_id=company_id)
    if row.status in ("completed", "cancelled"):
        raise HTTPException(status_code=409, detail="Finished maintenances cannot be edited")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def start_maintenance(db: Session, row_id: str, *, company_id: str):
    row = get_maintenance(db, row_id, company_id=company_id)
    if row.status != "scheduled":
        raise HTTPException(status_code=409, detail="Only scheduled maintenances can be started")
    row.status = "in_progress"
    row.start_date = row.start_date or date.today()
    asset = _require_asset(db, row.asset_id, company_id)
    asset.status = "under_maintenance"
    db.commit()
    db.refresh(row)
    return row


def complete_maintenance(db: Session, row_id: str, *, company_id: str):
    row = get_maintenance(db, row_id, company_id=company_id)
    if row.status not in ("scheduled", "in_progress"):
        raise HTTPException(status_code=409, detail="Only scheduled/in_progress maintenances can be completed")
    row.status = "completed"
    row.end_date = row.end_date or date.today()
    asset = _require_asset(db, row.asset_id, company_id)
    db.flush()
    _restore_asset_status(db, asset)
    db.commit()
    db.refresh(row)
    return row


def cancel_maintenance(db: Session, row_id: str, *, company_id: str):
    row = get_maintenance(db, row_id, company_id=company_id)
    if row.status in ("completed", "cancelled"):
        raise HTTPException(status_code=409, detail="Maintenance already finished")
    row.status = "cancelled"
    row.end_date = row.end_date or date.today()
    asset = _require_asset(db, row.asset_id, company_id)
    db.flush()
    _restore_asset_status(db, asset)
    db.commit()
    db.refresh(row)
    return row


def delete_maintenance(db: Session, row_id: str, *, company_id: str):
    row = get_maintenance(db, row_id, company_id=company_id)
    if row.status not in ("scheduled", "cancelled"):
        raise HTTPException(status_code=409, detail="Only scheduled/cancelled maintenances can be deleted")
    db.delete(row)
    db.commit()


# --- depreciations ---

def list_depreciations(db: Session, *, company_id: str, asset_id: Optional[str] = None):
    query = db.query(HrmAssetDepreciation).filter(HrmAssetDepreciation.company_id == company_id)
    if asset_id:
        query = query.filter(HrmAssetDepreciation.asset_id == asset_id)
    return query.order_by(HrmAssetDepreciation.created_at.desc()).all()


def get_depreciation(db: Session, row_id: str, *, company_id: str):
    return _get(db, HrmAssetDepreciation, row_id, company_id, "Asset depreciation")


def create_depreciation(db: Session, payload: AssetDepreciationCreate, *, created_by: Optional[str]):
    asset = _require_asset(db, payload.asset_id, payload.company_id)
    existing = (
        db.query(HrmAssetDepreciation)
        .filter(
            HrmAssetDepreciation.company_id == payload.company_id,
            HrmAssetDepreciation.asset_id == payload.asset_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Depreciation already exists for this asset")
    cost = asset.purchase_cost or ZERO
    salvage = payload.salvage_value
    if salvage is None:
        salvage = (cost * Decimal("0.10")).quantize(Decimal("0.01")) if cost else ZERO
    row = HrmAssetDepreciation(
        company_id=payload.company_id,
        asset_id=payload.asset_id,
        method=payload.method,
        useful_life_years=payload.useful_life_years,
        salvage_value=salvage,
        current_value=cost,
        last_calculated_date=date.today(),
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_depreciation(db: Session, row_id: str, payload: AssetDepreciationUpdate, *, company_id: str):
    row = get_depreciation(db, row_id, company_id=company_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def _years_elapsed(purchase_date: Optional[date], as_of: date) -> int:
    if not purchase_date:
        return 0
    years = as_of.year - purchase_date.year
    if (as_of.month, as_of.day) < (purchase_date.month, purchase_date.day):
        years -= 1
    return max(0, years)


def calculate_depreciation(db: Session, row_id: str, *, company_id: str):
    row = get_depreciation(db, row_id, company_id=company_id)
    asset = _require_asset(db, row.asset_id, company_id)
    cost = asset.purchase_cost or ZERO
    salvage = row.salvage_value if row.salvage_value is not None else ZERO
    life = row.useful_life_years or 5
    as_of = date.today()
    years = min(_years_elapsed(asset.purchase_date, as_of), life)

    if row.method == "reducing_balance":
        if cost <= ZERO or life <= 0:
            current = salvage
        else:
            # declining balance rate approx: 2 / life (double declining), floored at salvage
            rate = Decimal("2") / Decimal(life)
            current = cost
            for _ in range(years):
                current = current - (current * rate)
            if current < salvage:
                current = salvage
    else:
        # straight_line
        depreciable = cost - salvage
        if life <= 0 or depreciable <= ZERO:
            current = salvage if cost > ZERO else ZERO
        else:
            annual = depreciable / Decimal(life)
            current = cost - (annual * Decimal(years))
            if current < salvage:
                current = salvage

    row.current_value = Decimal(current).quantize(Decimal("0.01"))
    row.last_calculated_date = as_of
    db.commit()
    db.refresh(row)
    return row


def delete_depreciation(db: Session, row_id: str, *, company_id: str):
    row = get_depreciation(db, row_id, company_id=company_id)
    db.delete(row)
    db.commit()
