from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel


class AiPackageRead(BaseModel):
    id: str
    slug: str
    name: str
    price_bdt: Decimal
    included_tokens: int
    description: str

    model_config = {"from_attributes": True}


class AiPackageListResponse(BaseModel):
    data: List[AiPackageRead]


class AiOverageInvoiceRead(BaseModel):
    id: str
    period_start: date
    period_end: date
    overage_tokens: int
    amount_bdt: Decimal
    status: str
    paid_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AiPlanOverviewRead(BaseModel):
    package: AiPackageRead
    on_demand_enabled: bool
    current_period_start: date
    current_period_end: date
    tokens_used: int
    percent_used: float
    unpaid_invoice: Optional[AiOverageInvoiceRead] = None


class AiPlanOverviewResponse(BaseModel):
    data: AiPlanOverviewRead


class SelectPackageRequest(BaseModel):
    package_id: str


class SetOnDemandRequest(BaseModel):
    enabled: bool
