from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class CommerceInventoryHistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    item_id: str
    warehouse_id: str
    movement_type: str
    quantity: int
    qty_before: int
    qty_after: int
    reference: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime


class CommerceInventoryHistoryListResponse(BaseModel):
    data: List[CommerceInventoryHistoryRead]
    meta: Dict[str, Any] = Field(default_factory=dict)


class CommerceInventoryAlertRead(BaseModel):
    item_id: str
    warehouse_id: str
    sku: str
    name: str
    available: int
    reorder_level: int
    message: str


class CommerceInventoryAlertListResponse(BaseModel):
    data: List[CommerceInventoryAlertRead]
    meta: Dict[str, Any] = Field(default_factory=dict)
