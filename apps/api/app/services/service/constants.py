"""Service job-card lifecycle — centralized so UI and API share one map."""

from __future__ import annotations

JOB_TYPES = frozenset({"warranty_repair", "paid_repair", "direct"})

JOB_STATUSES = frozenset(
    {
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
    }
)

JOB_STATUS_TRANSITIONS: dict[str, tuple[str, ...]] = {
    "draft": ("received", "cancelled"),
    "received": ("diagnosis", "in_progress", "cancelled", "on_hold"),
    "diagnosis": ("waiting_approval", "approved", "in_progress", "cancelled", "on_hold"),
    "waiting_approval": ("approved", "rejected", "cancelled", "on_hold"),
    "approved": ("in_progress", "cancelled", "on_hold"),
    "in_progress": ("waiting_parts", "ready_for_qc", "completed", "on_hold", "cancelled"),
    "waiting_parts": ("in_progress", "on_hold", "cancelled"),
    "ready_for_qc": ("ready_for_delivery", "in_progress", "on_hold"),
    "ready_for_delivery": ("completed", "in_progress"),
    "on_hold": ("received", "diagnosis", "in_progress", "cancelled"),
    "rejected": ("cancelled", "received"),
    "completed": (),
    "cancelled": (),
}

LINE_KINDS = frozenset({"service", "part", "custom"})
DIAGNOSIS_STATUSES = frozenset({"pending", "completed"})
APPROVAL_STATUSES = frozenset({"not_required", "pending", "approved", "rejected"})
QC_STATUSES = frozenset({"not_required", "pending", "passed", "failed"})
PRIORITIES = frozenset({"low", "normal", "high", "urgent"})

JOB_STATUS_LABEL = {
    "draft": "Draft",
    "received": "Received",
    "diagnosis": "Diagnosis",
    "waiting_approval": "Waiting approval",
    "approved": "Approved",
    "in_progress": "In progress",
    "waiting_parts": "Waiting for parts",
    "ready_for_qc": "Ready for QC",
    "ready_for_delivery": "Ready for delivery",
    "completed": "Completed",
    "cancelled": "Cancelled",
    "rejected": "Rejected",
    "on_hold": "On hold",
}
