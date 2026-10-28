from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class FinanceAccountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    code: str
    name: str
    account_type: str
    parent_id: Optional[str] = None
    parent_code: Optional[str] = None
    is_system: bool
    is_active: bool
    is_postable: bool = True
    nature: str = "debit"
    debit: Decimal = Decimal("0")
    credit: Decimal = Decimal("0")
    balance: Decimal = Decimal("0")
    balance_side: str = "debit"
    depth: int = 0


class FinanceAccountCreate(BaseModel):
    code: str = Field(min_length=1, max_length=16)
    name: str = Field(min_length=1, max_length=120)
    account_type: str
    parent_id: Optional[str] = None
    is_postable: bool = True


class FinanceAccountUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    account_type: Optional[str] = None
    parent_id: Optional[str] = None
    is_active: Optional[bool] = None
    is_postable: Optional[bool] = None


class FinanceAccountResponse(BaseModel):
    data: FinanceAccountRead


class FinancePaymentAccountRead(BaseModel):
    id: str
    company_id: str
    name: str
    kind: str
    gl_account_id: str
    gl_account_code: Optional[str] = None
    gl_account_name: Optional[str] = None
    opening_balance: Decimal
    balance: Decimal
    is_active: bool
    is_default: bool
    created_at: datetime
    check_balance: bool = False
    bank_branch_id: Optional[str] = None
    bank_label: Optional[str] = None  # "Bank · Branch"
    account_number: Optional[str] = None
    account_title: Optional[str] = None


class FinancePaymentAccountCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: str = "cash"
    opening_balance: Decimal = Decimal("0")
    is_default: bool = False
    check_balance: bool = False
    bank_branch_id: Optional[str] = None
    account_number: Optional[str] = Field(default=None, max_length=40)
    account_title: Optional[str] = Field(default=None, max_length=120)


class FinancePaymentAccountUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None
    check_balance: Optional[bool] = None
    bank_branch_id: Optional[str] = None
    account_number: Optional[str] = Field(default=None, max_length=40)
    account_title: Optional[str] = Field(default=None, max_length=120)


class FinancePaymentAccountTransferRequest(BaseModel):
    from_account_id: str
    to_account_id: str
    amount: Decimal = Field(gt=0)
    payment_date: Optional[date] = None
    reference: Optional[str] = Field(default=None, max_length=64)
    notes: Optional[str] = None


class FinancePaymentAccountListResponse(BaseModel):
    data: list[FinancePaymentAccountRead]


class FinancePaymentAccountResponse(BaseModel):
    data: FinancePaymentAccountRead


class FinanceSettlementRequest(BaseModel):
    amount: Decimal = Field(gt=0)
    payment_account_id: Optional[str] = None
    payment_date: Optional[date] = None
    reference: Optional[str] = None
    notes: Optional[str] = None


class FinanceJournalLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    account_id: str
    account_code: Optional[str] = None
    account_name: Optional[str] = None
    debit: Decimal
    credit: Decimal
    description: Optional[str] = None
    party_type: Optional[str] = None
    party_id: Optional[str] = None
    tax_amount: Decimal
    cost_center_id: Optional[str] = None
    cost_center_code: Optional[str] = None
    cost_center_name: Optional[str] = None


class FinanceJournalEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    entry_number: str
    entry_date: date
    description: str
    source_type: str
    source_id: str
    status: str
    created_at: datetime
    lines: list[FinanceJournalLineRead] = []
    debit_total: Decimal = Decimal("0")
    credit_total: Decimal = Decimal("0")


class FinanceJournalListMeta(BaseModel):
    total: int
    limit: int
    offset: int


class FinanceJournalListResponse(BaseModel):
    data: list[FinanceJournalEntryRead]
    meta: FinanceJournalListMeta


class FinancePaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    payment_number: str
    payment_date: date
    amount: Decimal
    payment_method: str
    payment_account_id: Optional[str] = None
    payment_account_name: Optional[str] = None
    direction: str
    source_type: str
    source_id: str
    party_type: Optional[str] = None
    party_id: Optional[str] = None
    party_name: Optional[str] = None
    is_transfer: bool = False
    reference: Optional[str] = None
    project_id: Optional[str] = None
    created_at: datetime


class FinanceReceivableRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    customer_id: str
    customer_name: Optional[str] = None
    source_type: str
    source_id: str
    invoice_number: str
    amount: Decimal
    amount_paid: Decimal
    balance: Decimal
    tax_amount: Decimal
    due_date: Optional[date] = None
    status: str
    journal_entry_id: Optional[str] = None
    posting_status: Optional[str] = None
    posting_error: Optional[str] = None
    project_id: Optional[str] = None
    created_at: datetime


class FinancePayableRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    supplier_id: str
    supplier_name: Optional[str] = None
    source_type: str
    source_id: str
    reference_number: str
    amount: Decimal
    amount_paid: Decimal
    balance: Decimal
    tax_amount: Decimal
    due_date: Optional[date] = None
    status: str
    journal_entry_id: Optional[str] = None
    posting_status: Optional[str] = None
    posting_error: Optional[str] = None
    created_at: datetime


class FinanceTaxSummaryRead(BaseModel):
    output_tax_total: Decimal
    input_tax_total: Decimal
    net_tax_payable: Decimal


class FinanceDashboardRead(BaseModel):
    receivable_balance: Decimal
    payable_balance: Decimal
    payments_inbound_total: Decimal
    journal_entry_count: int
    account_count: int
    unposted_receivable_count: int = 0
    failed_posting_count: int = 0
    unposted_payable_count: int = 0
    tax_summary: FinanceTaxSummaryRead
    payment_accounts: list[FinancePaymentAccountRead]
    recent_receivables: list[FinanceReceivableRead]
    recent_payables: list[FinancePayableRead]
    recent_payments: list[FinancePaymentRead]


class FinanceAccountListResponse(BaseModel):
    data: list[FinanceAccountRead]


class FinanceListMeta(BaseModel):
    total: int
    limit: int
    offset: int


class FinanceJournalEntryResponse(BaseModel):
    data: FinanceJournalEntryRead


class FinancePaymentListResponse(BaseModel):
    data: list[FinancePaymentRead]
    meta: FinanceListMeta


class FinanceReceivableListResponse(BaseModel):
    data: list[FinanceReceivableRead]
    meta: FinanceListMeta


class FinancePayableListResponse(BaseModel):
    data: list[FinancePayableRead]
    meta: FinanceListMeta


class FinancePayableResponse(BaseModel):
    data: FinancePayableRead


class FinancePayableFromPurchaseRequest(BaseModel):
    company_id: str = "default"
    supplier_id: str = Field(min_length=1, max_length=36)
    reference_number: str = Field(min_length=1, max_length=64)
    amount: Decimal = Field(gt=0)
    tax_amount: Decimal = Field(default=Decimal("0"), ge=0)
    due_date: Optional[date] = None
    source_type: str = Field(pattern="^(vendor_bill|purchase_return)$")
    source_id: str = Field(min_length=1, max_length=36)
    description: Optional[str] = None
    credit: bool = False


class FinanceDashboardResponse(BaseModel):
    data: FinanceDashboardRead


class FinanceTaxSummaryResponse(BaseModel):
    data: FinanceTaxSummaryRead


# ── Expenses ─────────────────────────────────────────────────────────────────


class FinanceExpenseCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    company_id: str = "default"


class FinanceExpenseCategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    is_active: Optional[bool] = None


class FinanceExpenseCategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    is_active: bool
    created_at: datetime


class FinanceExpenseCategoryListResponse(BaseModel):
    data: list[FinanceExpenseCategoryRead]


class FinanceExpenseCreate(BaseModel):
    company_id: str = "default"
    category_id: str
    payee: str = Field(min_length=1, max_length=120)
    description: str = ""
    expense_date: date
    amount: Decimal = Field(ge=0)
    tax_amount: Decimal = Field(default=Decimal("0"), ge=0)
    payment_method: str = "cash"
    payment_account_id: Optional[str] = None
    reference: Optional[str] = None
    notes: Optional[str] = None
    account_id: Optional[str] = None
    allocation_rule_id: Optional[str] = None
    override_lines: Optional[list["FinanceAllocationOverrideLine"]] = None
    party_id: Optional[str] = None


class FinanceExpenseUpdate(BaseModel):
    category_id: Optional[str] = None
    payee: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = None
    expense_date: Optional[date] = None
    amount: Optional[Decimal] = Field(default=None, ge=0)
    tax_amount: Optional[Decimal] = Field(default=None, ge=0)
    payment_method: Optional[str] = None
    payment_account_id: Optional[str] = None
    reference: Optional[str] = None
    notes: Optional[str] = None
    account_id: Optional[str] = None
    allocation_rule_id: Optional[str] = None
    override_lines: Optional[list["FinanceAllocationOverrideLine"]] = None
    party_id: Optional[str] = None


class FinanceExpenseRejectRequest(BaseModel):
    note: Optional[str] = None


