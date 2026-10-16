from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_write_access
from app.models.marketing_coupon import MarketingCoupon
from app.schemas.marketing_coupon import (
    CouponCreate,
    CouponListMeta,
    CouponListResponse,
    CouponRead,
    CouponResponse,
    CouponUpdate,
)

router = APIRouter(prefix="/marketing/coupons", tags=["marketing-coupons"])


def _label_for(discount_type: str, discount_value: Decimal, explicit: str | None) -> str:
    if explicit and explicit.strip():
        return explicit.strip()
    value = f"{discount_value.normalize():f}".rstrip("0").rstrip(".")
    if discount_type == "fixed":
        return f"৳{value} fixed"
    return f"{value}% off"


def _to_read(row: MarketingCoupon) -> CouponRead:
    return CouponRead.model_validate(row)


@router.get("", response_model=CouponListResponse)
def list_coupons(
    search: str | None = Query(default=None),
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> CouponListResponse:
    q = db.query(MarketingCoupon)
    if status and status != "all":
        q = q.filter(MarketingCoupon.status == status)
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(
            (MarketingCoupon.code.ilike(term))
            | (MarketingCoupon.name.ilike(term))
            | (MarketingCoupon.discount_label.ilike(term))
        )
    rows = q.order_by(MarketingCoupon.updated_at.desc(), MarketingCoupon.code.asc()).all()
    active_count = (
        db.query(MarketingCoupon).filter(MarketingCoupon.status == "active").count()
    )
    return CouponListResponse(
        data=[_to_read(row) for row in rows],
        meta=CouponListMeta(count=len(rows), active_count=active_count),
    )


@router.post("", response_model=CouponResponse, status_code=201)
def create_coupon(
    payload: CouponCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> CouponResponse:
    code = payload.code.strip().upper()
    existing = db.query(MarketingCoupon).filter(MarketingCoupon.code == code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Coupon code already exists")
    if payload.ends_at < payload.starts_at:
        raise HTTPException(status_code=400, detail="End date must be on or after start date")

    row = MarketingCoupon(
        code=code,
        name=payload.name.strip(),
        discount_type=payload.discount_type,
        discount_value=payload.discount_value,
        discount_label=_label_for(payload.discount_type, payload.discount_value, payload.discount_label),
        status=payload.status,
        redemption_limit=payload.redemption_limit,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        min_order_amount=payload.min_order_amount,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return CouponResponse(data=_to_read(row))


@router.patch("/{coupon_id}", response_model=CouponResponse)
def update_coupon(
    coupon_id: str,
    payload: CouponUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> CouponResponse:
    row = db.get(MarketingCoupon, coupon_id)
    if not row:
        raise HTTPException(status_code=404, detail="Coupon not found")

    data = payload.model_dump(exclude_unset=True)
    if "code" in data and data["code"] is not None:
        code = str(data["code"]).strip().upper()
        clash = (
            db.query(MarketingCoupon)
            .filter(MarketingCoupon.code == code, MarketingCoupon.id != coupon_id)
            .first()
        )
        if clash:
            raise HTTPException(status_code=400, detail="Coupon code already exists")
        data["code"] = code

    starts = data.get("starts_at", row.starts_at)
    ends = data.get("ends_at", row.ends_at)
    if ends < starts:
        raise HTTPException(status_code=400, detail="End date must be on or after start date")

    for key, value in data.items():
        setattr(row, key, value)

    dtype = row.discount_type
    dval = row.discount_value
    if "discount_label" not in data or not data.get("discount_label"):
        if any(k in data for k in ("discount_type", "discount_value", "discount_label")):
            row.discount_label = _label_for(dtype, dval, data.get("discount_label"))

    db.commit()
    db.refresh(row)
    return CouponResponse(data=_to_read(row))


@router.delete("/{coupon_id}", status_code=204)
def delete_coupon(
    coupon_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> None:
    row = db.get(MarketingCoupon, coupon_id)
    if not row:
        raise HTTPException(status_code=404, detail="Coupon not found")
    db.delete(row)
    db.commit()
