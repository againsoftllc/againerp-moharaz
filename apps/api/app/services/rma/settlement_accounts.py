"""Which existing account an RMA settlement lands on. One table, so the accounting treatment can be read (and reviewed) in one place.

The cash / bank side is always the payment account the user picks. This file decides the *other* side from the purpose, the
direction and the type of party. Nothing is "income" or "expense" just because of its sign:

  Money In (+)
    Parts / Service, Repair / Labour  -> settles the RMA's own customer receivable (Dr cash / Cr 1100 Accounts Receivable)
    Damage Compensation               -> 4100 Other Income
    Refund / Settlement               -> customer, dealer: 1100 Accounts Receivable (they are paying back what they were refunded)
                                         supplier: 2100 Accounts Payable (the supplier refunds what we paid / owe)
    Replacement Price Difference      -> customer, dealer, other: 4000 Sales Revenue; supplier: 2100 Accounts Payable
    Other                             -> 4100 Other Income

  Money Out (-)
    Parts / Service, Repair / Labour  -> 6000 Operating Expenses (a cost the RMA pays to a dealer, supplier or other party)
    Damage Compensation               -> 6000 Operating Expenses
    Refund / Settlement               -> customer, dealer: 4200 Sales Returns (contra revenue); supplier: 2100 Accounts Payable
    Replacement Price Difference      -> customer, dealer, other: 4200 Sales Returns; supplier: 2100 Accounts Payable
    Other                             -> 6000 Operating Expenses

Combinations that have no honest treatment are refused with a clear message (for example a refund to an "Other Party", which has
no ledger, or charging the RMA's own repair cost to a customer).
"""

from __future__ import annotations

from typing import Optional

from app.services.rma.constants import SETTLEMENT_CHARGE_PURPOSES

# The "counter" a settlement posts to: a ledger account code, or RECEIVABLE = settle the RMA's receivable via Finance.
RECEIVABLE = "receivable"


class SettlementRuleError(ValueError):
    """A purpose / direction / party combination that cannot be posted."""


def counter_account(direction: str, purpose: str, party_type: str) -> str:
    """The account code on the other side of the cash line, or RECEIVABLE for the RMA's own charges."""
    inbound = direction == "in"
    if purpose in SETTLEMENT_CHARGE_PURPOSES:
        if inbound:
            if party_type != "customer":
                raise SettlementRuleError("The RMA's own charges are collected from the customer. Pick the customer, or another purpose.")
            return RECEIVABLE
        if party_type == "customer":
            raise SettlementRuleError("Money paid out to a customer is a refund, not a service charge. Choose Refund / Settlement.")
        return "6000"
    if purpose == "damage_compensation":
        return "4100" if inbound else "6000"
    if purpose == "refund_settlement":
        if party_type == "other":
            raise SettlementRuleError("A refund or settlement needs a customer, dealer or supplier on the books. Pick the party, or use Other with a note.")
        if party_type == "supplier":
            return "2100"
        return "1100" if inbound else "4200"
    if purpose == "replacement_price_difference":
        if party_type == "supplier":
            return "2100"
        return "4000" if inbound else "4200"
    if purpose == "other":
        return "4100" if inbound else "6000"
    raise SettlementRuleError(f"Unknown purpose: {purpose}")


def journal_party_tag(party_type: str, counter_code: str) -> Optional[str]:
    """The party kind written on the journal lines. Receivable / payable lines follow the sub-ledger they belong to."""
    if counter_code == "1100":
        return "customer"
    if counter_code == "2100":
        return "supplier"
    return {"customer": "customer", "supplier": "supplier", "dealer": "vendor"}.get(party_type)


def payment_party_tag(party_type: str) -> str:
    return {"customer": "customer", "supplier": "supplier", "dealer": "vendor"}.get(party_type, "other")
