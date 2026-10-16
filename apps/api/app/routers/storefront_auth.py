from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.storefront_customer_auth import CustomerAuthContext, get_current_storefront_customer
from app.schemas.storefront_account import (
    AuthMethodResponse,
    AuthSessionResponse,
    CustomerMeRead,
    IdentifierRequest,
    LoginPinRequest,
    MeResponse,
    OkResponse,
    RequestOtpResponse,
    SetPinRequest,
    VerifyOtpRequest,
)
from app.services.ecommerce.storefront_customer_auth_service import (
    DEFAULT_OTP,
    CustomerAuthError,
    StorefrontCustomerAuthService,
    mask_identifier,
)

router = APIRouter(prefix="/auth", tags=["storefront-auth"])


def _svc(db: Session) -> StorefrontCustomerAuthService:
    return StorefrontCustomerAuthService(db)


def _http(exc: CustomerAuthError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.message)


@router.post("/method", response_model=AuthMethodResponse)
def auth_method(payload: IdentifierRequest, db: Session = Depends(get_db)) -> AuthMethodResponse:
    try:
        normalized, identity, is_registered = _svc(db).get_method(payload.identifier)
    except CustomerAuthError as exc:
        raise _http(exc) from exc
    has_pin = bool(identity and identity.pin_hash and identity.is_active)
    return AuthMethodResponse(
        method="pin" if has_pin else "otp",
        identifier=normalized.identifier,
        identifier_type=normalized.identifier_type,
        masked=mask_identifier(normalized),
        has_pin=has_pin,
        is_registered=is_registered,
    )


@router.post("/request-otp", response_model=RequestOtpResponse)
def request_otp(payload: IdentifierRequest, http_request: Request, db: Session = Depends(get_db)) -> RequestOtpResponse:
    """Send a sign-in code by SMS (the site's gateway); development_otp only off the live server without SMS."""
    from app.services.site_resolver import request_site_options

    try:
        normalized, expires_in, dev = _svc(db).request_otp(payload.identifier, request_site_options(db, http_request))
    except CustomerAuthError as exc:
        raise _http(exc) from exc
    return RequestOtpResponse(
        expires_in=expires_in,
        masked=mask_identifier(normalized),
        development_otp=DEFAULT_OTP if dev else None,
    )


@router.post("/verify-otp", response_model=AuthSessionResponse)
def verify_otp(payload: VerifyOtpRequest, db: Session = Depends(get_db)) -> AuthSessionResponse:
    try:
        token, expires_at, customer, identity = _svc(db).verify_otp(
            payload.identifier,
            payload.otp,
            display_name=payload.name,
        )
    except CustomerAuthError as exc:
        raise _http(exc) from exc
    return AuthSessionResponse(
        token=token,
        expires_at=expires_at,
        customer=CustomerMeRead(**StorefrontCustomerAuthService.customer_to_me(customer, identity)),
    )


@router.post("/login-pin", response_model=AuthSessionResponse)
def login_pin(payload: LoginPinRequest, db: Session = Depends(get_db)) -> AuthSessionResponse:
    try:
        token, expires_at, customer, identity = _svc(db).login_pin(payload.identifier, payload.pin)
    except CustomerAuthError as exc:
        raise _http(exc) from exc
    return AuthSessionResponse(
        token=token,
        expires_at=expires_at,
        customer=CustomerMeRead(**StorefrontCustomerAuthService.customer_to_me(customer, identity)),
    )


@router.get("/me", response_model=MeResponse)
def me(ctx: CustomerAuthContext = Depends(get_current_storefront_customer)) -> MeResponse:
    _session, identity, customer = ctx
    return MeResponse(
        data=CustomerMeRead(**StorefrontCustomerAuthService.customer_to_me(customer, identity)),
    )


@router.post("/logout", response_model=OkResponse)
def logout(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> OkResponse:
    token = ""
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
    _svc(db).logout(token)
    return OkResponse()


@router.put("/pin", response_model=MeResponse)
def set_pin(
    payload: SetPinRequest,
    ctx: CustomerAuthContext = Depends(get_current_storefront_customer),
    db: Session = Depends(get_db),
) -> MeResponse:
    _session, identity, customer = ctx
    try:
        _svc(db).set_pin(identity, payload.pin, payload.confirm_pin)
    except CustomerAuthError as exc:
        raise _http(exc) from exc
    db.refresh(identity)
    return MeResponse(
        data=CustomerMeRead(**StorefrontCustomerAuthService.customer_to_me(customer, identity)),
    )


@router.delete("/pin", response_model=MeResponse)
def clear_pin(
    ctx: CustomerAuthContext = Depends(get_current_storefront_customer),
    db: Session = Depends(get_db),
) -> MeResponse:
    _session, identity, customer = ctx
    _svc(db).clear_pin(identity)
    db.refresh(identity)
    return MeResponse(
        data=CustomerMeRead(**StorefrontCustomerAuthService.customer_to_me(customer, identity)),
    )
