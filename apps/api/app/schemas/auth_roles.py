from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class ModuleInfo(BaseModel):
    id: str
    label: str
    group: str = ""
    hint: str = ""


class ModuleListResponse(BaseModel):
    data: List[ModuleInfo]


class RolePermissionFlags(BaseModel):
    module: str
    can_read: bool = False
    can_create: bool = False
    can_write: bool = False
    can_delete: bool = False
    can_publish: bool = False
    can_export: bool = False
    can_approve: bool = False


class RoleRead(BaseModel):
    id: str
    name: str
    slug: str
    description: Optional[str] = None
    is_system: bool
    is_active: bool
    permissions: List[RolePermissionFlags] = Field(default_factory=list)
    user_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class RoleListResponse(BaseModel):
    data: List[RoleRead]


class RoleResponse(BaseModel):
    data: RoleRead


class RoleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    slug: Optional[str] = Field(default=None, min_length=2, max_length=64, pattern=r"^[a-z0-9][a-z0-9_-]*$")
    description: Optional[str] = None
    # start from one of the job-based templates (GET /roles/templates) instead of the read-only default
    template: Optional[str] = None


class RoleTemplate(BaseModel):
    id: str
    name: str
    description: str
    permissions: List[RolePermissionFlags] = Field(default_factory=list)


class RoleTemplateListResponse(BaseModel):
    data: List[RoleTemplate]


class RoleUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = None
    is_active: Optional[bool] = None


class RolePermissionsPut(BaseModel):
    permissions: List[RolePermissionFlags]
