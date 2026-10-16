from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field, model_validator


class VendorCatalogVisibilityRuleRead(BaseModel):
    id: str
    item_id: str
    vendor_group_id: Optional[str] = None
    vendor_group_name: Optional[str] = None
    vendor_id: Optional[str] = None
    vendor_name: Optional[str] = None
    is_visible: bool
    created_at: datetime
    updated_at: datetime


class VendorCatalogVisibilityRuleWrite(BaseModel):
    item_id: str
    vendor_group_id: Optional[str] = None
    vendor_id: Optional[str] = None
    is_visible: bool = True

    @model_validator(mode="after")
    def _single_scope(self) -> "VendorCatalogVisibilityRuleWrite":
        if (self.vendor_group_id is None) == (self.vendor_id is None):
            raise ValueError("Set exactly one of vendor_group_id or vendor_id")
        return self


class VendorCatalogVisibilityListResponse(BaseModel):
    data: List[VendorCatalogVisibilityRuleRead]


class VendorCatalogVisibilityResponse(BaseModel):
    data: VendorCatalogVisibilityRuleRead


class VendorProductPriceRead(BaseModel):
    id: str
    vendor_id: str
    vendor_name: Optional[str] = None
    item_id: str
    unit_price: Decimal
    min_qty: int
    max_qty: Optional[int] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class VendorProductPriceWrite(BaseModel):
    vendor_id: str
    item_id: str
    unit_price: Decimal = Field(gt=0)
    min_qty: int = 1
    max_qty: Optional[int] = None
    is_active: bool = True


class VendorProductPriceListResponse(BaseModel):
    data: List[VendorProductPriceRead]


class VendorProductPriceResponse(BaseModel):
    data: VendorProductPriceRead
