"""RMA registers and analysis (Reports › RMA): one row shape for the four document types, unused fields stay empty."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Dict, List, Optional

from pydantic import BaseModel


class RmaRegisterRow(BaseModel):
    id: str
    doc_number: str
    doc_date: Optional[date] = None
    status: str
    status_label: str
    rma_id: Optional[str] = None
    rma_number: str = ""
    customer_name: str = ""
    customer_phone: str = ""
    supplier_name: str = ""
    product_name: str = ""
    sku: str = ""
    serial_number: str = ""
    new_serial: str = ""
    new_product: str = ""
    claim_number: str = ""
    invoice_no: str = ""
    sale_source: Optional[str] = None
    sale_source_label: Optional[str] = None
    warranty_status: Optional[str] = None
    warranty_label: Optional[str] = None
    warranty_days_left: Optional[int] = None
    problem: str = ""
    engineer: str = ""
    promised_date: Optional[date] = None
    expected_return_date: Optional[date] = None
    outcome: Optional[str] = None
    outcome_label: Optional[str] = None
    amount: Decimal = Decimal("0")
    collected: Decimal = Decimal("0")
    refund: Decimal = Decimal("0")


class RmaRegisterTotals(BaseModel):
    count: int
    amount: Decimal
    collected: Decimal
    refund: Decimal


class RmaRegisterResponse(BaseModel):
    data: List[RmaRegisterRow]
    totals: RmaRegisterTotals
    group_options: Dict[str, str]


class RmaAnalysisRow(BaseModel):
    key: str
    label: str
    count: int
    done: int
    open: int
    amount: Decimal
    collected: Decimal
    refund: Decimal


class RmaAnalysisResponse(BaseModel):
    data: List[RmaAnalysisRow]
    totals: RmaRegisterTotals
    group_by: str
    group_options: Dict[str, str]
