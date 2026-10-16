"""Supplier portal auth dependency.

The whole isolation guarantee of the portal rests here: `supplier_id` is read
from the session row, never from anything the client sends. Portal endpoints
must take their scope from `PortalIdentity.supplier_id` and must not accept a
supplier id as a path, query, or body parameter.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.supplier_user import SupplierSession, SupplierUser
from app.services.supplier import supplier_auth_service


@dataclass(frozen=True)
class PortalIdentity:
    user: SupplierUser
    session: SupplierSession

    @property
    def supplier_id(self) -> str:
        return self.session.supplier_id


def _bearer(authorization: Optional[str]) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    return authorization.removeprefix("Bearer ").strip()


def require_supplier_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> PortalIdentity:
    token = _bearer(authorization)
    user, session = supplier_auth_service.resolve_session(db, token)
    return PortalIdentity(user=user, session=session)
