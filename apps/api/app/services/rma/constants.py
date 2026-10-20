"""RMA workflow constants.

Existing ticket statuses stay valid so live claims are not rewritten.
Authorization-first states (`draft` → `awaiting_return`) are additive.
"""

from __future__ import annotations

RMA_TYPES: tuple[str, ...] = ("customer", "warranty", "supplier")

RMA_STATUSES: tuple[str, ...] = (
    "draft",
    "pending_approval",
    "correction_requested",
    "approved",
    "awaiting_return",
    "received",
    "diagnosing",
    "awaiting_approval",
    "in_repair",
    "sent_to_supplier",
    "at_supplier",
    "returned_from_supplier",
    "ready_for_delivery",
    "delivered",
    "closed",
    "rejected",
    "cancelled",
    "on_hold",
)

RMA_STATUS_LABELS: dict[str, str] = {
    "draft": "Draft",
    "pending_approval": "Pending approval",
    "correction_requested": "Needs correction",
    "approved": "Approved",
    "awaiting_return": "Awaiting return",
    "received": "Received",
    "diagnosing": "Inspection",
    "awaiting_approval": "Resolution pending",
    "in_repair": "Processing",
    "sent_to_supplier": "Sent to supplier",
    "at_supplier": "At supplier",
    "returned_from_supplier": "Back from supplier",
    "ready_for_delivery": "Ready for delivery",
    "delivered": "Delivered",
    "closed": "Completed",
    "rejected": "Rejected",
    "cancelled": "Cancelled",
    "on_hold": "On hold",
}

_TERMINAL = {"closed", "rejected", "cancelled"}

RMA_STATUS_TRANSITIONS: dict[str, frozenset[str]] = {
    "draft": frozenset({"pending_approval", "received", "rejected"}),
    "pending_approval": frozenset({"approved", "rejected", "correction_requested"}),
    "correction_requested": frozenset({"pending_approval", "rejected"}),
    "approved": frozenset({"awaiting_return", "received"}),
    "awaiting_return": frozenset({"received"}),
    # received -> sent_to_supplier is only reachable through a supplier claim (see change_status).
    "received": frozenset({"diagnosing", "in_repair", "sent_to_supplier", "rejected", "on_hold"}),
    "diagnosing": frozenset(
        {"awaiting_approval", "in_repair", "sent_to_supplier", "ready_for_delivery", "rejected", "on_hold"}
    ),
    "awaiting_approval": frozenset({"in_repair", "sent_to_supplier", "rejected", "on_hold"}),
    "in_repair": frozenset({"sent_to_supplier", "ready_for_delivery", "on_hold"}),
    "sent_to_supplier": frozenset({"at_supplier"}),
    "at_supplier": frozenset({"returned_from_supplier"}),
    "returned_from_supplier": frozenset({"in_repair", "ready_for_delivery"}),
    "ready_for_delivery": frozenset({"delivered"}),
    "delivered": frozenset({"closed"}),
    "on_hold": frozenset({"received", "diagnosing", "awaiting_approval", "in_repair"}),
    "closed": frozenset(),
    "rejected": frozenset(),
    "cancelled": frozenset(),
}

for _status, _next in list(RMA_STATUS_TRANSITIONS.items()):
    if _status not in _TERMINAL:
        RMA_STATUS_TRANSITIONS[_status] = _next | {"cancelled"}

# Statuses only the complaint-approval action (not a plain status change) may move a ticket into.
DECISION_ONLY_STATUSES = frozenset({"approved", "rejected", "correction_requested"})

