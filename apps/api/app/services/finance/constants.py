"""Finance foundation constants — not a full accounting module."""

from typing import Optional

ACCOUNT_TYPES = ("asset", "liability", "equity", "revenue", "expense")
DEBIT_NORMAL_TYPES = ("asset", "expense")
CREDIT_NORMAL_TYPES = ("liability", "equity", "revenue")

# Central journal / AR / AP / payment source types. UI and API share this list.
SOURCE_TYPES = (
    "sales_order",
    "sales_return",
    "purchase_receipt",
    "purchase_document",
    "vendor_bill",
    "purchase_return",
    "pos_payment",
    "pos_cart",
    "pos_return",
    "pos_cash_movement",
    "expense",
    "receivable_settlement",
    "payable_settlement",
    "service_job",
    "rma",
    "commerce_order",
    "manual",
    "payment_transfer",
    "cheque_receipt",
    "cheque_deposit",
    "cheque_clearance",
    "cheque_reversal",
    "cheque_bank_charge",
)

SOURCE_TYPE_LABELS = {
    "sales_order": "Sales order",
    "sales_return": "Sales return",
    "purchase_receipt": "Purchase receipt",
    "purchase_document": "Purchase document",
    "vendor_bill": "Vendor bill",
    "purchase_return": "Purchase return",
    "pos_payment": "POS payment",
    "pos_cart": "POS cart",
    "pos_return": "POS return",
    "pos_cash_movement": "POS cash movement",
    "expense": "Expense",
    "receivable_settlement": "Receivable settlement",
    "sales_order_payment": "Sales payment",
    "sales_order_refund": "Sales refund",
    "receivable_adjustment": "Invoice adjustment",
    "receivable_void": "Invoice voided",
    "payable_settlement": "Payable settlement",
    "service_job": "Service job",
    "rma": "RMA",
    "commerce_order": "Commerce order",
    "manual": "Manual",
    "payment_transfer": "Payment transfer",
    "cheque_receipt": "Cheque recorded",
    "cheque_deposit": "Cheque deposited",
    "cheque_clearance": "Cheque cleared",
    "cheque_reversal": "Cheque reversal",
    "cheque_bank_charge": "Cheque bank charge",
}

OUTPUT_TAX_CODE = "2210"
INPUT_TAX_CODE = "1310"
RETAINED_EARNINGS_CODE = "3000"
AR_CODE = "1100"
CHEQUES_IN_HAND_CODE = "1150"
CHEQUES_UNDER_COLLECTION_CODE = "1160"
CHEQUES_ISSUED_CODE = "2150"
BANK_CHARGES_CODE = "6170"
CUSTOMER_ADVANCES_CODE = "2200"
SUPPLIER_ADVANCES_CODE = "1400"
AP_CODE = "2100"
REVENUE_CODE = "4000"
COGS_CODE = "5000"
OPEX_CODE = "6000"

# Contra accounts keep their type band but flip normal balance (accum. dep., drawings, sales returns).
CONTRA_NORMAL_BALANCE = {
    "1510": "credit",
    "3020": "debit",
    "4200": "debit",
    "4210": "debit",
}

