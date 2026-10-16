"""Vendor audit log view — SPEC.md §43.

Reads the existing collab_activity table (no new vendor_audit_logs table,
per SPEC §61 — reuse, don't duplicate). A vendor's full trail spans several
entity_types (vendor, vendor_order_request, vendor_quotation,
vendor_invoice), so this collects all of them by entity id, not just the
vendor row itself.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.collab_activity import CollabActivity
from app.models.vendor.vendor_invoice import VendorInvoice
from app.models.vendor.vendor_order_request import VendorOrderRequest
from app.models.vendor.vendor_quotation import VendorQuotation


def vendor_entity_ids(db: Session, vendor_id: str) -> dict[str, list[str]]:
    order_request_ids = [r.id for r in db.query(VendorOrderRequest.id).filter(VendorOrderRequest.vendor_id == vendor_id)]
    quotation_ids = [r.id for r in db.query(VendorQuotation.id).filter(VendorQuotation.vendor_id == vendor_id)]
    invoice_ids = [r.id for r in db.query(VendorInvoice.id).filter(VendorInvoice.vendor_id == vendor_id)]
    return {
        "vendor": [vendor_id],
        "vendor_order_request": order_request_ids,
        "vendor_quotation": quotation_ids,
        "vendor_invoice": invoice_ids,
    }


def list_vendor_activity(
    db: Session,
    *,
    vendor_id: str,
    entity_type: Optional[str] = None,
    limit: int = 200,
):
    ids_by_type = vendor_entity_ids(db, vendor_id)
    if entity_type:
        ids_by_type = {entity_type: ids_by_type.get(entity_type, [])}

    conditions = [
        (CollabActivity.entity_type == etype) & (CollabActivity.entity_id.in_(ids))
        for etype, ids in ids_by_type.items()
        if ids
    ]
    if not conditions:
        return []

    return (
        db.query(CollabActivity)
        .filter(or_(*conditions))
        .order_by(CollabActivity.created_at.desc())
        .limit(limit)
        .all()
    )