# Supplier claim (docs/RMA.md Stage C): draft -> pending_approval -> approved -> dispatched.
CLAIM_STATUSES: tuple[str, ...] = (
    "draft",
    "pending_approval",
    "correction_requested",
    "approved",
    "dispatched",
    "rejected",
    "cancelled",
)
CLAIM_STATUS_LABELS: dict[str, str] = {
    "draft": "Draft",
    "pending_approval": "Pending approval",
    "correction_requested": "Needs correction",
    "approved": "Approved",
    "dispatched": "Dispatched",
    "rejected": "Rejected",
    "cancelled": "Cancelled",
}
CLAIM_OPEN_STATUSES = ("draft", "pending_approval", "correction_requested", "approved", "dispatched")
# A claim can be raised while the unit is in the RMA store and the ticket can still move on to "sent to supplier".
CLAIM_TICKET_STATUSES = frozenset({"received", "diagnosing", "awaiting_approval", "in_repair"})

# Supplier receipt (docs/RMA.md Stage D): draft -> pending_approval -> approved (stock posted once).
RECEIPT_STATUSES: tuple[str, ...] = (
    "draft",
    "pending_approval",
    "correction_requested",
    "approved",
    "rejected",
    "cancelled",
)
RECEIPT_STATUS_LABELS: dict[str, str] = {
    "draft": "Draft",
    "pending_approval": "Pending approval",
    "correction_requested": "Needs correction",
    "approved": "Approved",
    "rejected": "Rejected",
    "cancelled": "Cancelled",
}
RECEIPT_OPEN_STATUSES = ("draft", "pending_approval", "correction_requested")
RECEIPT_OUTCOMES: dict[str, str] = {
    "replacement": "Replacement",
    "repaired": "Original unit repaired",
    "returned_unrepaired": "Returned unrepaired",
    "other": "Other",
}

# Customer delivery / payment (docs/RMA.md Stage E, section 5): two concepts, five presets.
DELIVERY_STATUSES: tuple[str, ...] = (
    "draft",
    "pending_approval",
    "correction_requested",
    "approved",
    "rejected",
    "cancelled",
)
DELIVERY_STATUS_LABELS: dict[str, str] = {
    "draft": "Draft",
    "pending_approval": "Pending approval",
    "correction_requested": "Needs correction",
    "approved": "Approved",
    "rejected": "Rejected",
    "cancelled": "Cancelled",
}
DELIVERY_OPEN_STATUSES = ("draft", "pending_approval", "correction_requested")
PAYMENT_STATES = ("none", "received", "due")
# preset -> (deliver_product, payment_state). "custom" is any other valid combination.
DELIVERY_PRESETS: dict[str, tuple[bool, str]] = {
    "without_payment": (True, "none"),
    "payment_received": (False, "received"),
    "payment_payable": (False, "due"),
    "product_payment_received": (True, "received"),
    "product_payment_payable": (True, "due"),
}
# The unit can be handed over from these RMA statuses (the delivery moves it on to delivered / completed).
DELIVERY_PHYSICAL_STATUSES = frozenset({"diagnosing", "in_repair", "returned_from_supplier", "ready_for_delivery"})
# While the unit is in one of these stock states it can only leave through a delivery.
DELIVERY_HELD_STATES = frozenset({"in_rma_store", "replacement_received", "with_supplier"})

# RMA settlement: a money-in / money-out entry against an RMA (separate from handing the product over).
SETTLEMENT_STATUSES: tuple[str, ...] = DELIVERY_STATUSES
SETTLEMENT_STATUS_LABELS: dict[str, str] = DELIVERY_STATUS_LABELS
SETTLEMENT_OPEN_STATUSES = DELIVERY_OPEN_STATUSES
SETTLEMENT_PARTY_TYPES: dict[str, str] = {
    "customer": "Customer",
    "dealer": "Dealer",
    "supplier": "Supplier",
    "other": "Other Party",
}
SETTLEMENT_DIRECTIONS: dict[str, str] = {"in": "Money In (+)", "out": "Money Out (-)"}
SETTLEMENT_PURPOSES: dict[str, str] = {
    "parts_service": "Parts / Service Charge",
    "damage_compensation": "Damage Compensation",
    "repair_labour": "Repair / Labour Charge",
    "refund_settlement": "Refund / Settlement",
    "replacement_price_difference": "Replacement Price Difference",
    "other": "Other",
}
# Purposes that are the RMA's own charges: money in settles the RMA's customer receivable.
SETTLEMENT_CHARGE_PURPOSES = frozenset({"parts_service", "repair_labour"})
# An RMA can take a settlement from the moment the complaint is approved (it may be closed already: payment after delivery).
SETTLEMENT_BLOCKED_STATUSES = frozenset({"draft", "pending_approval", "correction_requested", "rejected", "cancelled"})