DEFAULT_ACCOUNTS = (
    {"code": "1000", "name": "Cash", "account_type": "asset"},
    {"code": "1010", "name": "Bank", "account_type": "asset"},
    {"code": "1020", "name": "Mobile Wallet", "account_type": "asset"},
    {"code": "1100", "name": "Accounts Receivable", "account_type": "asset"},
    {"code": "1150", "name": "Cheques in Hand", "account_type": "asset"},
    {"code": "1160", "name": "Cheques Under Collection", "account_type": "asset"},
    {"code": "1200", "name": "Inventory", "account_type": "asset"},
    {"code": "1300", "name": "Prepaid Expenses", "account_type": "asset"},
    {"code": "1310", "name": "Input Tax", "account_type": "asset"},
    {"code": "1400", "name": "Advances to Suppliers", "account_type": "asset"},
    {"code": "1500", "name": "Furniture & Equipment", "account_type": "asset"},
    {"code": "1510", "name": "Accumulated Depreciation", "account_type": "asset", "parent_code": "1500", "normal_balance": "credit"},
    {"code": "2100", "name": "Accounts Payable", "account_type": "liability"},
    {"code": "2150", "name": "Cheques Issued (Payable)", "account_type": "liability"},
    {"code": "2200", "name": "Customer Advances", "account_type": "liability"},
    {"code": "2210", "name": "Output Tax Payable", "account_type": "liability"},
    {"code": "2300", "name": "Accrued Expenses", "account_type": "liability"},
    {"code": "3000", "name": "Retained Earnings", "account_type": "equity"},
    {"code": "3010", "name": "Owner's Capital", "account_type": "equity"},
    {"code": "3020", "name": "Drawings", "account_type": "equity", "normal_balance": "debit"},
    {"code": "4000", "name": "Sales Revenue", "account_type": "revenue"},
    {"code": "4100", "name": "Other Income", "account_type": "revenue"},
    {"code": "4110", "name": "Discount Received", "account_type": "revenue", "parent_code": "4100"},
    {"code": "4200", "name": "Sales Returns", "account_type": "revenue", "parent_code": "4000", "normal_balance": "debit"},
    {"code": "4210", "name": "Discount Allowed", "account_type": "revenue", "parent_code": "4000", "normal_balance": "debit"},
    {"code": "5000", "name": "Cost of Goods Sold", "account_type": "expense"},
    {"code": "6000", "name": "Operating Expenses", "account_type": "expense"},
    {"code": "6100", "name": "Admin Cost", "account_type": "expense", "parent_code": "6000"},
    {"code": "6110", "name": "Electricity Bill", "account_type": "expense", "parent_code": "6100"},
    {"code": "6120", "name": "Rent", "account_type": "expense", "parent_code": "6100"},
    {"code": "6130", "name": "Salaries", "account_type": "expense", "parent_code": "6000"},
    {"code": "6140", "name": "Office Supplies", "account_type": "expense", "parent_code": "6100"},
    {"code": "6150", "name": "Marketing", "account_type": "expense", "parent_code": "6000"},
    {"code": "6160", "name": "Travel", "account_type": "expense", "parent_code": "6000"},
    {"code": "6170", "name": "Bank Charges", "account_type": "expense", "parent_code": "6000"},
    {"code": "6200", "name": "Depreciation Expense", "account_type": "expense", "parent_code": "6000"},
)


# Odoo-style Balance Sheet layout. Accounts are grouped into these buckets by code band
# (see balance_sheet_bucket); the report renders section → group → bucket → accounts.
BALANCE_SHEET_BUCKET_LABELS = {
    "bank_cash": "Bank and Cash Accounts",
    "receivables": "Receivables",
    "current_assets": "Current Assets",
    "prepayments": "Prepayments",
    "fixed_assets": "Fixed Assets",
    "non_current_assets": "Non-current Assets",
    "current_liabilities": "Current Liabilities",
    "credit_card": "Credit Card",
    "payables": "Payables",
    "non_current_liabilities": "Non-current Liabilities",
    "equity": "Equity",
    "current_year_earnings": "Current Year Unallocated Earnings",
    "previous_years_earnings": "Previous Years Earnings",
}


def _code_int(code: Optional[str]) -> Optional[int]:
    if not code:
        return None
    digits = "".join(ch for ch in str(code) if ch.isdigit())
    return int(digits[:4]) if digits else None


