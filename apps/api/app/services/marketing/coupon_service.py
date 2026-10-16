"""Resolve marketing_coupons discounts for storefront cart/checkout."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.models.marketing_coupon import MarketingCoupon


class CouponError(ValueError):
    pass


@dataclass(frozen=True)
class CouponDiscount:
    code: str
    amount: Decimal
    label: str
    discount_type: str


def _normalize(code: str) -> str:
    return code.strip().upper()


def find_active_coupon(db: Session, code: str) -> MarketingCoupon:
    normalized = _normalize(code)
    if not normalized:
        raise CouponError("Please enter a promo code")

    row = (
        db.query(MarketingCoupon)
        .filter(MarketingCoupon.code == normalized)
        .first()
    )
    if not row:
        raise CouponError("Please enter a valid promo code")

    today = date.today()
    if row.status != "active":
        raise CouponError("This promo code is not active")
    if row.starts_at and today < row.starts_at:
        raise CouponError("This promo code is not active yet")
    if row.ends_at and today > row.ends_at:
        raise CouponError("This promo code has expired")
    if row.redemption_limit is not None and row.redemptions >= row.redemption_limit:
        raise CouponError("This promo code has reached its redemption limit")

    return row


def calculate_coupon_discount(row: MarketingCoupon, subtotal: Decimal) -> CouponDiscount:
    if subtotal <= 0:
        raise CouponError("Add items to your cart before applying a promo code")

    if row.min_order_amount is not None and subtotal < row.min_order_amount:
        raise CouponError(f"Minimum order amount is ৳{row.min_order_amount}")

    dtype = (row.discount_type or "percent").strip().lower()
    if dtype in {"percent", "percentage"}:
        amount = (subtotal * (row.discount_value / Decimal("100"))).quantize(Decimal("0.01"))
    elif dtype in {"fixed", "flat", "amount"}:
        amount = Decimal(row.discount_value).quantize(Decimal("0.01"))
    else:
        raise CouponError("Unsupported promo code type")

    amount = min(amount, subtotal)
    if amount <= 0:
        raise CouponError("This promo code has no discount for this cart")

    return CouponDiscount(
        code=row.code,
        amount=amount,
        label=row.discount_label or row.name,
        discount_type=dtype,
    )


def resolve_coupon_discount(
    db: Session,
    coupon_code: Optional[str],
    subtotal: Decimal,
) -> Optional[CouponDiscount]:
    if not coupon_code or not coupon_code.strip():
        return None
    row = find_active_coupon(db, coupon_code)
    return calculate_coupon_discount(row, subtotal)
