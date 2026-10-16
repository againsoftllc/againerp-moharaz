"""ERP admin management of vendors, vendor groups, vendor types, and vendor
portal users — SPEC.md §4, §6, §7. Vendor-portal-facing endpoints live in
app.routers.vendor_portal instead.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_user, get_current_company_id
from app.models.auth_user import AuthUser
from app.models.collab_activity import CollabActivity
from app.models.item import Item
from app.models.vendor.vendor import Vendor, dump_json, load_json
from app.models.vendor.vendor_group import VendorGroup
from app.models.vendor.vendor_pricing import VendorPriceList, VendorPriceListItem
from app.models.vendor.vendor_type import VendorType
from app.models.vendor.vendor_user import VendorUser
from app.schemas.vendor.analytics import (
    VendorAnalyticsOverviewRead,
    VendorAnalyticsOverviewResponse,
    VendorRankRowRead,
    VendorRankingResponse,
    VendorScoreRead,
    VendorScoreResponse,
)
from app.schemas.vendor.audit import VendorAuditLogEntryRead, VendorAuditLogListResponse
from app.schemas.vendor.credit import VendorCreditSummaryRead, VendorCreditSummaryResponse
from app.schemas.vendor.portal import (
    VendorUserAdminRead,
    VendorUserInviteRequest,
    VendorUserListResponse,
    VendorUserResponse,
)
from app.schemas.vendor.pricing import (
    VendorPriceListItemListResponse,
    VendorPriceListItemRead,
    VendorPriceListItemResponse,
    VendorPriceListItemWrite,
    VendorPriceListListResponse,
    VendorPriceListRead,
    VendorPriceListResponse,
    VendorPriceListWrite,
)
from app.schemas.vendor.vendor import (
    VendorGroupListResponse,
    VendorGroupRead,
    VendorGroupResponse,
    VendorGroupWrite,
    VendorListResponse,
    VendorRead,
    VendorResponse,
    VendorTypeCreate,
    VendorTypeRead,
    VendorWrite,
)
from app.services.vendor import vendor_analytics_service, vendor_audit_service, vendor_auth_service, vendor_credit_service
from app.services.core.sequence_service import next_number as allocate_number

router = APIRouter(prefix="/vendors", tags=["vendor-admin"])


def _log(db: Session, *, entity_id: str, action: str, performed_by: str, details: Optional[str] = None) -> None:
    db.add(
        CollabActivity(
            entity_type="vendor",
            entity_id=entity_id,
            action=action,
            performed_by=performed_by,
            performed_by_type="user",
            details_json=details,
        )
    )


def _next_vendor_code(db: Session, company_id: str = "default") -> str:
    return allocate_number(
        db,
        company_id,
        "party.vendor",
        initial=lambda: db.query(Vendor).count() + 1,
        is_taken=lambda code: db.query(Vendor.id).filter(Vendor.vendor_code == code).first() is not None,
    )


def _vendor_read(row: Vendor, links=None) -> VendorRead:
    return VendorRead(
        id=row.id,
        vendor_code=row.vendor_code,
        company_name=row.company_name,
        legal_name=row.legal_name,
        display_name=row.display_name,
        contact_person=row.contact_person,
        phone=row.phone,
        email=row.email,
        website=row.website,
        logo=row.logo,
        vendor_type_id=row.vendor_type_id,
        vendor_group_id=row.vendor_group_id,
        price_list_id=row.price_list_id,
        status=row.status,
        addresses=load_json(row.addresses_json, []),
        city=row.city,
        state_division=row.state_division,
        country=row.country,
        postal_code=row.postal_code,
        trade_license=row.trade_license,
        vat_tax_id=row.vat_tax_id,
        bin_tin=row.bin_tin,
        business_registration_number=row.business_registration_number,
        payment_terms=row.payment_terms,
        payment_schedule=getattr(row, "payment_schedule", None),
        credit_limit=row.credit_limit,
        opening_balance=getattr(row, "opening_balance", None) or Decimal("0"),
        currency=row.currency,
        preferred_payment_method=row.preferred_payment_method,
        account_manager_id=row.account_manager_id,
        sales_rep_id=row.sales_rep_id,
        onboarding_date=row.onboarding_date,
        last_order_date=row.last_order_date,
        last_payment_date=row.last_payment_date,
        notes=row.notes,
        portal_enabled=row.portal_enabled,
        created_at=row.created_at,
        updated_at=row.updated_at,
        party_id=row.party_id,
        roles=list(links.roles) if links else (["vendor"] if row.party_id else []),
        linked_customer_id=links.customer.id if links and links.customer else None,
        linked_customer_name=links.customer.name if links and links.customer else None,
        linked_supplier_id=links.supplier.id if links and links.supplier else None,
        linked_supplier_name=links.supplier.name if links and links.supplier else None,
    )


VENDOR_AUDIT_FIELDS = (
    "company_name", "legal_name", "display_name", "contact_person", "phone", "email", "website",
    "vendor_type_id", "vendor_group_id", "price_list_id", "status", "city", "state_division", "country",
    "postal_code", "trade_license", "vat_tax_id", "bin_tin", "business_registration_number",
    "payment_terms", "payment_schedule", "credit_limit", "opening_balance", "currency", "preferred_payment_method", "account_manager_id",
    "sales_rep_id", "onboarding_date", "notes", "portal_enabled",
)


def _snapshot(row: Vendor) -> dict:
    out = {}
    for name in VENDOR_AUDIT_FIELDS:
        value = getattr(row, name, None)
        out[name] = str(value) if value is not None and not isinstance(value, (bool, int)) else value
    return out


def _audit_diff(before: dict, after: dict) -> dict:
    return {k: {"old": before.get(k), "new": after.get(k)} for k in after if before.get(k) != after.get(k)}


def _validate_vendor_refs(db: Session, payload: VendorWrite, only: Optional[set[str]] = None) -> None:
    """Reject unknown type / group / price-list ids with a clear 422 instead of a raw FK error."""

    def want(name: str) -> bool:
        return only is None or name in only

    problems = []
    if want("vendor_type_id") and payload.vendor_type_id and not db.get(VendorType, payload.vendor_type_id):
        problems.append("vendor_type_id: unknown vendor type")
    if want("vendor_group_id") and payload.vendor_group_id and not db.get(VendorGroup, payload.vendor_group_id):
        problems.append("vendor_group_id: unknown vendor group")
    if want("price_list_id") and payload.price_list_id and not db.get(VendorPriceList, payload.price_list_id):
        problems.append("price_list_id: unknown price list")
    if problems:
        raise HTTPException(status_code=422, detail="; ".join(problems))


def _find_duplicate_vendor(db: Session, payload: VendorWrite, *, exclude_id: Optional[str] = None) -> Optional[Vendor]:
    """Same company name (case-insensitive) or same non-empty email already on another vendor."""
    q = db.query(Vendor).filter(Vendor.status != "archived")
    if exclude_id:
        q = q.filter(Vendor.id != exclude_id)
    name = (payload.company_name or "").strip()
    email = (payload.email or "").strip()
    conds = []
    if name:
        conds.append(Vendor.company_name.ilike(name))
    if email:
        conds.append(Vendor.email.ilike(email))
    if not conds:
        return None
    from sqlalchemy import or_

    return q.filter(or_(*conds)).first()


def _apply_vendor_write(
    row: Vendor, payload: VendorWrite, *, company_id: str, only: Optional[set[str]] = None
) -> None:
    """Applies payload fields onto row.

    `only`, when given, restricts the write to just those field names —
    used by PATCH so omitted fields are left untouched instead of being
    silently reset to the schema default (that reset a vendor's
    vendor_group_id to null the first time this shipped without the guard).
    Create always passes only=None: a new row should take every field.
    """

    def want(name: str) -> bool:
        return only is None or name in only

    if want("company_name"):
        row.company_name = payload.company_name
    if want("legal_name"):
        row.legal_name = payload.legal_name
    if want("display_name") or want("company_name"):
        row.display_name = payload.display_name or payload.company_name
    if want("contact_person"):
        row.contact_person = payload.contact_person
    if want("phone"):
        row.phone = payload.phone
    if want("email"):
        row.email = payload.email
    if want("website"):
        row.website = payload.website
    if want("logo"):
        row.logo = payload.logo
    if want("vendor_type_id"):
        row.vendor_type_id = payload.vendor_type_id
    if want("vendor_group_id"):
        row.vendor_group_id = payload.vendor_group_id
    if want("price_list_id"):
        row.price_list_id = payload.price_list_id
    if want("status"):
        row.status = payload.status
    if want("addresses"):
        row.addresses_json = dump_json([addr.model_dump() for addr in payload.addresses])
    if want("city"):
        row.city = payload.city
    if want("state_division"):
        row.state_division = payload.state_division
    if want("country"):
        row.country = payload.country
    if want("postal_code"):
        row.postal_code = payload.postal_code
    if want("trade_license"):
        row.trade_license = payload.trade_license
    if want("vat_tax_id"):
        row.vat_tax_id = payload.vat_tax_id
    if want("bin_tin"):
        row.bin_tin = payload.bin_tin
    if want("business_registration_number"):
        row.business_registration_number = payload.business_registration_number
    if want("payment_terms"):
        row.payment_terms = payload.payment_terms
    if want("payment_schedule"):
        row.payment_schedule = payload.payment_schedule
    if want("credit_limit"):
        row.credit_limit = payload.credit_limit
    if want("opening_balance"):
        row.opening_balance = payload.opening_balance
    if want("currency"):
        row.currency = payload.currency
    if want("preferred_payment_method"):
        row.preferred_payment_method = payload.preferred_payment_method
    if want("account_manager_id"):
        row.account_manager_id = payload.account_manager_id
    if want("sales_rep_id"):
        row.sales_rep_id = payload.sales_rep_id
    if want("onboarding_date"):
        row.onboarding_date = payload.onboarding_date
    if want("notes"):
        row.notes = payload.notes
    if want("portal_enabled"):
        row.portal_enabled = payload.portal_enabled
    row.company_id = company_id


# --------------------------------------------------------------- vendor types


@router.get("/types", response_model=list[VendorTypeRead])
def list_vendor_types(db: Session = Depends(get_db)) -> list[VendorTypeRead]:
    rows = db.query(VendorType).filter(VendorType.is_active.is_(True)).order_by(VendorType.name.asc()).all()
    return [VendorTypeRead(id=r.id, code=r.code, name=r.name, is_system=r.is_system, is_active=r.is_active) for r in rows]


@router.post("/types", response_model=VendorTypeRead, status_code=201)
def create_vendor_type(
    payload: VendorTypeCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(get_current_user),
) -> VendorTypeRead:
    if db.query(VendorType).filter(VendorType.code == payload.code).first():
        raise HTTPException(status_code=409, detail="A vendor type with that code already exists")
    row = VendorType(code=payload.code, name=payload.name)
    db.add(row)
    db.commit()
    db.refresh(row)
    return VendorTypeRead(id=row.id, code=row.code, name=row.name, is_system=row.is_system, is_active=row.is_active)


# -------------------------------------------------------------- vendor groups


@router.get("/groups", response_model=VendorGroupListResponse)
def list_vendor_groups(db: Session = Depends(get_db)) -> VendorGroupListResponse:
    rows = db.query(VendorGroup).order_by(VendorGroup.name.asc()).all()
    return VendorGroupListResponse(data=[VendorGroupRead.model_validate(r, from_attributes=True) for r in rows])


@router.post("/groups", response_model=VendorGroupResponse, status_code=201)
def create_vendor_group(
    payload: VendorGroupWrite,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(get_current_user),
) -> VendorGroupResponse:
    if db.query(VendorGroup).filter(VendorGroup.code == payload.code).first():
        raise HTTPException(status_code=409, detail="A vendor group with that code already exists")
    row = VendorGroup(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return VendorGroupResponse(data=VendorGroupRead.model_validate(row, from_attributes=True))


@router.patch("/groups/{group_id}", response_model=VendorGroupResponse)
def update_vendor_group(
    group_id: str,
    payload: VendorGroupWrite,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(get_current_user),
) -> VendorGroupResponse:
    row = db.get(VendorGroup, group_id)
    if not row:
        raise HTTPException(status_code=404, detail="Vendor group not found")
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return VendorGroupResponse(data=VendorGroupRead.model_validate(row, from_attributes=True))


# ---------------------------------------------------------------- price lists
# Must stay registered before the /{vendor_id} routes below — otherwise a
# request to /vendors/price-lists matches the {vendor_id} path parameter
# first and 404s as "vendor 'price-lists' not found".


@router.get("/price-lists", response_model=VendorPriceListListResponse)
def list_price_lists(db: Session = Depends(get_db)) -> VendorPriceListListResponse:
    rows = db.query(VendorPriceList).order_by(VendorPriceList.name.asc()).all()
    return VendorPriceListListResponse(data=[VendorPriceListRead.model_validate(r, from_attributes=True) for r in rows])


@router.post("/price-lists", response_model=VendorPriceListResponse, status_code=201)
def create_price_list(
    payload: VendorPriceListWrite,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(get_current_user),
) -> VendorPriceListResponse:
    if db.query(VendorPriceList).filter(VendorPriceList.code == payload.code).first():
        raise HTTPException(status_code=409, detail="A price list with that code already exists")
    row = VendorPriceList(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return VendorPriceListResponse(data=VendorPriceListRead.model_validate(row, from_attributes=True))


def _price_list_item_read(db: Session, row: VendorPriceListItem) -> VendorPriceListItemRead:
    item = db.get(Item, row.item_id)
    return VendorPriceListItemRead(
        id=row.id,
        price_list_id=row.price_list_id,
        item_id=row.item_id,
        sku=item.sku if item else None,
        product_name=item.name if item else None,
        unit_price=row.unit_price,
        min_qty=row.min_qty,
        max_qty=row.max_qty,
        is_active=row.is_active,
    )


@router.get("/price-lists/{price_list_id}/items", response_model=VendorPriceListItemListResponse)
def list_price_list_items(price_list_id: str, db: Session = Depends(get_db)) -> VendorPriceListItemListResponse:
    if not db.get(VendorPriceList, price_list_id):
        raise HTTPException(status_code=404, detail="Price list not found")
    rows = (
        db.query(VendorPriceListItem)
        .filter(VendorPriceListItem.price_list_id == price_list_id)
        .order_by(VendorPriceListItem.min_qty.asc())
        .all()
    )
    return VendorPriceListItemListResponse(data=[_price_list_item_read(db, r) for r in rows])


@router.post("/price-lists/{price_list_id}/items", response_model=VendorPriceListItemResponse, status_code=201)
def upsert_price_list_item(
    price_list_id: str,
    payload: VendorPriceListItemWrite,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(get_current_user),
) -> VendorPriceListItemResponse:
    if not db.get(VendorPriceList, price_list_id):
        raise HTTPException(status_code=404, detail="Price list not found")
    if not db.get(Item, payload.item_id):
        raise HTTPException(status_code=404, detail="Item not found")

    row = (
        db.query(VendorPriceListItem)
        .filter(
            VendorPriceListItem.price_list_id == price_list_id,
            VendorPriceListItem.item_id == payload.item_id,
            VendorPriceListItem.min_qty == payload.min_qty,
        )
        .first()
    )
    if row:
        row.unit_price = payload.unit_price
        row.max_qty = payload.max_qty
        row.is_active = payload.is_active
    else:
        row = VendorPriceListItem(price_list_id=price_list_id, **payload.model_dump())
        db.add(row)
    db.commit()
    db.refresh(row)
    return VendorPriceListItemResponse(data=_price_list_item_read(db, row))


@router.delete("/price-lists/{price_list_id}/items/{item_row_id}", status_code=204)
def delete_price_list_item(
    price_list_id: str,
    item_row_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(get_current_user),
) -> None:
    row = db.get(VendorPriceListItem, item_row_id)
    if not row or row.price_list_id != price_list_id:
        raise HTTPException(status_code=404, detail="Price list item not found")
    db.delete(row)
    db.commit()


# ------------------------------------------------------------------ analytics


@router.get("/analytics/overview", response_model=VendorAnalyticsOverviewResponse)
def get_analytics_overview(
    db: Session = Depends(get_db),
    days: Optional[int] = Query(default=None, description="Limit revenue/order stats to the last N days"),
) -> VendorAnalyticsOverviewResponse:
    since = datetime.utcnow() - timedelta(days=days) if days else None
    overview = vendor_analytics_service.get_overview(db, since=since)
    return VendorAnalyticsOverviewResponse(data=VendorAnalyticsOverviewRead(**overview.__dict__))


@router.get("/analytics/ranking", response_model=VendorRankingResponse)
def get_vendor_ranking(
    db: Session = Depends(get_db),
    days: Optional[int] = Query(default=None),
    limit: int = Query(default=20, le=100),
) -> VendorRankingResponse:
    since = datetime.utcnow() - timedelta(days=days) if days else None
    rows = vendor_analytics_service.rank_vendors(db, since=since, limit=limit)
    return VendorRankingResponse(data=[VendorRankRowRead(**r.__dict__) for r in rows])


# -------------------------------------------------------------------- vendors


@router.get("", response_model=VendorListResponse)
def list_vendors(
    db: Session = Depends(get_db),
    search: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    vendor_group_id: Optional[str] = Query(default=None),
    include_archived: bool = Query(default=False, description="Archived vendors are hidden unless this is set or status=archived"),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
) -> VendorListResponse:
    q = db.query(Vendor)
    if not status and not include_archived:
        q = q.filter(Vendor.status != "archived")
    if search:
        like = f"%{search.strip()}%"
        q = q.filter(
            (Vendor.company_name.ilike(like))
            | (Vendor.vendor_code.ilike(like))
            | (Vendor.email.ilike(like))
        )
    if status:
        q = q.filter(Vendor.status == status)
    if vendor_group_id:
        q = q.filter(Vendor.vendor_group_id == vendor_group_id)
    total = q.count()
    rows = q.order_by(Vendor.created_at.desc()).offset(offset).limit(limit).all()
    from app.services.parties.party_commerce_links import load_links_map

    links_map = load_links_map(db, [r.party_id for r in rows if r.party_id])
    return VendorListResponse(
        data=[_vendor_read(r, links=links_map.get(r.party_id or "")) for r in rows],
        total=total,
    )


@router.post("", response_model=VendorResponse, status_code=201)
def create_vendor(
    payload: VendorWrite,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
    company_id: str = Depends(get_current_company_id),
) -> VendorResponse:
    _validate_vendor_refs(db, payload)
    dup = _find_duplicate_vendor(db, payload)
    if dup:
        raise HTTPException(
            status_code=409,
            detail=f"A vendor with this name or email already exists: {dup.company_name} ({dup.vendor_code})",
        )
    row = Vendor(id=str(uuid.uuid4()), vendor_code=_next_vendor_code(db))
    _apply_vendor_write(row, payload, company_id=company_id)
    # Party must exist (and party_id be set) BEFORE the first insert — party_id
    # is NOT NULL, so row.id is generated up front above instead of left to the
    # column's lazy default, and ensure_party_for_vendor runs before db.add().
    from app.services.parties.commerce_party_bridge import ensure_party_for_vendor
    from app.services.parties.party_commerce_links import links_for_party

    ensure_party_for_vendor(db, row)
    db.add(row)
    db.flush()
    _log(db, entity_id=row.id, action="vendor_created", performed_by=user.id)
    db.commit()
    db.refresh(row)
    links = links_for_party(db, row.party_id) if row.party_id else None
    return VendorResponse(data=_vendor_read(row, links=links))


@router.get("/{vendor_id}", response_model=VendorResponse)
def get_vendor(vendor_id: str, db: Session = Depends(get_db)) -> VendorResponse:
    row = db.get(Vendor, vendor_id)
    if not row:
        raise HTTPException(status_code=404, detail="Vendor not found")
    from app.services.parties.commerce_party_bridge import ensure_party_for_vendor
    from app.services.parties.party_commerce_links import links_for_party

    if not row.party_id:
        ensure_party_for_vendor(db, row)
        db.commit()
        db.refresh(row)
    links = links_for_party(db, row.party_id) if row.party_id else None
    return VendorResponse(data=_vendor_read(row, links=links))


@router.get("/{vendor_id}/credit", response_model=VendorCreditSummaryResponse)
def get_vendor_credit(vendor_id: str, db: Session = Depends(get_db)) -> VendorCreditSummaryResponse:
    row = db.get(Vendor, vendor_id)
    if not row:
        raise HTTPException(status_code=404, detail="Vendor not found")
    summary = vendor_credit_service.compute_credit_summary(db, row)
    return VendorCreditSummaryResponse(data=VendorCreditSummaryRead(**summary.__dict__))


@router.get("/{vendor_id}/audit-log", response_model=VendorAuditLogListResponse)
def get_vendor_audit_log(
    vendor_id: str,
    db: Session = Depends(get_db),
    entity_type: Optional[str] = Query(default=None),
) -> VendorAuditLogListResponse:
    if not db.get(Vendor, vendor_id):
        raise HTTPException(status_code=404, detail="Vendor not found")
    rows = vendor_audit_service.list_vendor_activity(db, vendor_id=vendor_id, entity_type=entity_type)
    return VendorAuditLogListResponse(
        data=[
            VendorAuditLogEntryRead(
                id=r.id,
                entity_type=r.entity_type,
                entity_id=r.entity_id,
                action=r.action,
                performed_by=r.performed_by,
                performed_by_type=r.performed_by_type,
                old_value=r.old_value,
                new_value=r.new_value,
                details_json=r.details_json,
                created_at=r.created_at,
            )
            for r in rows
        ]
    )


@router.get("/{vendor_id}/score", response_model=VendorScoreResponse)
def get_vendor_score(vendor_id: str, db: Session = Depends(get_db)) -> VendorScoreResponse:
    row = db.get(Vendor, vendor_id)
    if not row:
        raise HTTPException(status_code=404, detail="Vendor not found")
    score = vendor_analytics_service.compute_vendor_score(db, row)
    return VendorScoreResponse(data=VendorScoreRead(**score.__dict__))


@router.patch("/{vendor_id}", response_model=VendorResponse)
def update_vendor(
    vendor_id: str,
    payload: VendorWrite,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> VendorResponse:
    row = db.get(Vendor, vendor_id)
    if not row:
        raise HTTPException(status_code=404, detail="Vendor not found")
    only = payload.model_fields_set
    _validate_vendor_refs(db, payload, only)
    if ("company_name" in only and payload.company_name.strip().lower() != (row.company_name or "").strip().lower()) or (
        "email" in only and payload.email and payload.email.strip().lower() != (row.email or "").strip().lower()
    ):
        dup = _find_duplicate_vendor(db, payload, exclude_id=row.id)
        if dup:
            raise HTTPException(
                status_code=409,
                detail=f"A vendor with this name or email already exists: {dup.company_name} ({dup.vendor_code})",
            )
    before = _snapshot(row)
    _apply_vendor_write(row, payload, company_id=row.company_id, only=only)
    changes = _audit_diff(before, _snapshot(row))
    action = "vendor_updated"
    if "status" in changes:
        action = "vendor_archived" if changes["status"]["new"] == "archived" else "vendor_status_changed"
    _log(db, entity_id=row.id, action=action, performed_by=user.id, details=dump_json(changes) if changes else None)
    db.commit()
    db.refresh(row)
    from app.services.parties.party_commerce_links import links_for_party

    links = links_for_party(db, row.party_id) if row.party_id else None
    return VendorResponse(data=_vendor_read(row, links=links))


# -------------------------------------------------------------- portal users


def _admin_user_read(db: Session, user: VendorUser, *, include_token: bool = False) -> VendorUserAdminRead:
    vendor = db.get(Vendor, user.vendor_id)
    return VendorUserAdminRead(
        id=user.id,
        email=user.email,
        name=user.name,
        phone=user.phone,
        role=user.role,
        vendor_id=user.vendor_id,
        vendor_name=vendor.company_name if vendor else None,
        is_active=user.is_active,
        accepted_at=user.accepted_at,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
        has_password=bool(user.password_hash),
        invite_pending=bool(user.invite_token),
        invite_expires_at=user.invite_expires_at,
        invite_token=user.invite_token if include_token else None,
    )


@router.get("/{vendor_id}/portal-users", response_model=VendorUserListResponse)
def list_portal_users(
    vendor_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(get_current_user),
) -> VendorUserListResponse:
    if not db.get(Vendor, vendor_id):
        raise HTTPException(status_code=404, detail="Vendor not found")
    rows = vendor_auth_service.list_users(db, vendor_id)
    return VendorUserListResponse(data=[_admin_user_read(db, r) for r in rows])


@router.post("/{vendor_id}/portal-users", response_model=VendorUserResponse, status_code=201)
def invite_portal_user(
    vendor_id: str,
    payload: VendorUserInviteRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
    company_id: str = Depends(get_current_company_id),
) -> VendorUserResponse:
    """Creates the invite and returns its token once.

    There is no email sender in this deployment, so the admin copies the
    link to the vendor themselves — same as the supplier portal invite flow.
    """
    row = vendor_auth_service.invite_user(
        db,
        vendor_id=vendor_id,
        email=payload.email,
        name=payload.name,
        role=payload.role,
        company_id=company_id,
        invited_by=user.id,
    )
    return VendorUserResponse(data=_admin_user_read(db, row, include_token=True))


@router.delete("/{vendor_id}/portal-users/{portal_user_id}", response_model=VendorUserResponse)
def revoke_portal_user(
    vendor_id: str,
    portal_user_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> VendorUserResponse:
    row = vendor_auth_service.revoke_access(
        db, vendor_user_id=portal_user_id, vendor_id=vendor_id, performed_by=user.id
    )
    return VendorUserResponse(data=_admin_user_read(db, row))
