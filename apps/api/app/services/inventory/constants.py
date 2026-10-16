"""Inventory domain constants."""

from __future__ import annotations

INVENTORY_STATUSES = frozenset({"active", "inactive", "discontinued"})

# Canonical movement types stored on inventory_stock_movements.
# Legacy short names (`in`, `out`, `opening`, `reserve`, `release`) remain
# readable and accepted as aliases. `transfer` and `adjustment` (absolute SET)
# are retired — see RETIRED_MOVEMENT_TYPES.
MOVEMENT_PURCHASE_RECEIPT = "purchase_receipt"
MOVEMENT_PURCHASE_RETURN = "purchase_return"
MOVEMENT_SALES_DELIVERY = "sales_delivery"
MOVEMENT_POS_SALE = "pos_sale"
MOVEMENT_POS_RETURN = "pos_return"
MOVEMENT_COMMERCE_SALE = "commerce_sale"
MOVEMENT_TRANSFER_OUT = "transfer_out"
MOVEMENT_TRANSFER_IN = "transfer_in"
MOVEMENT_TRANSFER_IN_TRANSIT = "transfer_in_transit"
MOVEMENT_STOCK_ADJUSTMENT_IN = "stock_adjustment_in"
MOVEMENT_STOCK_ADJUSTMENT_OUT = "stock_adjustment_out"
MOVEMENT_STOCK_COUNT_IN = "stock_count_in"
MOVEMENT_STOCK_COUNT_OUT = "stock_count_out"
MOVEMENT_OPENING_STOCK = "opening_stock"
MOVEMENT_CUSTOMER_RETURN = "customer_return"
MOVEMENT_RMA_REPLACEMENT = "rma_replacement"
MOVEMENT_SCRAP = "scrap"
MOVEMENT_SERVICE_CONSUMPTION = "service_consumption"
MOVEMENT_RESERVATION = "reservation"
MOVEMENT_RESERVATION_RELEASE = "reservation_release"
MOVEMENT_REVERSAL = "reversal"

# Historical rows may still use these. Do not rewrite them.
LEGACY_MOVEMENT_TYPES = frozenset({"in", "out", "opening", "reserve", "release", "transfer", "adjustment"})

RETIRED_MOVEMENT_TYPES = frozenset({"transfer", "adjustment"})

MOVEMENT_TYPE_ALIASES: dict[str, str] = {
    "opening": MOVEMENT_OPENING_STOCK,
    "reserve": MOVEMENT_RESERVATION,
    "release": MOVEMENT_RESERVATION_RELEASE,
}

ON_HAND_IN_TYPES = frozenset({
    "in",
    "opening",
    MOVEMENT_OPENING_STOCK,
    MOVEMENT_PURCHASE_RECEIPT,
    MOVEMENT_POS_RETURN,
    MOVEMENT_TRANSFER_IN,
    MOVEMENT_STOCK_ADJUSTMENT_IN,
    MOVEMENT_STOCK_COUNT_IN,
    MOVEMENT_CUSTOMER_RETURN,
})

ON_HAND_OUT_TYPES = frozenset({
    "out",
    MOVEMENT_SALES_DELIVERY,
    MOVEMENT_POS_SALE,
    MOVEMENT_COMMERCE_SALE,
    MOVEMENT_TRANSFER_OUT,
    MOVEMENT_STOCK_ADJUSTMENT_OUT,
    MOVEMENT_STOCK_COUNT_OUT,
    MOVEMENT_SCRAP,
    MOVEMENT_RMA_REPLACEMENT,
    MOVEMENT_SERVICE_CONSUMPTION,
    MOVEMENT_PURCHASE_RETURN,
})

RESERVATION_TYPES = frozenset({MOVEMENT_RESERVATION, "reserve"})
RESERVATION_RELEASE_TYPES = frozenset({MOVEMENT_RESERVATION_RELEASE, "release"})
INCOMING_HOLD_TYPES = frozenset({MOVEMENT_TRANSFER_IN_TRANSIT})

MOVEMENT_TYPES = (
    ON_HAND_IN_TYPES
    | ON_HAND_OUT_TYPES
    | RESERVATION_TYPES
    | RESERVATION_RELEASE_TYPES
    | INCOMING_HOLD_TYPES
    | {MOVEMENT_REVERSAL}
    | LEGACY_MOVEMENT_TYPES
)

ALLOW_NEGATIVE_STOCK = False

RESERVATION_SOURCE_SALES = "sales_order"
RESERVATION_SOURCE_COMMERCE = "commerce_order"
INCOMING_SOURCE_TRANSFER = "stock_transfer"
INCOMING_SOURCE_PURCHASE = "purchase_order"

RESERVATION_STATUSES = frozenset({"open", "consumed", "released"})
INCOMING_STATUSES = frozenset({"open", "received", "cancelled"})

