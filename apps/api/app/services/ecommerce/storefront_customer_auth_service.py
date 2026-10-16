from __future__ import annotations

import os
import re
import secrets
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Literal, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.commerce_customer import CommerceCustomer, dump_json, load_json
from app.models.storefront_customer_auth import (
    StorefrontCustomerIdentity,
    StorefrontCustomerSession,
    StorefrontOtpChallenge,
)
from app.security import hash_password, new_session_token, verify_password

DEFAULT_COMPANY_ID = "default"
# Customer statuses are active | vip | inactive | blocked. Only the last two
# are disabled — a VIP is a paying customer, not a locked-out one.
LOGIN_BLOCKED_STATUSES = {"inactive", "blocked"}
DEFAULT_OTP = "1234"
OTP_TTL_SECONDS = 300
# a new code at most every OTP_RESEND_SECONDS, and OTP_MAX_PER_HOUR an hour, per number
OTP_RESEND_SECONDS = 45
OTP_MAX_PER_HOUR = 5
SESSION_DAYS = 30
PIN_LENGTH = 4

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
PHONE_RE = re.compile(r"^(?:\+?880)?01[3-9]\d{8}$")


class CustomerAuthError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True)
class NormalizedIdentifier:
    identifier: str
    identifier_type: Literal["phone", "email"]
    display: str


def dev_otp_allowed() -> bool:
    """The fixed development code (DEFAULT_OTP) works only off the live server: never on Railway, and not where
    STOREFRONT_DEV_OTP=0. With an SMS gateway set up, real codes are sent everywhere."""
    return not os.environ.get("RAILWAY_ENVIRONMENT") and os.environ.get("STOREFRONT_DEV_OTP", "1") != "0"


def normalize_identifier(raw: str) -> NormalizedIdentifier:
    value = (raw or "").strip()
    if not value:
        raise CustomerAuthError("Enter your phone number or email")

    if EMAIL_RE.match(value):
        email = value.lower()
        return NormalizedIdentifier(identifier=email, identifier_type="email", display=email)

    digits = re.sub(r"[\s\-]", "", value)
    if digits.startswith("+880"):
        local = "0" + digits[4:]
    elif digits.startswith("880"):
        local = "0" + digits[3:]
    else:
        local = digits
    if not (local.startswith("01") and len(local) == 11 and local.isdigit()):
        raise CustomerAuthError("Enter a valid phone number (e.g. 01XXXXXXXXX) or email address")
    if local[2] not in "3456789":
        raise CustomerAuthError("Enter a valid phone number (e.g. 01XXXXXXXXX) or email address")

    return NormalizedIdentifier(identifier=local, identifier_type="phone", display=local)


def mask_identifier(normalized: NormalizedIdentifier) -> str:
    value = normalized.display
    if normalized.identifier_type == "email":
        user, _, domain = value.partition("@")
        head = user[:2]
        return f"{head}{'*' * max(len(user) - 2, 2)}@{domain}"
    return f"{value[:3]}{'*' * max(len(value) - 5, 3)}{value[-2:]}"


