from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


class ChequeBookCreate(BaseModel):
    payment_account_id: str
    bank_name: str = Field(min_length=1, max_length=120)
    branch_name: Optional[str] = Field(default=None, max_length=120)
    routing_number: Optional[str] = Field(default=None, max_length=40)
    cheque_prefix: str = Field(default="", max_length=32)
    number_from: int = Field(ge=0)
    number_to: int = Field(ge=0)
    remarks: Optional[str] = None


class ChequeBookUpdate(BaseModel):
    payment_account_id: Optional[str] = None
    bank_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    branch_name: Optional[str] = Field(default=None, max_length=120)
    routing_number: Optional[str] = Field(default=None, max_length=40)
    cheque_prefix: Optional[str] = Field(default=None, max_length=32)
    number_from: Optional[int] = Field(default=None, ge=0)
    number_to: Optional[int] = Field(default=None, ge=0)
    remarks: Optional[str] = None


class ChequeBookStateRequest(BaseModel):
    state: str


class ChequeLeafVoidRequest(BaseModel):
    void: bool = True


class ChequeLeafRead(BaseModel):
    id: str
    book_id: str
    cheque_number: str
    status: str  # stored: unused | issued | void
    display_status: str  # unused | void | not_treated | cleared | bounced | cancelled
    cheque_id: Optional[str] = None
    issue_date: Optional[date] = None
    party_name: Optional[str] = None
    payment_number: Optional[str] = None
    amount: Decimal = Decimal("0")
    cheque_type: str = "issued"
    remarks: Optional[str] = None


class ChequeBookRead(BaseModel):
    id: str
    company_id: str
    book_number: str
    payment_account_id: str
    payment_account_name: Optional[str] = None
    bank_name: str
    branch_name: Optional[str] = None
    routing_number: Optional[str] = None
    cheque_prefix: str
    number_from: int
    number_to: int
    state: str
    remarks: Optional[str] = None
    leaf_count: int = 0
    unused_count: int = 0
    created_at: datetime
    updated_at: datetime


class ChequeBookDetailRead(ChequeBookRead):
    leaves: list[ChequeLeafRead] = []


class ChequeBookListResponse(BaseModel):
    data: list[ChequeBookRead]


class ChequeBookResponse(BaseModel):
    data: ChequeBookDetailRead


class ChequeBookActionResponse(BaseModel):
    data: ChequeBookDetailRead
    count: int = 0


class AvailableLeafRead(BaseModel):
    leaf_id: str
    cheque_number: str
    book_id: str
    book_number: str
    bank_name: str
    payment_account_id: str


class AvailableLeafListResponse(BaseModel):
    data: list[AvailableLeafRead]
