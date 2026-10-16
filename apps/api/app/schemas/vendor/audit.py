from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class VendorAuditLogEntryRead(BaseModel):
    id: str
    entity_type: str
    entity_id: str
    action: str
    performed_by: Optional[str] = None
    performed_by_type: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    details_json: Optional[str] = None
    created_at: datetime


class VendorAuditLogListResponse(BaseModel):
    data: List[VendorAuditLogEntryRead]
