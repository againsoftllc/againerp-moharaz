"""Company-wide settings of the simple module settings pages (Finance, RMA, Media…)."""
from __future__ import annotations

from typing import Any, Union

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, get_current_user
from app.models.auth_user import AuthUser
from app.services import rbac as rbac_service
from app.services.core.module_settings import MODULE_IDS, get_saved_values, save_module_settings

router = APIRouter(prefix="/module-settings", tags=["module-settings"])

# Settings pages whose module has no RBAC entry of its own.
_PERMISSION_MODULE = {"vendors": "purchase"}

SettingValue = Union[bool, int, float, str]


class ModuleSettingsBody(BaseModel):
    values: dict[str, SettingValue]


class ModuleSettingsResponse(BaseModel):
    module_id: str
    values: dict[str, Any]
    saved: bool


def _check_module(module_id: str) -> str:
    if module_id not in MODULE_IDS:
        raise HTTPException(status_code=404, detail=f"No settings for module {module_id}")
    return module_id


def _require(db: Session, user: AuthUser, module_id: str, action: str) -> None:
    module = _PERMISSION_MODULE.get(module_id, module_id)
    if not rbac_service.has_permission(db, user, module, action):
        raise HTTPException(status_code=403, detail=f"Missing permission {module}:{action}")


@router.get("/{module_id}", response_model=ModuleSettingsResponse)
def get_settings(
    module_id: str = Path(max_length=40),
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
    company_id: str = Depends(get_current_company_id),
) -> ModuleSettingsResponse:
    _check_module(module_id)
    _require(db, user, module_id, "read")
    saved = get_saved_values(db, company_id, module_id)
    return ModuleSettingsResponse(module_id=module_id, values=saved or {}, saved=saved is not None)


@router.put("/{module_id}", response_model=ModuleSettingsResponse)
def put_settings(
    body: ModuleSettingsBody,
    module_id: str = Path(max_length=40),
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
    company_id: str = Depends(get_current_company_id),
) -> ModuleSettingsResponse:
    _check_module(module_id)
    _require(db, user, module_id, "write")
    try:
        values = save_module_settings(db, company_id, module_id, body.values, actor_id=user.id)
    except ValueError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    db.commit()
    return ModuleSettingsResponse(module_id=module_id, values=values, saved=True)
