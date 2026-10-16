"""Optional Pathao consignment creation from commerce orders.

No hard dependency: if the Pathao plugin is missing, uninstalled, disabled,
or incomplete, callers continue with normal local shipment behavior.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.models.commerce_order import CommerceOrder
from app.models.commerce_order_shipment import CommerceOrderShipment

logger = logging.getLogger("pathao.shipping")

PLUGIN_ID = "pathao-default"
PATHAO_TRACK_URL = "https://pathao.com/track/{consignment_id}"


@dataclass
class PathaoConsignmentResult:
    created: bool
    consignment_id: str = ""
    tracking_url: str = ""
    message: str = ""
    skipped: bool = False


def _normalize_bd_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("880") and len(digits) >= 13:
        digits = "0" + digits[3:]
    if len(digits) == 10 and digits.startswith("1"):
        digits = "0" + digits
    return digits


def _delivery_type(service: str) -> int:
    # Pathao: 48 = Normal, 12 = On Demand
    return 12 if (service or "").lower() in {"express", "same_day", "on_demand"} else 48


def _item_type(item_type: str) -> int:
    return 1 if (item_type or "").lower() == "document" else 2


def _courier_wants_pathao(courier: Optional[str], *, force: bool) -> bool:
    if force:
        return True
    if not courier or not courier.strip():
        return True
    return courier.strip().lower() in {"pathao", "pathao courier"}


def get_active_pathao_plugin(db: Session):
    """Return Pathao plugin row only when installed+enabled; else None."""
    try:
        from app.models.pathao_plugin import PathaoPlugin
        from app.services.pathao_client import credentials_complete
    except Exception:
        return None
    try:
        row = db.get(PathaoPlugin, PLUGIN_ID)
    except Exception:
        return None
    if not row or not row.installed or not row.enabled:
        return None
    if not credentials_complete(row):
        return None
    if not (row.store_id or "").strip():
        return None
    return row


def build_pathao_order_payload(
    order: CommerceOrder,
    plugin,
    *,
    shipment_number: str = "",
    item_quantity: int = 1,
) -> Dict[str, Any]:
    phone = _normalize_bd_phone(order.customer_phone or "")
    address = (order.shipping_address or order.billing_address or "").strip()
    name = (order.customer_name or "Customer").strip()
    if len(name) < 3:
        name = (name + " Customer").strip()

    qty = max(1, int(item_quantity or 1))
    weight = min(10.0, max(0.5, round(0.5 * qty, 2)))

    amount = 0
    if plugin.cod_enabled:
        method = (order.payment_method or "").lower()
        unpaid = (order.payment_status or "").lower() not in {"paid", "refunded"}
        if unpaid and ("cod" in method or method in {"cash", "cash_on_delivery"}):
            amount = int(Decimal(order.due_amount or order.grand_total or 0))

    payload: Dict[str, Any] = {
        "store_id": int(str(plugin.store_id).strip()),
        "merchant_order_id": (shipment_number or order.order_number)[:50],
        "recipient_name": name[:100],
        "recipient_phone": phone,
        "recipient_address": address[:220] if len(address) >= 10 else (address + ", Dhaka")[:220],
        "delivery_type": _delivery_type(plugin.default_service),
        "item_type": _item_type(plugin.item_type),
        "item_quantity": qty,
        "item_weight": weight,
        "amount_to_collect": max(0, amount),
        "item_description": f"Order {order.order_number}"[:200],
    }
    if plugin.pickup_phone:
        # Pathao does not always require pickup phone on create; keep description note.
        pass
    return payload


@dataclass
class SalesOrderPathaoResult:
    created: bool
    skipped: bool = False
    consignment_id: str = ""
    tracking_url: str = ""
    message: str = ""


def create_sales_order_pathao_consignment(
    db: Session,
    order,  # app.models.sales.SalesOrder
    *,
    recipient_name: str,
    recipient_phone: str,
    recipient_address: str,
    item_quantity: Optional[int] = None,
    item_weight_kg: Optional[float] = None,
) -> SalesOrderPathaoResult:
    """Book a Pathao consignment for an admin-created SalesOrder.

    Mirrors maybe_create_pathao_consignment (the storefront CommerceOrder path) but
    SalesOrder carries no address/shipment sub-model of its own, so the caller (the
    Shipping tab, which already resolved the selected address) supplies recipient
    details directly instead of us re-deriving them from the customer record.
    """
    plugin = get_active_pathao_plugin(db)
    if not plugin:
        return SalesOrderPathaoResult(created=False, skipped=True, message="Pathao plugin is not installed or not ready")

    phone = _normalize_bd_phone(recipient_phone)
    if len(phone) != 11 or not phone.startswith("01"):
        return SalesOrderPathaoResult(
            created=False,
            skipped=True,
            message=f"Invalid recipient phone for Pathao: {recipient_phone!r}",
        )
    address = (recipient_address or "").strip()
    if len(address) < 10:
        return SalesOrderPathaoResult(
            created=False,
            skipped=True,
            message="Shipping address too short for Pathao (min 10 chars)",
        )

    try:
        from app.services.pathao_client import PathaoError, create_order
    except Exception as exc:
        logger.exception("Pathao client unavailable")
        return SalesOrderPathaoResult(created=False, message=str(exc), skipped=True)

    qty = max(1, int(item_quantity or 1))
    weight = min(10.0, max(0.5, round(float(item_weight_kg), 2))) if item_weight_kg else min(10.0, max(0.5, round(0.5 * qty, 2)))
    name = (recipient_name or "Customer").strip()
    if len(name) < 3:
        name = (name + " Customer").strip()

    payload: Dict[str, Any] = {
        "store_id": int(str(plugin.store_id).strip()),
        "merchant_order_id": order.order_number[:50],
        "recipient_name": name[:100],
        "recipient_phone": phone,
        "recipient_address": address[:220],
        "delivery_type": _delivery_type(plugin.default_service),
        "item_type": _item_type(plugin.item_type),
        "item_quantity": qty,
        "item_weight": weight,
        "amount_to_collect": 0,
        "item_description": f"Order {order.order_number}"[:200],
    }

    try:
        data = create_order(db, plugin, payload)
    except PathaoError as exc:
        logger.warning("Pathao consignment failed for %s: %s", order.order_number, exc)
        return SalesOrderPathaoResult(created=False, message=str(exc))
    except Exception as exc:
        logger.exception("Pathao consignment unexpected error for %s", order.order_number)
        return SalesOrderPathaoResult(created=False, message=str(exc))

    consignment_id = str(data.get("consignment_id") or data.get("invoice_id") or "")
    if not consignment_id:
        return SalesOrderPathaoResult(created=False, message="Pathao response missing consignment_id")

    tracking_url = PATHAO_TRACK_URL.format(consignment_id=consignment_id)
    order.courier = "Pathao"
    order.tracking_number = consignment_id
    order.tracking_url = tracking_url

    return SalesOrderPathaoResult(
        created=True,
        consignment_id=consignment_id,
        tracking_url=tracking_url,
        message=f"Pathao consignment {consignment_id} created",
    )


def maybe_create_pathao_consignment(
    db: Session,
    order: CommerceOrder,
    shipment: CommerceOrderShipment,
    *,
    force: bool = False,
    item_quantity: int = 1,
) -> PathaoConsignmentResult:
    """Best-effort Pathao create. Never raises into commerce core."""
    plugin = get_active_pathao_plugin(db)
    if not plugin:
        return PathaoConsignmentResult(
            created=False,
            skipped=True,
            message="Pathao plugin not active",
        )
    if not plugin.auto_create_shipment and not force:
        return PathaoConsignmentResult(
            created=False,
            skipped=True,
            message="Pathao auto_create_shipment is off",
        )
    if not _courier_wants_pathao(shipment.courier or order.courier, force=force):
        return PathaoConsignmentResult(
            created=False,
            skipped=True,
            message="Courier is not Pathao",
        )
    if shipment.tracking_number and not force:
        return PathaoConsignmentResult(
            created=False,
            skipped=True,
            message="Shipment already has tracking",
        )

    phone = _normalize_bd_phone(order.customer_phone or "")
    if len(phone) != 11 or not phone.startswith("01"):
        return PathaoConsignmentResult(
            created=False,
            skipped=True,
            message=f"Invalid recipient phone for Pathao: {order.customer_phone!r}",
        )
    address = (order.shipping_address or order.billing_address or "").strip()
    if len(address) < 10:
        return PathaoConsignmentResult(
            created=False,
            skipped=True,
            message="Shipping address too short for Pathao (min 10 chars)",
        )

    try:
        from app.services.pathao_client import PathaoError, create_order
    except Exception as exc:
        logger.exception("Pathao client unavailable")
        return PathaoConsignmentResult(created=False, message=str(exc), skipped=True)

    payload = build_pathao_order_payload(
        order,
        plugin,
        shipment_number=shipment.shipment_number,
        item_quantity=item_quantity,
    )
    try:
        data = create_order(db, plugin, payload)
    except PathaoError as exc:
        logger.warning("Pathao consignment failed for %s: %s", order.order_number, exc)
        return PathaoConsignmentResult(created=False, message=str(exc))
    except Exception as exc:
        logger.exception("Pathao consignment unexpected error for %s", order.order_number)
        return PathaoConsignmentResult(created=False, message=str(exc))

    consignment_id = str(
        data.get("consignment_id")
        or data.get("consignment_id".upper())
        or data.get("invoice_id")
        or "",
    )
    if not consignment_id:
        return PathaoConsignmentResult(
            created=False,
            message="Pathao response missing consignment_id",
        )

    tracking_url = PATHAO_TRACK_URL.format(consignment_id=consignment_id)
    if plugin.sync_tracking:
        shipment.courier = shipment.courier or "Pathao"
        shipment.tracking_number = consignment_id
        shipment.tracking_url = tracking_url
        order.courier = "Pathao"
        order.tracking_number = consignment_id
        order.tracking_url = tracking_url

    return PathaoConsignmentResult(
        created=True,
        consignment_id=consignment_id,
        tracking_url=tracking_url,
        message=f"Pathao consignment {consignment_id} created",
    )
