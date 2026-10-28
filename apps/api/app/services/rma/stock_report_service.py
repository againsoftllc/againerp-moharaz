"""RMA stock report: every unit that is in an RMA location right now, in one list.

Two kinds of location hold RMA units (see `InventoryWarehouse`):

  RMA Store              `is_rma_store`          returned units under claim and replacements waiting for the customer
  Supplier / In Transit  `is_supplier_transit`   units that are out with a supplier

The quantities come from the stock levels of those warehouses (the physical truth, the same numbers the Stock page shows),
so the report always agrees with inventory. Each unit is then tied to the RMA that explains it (RMA number, customer, supplier,
claim, since when); units no open RMA accounts for are listed too, flagged "No linked RMA", so a gap between the books and the
shelf is visible instead of hidden. A read over existing records: no new tables, no state of its own.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.inventory_serial import InventorySerial
from app.models.inventory_stock_level import InventoryStockLevel
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.rma import RmaStockEvent, RmaSupplierClaim, RmaTicket
from app.services.rma.constants import CUSTODY_LABELS

# A unit that has sat in an RMA location longer than this is "aged" (shown in the summary and highlighted).
AGED_AFTER_DAYS = 30

# Custody states a unit can be in while it is physically in each kind of location.
_STORE_STATES = ("in_rma_store", "replacement_received")
_SUPPLIER_STATES = ("with_supplier",)
_KIND_STATES = {"rma_store": _STORE_STATES, "supplier": _SUPPLIER_STATES}
_KIND_LABEL = {"rma_store": "In RMA Store", "supplier": "With Supplier"}
# Serials that no longer hold a physical unit in the location.
_GONE_SERIAL_STATUSES = ("replaced", "sold", "scrapped", "returned")


def _kind(warehouse: InventoryWarehouse) -> str:
    return "supplier" if warehouse.is_supplier_transit and not warehouse.is_rma_store else "rma_store"


def _money(value: Any) -> Decimal:
    return Decimal(str(value or 0))


def _days(since: Optional[datetime], today: date) -> int:
    return max((today - since.date()).days, 0) if since else 0


def _since(ticket: RmaTicket, events: list[RmaStockEvent], claim: Optional[RmaSupplierClaim], fallback: Optional[datetime]) -> Optional[datetime]:
    """When the unit reached its current place: the stock event that put it there, else the claim dispatch, else the last edit."""
    live = [e for e in events if e.reversed_at is None and e.custody_state == ticket.custody_state]
    if live:
        return max(e.created_at for e in live)
    if ticket.custody_state == "with_supplier" and claim is not None:
        if claim.dispatched_at:
            return claim.dispatched_at
        if claim.dispatch_date:
            return datetime.combine(claim.dispatch_date, datetime.min.time())
    return ticket.updated_at or fallback


def stock_report(db: Session, company_id: str, today: Optional[date] = None) -> dict[str, Any]:
    today = today or date.today()

    warehouses = (
        db.query(InventoryWarehouse)
        .filter(
            InventoryWarehouse.company_id == company_id,
            or_(InventoryWarehouse.is_rma_store.is_(True), InventoryWarehouse.is_supplier_transit.is_(True)),
        )
        .order_by(InventoryWarehouse.sort_order, InventoryWarehouse.name)
        .all()
    )
    by_id = {w.id: w for w in warehouses}
    levels = (
        db.query(InventoryStockLevel)
        .filter(
            InventoryStockLevel.company_id == company_id,
            InventoryStockLevel.warehouse_id.in_(list(by_id) or [""]),
            InventoryStockLevel.on_hand > 0,
        )
        .order_by(InventoryStockLevel.name)
        .all()
    )

    # the RMAs that can explain a unit sitting in these places
    states = sorted({s for w in warehouses for s in _KIND_STATES[_kind(w)]})
    tickets = (
        db.query(RmaTicket)
        .filter(RmaTicket.company_id == company_id, RmaTicket.custody_state.in_(states or [""]))
        .order_by(RmaTicket.updated_at.desc())
        .all()
    )
    ticket_ids = [t.id for t in tickets]
    claims: dict[str, RmaSupplierClaim] = {}
    events: dict[str, list[RmaStockEvent]] = {}
    if ticket_ids:
        for claim in db.query(RmaSupplierClaim).filter(RmaSupplierClaim.rma_id.in_(ticket_ids)).order_by(RmaSupplierClaim.created_at):
            claims[claim.rma_id] = claim  # the latest claim wins
        for event in db.query(RmaStockEvent).filter(RmaStockEvent.rma_id.in_(ticket_ids)):
            events.setdefault(event.rma_id, []).append(event)

    # Units moved into an RMA location often carry no cost of their own: value them at the average cost the same product
    # has in the normal warehouses (flagged "estimated" so nobody mistakes it for a booked cost).
    avg_cost: dict[str, Decimal] = {}
    missing = [l.variant_id for l in levels if _money(l.unit_cost) <= 0]
    if missing:
        costed = (
            db.query(InventoryStockLevel)
            .filter(
                InventoryStockLevel.company_id == company_id,
                InventoryStockLevel.variant_id.in_(missing),
                InventoryStockLevel.unit_cost > 0,
                InventoryStockLevel.on_hand > 0,
            )
            .all()
        )
        totals: dict[str, tuple[Decimal, int]] = {}
        for c in costed:
            if c.warehouse_id in by_id:
                continue
            money, qty = totals.get(c.variant_id, (Decimal("0"), 0))
            totals[c.variant_id] = (money + _money(c.unit_cost) * c.on_hand, qty + c.on_hand)
        avg_cost = {v: (m / q).quantize(Decimal("0.01")) for v, (m, q) in totals.items() if q > 0}

    rows: list[dict[str, Any]] = []
    used: set[str] = set()  # a ticket explains one stock line only

    def row_for(level: InventoryStockLevel, warehouse: InventoryWarehouse, kind: str, ticket: Optional[RmaTicket], qty: int, serial: str) -> dict[str, Any]:
        claim = claims.get(ticket.id) if ticket else None
        since = _since(ticket, events.get(ticket.id, []), claim, level.updated_at) if ticket else level.updated_at
        unit_cost = _money(level.unit_cost)
        estimated = unit_cost <= 0 and level.variant_id in avg_cost
        if estimated:
            unit_cost = avg_cost[level.variant_id]
        expected = claim.expected_return_date if claim and kind == "supplier" else None
        return {
            "id": f"{level.id}:{ticket.id if ticket else 'unlinked'}",
            "location_id": warehouse.id,
            "location_code": warehouse.code,
            "location_name": warehouse.name,
            "location_kind": kind,
            "sku": level.sku,
            "product_name": level.name,
            "thumbnail": level.thumbnail,
            "serial_number": serial,
            "quantity": qty,
            "unit_cost": unit_cost,
            "cost_estimated": estimated,
            "value": unit_cost * qty,
            "rma_id": ticket.id if ticket else None,
            "rma_number": ticket.rma_number if ticket else None,
            "rma_status": ticket.status if ticket else None,
            "custody_state": ticket.custody_state if ticket else None,
            "custody_label": CUSTODY_LABELS.get(ticket.custody_state or "", "") if ticket else _KIND_LABEL[kind],
            "customer_name": ticket.customer_name if ticket else "",
            "supplier_name": (claim.supplier_name if claim else (ticket.supplier_name or "")) if ticket else "",
            "claim_id": claim.id if claim else None,
            "claim_number": claim.claim_number if claim else None,
            "claim_status": claim.status if claim else None,
            "warranty_status": ticket.warranty_status if ticket else None,
            "since": since,
            "days_in_location": _days(since, today),
            "expected_return_date": expected,
            "is_late": bool(expected and expected < today),
            "linked": ticket is not None,
        }

    for level in levels:
        warehouse = by_id[level.warehouse_id]
        kind = _kind(warehouse)
        remaining = int(level.on_hand)
        for ticket in tickets:
            if remaining <= 0:
                break
            if ticket.id in used or ticket.custody_state not in _KIND_STATES[kind]:
                continue
            # what sits on the shelf is the product the supplier sent back when that differs from the one claimed
            held_item = ticket.held_item_id or ticket.item_id
            held_sku = ticket.held_sku or ticket.sku or ""
            same_item = bool(level.item_id and held_item) and level.item_id == held_item
            if not same_item and held_sku != level.sku:
                continue
            qty = max(min(int(ticket.quantity or 1), remaining), 1)
            serial = ticket.received_serial_number or ticket.serial_number or ""
            rows.append(row_for(level, warehouse, kind, ticket, qty, serial))
            used.add(ticket.id)
            remaining -= qty
        if remaining > 0:
            # units the books hold here that no open RMA explains: show them, with the serials the warehouse has on record
            taken = {r["serial_number"] for r in rows if r["serial_number"]}
            serials = [
                s.serial_number
                for s in db.query(InventorySerial)
                .filter(
                    InventorySerial.company_id == company_id,
                    InventorySerial.warehouse_id == warehouse.id,
                    InventorySerial.sku == level.sku,
                    InventorySerial.status.notin_(_GONE_SERIAL_STATUSES),
                )
                .order_by(InventorySerial.serial_number)
                if s.serial_number not in taken
            ]
            rows.append(row_for(level, warehouse, kind, None, remaining, ", ".join(serials[:remaining])))

    # what has waited longest comes first; late supplier returns on top
    rows.sort(key=lambda r: (not r["is_late"], -r["days_in_location"], r["product_name"]))

    def part(kind: str) -> list[dict[str, Any]]:
        return [r for r in rows if r["location_kind"] == kind]

    store, supplier = part("rma_store"), part("supplier")
    units = lambda items: sum(int(r["quantity"]) for r in items)  # noqa: E731
    value = lambda items: sum((r["value"] for r in items), Decimal("0"))  # noqa: E731
    locations = [
        {
            "id": w.id,
            "code": w.code,
            "name": w.name,
            "kind": _kind(w),
            "units": sum(int(r["quantity"]) for r in rows if r["location_id"] == w.id),
            "value": sum((r["value"] for r in rows if r["location_id"] == w.id), Decimal("0")),
        }
        for w in warehouses
    ]
    return {
        "summary": {
            "total_units": units(rows),
            "store_units": units(store),
            "supplier_units": units(supplier),
            "total_value": value(rows),
            "store_value": value(store),
            "supplier_value": value(supplier),
            "sku_count": len({r["sku"] for r in rows}),
            "late_returns": sum(int(r["quantity"]) for r in supplier if r["is_late"]),
            "aged_units": sum(int(r["quantity"]) for r in rows if r["days_in_location"] > AGED_AFTER_DAYS),
            "unlinked_units": sum(int(r["quantity"]) for r in rows if not r["linked"]),
            "oldest_days": max((r["days_in_location"] for r in rows), default=0),
            "aged_after_days": AGED_AFTER_DAYS,
        },
        "locations": locations,
        "rows": rows,
    }
