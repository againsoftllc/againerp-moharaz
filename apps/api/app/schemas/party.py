from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class PartyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    type: str
    display_name: str
    legal_name: str
    status: str
    roles: List[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class PartyRoleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    party_id: str
    role: str
    created_at: datetime


class PartyListMeta(BaseModel):
    count: int
    page: int = 1
    per_page: int = 50


class PartyListResponse(BaseModel):
    data: List[PartyRead]
    meta: PartyListMeta


class PartyResponse(BaseModel):
    data: PartyRead


class PartyRoleResponse(BaseModel):
    data: PartyRoleRead


class PartyRolesResponse(BaseModel):
    data: List[PartyRoleRead]


class PartyCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=255)
    type: str = Field(default="person", pattern="^(person|organization)$")
    legal_name: str = Field(default="", max_length=255)
    status: str = Field(default="active", pattern="^(active|inactive|archived)$")
    company_id: str = Field(default="default", max_length=36)
    roles: List[str] = Field(default_factory=list)


class PartyUpdate(BaseModel):
    type: Optional[str] = Field(default=None, pattern="^(person|organization)$")
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    legal_name: Optional[str] = Field(default=None, max_length=255)
    status: Optional[str] = Field(default=None, pattern="^(active|inactive|archived)$")


class PartyRoleAssign(BaseModel):
    role: str = Field(min_length=1, max_length=50)


class PartyCommerceLinkRef(BaseModel):
    id: str
    name: str
    code: Optional[str] = None


class PartyCommerceLinksRead(BaseModel):
    party_id: str
    roles: List[str] = Field(default_factory=list)
    customer: Optional[PartyCommerceLinkRef] = None
    supplier: Optional[PartyCommerceLinkRef] = None
    vendor: Optional[PartyCommerceLinkRef] = None


class PartyCommerceLinksResponse(BaseModel):
    data: PartyCommerceLinksRead


class PartyCommerceLinkRequest(BaseModel):
    role: str = Field(pattern="^(customer|supplier|vendor)$")
    existing_id: Optional[str] = Field(default=None, max_length=36)
