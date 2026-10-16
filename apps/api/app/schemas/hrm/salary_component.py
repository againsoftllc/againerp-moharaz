from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SalaryComponentCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    type: str = Field(default="earning", pattern="^(earning|deduction)$")
    calculation_type: str = Field(default="fixed", pattern="^(fixed|percentage)$")
    default_amount: Decimal = Field(default=Decimal("0"), ge=Decimal("0"))
    percentage_of_basic: Optional[Decimal] = Field(
        default=None, ge=Decimal("0"), le=Decimal("100")
    )
    is_taxable: bool = True
    is_mandatory: bool = False
    status: str = Field(default="active", pattern="^(active|inactive)$")

    @model_validator(mode="after")
    def validate_calculation(self) -> SalaryComponentCreate:
        if self.calculation_type == "percentage" and self.percentage_of_basic is None:
            raise ValueError("percentage_of_basic is required when calculation_type=percentage")
        return self


class SalaryComponentUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    type: Optional[str] = Field(default=None, pattern="^(earning|deduction)$")
    calculation_type: Optional[str] = Field(
        default=None, pattern="^(fixed|percentage)$"
    )
    default_amount: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    percentage_of_basic: Optional[Decimal] = Field(
        default=None, ge=Decimal("0"), le=Decimal("100")
    )
    is_taxable: Optional[bool] = None
    is_mandatory: Optional[bool] = None
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")


class SalaryComponentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    description: Optional[str] = None
    type: str
    calculation_type: str
    default_amount: Decimal
    percentage_of_basic: Optional[Decimal] = None
    is_taxable: bool
    is_mandatory: bool
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class SalaryComponentListMeta(BaseModel):
    count: int


class SalaryComponentListResponse(BaseModel):
    data: List[SalaryComponentRead]
    meta: SalaryComponentListMeta
    errors: List[str] = []


class SalaryComponentResponse(BaseModel):
    data: SalaryComponentRead
    errors: List[str] = []
