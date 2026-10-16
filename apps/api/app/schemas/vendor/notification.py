from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class VendorNotificationRead(BaseModel):
    id: str
    event: str
    title: str
    message: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    is_read: bool
    created_at: datetime


class VendorNotificationListResponse(BaseModel):
    data: List[VendorNotificationRead]
    unread_count: int


class VendorNotificationMarkReadResponse(BaseModel):
    data: VendorNotificationRead
