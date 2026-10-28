from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field

PARTY_TYPE_PATTERN = "^(customer|supplier)$"


class SettledByRef(BaseModel):
    ref: str
    amount: Decimal


class SettlementDocumentRead(BaseModel):
    id: str
    number: str
    doc_date: Optional[date] = None
    due_date: Optional[date] = None
    amount: Decimal
    paid: Decimal
    balance: Decimal
    status: str
    settled_by: List[SettledByRef] = Field(default_factory=list)


class SettlementDocumentListResponse(BaseModel):
    data: List[SettlementDocumentRead]


class SettlementLineInput(BaseModel):
    document_id: str = Field(min_length=1, max_length=36)
    # negative = take this much off the document, positive = put this much on it
    amount: Decimal


class SettlementCreate(BaseModel):
    party_type: str = Field(pattern=PARTY_TYPE_PATTERN)
    party_id: str = Field(min_length=1, max_length=36)
    settlement_date: Optional[date] = None
    note: Optional[str] = Field(default=None, max_length=1000)
    lines: List[SettlementLineInput] = Field(min_length=2)


class SettlementLineRead(BaseModel):
    document_id: str
    number: str
    amount: Decimal


class SettlementRead(BaseModel):
    id: str
    settlement_number: str
    party_type: str
    party_id: str
    party_name: Optional[str] = None
    settlement_date: date
    total: Decimal
    note: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    lines: List[SettlementLineRead] = Field(default_factory=list)


class SettlementResponse(BaseModel):
    data: SettlementRead


class SettlementListResponse(BaseModel):
    data: List[SettlementRead]


class SettledByRequest(BaseModel):
    doc_type: str = Field(pattern="^(receivable|payable)$")
    ids: List[str] = Field(default_factory=list, max_length=2000)


class SettledByResponse(BaseModel):
    data: dict[str, List[SettledByRef]]
