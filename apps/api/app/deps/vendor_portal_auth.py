"""Vendor portal auth dependency.

Same isolation guarantee as app.deps.portal_auth (supplier side): `vendor_id`
is read from the session row, never from anything the client sends. Vendor
portal endpoints must take their scope from `VendorIdentity.vendor_id` and
must not accept a vendor id as a path, query, or body parameter.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.vendor.vendor_user import VendorSession, VendorUser
from app.services.vendor import vendor_auth_service
from modules.vendor.permissions.permissions import vendor_user_has_permission


@dataclass(frozen=True)
class VendorIdentity:
    user: VendorUser
    session: VendorSession

    @property
    def vendor_id(self) -> str:
        return self.session.vendor_id


def _bearer(authorization: Optional[str]) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    return authorization.removeprefix("Bearer ").strip()


def require_vendor_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> VendorIdentity:
    token = _bearer(authorization)
    user, session = vendor_auth_service.resolve_session(db, token)
    return VendorIdentity(user=user, session=session)


def require_vendor_permission(permission: str):
    def _dep(identity: VendorIdentity = Depends(require_vendor_user)) -> VendorIdentity:
        if not vendor_user_has_permission(identity.user.role, permission):
            raise HTTPException(status_code=403, detail="Not permitted")
        return identity

    return _dep
