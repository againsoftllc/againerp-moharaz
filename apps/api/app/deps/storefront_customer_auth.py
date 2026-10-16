from __future__ import annotations

from typing import Optional, Tuple

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.commerce_customer import CommerceCustomer
from app.models.storefront_customer_auth import StorefrontCustomerIdentity, StorefrontCustomerSession
from app.services.ecommerce.storefront_customer_auth_service import StorefrontCustomerAuthService

CustomerAuthContext = Tuple[StorefrontCustomerSession, StorefrontCustomerIdentity, CommerceCustomer]


def _bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ").strip()
    return token or None


def get_current_storefront_customer(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> CustomerAuthContext:
    token = _bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    ctx = StorefrontCustomerAuthService(db).get_session(token)
    if not ctx:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return ctx


def get_optional_storefront_customer(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> Optional[CustomerAuthContext]:
    token = _bearer_token(authorization)
    if not token:
        return None
    return StorefrontCustomerAuthService(db).get_session(token)
