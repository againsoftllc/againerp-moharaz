from __future__ import annotations

from datetime import date as Date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


# --- asset types ---
class AssetTypeCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    depreciation_rate: Optional[Decimal] = None
    status: str = Field(default="active", pattern="^(active|inactive)$")


class AssetTypeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    depreciation_rate: Optional[Decimal] = None
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")


class AssetTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    description: Optional[str] = None
    depreciation_rate: Optional[Decimal] = None
    status: str
    assets_count: int = 0
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AssetTypeListResponse(BaseModel):
    data: List[AssetTypeRead]
    meta: dict
    errors: List[str] = []


class AssetTypeResponse(BaseModel):
    data: AssetTypeRead
    errors: List[str] = []


# --- assets ---
class AssetCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    asset_type_id: Optional[str] = Field(default=None, max_length=36)
    serial_number: Optional[str] = Field(default=None, max_length=50)
    asset_code: Optional[str] = Field(default=None, max_length=50)
    secondary_code: Optional[str] = Field(default=None, max_length=50)
    purchase_date: Optional[Date] = None
    purchase_cost: Optional[Decimal] = None
    condition: Optional[str] = Field(default=None, pattern="^(new|good|fair|poor)$")
    description: Optional[str] = Field(default=None, max_length=255)
    location: Optional[str] = Field(default=None, max_length=255)
    supplier: Optional[str] = Field(default=None, max_length=255)
    warranty_info: Optional[str] = Field(default=None, max_length=255)
    warranty_expiry_date: Optional[Date] = None
    images: Optional[str] = Field(default=None, max_length=50)
    documents: Optional[str] = Field(default=None, max_length=50)
    qr_code: Optional[str] = Field(default=None, max_length=50)


class AssetUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    asset_type_id: Optional[str] = Field(default=None, max_length=36)
    serial_number: Optional[str] = Field(default=None, max_length=50)
    asset_code: Optional[str] = Field(default=None, max_length=50)
    secondary_code: Optional[str] = Field(default=None, max_length=50)
    purchase_date: Optional[Date] = None
    purchase_cost: Optional[Decimal] = None
    condition: Optional[str] = Field(default=None, pattern="^(new|good|fair|poor)$")
    description: Optional[str] = Field(default=None, max_length=255)
    location: Optional[str] = Field(default=None, max_length=255)
    supplier: Optional[str] = Field(default=None, max_length=255)
    warranty_info: Optional[str] = Field(default=None, max_length=255)
    warranty_expiry_date: Optional[Date] = None
    images: Optional[str] = Field(default=None, max_length=50)
    documents: Optional[str] = Field(default=None, max_length=50)
    qr_code: Optional[str] = Field(default=None, max_length=50)


class AssetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    asset_type_id: Optional[str] = None
    asset_type_name: Optional[str] = None
    serial_number: Optional[str] = None
    asset_code: Optional[str] = None
    secondary_code: Optional[str] = None
    purchase_date: Optional[Date] = None
    purchase_cost: Optional[Decimal] = None
    status: str
    condition: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    supplier: Optional[str] = None
    warranty_info: Optional[str] = None
    warranty_expiry_date: Optional[Date] = None
    images: Optional[str] = None
    documents: Optional[str] = None
    qr_code: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AssetListResponse(BaseModel):
    data: List[AssetRead]
    meta: dict
    errors: List[str] = []


class AssetResponse(BaseModel):
    data: AssetRead
    errors: List[str] = []


# --- assignments ---
class AssetAssignmentCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    asset_id: str = Field(min_length=1, max_length=36)
    employee_id: str = Field(min_length=1, max_length=36)
    checkout_date: Optional[Date] = None
    expected_return_date: Optional[Date] = None
    checkout_condition: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = None


class AssetAssignmentUpdate(BaseModel):
    expected_return_date: Optional[Date] = None
    checkout_condition: Optional[str] = Field(default=None, max_length=50)
    checkin_condition: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = None


class AssetCheckinBody(BaseModel):
    checkin_date: Optional[Date] = None
    checkin_condition: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = None


class AssetAssignmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    asset_id: Optional[str] = None
    employee_id: Optional[str] = None
    checkout_date: Optional[Date] = None
    checkin_date: Optional[Date] = None
    expected_return_date: Optional[Date] = None
    checkout_condition: Optional[str] = None
    checkin_condition: Optional[str] = None
    notes: Optional[str] = None
    is_acknowledged: bool
    acknowledged_at: Optional[datetime] = None
    assigned_by: Optional[str] = None
    received_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AssetAssignmentListResponse(BaseModel):
    data: List[AssetAssignmentRead]
    meta: dict
    errors: List[str] = []


class AssetAssignmentResponse(BaseModel):
    data: AssetAssignmentRead
    errors: List[str] = []


# --- maintenances ---
class AssetMaintenanceCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    asset_id: str = Field(min_length=1, max_length=36)
    maintenance_type: Optional[str] = Field(default=None, max_length=50)
    start_date: Optional[Date] = None
    end_date: Optional[Date] = None
    cost: Optional[Decimal] = None
    details: Optional[str] = None
    supplier: Optional[str] = Field(default=None, max_length=50)


class AssetMaintenanceUpdate(BaseModel):
    maintenance_type: Optional[str] = Field(default=None, max_length=50)
    start_date: Optional[Date] = None
    end_date: Optional[Date] = None
    cost: Optional[Decimal] = None
    details: Optional[str] = None
    completion_notes: Optional[str] = None
    supplier: Optional[str] = Field(default=None, max_length=50)


class AssetMaintenanceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    asset_id: Optional[str] = None
    maintenance_type: Optional[str] = None
    start_date: Optional[Date] = None
    end_date: Optional[Date] = None
    cost: Optional[Decimal] = None
    status: str
    details: Optional[str] = None
    completion_notes: Optional[str] = None
    supplier: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AssetMaintenanceListResponse(BaseModel):
    data: List[AssetMaintenanceRead]
    meta: dict
    errors: List[str] = []


class AssetMaintenanceResponse(BaseModel):
    data: AssetMaintenanceRead
    errors: List[str] = []


# --- depreciations ---
class AssetDepreciationCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    asset_id: str = Field(min_length=1, max_length=36)
    method: str = Field(default="straight_line", pattern="^(straight_line|reducing_balance)$")
    useful_life_years: int = Field(default=5, ge=1)
    salvage_value: Optional[Decimal] = None


class AssetDepreciationUpdate(BaseModel):
    method: Optional[str] = Field(default=None, pattern="^(straight_line|reducing_balance)$")
    useful_life_years: Optional[int] = Field(default=None, ge=1)
    salvage_value: Optional[Decimal] = None


class AssetDepreciationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    asset_id: Optional[str] = None
    method: Optional[str] = None
    useful_life_years: int
    salvage_value: Optional[Decimal] = None
    current_value: Decimal
    last_calculated_date: Optional[Date] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AssetDepreciationListResponse(BaseModel):
    data: List[AssetDepreciationRead]
    meta: dict
    errors: List[str] = []


class AssetDepreciationResponse(BaseModel):
    data: AssetDepreciationRead
    errors: List[str] = []
