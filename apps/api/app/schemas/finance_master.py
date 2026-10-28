from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field


class BankBranchRead(BaseModel):
    id: str
    bank_id: str
    name: str
    routing_number: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    is_active: bool


class BankRead(BaseModel):
    id: str
    name: str
    short_name: Optional[str] = None
    swift_code: Optional[str] = None
    is_active: bool
    branches: List[BankBranchRead] = Field(default_factory=list)
    account_count: int = 0  # the company's own bank accounts at this bank


class BankListResponse(BaseModel):
    data: List[BankRead]


class BankResponse(BaseModel):
    data: BankRead


class BankSave(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)
    short_name: Optional[str] = Field(default=None, max_length=40)
    swift_code: Optional[str] = Field(default=None, max_length=20)
    is_active: Optional[bool] = None


class BankBranchSave(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)
    routing_number: Optional[str] = Field(default=None, max_length=20)
    address: Optional[str] = None
    phone: Optional[str] = Field(default=None, max_length=40)
    is_active: Optional[bool] = None


class OpeningLineInput(BaseModel):
    account_id: str = Field(min_length=1, max_length=36)
    debit: Decimal = Field(default=Decimal("0"), ge=0)
    credit: Decimal = Field(default=Decimal("0"), ge=0)
    cost_center_id: Optional[str] = Field(default=None, max_length=36)
    description: Optional[str] = Field(default=None, max_length=255)


class OpeningBatchSave(BaseModel):
    as_of_date: date
    note: Optional[str] = Field(default=None, max_length=1000)
    lines: List[OpeningLineInput] = Field(default_factory=list)


class OpeningLineRead(BaseModel):
    id: str
    account_id: str
    account_code: Optional[str] = None
    account_name: Optional[str] = None
    debit: Decimal
    credit: Decimal
    cost_center_id: Optional[str] = None
    description: Optional[str] = None


class OpeningBatchRead(BaseModel):
    id: str
    as_of_date: date
    note: Optional[str] = None
    status: str
    total_debit: Decimal
    total_credit: Decimal
    difference: Decimal  # debit − credit: posted to Opening Balance Equity on finalize
    journal_entry_id: Optional[str] = None
    journal_entry_number: Optional[str] = None
    created_by: Optional[str] = None
    finalized_by: Optional[str] = None
    finalized_at: Optional[datetime] = None
    created_at: datetime
    lines: List[OpeningLineRead] = Field(default_factory=list)


class OpeningBatchResponse(BaseModel):
    data: OpeningBatchRead


class OpeningBatchListResponse(BaseModel):
    data: List[OpeningBatchRead]
    # GL code → where that head's opening comes from instead (not offered in a batch)
    restricted: dict[str, str] = Field(default_factory=dict)
