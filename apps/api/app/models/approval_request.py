from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import DateTime, Index, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ApprovalRequest(Base):
    """A finalizing action held for someone with the Approve permission (docs/approval.md).

    When a user without Approve on the document's module presses Finalize / Confirm / Post, the call is not run: it is
    stored here exactly as sent. An approver opens Inventory > Approve, and approving replays the stored call as the
    approver, so every rule of the real endpoint (stock, ledger, limits) still applies at that moment.
    """

    __tablename__ = "approval_requests"
    __table_args__ = (
        Index("ix_approval_requests_company_status", "company_id", "status"),
        Index("ix_approval_requests_company_group", "company_id", "group_key"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")

    # what is being approved: a key from services/core/approval_gate.ACTIONS, its menu group and display label
    action_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    group_key: Mapped[str] = mapped_column(String(32), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    reference: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    party: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    entity_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    # the record whose own drawer the Approve screen opens (sales_order, quotation, sales_return, purchase_receipt,
    # purchase_return, stock_adjustment, stock_transfer, customer, supplier, rma_ticket); none = no drawer for it
    target_kind: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    target_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    # the held call, replayed on approval
    http_method: Mapped[str] = mapped_column(String(8), nullable=False)
    http_path: Mapped[str] = mapped_column(String(512), nullable=False)
    query_string: Mapped[str] = mapped_column(Text, nullable=False, default="")
    body_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # pending -> approving -> approved | rejected | cancelled   (a failed replay goes back to pending with last_error)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending", index=True)

    requested_by: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    requested_by_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    requested_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    decided_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    decided_by_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    decision_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    result_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