# Plain-language stock states (docs/RMA.md §3).
CUSTODY_STATES = ("in_rma_store", "with_supplier", "replacement_received", "delivered")
CUSTODY_LABELS: dict[str, str] = {
    "in_rma_store": "In RMA Store",
    "with_supplier": "With Supplier",
    "replacement_received": "Replacement Received",
    "delivered": "Delivered to Customer",
}

SUPPLIER_STATUSES = frozenset({"sent_to_supplier", "at_supplier"})
OPEN_STATUSES = tuple(s for s in RMA_STATUSES if s not in _TERMINAL and s != "delivered")

WARRANTY_STATUSES = frozenset({"in_warranty", "out_of_warranty", "unknown"})
WARRANTY_SOURCES = frozenset({"order", "serial", "sales", "manual", "unknown"})

# Status vs resolution stay separate. Legacy `repair`/`replace` remain readable.
RESOLUTION_TYPES = frozenset({
    "repair",
    "warranty_repair",
    "paid_repair",
    "replace",
    "refund",
    "partial_refund",
    "store_credit",
    "supplier_return",
    "resellable",
    "scrap",
    "reject",
})
RESOLUTION_STATUSES = frozenset({"pending", "processing", "completed"})

PHYSICAL_CONDITIONS = frozenset({"new", "like_new", "used", "damaged", "heavily_damaged"})
FUNCTIONAL_RESULTS = frozenset({"passed", "failed", "partial"})
QC_RESULTS = frozenset({"resellable", "repairable", "scrap", "supplier_return"})

CHARGE_KINDS = frozenset({"part", "labour", "misc"})

SUPPLIER_JOB_STATUSES = frozenset(
    {"draft", "dispatched", "acknowledged", "in_progress", "completed", "returned", "rejected"}
)

BILL_STATUSES = frozenset({"not_billed", "billed", "paid", "waived"})

REASON_CATEGORIES = frozenset({"customer", "warranty", "internal"})

DEFAULT_REASONS: tuple[tuple[str, str, str], ...] = (
    ("defective", "Defective", "customer"),
    ("damaged", "Damaged", "customer"),
    ("wrong_product", "Wrong product", "customer"),
    ("wrong_variant", "Wrong variant", "customer"),
    ("missing_parts", "Missing parts", "customer"),
    ("not_as_expected", "Not as expected", "customer"),
    ("changed_mind", "Changed mind", "customer"),
    ("duplicate_order", "Duplicate order", "customer"),
    ("manufacturing_defect", "Manufacturing defect", "warranty"),
    ("warranty_failure", "Warranty failure", "warranty"),
    ("shipping_damage", "Shipping damage", "internal"),
    ("quality_issue", "Quality issue", "internal"),
    ("recall", "Recall", "internal"),
    ("wrong_shipment", "Wrong shipment", "internal"),
    ("supplier_issue", "Supplier issue", "internal"),
)

SERVICE_JOB_STATUSES = frozenset({
    "draft",
    "received",
    "diagnosis",
    "waiting_approval",
    "approved",
    "in_progress",
    "waiting_parts",
    "ready_for_qc",
    "ready_for_delivery",
    "completed",
    "cancelled",
    "rejected",
    "on_hold",
})
SERVICE_JOB_TYPES = frozenset({"warranty_repair", "paid_repair", "direct"})
