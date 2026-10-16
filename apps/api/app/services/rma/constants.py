"""RMA workflow constants.

Existing ticket statuses stay valid so live claims are not rewritten.
Authorization-first states (`draft` → `awaiting_return`) are additive.
"""

from __future__ import annotations

RMA_TYPES: tuple[str, ...] = ("customer", "warranty", "supplier")

RMA_STATUSES: tuple[str, ...] = (
    "draft",
    "pending_approval",
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
    "pending_approval": frozenset({"approved", "rejected"}),
    "approved": frozenset({"awaiting_return", "received"}),
    "awaiting_return": frozenset({"received"}),
    "received": frozenset({"diagnosing", "in_repair", "rejected", "on_hold"}),
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
