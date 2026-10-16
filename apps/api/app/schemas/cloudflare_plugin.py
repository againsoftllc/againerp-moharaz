from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class CloudflarePluginRead(BaseModel):
    id: str
    company_id: str
    installed: bool
    enabled: bool
    account_status: str
    account_id: str
    account_name: str
    auth_method: Literal["manual", "oauth"]
    oauth_available: bool
    oauth_client_id_set: bool = False
    oauth_client_secret_set: bool = False
    oauth_client_id: str = ""
    api_token_set: bool
    api_token_hint: str
    media_storage: Literal["local", "r2"]
    r2_status: str
    r2_bucket: str
    r2_access_key_set: bool
    r2_public_base_url: str
    images_status: str
    images_account_hash: str
    images_api_token_set: bool
    images_api_token_hint: str
    verified_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class CloudflareOAuthAuthorizeResponse(BaseModel):
    url: str


class CloudflareOAuthAuthorizeEnvelope(BaseModel):
    data: CloudflareOAuthAuthorizeResponse


class CloudflarePluginUpdate(BaseModel):
    enabled: Optional[bool] = None
    account_id: Optional[str] = None
    api_token: Optional[str] = None
    oauth_client_id: Optional[str] = None
    oauth_client_secret: Optional[str] = None
    media_storage: Optional[Literal["local", "r2"]] = None
    r2_bucket: Optional[str] = None
    r2_access_key_id: Optional[str] = None
    r2_secret_access_key: Optional[str] = None
    r2_public_base_url: Optional[str] = None
    images_account_hash: Optional[str] = None
    images_api_token: Optional[str] = None
    verify_account: bool = False
    verify_r2: bool = False
    verify_images: bool = False


class CloudflarePluginResponse(BaseModel):
    data: CloudflarePluginRead