class StorefrontCustomerAuthService:
    def __init__(self, db: Session):
        self._db = db

    def get_method(
        self, raw_identifier: str
    ) -> Tuple[NormalizedIdentifier, StorefrontCustomerIdentity | None, bool]:
        normalized = normalize_identifier(raw_identifier)
        identity = (
            self._db.query(StorefrontCustomerIdentity)
            .filter(StorefrontCustomerIdentity.identifier == normalized.identifier)
            .first()
        )
        is_registered = bool(identity) or bool(self._find_existing_customer(normalized))
        return normalized, identity, is_registered

    def request_otp(self, raw_identifier: str, site_options: Optional[dict] = None) -> Tuple[NormalizedIdentifier, int, bool]:
        """A fresh random code, sent by SMS through the admin's gateway. Without a gateway the fixed development
        code works — only off the live server (dev_otp_allowed); live then refuses OTP sign-in. Returns the
        number, the code's lifetime and whether it is the development code."""
        from app.services.sms_service import SmsError, send_sms, sms_config

        normalized = normalize_identifier(raw_identifier)
        now = datetime.utcnow()
        config = sms_config(self._db, site_options)
        dev = config is None and dev_otp_allowed()
        if config is None and not dev:
            raise CustomerAuthError("Sign-in by SMS code isn't available yet — please call us to order", status_code=503)
        if normalized.identifier_type != "phone" and not dev:
            raise CustomerAuthError("Sign in with your mobile number (01XXXXXXXXX)")

        recent = (
            self._db.query(StorefrontOtpChallenge)
            .filter(
                StorefrontOtpChallenge.identifier == normalized.identifier,
                StorefrontOtpChallenge.created_at >= now - timedelta(hours=1),
            )
            .order_by(StorefrontOtpChallenge.created_at.desc())
            .all()
        )
        if recent and (now - recent[0].created_at).total_seconds() < OTP_RESEND_SECONDS:
            wait = OTP_RESEND_SECONDS - int((now - recent[0].created_at).total_seconds())
            raise CustomerAuthError(f"Please wait {wait} seconds before asking for a new code", status_code=429)
        if len(recent) >= OTP_MAX_PER_HOUR:
            raise CustomerAuthError("Too many codes asked for this number — try again in an hour", status_code=429)
        # Invalidate previous open challenges for this identifier.
        open_challenges = (
            self._db.query(StorefrontOtpChallenge)
            .filter(
                StorefrontOtpChallenge.identifier == normalized.identifier,
                StorefrontOtpChallenge.consumed_at.is_(None),
                StorefrontOtpChallenge.expires_at > now,
            )
            .all()
        )
        for challenge in open_challenges:
            challenge.consumed_at = now

        code = DEFAULT_OTP if dev else f"{secrets.randbelow(10 ** PIN_LENGTH):0{PIN_LENGTH}d}"
        challenge = StorefrontOtpChallenge(
            identifier=normalized.identifier,
            identifier_type=normalized.identifier_type,
            code_hash=hash_password(code),
            expires_at=now + timedelta(seconds=OTP_TTL_SECONDS),
        )
        self._db.add(challenge)
        self._db.commit()
        if not dev:
            try:
                send_sms(config, normalized.identifier,
                         f"Your login code is {code}. It expires in {OTP_TTL_SECONDS // 60} minutes. Never share it.")
            except SmsError as exc:
                challenge.consumed_at = now
                self._db.commit()
                raise CustomerAuthError(str(exc), status_code=502) from exc
        return normalized, OTP_TTL_SECONDS, dev

    def verify_otp(
        self,
        raw_identifier: str,
        otp: str,
        *,
        display_name: Optional[str] = None,
    ) -> Tuple[str, datetime, CommerceCustomer, StorefrontCustomerIdentity]:
        normalized = normalize_identifier(raw_identifier)
        code = (otp or "").strip()
        if len(code) != PIN_LENGTH or not code.isdigit():
            raise CustomerAuthError(f"Enter the {PIN_LENGTH}-digit verification code")

        now = datetime.utcnow()
        challenge = (
            self._db.query(StorefrontOtpChallenge)
            .filter(
                StorefrontOtpChallenge.identifier == normalized.identifier,
                StorefrontOtpChallenge.consumed_at.is_(None),
            )
            .order_by(StorefrontOtpChallenge.created_at.desc())
            .first()
        )
        if not challenge or challenge.expires_at <= now:
            raise CustomerAuthError("OTP expired — request a new code", status_code=400)
        if challenge.attempts >= challenge.max_attempts:
            raise CustomerAuthError("Too many OTP attempts — request a new code", status_code=400)

        if not verify_password(code, challenge.code_hash):
            challenge.attempts += 1
            self._db.commit()
            left = challenge.max_attempts - challenge.attempts
            raise CustomerAuthError(
                f"Wrong code — check the SMS ({left} {'try' if left == 1 else 'tries'} left)" if left > 0
                else "Too many wrong codes — request a new one",
                status_code=401,
            )

        challenge.consumed_at = now
        identity, customer = self._get_or_create_identity(
            normalized,
            verified_at=now,
            display_name=display_name,
        )
        token, expires_at = self._issue_session(identity, customer)
        self._db.commit()
        return token, expires_at, customer, identity

    def login_pin(self, raw_identifier: str, pin: str) -> Tuple[str, datetime, CommerceCustomer, StorefrontCustomerIdentity]:
        normalized = normalize_identifier(raw_identifier)
        code = (pin or "").strip()
        if len(code) != PIN_LENGTH or not code.isdigit():
            raise CustomerAuthError(f"Enter your {PIN_LENGTH}-digit PIN")

        identity = (
            self._db.query(StorefrontCustomerIdentity)
            .filter(StorefrontCustomerIdentity.identifier == normalized.identifier)
            .first()
        )
        if not identity or not identity.pin_hash:
            raise CustomerAuthError("PIN not set — login with OTP", status_code=400)
        if not identity.is_active:
            raise CustomerAuthError("Account is inactive", status_code=403)

        if not verify_password(code, identity.pin_hash):
            identity.failed_pin_attempts += 1
            self._db.commit()
            raise CustomerAuthError("Wrong PIN — try again, or login with OTP", status_code=401)

        identity.failed_pin_attempts = 0
        if not identity.verified_at:
            identity.verified_at = datetime.utcnow()
        customer = self._db.get(CommerceCustomer, identity.customer_id)
        if not customer or customer.status in LOGIN_BLOCKED_STATUSES:
            raise CustomerAuthError("Customer account is not available", status_code=403)

        token, expires_at = self._issue_session(identity, customer)
        self._db.commit()
        return token, expires_at, customer, identity

    def set_pin(self, identity: StorefrontCustomerIdentity, pin: str, confirm_pin: str) -> None:
        if pin != confirm_pin:
            raise CustomerAuthError("PINs do not match")
        if len(pin) != PIN_LENGTH or not pin.isdigit():
            raise CustomerAuthError(f"PIN must be exactly {PIN_LENGTH} digits")
        identity.pin_hash = hash_password(pin)
        identity.failed_pin_attempts = 0
        self._db.commit()

    def clear_pin(self, identity: StorefrontCustomerIdentity) -> None:
        identity.pin_hash = None
        identity.failed_pin_attempts = 0
        self._db.commit()

    def logout(self, token: str) -> None:
        if not token:
            return
        self._db.query(StorefrontCustomerSession).filter(StorefrontCustomerSession.token == token).delete()
        self._db.commit()

    def get_session(self, token: str) -> Optional[Tuple[StorefrontCustomerSession, StorefrontCustomerIdentity, CommerceCustomer]]:
        if not token:
            return None
        session = (
            self._db.query(StorefrontCustomerSession)
            .filter(
                StorefrontCustomerSession.token == token,
                StorefrontCustomerSession.expires_at > datetime.utcnow(),
            )
            .first()
        )
        if not session:
            return None
        identity = self._db.get(StorefrontCustomerIdentity, session.identity_id)
        customer = self._db.get(CommerceCustomer, session.customer_id)
        if (
            not identity
            or not identity.is_active
            or not customer
            or customer.status in LOGIN_BLOCKED_STATUSES
        ):
            return None
        return session, identity, customer

    def _issue_session(
        self,
        identity: StorefrontCustomerIdentity,
        customer: CommerceCustomer,
    ) -> Tuple[str, datetime]:
        expires_at = datetime.utcnow() + timedelta(days=SESSION_DAYS)
        token = new_session_token()
        self._db.add(
            StorefrontCustomerSession(
                identity_id=identity.id,
                customer_id=customer.id,
                token=token,
                expires_at=expires_at,
            )
        )
        self._db.flush()
        return token, expires_at

    def _get_or_create_identity(
        self,
        normalized: NormalizedIdentifier,
        *,
        verified_at: datetime,
        display_name: Optional[str] = None,
    ) -> Tuple[StorefrontCustomerIdentity, CommerceCustomer]:
        identity = (
            self._db.query(StorefrontCustomerIdentity)
            .filter(StorefrontCustomerIdentity.identifier == normalized.identifier)
            .first()
        )
        if identity:
            customer = self._db.get(CommerceCustomer, identity.customer_id)
            if not customer:
                customer = self._create_customer(normalized, display_name=display_name)
                identity.customer_id = customer.id
            identity.verified_at = verified_at
            identity.is_active = True
            identity.display_identifier = normalized.display
            self._db.flush()
            return identity, customer

        customer = self._find_existing_customer(normalized) or self._create_customer(
            normalized, display_name=display_name
        )
        identity = StorefrontCustomerIdentity(
            customer_id=customer.id,
            identifier=normalized.identifier,
            identifier_type=normalized.identifier_type,
            display_identifier=normalized.display,
            verified_at=verified_at,
            is_active=True,
        )
        self._db.add(identity)
        self._db.flush()
        return identity, customer

    def _find_existing_customer(self, normalized: NormalizedIdentifier) -> Optional[CommerceCustomer]:
        if normalized.identifier_type == "email":
            return (
                self._db.query(CommerceCustomer)
                .filter(CommerceCustomer.email == normalized.identifier)
                .first()
            )
        phone_digits = "".join(ch for ch in normalized.identifier if ch.isdigit())[-11:]
        candidates = (
            self._db.query(CommerceCustomer)
            .filter(CommerceCustomer.phone != "")
            .order_by(CommerceCustomer.created_at.desc())
            .limit(200)
            .all()
        )
        for row in candidates:
            row_digits = "".join(ch for ch in row.phone if ch.isdigit())[-11:]
            if row_digits and row_digits == phone_digits:
                return row
        return None

    def _create_customer(
        self,
        normalized: NormalizedIdentifier,
        *,
        display_name: Optional[str] = None,
    ) -> CommerceCustomer:
        cleaned_name = " ".join((display_name or "").split()).strip()
        if normalized.identifier_type == "email":
            email = normalized.identifier
            phone = ""
            name = cleaned_name or email.split("@")[0].replace(".", " ").title() or "Customer"
        else:
            email = ""
            phone = normalized.display
            name = cleaned_name or f"Customer {phone[-4:]}"

        code = f"SF-{new_session_token()[:8].upper()}"
        while self._db.query(CommerceCustomer).filter(CommerceCustomer.customer_code == code).first():
            code = f"SF-{new_session_token()[:8].upper()}"

        row = CommerceCustomer(
            id=str(uuid.uuid4()),
            company_id=DEFAULT_COMPANY_ID,
            customer_code=code,
            name=name,
            phone=phone,
            email=email,
            city="",
            region="",
            country="Bangladesh",
            customer_since=date.today(),
            status="active",
            group="retail",
            tags_json=dump_json(["storefront"]),
            timeline_json=dump_json(
                [
                    {
                        "id": f"tl_{uuid.uuid4().hex[:8]}",
                        "type": "status_change",
                        "title": "Registered via storefront OTP",
                        "actor": "Storefront",
                        "actorInitials": "SF",
                        "at": datetime.utcnow().isoformat() + "Z",
                    }
                ]
            ),
        )
        # party_id is NOT NULL — link before the first insert, same fix as the
        # admin create-customer endpoint (commerce_customers.py).
        from app.services.parties.commerce_party_bridge import ensure_party_for_customer

        ensure_party_for_customer(self._db, row)
        self._db.add(row)
        self._db.flush()
        return row

    @staticmethod
    def customer_to_me(
        customer: CommerceCustomer,
        identity: StorefrontCustomerIdentity,
    ) -> dict:
        return {
            "id": customer.id,
            "customer_code": customer.customer_code,
            "name": customer.name,
            "phone": customer.phone or (identity.display_identifier if identity.identifier_type == "phone" else ""),
            "email": customer.email or (identity.display_identifier if identity.identifier_type == "email" else ""),
            "profile_image": customer.profile_image,
            "city": customer.city or "",
            "region": customer.region or "",
            "country": customer.country or "Bangladesh",
            "reward_points": customer.reward_points or 0,
            "total_orders": customer.total_orders or 0,
            "wallet_balance": customer.wallet_balance,
            "has_pin": bool(identity.pin_hash),
            "identifier": identity.display_identifier or identity.identifier,
            "identifier_type": identity.identifier_type,
            "assigned_staff": customer.assigned_staff,
        }

    @staticmethod
    def load_addresses(customer: CommerceCustomer) -> list:
        return load_json(customer.addresses_json, [])