COMMERCE_SOURCE_TYPES = frozenset({"commerce_order", "storefront_cart", "commerce_shipment"})

DEFAULT_BASE_UOM = "ea"

# Suggested warehouse types — presets for the picker, not an enforced enum.
# `InventoryWarehouse.type` stays a free string so existing/custom values
# (e.g. a regional depot with its own label) are never invalidated.
WAREHOUSE_TYPE_PRESETS: tuple[str, ...] = (
    "Main warehouse",
    "Retail store",
    "Service center",
    "Consignment",
    "Ecommerce FC",
    "Returns / Damaged",
)

# --- serial registry -------------------------------------------------------

SERIAL_STATUSES: tuple[str, ...] = (
    "in_stock",
    "in_transit",
    "sold",
    "in_service",
    "replaced",
    "scrapped",
    "lost",
    "damaged",
)

SERIAL_STATUS_LABELS: dict[str, str] = {
    "in_stock": "In stock",
    "in_transit": "In transit",
    "sold": "Sold",
    "in_service": "In service",
    "replaced": "Replaced",
    "scrapped": "Scrapped",
    "lost": "Lost",
    "damaged": "Damaged",
}

# Explicit, like RMA_STATUS_TRANSITIONS — a unit's life is short enough to spell
# out, and an accidental jump (sold → in_stock) hides a real mistake.
SERIAL_STATUS_TRANSITIONS: dict[str, frozenset[str]] = {
    "in_stock": frozenset({"sold", "scrapped", "in_transit", "lost", "damaged"}),
    "in_transit": frozenset({"in_stock", "scrapped"}),
    "sold": frozenset({"in_service", "scrapped", "in_stock"}),
    # A repaired unit goes back to the customer, so it returns to `sold`.
# A POS / over-the-counter return restocks the unit (`in_stock`).
    "in_service": frozenset({"sold", "replaced", "scrapped"}),
    "replaced": frozenset(),
    "scrapped": frozenset(),
    "lost": frozenset({"in_stock", "scrapped"}),
    "damaged": frozenset({"in_stock", "scrapped"}),
}

# Warehouse-to-warehouse stock transfers (two-step: ship → in transit → receive).
TRANSFER_STATUSES = frozenset({"draft", "in_transit", "partial_received", "completed", "cancelled"})
TRANSFER_SHIPPED_STATUSES = frozenset({"in_transit", "partial_received", "completed"})
TRANSFER_SERIAL_SELECTED = "selected"
TRANSFER_SERIAL_SHIPPED = "shipped"
TRANSFER_SERIAL_RECEIVED = "received"

SERIAL_SOURCE_TYPES = frozenset({"receipt", "manual", "rma_replacement", "adjustment", "opening"})

# Stock adjustments — draft does not change stock; apply writes the ledger.
ADJUSTMENT_STATUSES = frozenset({"draft", "applied", "cancelled"})
ADJUSTMENT_REASONS: dict[str, str] = {
    "physical_count": "Physical Stock Count",
    "damaged": "Damaged",
    "lost": "Lost",
    "found": "Found",
    "expired": "Expired",
    "broken": "Broken",
    "data_correction": "Data Correction",
    "opening_stock": "Opening Stock",
    "migration": "Migration",
    "other": "Other",
}
ADJUSTMENT_TYPES = frozenset({"increase", "decrease", "mixed"})
ADJUSTMENT_SERIAL_KEEP = "keep"
ADJUSTMENT_SERIAL_REMOVE = "remove"
ADJUSTMENT_SERIAL_ADD = "add"
ADJUSTMENT_DECREASE_SERIAL_STATUS: dict[str, str] = {
    "lost": "lost",
    "damaged": "damaged",
    "broken": "damaged",
    "expired": "scrapped",
    "physical_count": "lost",
    "data_correction": "lost",
    "opening_stock": "lost",
    "migration": "lost",
    "other": "lost",
    "found": "lost",
}

# Product inventory tracking — derived from inventory_items.track_serial / track_batch.
# Do not add a duplicate column; this is the public enum the GRN flow uses.
TRACKING_NONE = "none"
TRACKING_SERIAL = "serial"
TRACKING_BATCH = "batch"
TRACKING_TYPES = frozenset({TRACKING_NONE, TRACKING_SERIAL, TRACKING_BATCH})


def tracking_type_of(track_serial: bool = False, track_batch: bool = False) -> str:
    if track_serial:
        return TRACKING_SERIAL
    if track_batch:
        return TRACKING_BATCH
    return TRACKING_NONE

# How a claim can let go of a unit.
SERIAL_RMA_OUTCOMES: dict[str, str] = {
    "returned": "sold",
    "replaced": "replaced",
    "scrapped": "scrapped",
}

# --- stock counts (cycle counting) -----------------------------------------

STOCK_COUNT_STATUSES: tuple[str, ...] = ("draft", "completed", "cancelled")