class FinanceExpensePayRequest(BaseModel):
    payment_method: str = "cash"
    payment_account_id: Optional[str] = None
    payment_date: Optional[date] = None
    reference: Optional[str] = None


class FinanceExpenseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    expense_number: str
    category_id: str
    category_name: Optional[str] = None
    payee: str
    description: str
    expense_date: date
    amount: Decimal
    tax_amount: Decimal
    total: Decimal
    payment_method: str
    payment_account_id: Optional[str] = None
    payment_account_name: Optional[str] = None
    status: str
    reference: Optional[str] = None
    notes: Optional[str] = None
    journal_entry_id: Optional[str] = None
    payment_id: Optional[str] = None
    created_by: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    account_id: Optional[str] = None
    account_code: Optional[str] = None
    account_name: Optional[str] = None
    allocation_rule_id: Optional[str] = None
    allocation_rule_name: Optional[str] = None
    allocation_method: Optional[str] = None
    allocation_json: Optional[Any] = None
    allocation_overridden: bool = False
    project_id: Optional[str] = None
    party_id: Optional[str] = None
    party_name: Optional[str] = None


class FinanceExpenseListMeta(BaseModel):
    total: int
    limit: int
    offset: int


class FinanceExpenseListResponse(BaseModel):
    data: list[FinanceExpenseRead]
    meta: FinanceExpenseListMeta


class FinanceExpenseResponse(BaseModel):
    data: FinanceExpenseRead


class FinanceExpenseCategoryTotal(BaseModel):
    category_id: str
    category_name: str
    total: Decimal


class FinanceExpenseSummaryRead(BaseModel):
    month_total: Decimal
    month_paid_total: Decimal
    pending_count: int
    pending_amount: Decimal
    by_category: list[FinanceExpenseCategoryTotal]


class FinanceExpenseSummaryResponse(BaseModel):
    data: FinanceExpenseSummaryRead


class FinanceSourceTypeRead(BaseModel):
    value: str
    label: str


class FinanceSourceTypeListResponse(BaseModel):
    data: list[FinanceSourceTypeRead]


class FinancePostingRetryRequest(BaseModel):
    source_type: str
    source_id: str
    company_id: str = "default"


class FinancePostingHealthItem(BaseModel):
    id: str
    source_type: str
    source_id: str
    invoice_number: str
    posting_status: Optional[str] = None
    posting_error: Optional[str] = None
    journal_entry_id: Optional[str] = None


class FinancePostingHealthRead(BaseModel):
    unposted_receivable_count: int
    failed_posting_count: int
    unposted_payable_count: int
    items: list[FinancePostingHealthItem]


class FinancePostingHealthResponse(BaseModel):
    data: FinancePostingHealthRead


