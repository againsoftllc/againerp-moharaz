from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field

RFQ_STATUS_PATTERN = "^(draft|sent|vendor_response|quotation|approved|po_created|closed|cancelled)$"
QUOTE_STATUS_PATTERN = "^(draft|submitted|accepted|rejected)$"


class PurchaseRfqLineRead(BaseModel):
    id: str
    item_id: str
    sku: str
    name: str
    quantity: int
    sort_order: int = 0


class PurchaseRfqLineCreate(BaseModel):
    """Either item_id or sku identifies the item."""

    item_id: Optional[str] = Field(default=None, max_length=36)
    sku: Optional[str] = Field(default=None, max_length=100)
    quantity: int = Field(gt=0)


class PurchaseRfqInviteRead(BaseModel):
    supplier_id: str
    supplier_name: Optional[str] = None
    invited_at: datetime
    viewed_at: Optional[datetime] = None


class PurchaseRfqQuoteLineRead(BaseModel):
    id: str
    rfq_line_id: str
    unit_price: Decimal


class PurchaseRfqQuoteLineCreate(BaseModel):
    rfq_line_id: str = Field(min_length=1, max_length=36)
    unit_price: Decimal = Field(ge=0)


class PurchaseRfqQuoteRead(BaseModel):
    id: str
    purchase_rfq_id: str
    supplier_id: str
    supplier_name: Optional[str] = None
    quote_number: Optional[str] = None
    status: str
    valid_until: Optional[date] = None
    lead_time_days: int
    moq: int
    total_amount: Decimal
    submitted_at: Optional[datetime] = None
    source: str
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    line_quotes: List[PurchaseRfqQuoteLineRead] = []


class PurchaseRfqQuoteCreate(BaseModel):
    """Body for the staff route (`POST /purchase/rfqs/{id}/quotes`), which
    records a quote on a supplier's behalf and so must name that supplier
    explicitly. The portal's own submission route takes supplier_id from the
    authenticated identity instead and never reads it from the client."""

    supplier_id: str = Field(min_length=1, max_length=36)
    quote_number: Optional[str] = Field(default=None, max_length=64)
    valid_until: Optional[date] = None
    lead_time_days: int = Field(default=0, ge=0)
    moq: int = Field(default=0, ge=0)
    notes: Optional[str] = None
    line_quotes: List[PurchaseRfqQuoteLineCreate] = Field(min_length=1)


class PurchaseRfqQuoteUpdate(BaseModel):
    quote_number: Optional[str] = Field(default=None, max_length=64)
    valid_until: Optional[date] = None
    lead_time_days: int = Field(default=0, ge=0)
    moq: int = Field(default=0, ge=0)
    notes: Optional[str] = None
    line_quotes: List[PurchaseRfqQuoteLineCreate] = Field(min_length=1)


class PurchaseRfqQuoteStatusUpdate(BaseModel):
    status: str = Field(pattern=QUOTE_STATUS_PATTERN)


class PurchaseRfqRead(BaseModel):
    id: str
    company_id: str
    rfq_number: str
    title: str
    status: str
    deadline: Optional[date] = None
    buyer_name: Optional[str] = None
    notes: Optional[str] = None
    created_by: Optional[str] = None
    sent_at: Optional[datetime] = None
    sent_by: Optional[str] = None
    awarded_supplier_id: Optional[str] = None
    linked_po_id: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    cancelled_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    lines: List[PurchaseRfqLineRead] = []
    invited_supplier_ids: List[str] = []
    invites: List[PurchaseRfqInviteRead] = []
    quotes: List[PurchaseRfqQuoteRead] = []


class PurchaseRfqListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class PurchaseRfqListResponse(BaseModel):
    data: List[PurchaseRfqRead]
    meta: PurchaseRfqListMeta


class PurchaseRfqResponse(BaseModel):
    data: PurchaseRfqRead


class PurchaseRfqCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    deadline: Optional[date] = None
    buyer_name: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = None
    invited_supplier_ids: List[str] = Field(default_factory=list)
    lines: List[PurchaseRfqLineCreate] = Field(min_length=1)


class PurchaseRfqUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    deadline: Optional[date] = None
    buyer_name: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = None
    invited_supplier_ids: List[str] = Field(default_factory=list)
    lines: List[PurchaseRfqLineCreate] = Field(min_length=1)


class PurchaseRfqStatusUpdate(BaseModel):
    status: str = Field(pattern=RFQ_STATUS_PATTERN)
    notes: Optional[str] = None


class PurchaseRfqLinkPoRequest(BaseModel):
    po_id: str = Field(min_length=1, max_length=36)


# ------------------------------------------------------- flat quotations page


class PurchaseRfqQuoteFlatRead(PurchaseRfqQuoteRead):
    """Same shape as PurchaseRfqQuoteRead, joined with its parent RFQ's
    identifying fields, for the flattened cross-RFQ Quotations page
    (`GET /purchase/rfq-quotes`)."""

    rfq_number: str
    rfq_title: str
    rfq_status: str


class PurchaseRfqQuoteListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class PurchaseRfqQuoteListResponse(BaseModel):
    data: List[PurchaseRfqQuoteFlatRead]
    meta: PurchaseRfqQuoteListMeta
