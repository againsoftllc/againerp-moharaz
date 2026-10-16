from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class PartyContactRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    party_id: str
    contact_kind: str
    label: str
    value: str
    is_primary: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime


class PartyContactCreate(BaseModel):
    contact_kind: str = Field(pattern="^(phone|email|social)$")
    value: str = Field(min_length=1, max_length=500)
    label: str = Field(default="", max_length=50)
    is_primary: bool = False
    sort_order: int = 0


class PartyContactUpdate(BaseModel):
    contact_kind: Optional[str] = Field(default=None, pattern="^(phone|email|social)$")
    value: Optional[str] = Field(default=None, min_length=1, max_length=500)
    label: Optional[str] = Field(default=None, max_length=50)
    is_primary: Optional[bool] = None
    sort_order: Optional[int] = None


class PartyAddressRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    party_id: str
    address_type: str
    label: str
    line1: str
    line2: Optional[str] = None
    city: str
    region: str
    postal_code: str
    country: str
    is_primary: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime


class PartyAddressCreate(BaseModel):
    address_type: str = Field(pattern="^(billing|shipping|office|warehouse|factory)$")
    label: str = Field(default="", max_length=100)
    line1: str = Field(default="", max_length=255)
    line2: Optional[str] = Field(default=None, max_length=255)
    city: str = Field(default="", max_length=100)
    region: str = Field(default="", max_length=100)
    postal_code: str = Field(default="", max_length=20)
    country: str = Field(default="Bangladesh", max_length=100)
    is_primary: bool = False
    sort_order: int = 0


class PartyAddressUpdate(BaseModel):
    address_type: Optional[str] = Field(default=None, pattern="^(billing|shipping|office|warehouse|factory)$")
    label: Optional[str] = Field(default=None, max_length=100)
    line1: Optional[str] = Field(default=None, max_length=255)
    line2: Optional[str] = Field(default=None, max_length=255)
    city: Optional[str] = Field(default=None, max_length=100)
    region: Optional[str] = Field(default=None, max_length=100)
    postal_code: Optional[str] = Field(default=None, max_length=20)
    country: Optional[str] = Field(default=None, max_length=100)
    is_primary: Optional[bool] = None
    sort_order: Optional[int] = None


class PartyDocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    party_id: str
    document_type: str
    document_number: Optional[str] = None
    issuer: Optional[str] = None
    issued_at: Optional[date] = None
    expires_at: Optional[date] = None
    storage_ref: Optional[str] = None
    notes: Optional[str] = None
    is_verified: bool
    created_at: datetime
    updated_at: datetime


class PartyDocumentCreate(BaseModel):
    document_type: str = Field(pattern="^(trade_license|bin|tin|nid|passport|agreement)$")
    document_number: Optional[str] = Field(default=None, max_length=100)
    issuer: Optional[str] = Field(default=None, max_length=255)
    issued_at: Optional[date] = None
    expires_at: Optional[date] = None
    storage_ref: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = None
    is_verified: bool = False


class PartyDocumentUpdate(BaseModel):
    document_type: Optional[str] = Field(
        default=None,
        pattern="^(trade_license|bin|tin|nid|passport|agreement)$",
    )
    document_number: Optional[str] = Field(default=None, max_length=100)
    issuer: Optional[str] = Field(default=None, max_length=255)
    issued_at: Optional[date] = None
    expires_at: Optional[date] = None
    storage_ref: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = None
    is_verified: Optional[bool] = None


class PartyBankAccountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    party_id: str
    bank_name: str
    account_name: str
    account_number: str
    routing_number: Optional[str] = None
    swift_code: Optional[str] = None
    currency: str
    is_primary: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


class PartyBankAccountCreate(BaseModel):
    bank_name: str = Field(min_length=1, max_length=255)
    account_name: str = Field(min_length=1, max_length=255)
    account_number: str = Field(min_length=1, max_length=100)
    routing_number: Optional[str] = Field(default=None, max_length=50)
    swift_code: Optional[str] = Field(default=None, max_length=20)
    currency: str = Field(default="BDT", max_length=10)
    is_primary: bool = False
    is_active: bool = True


class PartyBankAccountUpdate(BaseModel):
    bank_name: Optional[str] = Field(default=None, max_length=255)
    account_name: Optional[str] = Field(default=None, max_length=255)
    account_number: Optional[str] = Field(default=None, max_length=100)
    routing_number: Optional[str] = Field(default=None, max_length=50)
    swift_code: Optional[str] = Field(default=None, max_length=20)
    currency: Optional[str] = Field(default=None, max_length=10)
    is_primary: Optional[bool] = None
    is_active: Optional[bool] = None


class PartyNoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    party_id: str
    note_type: str
    title: Optional[str] = None
    body: str
    created_by: Optional[str] = None
    is_pinned: bool
    created_at: datetime
    updated_at: datetime


class PartyNoteCreate(BaseModel):
    body: str = Field(min_length=1)
    note_type: str = Field(default="general", pattern="^(general|internal|follow_up)$")
    title: Optional[str] = Field(default=None, max_length=255)
    is_pinned: bool = False


class PartyNoteUpdate(BaseModel):
    body: Optional[str] = Field(default=None, min_length=1)
    note_type: Optional[str] = Field(default=None, pattern="^(general|internal|follow_up)$")
    title: Optional[str] = Field(default=None, max_length=255)
    is_pinned: Optional[bool] = None


class PartyUserRead(BaseModel):
    id: str
    email: str
    username: str
    name: str
    role: str
    is_active: bool

    model_config = {"from_attributes": True}


class PartyUserLink(BaseModel):
    user_id: str


class PartyWorkspaceSummaryRead(BaseModel):
    party_id: str
    contact_count: int
    address_count: int
    document_count: int
    bank_account_count: int
    note_count: int
    user_count: int
    comment_count: int
    file_count: int
    label_count: int
    pending_ai_notes: int
    approval_status: Optional[str] = None
    assigned_to: Optional[str] = None


class PartyWorkspaceSummaryResponse(BaseModel):
    data: PartyWorkspaceSummaryRead


class PartyModuleSummaryRead(BaseModel):
    module: str
    party_id: str
    ready: bool


class PartyModuleListResponse(BaseModel):
    data: List[str]