class FinanceReportPeriod(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    date_from: str = Field(validation_alias="from", serialization_alias="from")
    date_to: str = Field(validation_alias="to", serialization_alias="to")


class FinanceReportMeta(BaseModel):
    company_id: str
    generated_at: str


class FinanceReportIntegrity(BaseModel):
    ok: bool
    warning: Optional[str] = None


class FinanceReportResponse(BaseModel):
    filters: dict[str, Any]
    period: FinanceReportPeriod
    rows: list[Any]
    totals: dict[str, Any]
    meta: FinanceReportMeta
    integrity: Optional[FinanceReportIntegrity] = None


class FinanceCostCenterCreate(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=120)
    kind: str = "concern"
    branch_id: Optional[str] = None
    department_id: Optional[str] = None


class FinanceCostCenterUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    kind: Optional[str] = None
    branch_id: Optional[str] = None
    department_id: Optional[str] = None
    is_active: Optional[bool] = None


class FinanceCostCenterRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    code: str
    name: str
    kind: str
    branch_id: Optional[str] = None
    department_id: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class FinanceCostCenterListResponse(BaseModel):
    data: list[FinanceCostCenterRead]


class FinanceCostCenterResponse(BaseModel):
    data: FinanceCostCenterRead


class FinanceAllocationRuleLineInput(BaseModel):
    cost_center_id: str
    basis_value: Decimal = Decimal("0")
    percentage: Decimal = Decimal("0")
    fixed_amount: Decimal = Decimal("0")


class FinanceAllocationRuleLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    cost_center_id: str
    cost_center_code: Optional[str] = None
    cost_center_name: Optional[str] = None
    basis_value: Decimal
    percentage: Decimal
    fixed_amount: Decimal


class FinanceAllocationRuleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    account_id: Optional[str] = None
    method: str = "quantity"
    unit_label: str = ""
    is_active: bool = True
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    notes: Optional[str] = None
    lines: list[FinanceAllocationRuleLineInput] = Field(min_length=1)


class FinanceAllocationRuleUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    account_id: Optional[str] = None
    method: Optional[str] = None
    unit_label: Optional[str] = None
    is_active: Optional[bool] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    notes: Optional[str] = None
    lines: Optional[list[FinanceAllocationRuleLineInput]] = None


class FinanceAllocationRuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    account_id: Optional[str] = None
    account_code: Optional[str] = None
    account_name: Optional[str] = None
    method: str
    unit_label: str
    is_active: bool
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    lines: list[FinanceAllocationRuleLineRead] = []


class FinanceAllocationRuleListResponse(BaseModel):
    data: list[FinanceAllocationRuleRead]


class FinanceAllocationRuleResponse(BaseModel):
    data: FinanceAllocationRuleRead


class FinanceAllocationOverrideLine(BaseModel):
    cost_center_id: str
    amount: Decimal
    basis_value: Optional[Decimal] = None


class FinanceAllocationPreviewRequest(BaseModel):
    amount: Decimal = Field(gt=0)
    override_lines: Optional[list[FinanceAllocationOverrideLine]] = None


class FinanceAllocationPreviewResponse(BaseModel):
    data: dict[str, Any]


class PartnerTradingRead(BaseModel):
    purchase_total: Decimal = Decimal("0")
    sales_total: Decimal = Decimal("0")
    purchase_profit: Decimal = Decimal("0")
    sales_profit: Decimal = Decimal("0")


class PartnerTradingResponse(BaseModel):
    data: PartnerTradingRead


# ── Cheques ──────────────────────────────────────────────────────────────


class FinanceChequeCreate(BaseModel):
    direction: str
    party_id: str
    # left out when the cheque is taken from a cheque book leaf (the leaf gives the number and the book's bank)
    bank_name: str = Field(default="", max_length=120)
    cheque_number: str = Field(default="", max_length=64)
    cheque_leaf_id: Optional[str] = None
    cheque_date: date
    amount: Decimal = Field(gt=0)
    receivable_id: Optional[str] = None
    payable_id: Optional[str] = None
    notes: Optional[str] = None


class FinanceChequeUpdate(BaseModel):
    bank_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    cheque_number: Optional[str] = Field(default=None, min_length=1, max_length=64)
    cheque_date: Optional[date] = None
    notes: Optional[str] = None


class FinanceChequeActionRequest(BaseModel):
    action: str
    action_date: Optional[date] = None
    payment_account_id: Optional[str] = None
    bank_charge: Decimal = Field(default=Decimal("0"), ge=0)
    note: Optional[str] = None


class FinanceChequeEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    action: str
    from_status: Optional[str] = None
    to_status: str
    event_date: date
    journal_entry_id: Optional[str] = None
    actor: Optional[str] = None
    note: Optional[str] = None
    created_at: datetime


class FinanceChequeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    direction: str
    cheque_number: str
    bank_name: str
    cheque_date: date
    amount: Decimal
    status: str
    party_type: str
    party_id: str
    party_name: Optional[str] = None
    receivable_id: Optional[str] = None
    payable_id: Optional[str] = None
    document_number: Optional[str] = None
    payment_account_id: Optional[str] = None
    payment_account_name: Optional[str] = None
    bank_charge: Decimal = Decimal("0")
    notes: Optional[str] = None
    available_actions: list[str] = []
    last_action_date: Optional[date] = None
    bounce_count: int = 0
    created_at: datetime
    updated_at: datetime


class FinanceChequeBulkActionRequest(BaseModel):
    cheque_ids: list[str] = Field(min_length=1, max_length=200)
    action: str
    action_date: Optional[date] = None
    payment_account_id: Optional[str] = None
    note: Optional[str] = None


class FinanceChequeBulkResult(BaseModel):
    id: str
    cheque_number: Optional[str] = None
    ok: bool
    status: Optional[str] = None
    error: Optional[str] = None


class FinanceChequeBulkResponse(BaseModel):
    data: list[FinanceChequeBulkResult]
    succeeded: int
    failed: int


class FinanceChequeDetailRead(FinanceChequeRead):
    events: list[FinanceChequeEventRead] = []
    journal_entries: list[FinanceJournalEntryRead] = []


class FinanceChequeListResponse(BaseModel):
    data: list[FinanceChequeRead]
    meta: FinanceListMeta


class FinanceChequeResponse(BaseModel):
    data: FinanceChequeDetailRead