def balance_sheet_bucket(account_type: str, code: Optional[str] = None) -> Optional[str]:
    """Map an account to its Balance Sheet bucket by type + code band. None for P&L accounts."""
    n = _code_int(code)
    if account_type == "asset":
        if n is None:
            return "current_assets"
        if 1000 <= n <= 1099:
            return "bank_cash"
        if 1100 <= n <= 1199:
            return "receivables"
        if 1300 <= n <= 1309:
            return "prepayments"
        if 1500 <= n <= 1799:
            return "fixed_assets"
        if 1800 <= n <= 1999:
            return "non_current_assets"
        return "current_assets"
    if account_type == "liability":
        if n is None:
            return "current_liabilities"
        if 2000 <= n <= 2099:
            return "credit_card"
        if 2100 <= n <= 2199:
            return "payables"
        if 2500 <= n <= 2999:
            return "non_current_liabilities"
        return "current_liabilities"
    if account_type == "equity":
        if code == RETAINED_EARNINGS_CODE:
            return "previous_years_earnings"
        return "equity"
    return None


# Odoo-style Profit and Loss layout (Odoo 18): Revenue, Costs of Revenue → Gross Profit,
# Operating Expenses → Operating Income (or Loss), Other Income / Other Expenses → Net Profit,
# Allocations and Withdrawals → Net Profit Left After Allocations and Withdrawals.
PNL_BUCKET_LABELS = {
    "revenue": "Revenue",
    "costs_of_revenue": "Costs of Revenue",
    "operating_expenses": "Operating Expenses",
    "other_income": "Other Income",
    "other_expenses": "Other Expenses",
    "allocations": "Allocations and Withdrawals",
}


def profit_loss_bucket(account_type: str, code: Optional[str] = None) -> Optional[str]:
    """Map an account to its P&L bucket by type + code band. None for balance-sheet accounts."""
    n = _code_int(code)
    if account_type == "revenue":
        return "other_income" if n is not None and 4100 <= n <= 4199 else "revenue"
    if account_type == "expense":
        if n is None or 6000 <= n <= 6999:
            return "operating_expenses"
        if 5000 <= n <= 5999:
            return "costs_of_revenue"
        return "other_expenses"
    if account_type == "equity" and account_normal_balance(account_type, code) == "debit":
        # Drawings / dividends: money taken out of the business in the period.
        return "allocations"
    return None


# Odoo-style Cash Flow Statement: opening band, "Net increase" with operating / investing /
# financing / unclassified groups (each cash in / cash out), closing band.
CASH_FLOW_GROUP_LABELS = {
    "operating": "Cash flows from operating activities",
    "investing": "Cash flows from investing & extraordinary activities",
    "financing": "Cash flows from financing activities",
    "unclassified": "Cash flows from unclassified activities",
}
CASH_FLOW_LINE_LABELS = {
    "operating_advance_in": "Advance Payments received from customers",
    "operating_in": "Cash received from operating activities",
    "operating_advance_out": "Advance payments made to suppliers",
    "operating_out": "Cash paid for operating activities",
    "investing_in": "Cash in",
    "investing_out": "Cash out",
    "financing_in": "Cash in",
    "financing_out": "Cash out",
    "unclassified_in": "Cash in",
    "unclassified_out": "Cash out",
}
CASH_FLOW_GROUP_LINES = {
    "operating": ("operating_advance_in", "operating_in", "operating_advance_out", "operating_out"),
    "investing": ("investing_in", "investing_out"),
    "financing": ("financing_in", "financing_out"),
    "unclassified": ("unclassified_in", "unclassified_out"),
}
CUSTOMER_CASH_SOURCES = frozenset(
    {"receivable_settlement", "pos_payment", "pos_cart", "sales_order", "commerce_order", "customer_payment", "service_job", "rma", "purchase_return"}
)
SUPPLIER_CASH_SOURCES = frozenset(
    {"payable_settlement", "vendor_bill", "purchase_receipt", "purchase_document", "supplier_payment", "expense", "sales_return", "pos_return"}
)


