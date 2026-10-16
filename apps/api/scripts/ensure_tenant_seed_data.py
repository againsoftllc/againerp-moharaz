"""Idempotent seed for multi-tenant SaaS tables — safe to run on every boot.

Backfills a "default" Company row so every pre-existing company_id="default"
row across the app keeps loading correctly, and seeds a default trial plan.
"""
from __future__ import annotations

from app.config import get_settings
from app.database import SessionLocal
from app.models.company import Company
from app.models.subscription_plan import SubscriptionPlan

DEFAULT_COMPANY_ID = "default"
TRIAL_PLAN_SLUG = "trial"


def ensure_tenant_seed_data() -> dict[str, int]:
    settings = get_settings()
    db = SessionLocal()
    created = {"plans": 0, "companies": 0}
    try:
        trial_plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.slug == TRIAL_PLAN_SLUG).first()
        if trial_plan is None:
            trial_plan = SubscriptionPlan(
                slug=TRIAL_PLAN_SLUG,
                name="Free Trial",
                price_amount=0,
                price_interval="monthly",
                max_users=None,
                is_trial_default=True,
                is_active=True,
            )
            db.add(trial_plan)
            db.flush()
            created["plans"] = 1

        default_company = db.get(Company, DEFAULT_COMPANY_ID)
        if default_company is None:
            db.add(
                Company(
                    id=DEFAULT_COMPANY_ID,
                    slug=DEFAULT_COMPANY_ID,
                    name="Default Company",
                    status="active",
                    plan_id=trial_plan.id,
                    trial_ends_at=None,
                    subscription_ends_at=None,
                )
            )
            created["companies"] = 1

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    return created


if __name__ == "__main__":
    result = ensure_tenant_seed_data()
    print(f"Tenant seed data: {result}")
