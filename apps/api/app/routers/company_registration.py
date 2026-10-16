from __future__ import annotations

import re
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models.auth_session import AuthSession
from app.models.auth_user import AuthUser
from app.models.company import Company
from app.models.subscription_plan import SubscriptionPlan
from app.schemas.auth import LoginResponse
from app.security import hash_password, new_session_token
from app.services import rbac as rbac_service
from app.services.auth_user_read import user_read
from app.services.tenant_bootstrap import bootstrap_new_company

router = APIRouter(prefix="/public", tags=["company-registration"])

SESSION_DAYS = 7
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "company"


class CompanyRegisterRequest(BaseModel):
    company_name: str = Field(min_length=2, max_length=255)
    slug: str | None = Field(default=None, max_length=64)
    owner_name: str = Field(min_length=1, max_length=255)
    email: str = Field(min_length=3, max_length=255)
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9._-]+$")
    password: str = Field(min_length=6, max_length=128)


@router.post("/register", response_model=LoginResponse, status_code=201)
def register_company(payload: CompanyRegisterRequest, db: Session = Depends(get_db)) -> LoginResponse:
    settings = get_settings()

    email = payload.email.strip().lower()
    username = payload.username.strip().lower()
    if db.query(AuthUser).filter(AuthUser.email == email).first():
        raise HTTPException(status_code=409, detail="Email already in use")
    if db.query(AuthUser).filter(AuthUser.username == username).first():
        raise HTTPException(status_code=409, detail="Username already taken")

    base_slug = _slugify(payload.slug or payload.company_name)
    if not SLUG_RE.match(base_slug):
        raise HTTPException(status_code=400, detail="Invalid company slug")
    slug = base_slug
    suffix = 1
    while db.query(Company).filter(Company.slug == slug).first():
        suffix += 1
        slug = f"{base_slug}-{suffix}"

    trial_plan = (
        db.query(SubscriptionPlan).filter(SubscriptionPlan.is_trial_default.is_(True)).first()
        or db.query(SubscriptionPlan).filter(SubscriptionPlan.slug == "trial").first()
    )
    trial_ends_at = datetime.utcnow() + timedelta(days=settings.trial_days)

    company = Company(
        slug=slug,
        name=payload.company_name.strip(),
        status="trialing",
        plan_id=trial_plan.id if trial_plan else None,
        trial_ends_at=trial_ends_at,
    )
    db.add(company)
    db.flush()

    user = AuthUser(
        company_id=company.id,
        email=email,
        username=username,
        name=payload.owner_name.strip(),
        role="admin",
        password_hash=hash_password(payload.password),
        is_active=True,
    )
    db.add(user)
    db.flush()
    bootstrap_new_company(db, company, user)

    expires_at = datetime.utcnow() + timedelta(days=SESSION_DAYS)
    token = new_session_token()
    db.add(AuthSession(user_id=user.id, token=token, expires_at=expires_at))
    db.commit()

    return LoginResponse(
        token=token,
        expires_at=expires_at,
        user=user_read(db, user),
        permissions=rbac_service.permissions_for_api(db, user),
    )