def cash_flow_line(
    direction: str,
    source_type: Optional[str] = None,
    party_type: Optional[str] = None,
    counter_code: Optional[str] = None,
    counter_type: Optional[str] = None,
) -> str:
    """Classify one payment into a Cash Flow Statement line.

    Posted payments are classified by the journal counter account (fixed assets → investing,
    loans / equity → financing, customer advances / supplier advances → advance lines, anything
    else → operating). Unposted payments fall back to source type / party type; a manual payment
    with no party is unclassified.
    """
    inbound = direction == "inbound"
    n = _code_int(counter_code)
    if counter_type:
        if counter_type == "asset" and n is not None and 1500 <= n <= 1999:
            return "investing_in" if inbound else "investing_out"
        if counter_type == "equity" or (counter_type == "liability" and n is not None and 2500 <= n <= 2999):
            return "financing_in" if inbound else "financing_out"
        if inbound and counter_type == "liability" and n is not None and 2200 <= n <= 2209:
            return "operating_advance_in"
        if not inbound and counter_type == "asset" and n is not None and 1400 <= n <= 1499:
            return "operating_advance_out"
        return "operating_in" if inbound else "operating_out"
    if inbound and (source_type in CUSTOMER_CASH_SOURCES or party_type == "customer"):
        return "operating_in"
    if not inbound and (source_type in SUPPLIER_CASH_SOURCES or party_type in ("supplier", "vendor")):
        return "operating_out"
    return "unclassified_in" if inbound else "unclassified_out"


def account_normal_balance(account_type: str, code: Optional[str] = None, override: Optional[str] = None) -> str:
    if override in ("debit", "credit"):
        return override
    if code and code in CONTRA_NORMAL_BALANCE:
        return CONTRA_NORMAL_BALANCE[code]
    return "debit" if account_type in DEBIT_NORMAL_TYPES else "credit"


RECEIVABLE_STATUSES = ("open", "partial", "paid", "void")
PAYABLE_STATUSES = ("open", "partial", "paid", "void")
PAYMENT_DIRECTIONS = ("inbound", "outbound")
POSTING_STATUSES = ("pending", "posted", "failed")

PAYMENT_ACCOUNT_KINDS = ("cash", "bank", "mobile_wallet", "card", "other")

# name, kind, GL code it posts to, whether it's the account new payments default to
DEFAULT_PAYMENT_ACCOUNTS = (
    {"name": "Cash", "kind": "cash", "gl_code": "1000", "is_default": True},
    {"name": "Bank", "kind": "bank", "gl_code": "1010", "is_default": False},
    {"name": "Mobile Banking", "kind": "mobile_wallet", "gl_code": "1020", "is_default": False},
)

PAYMENT_ACCOUNT_KIND_TO_GL_CODE = {
    "cash": "1000",
    "bank": "1010",
    "card": "1010",
    "mobile_wallet": "1020",
    "other": "1000",
}

# Maps the free-text payment_method values already flowing in from POS/expense
# forms to the payment-account kind that should hold that money.
PAYMENT_METHOD_TO_ACCOUNT_KIND = {
    "cash": "cash",
    "card": "bank",
    "bank": "bank",
    "bank_transfer": "bank",
    "mobile_banking": "mobile_wallet",
    "mobile_wallet": "mobile_wallet",
    "bkash": "mobile_wallet",
    "nagad": "mobile_wallet",
    "store_credit": "cash",
    "split": "cash",
    "other": "cash",
}

EXPENSE_STATUSES = ("draft", "approved", "paid", "rejected")
EXPENSE_ACCOUNT_CODE = "6000"
ALLOCATION_METHODS = ("percentage", "fixed", "quantity", "equal")

DEFAULT_COST_CENTERS = (
    {"code": "AS", "name": "AgainSoft", "kind": "concern"},
    {"code": "MHZ", "name": "Moharaz", "kind": "concern"},
    {"code": "EGP", "name": "EGP", "kind": "concern"},
)

DEFAULT_EXPENSE_CATEGORIES = (
    "Rent",
    "Utilities",
    "Salaries",
    "Office Supplies",
    "Marketing",
    "Travel",
    "Miscellaneous",
)

AGING_BUCKETS = (
    ("current", "Current"),
    ("1_30", "1–30 days"),
    ("31_60", "31–60 days"),
    ("61_90", "61–90 days"),
    ("90_plus", "90+ days"),
)

AGING_BUCKET_LABELS = dict(AGING_BUCKETS)
