"""Work out whether a returned unit is still under warranty.

Warranty is stored on the catalog product as free text ("1 year", "6 months",
"Lifetime", "Manufacturer warranty"), so this parses that text into a duration.
Anything it cannot read confidently comes back as `unknown` rather than a guess —
an agent then makes the call by hand, because a whole repair bill hangs on it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Optional

UNLIMITED = "lifetime"

_NONE_WORDS = ("no warranty", "without warranty", "none", "n/a", "not applicable")
_UNLIMITED_WORDS = ("lifetime", "life time", "unlimited")

_DURATION = re.compile(
    r"(?P<value>\d+(?:\.\d+)?)\s*[- ]?\s*(?P<unit>year|yr|month|mon|mo|week|wk|day)s?\b",
    re.IGNORECASE,
)

_UNIT_DAYS = {
    "year": 365,
    "yr": 365,
    "month": 30,
    "mon": 30,
    "mo": 30,
    "week": 7,
    "wk": 7,
    "day": 1,
}


@dataclass(frozen=True)
class WarrantyVerdict:
    status: str  # in_warranty | out_of_warranty | unknown
    expires_on: Optional[date]
    note: str


def parse_warranty_days(text: Optional[str]) -> Optional[int]:
    """Duration in days, 0 for "no warranty", None when unreadable.

    A sentinel of -1 means unlimited.
    """
    if not text:
        return None
    value = text.strip().lower()
    if not value:
        return None
    if any(word in value for word in _NONE_WORDS):
        return 0
    if any(word in value for word in _UNLIMITED_WORDS):
        return -1

    match = _DURATION.search(value)
    if not match:
        return None
    amount = float(match.group("value"))
    unit = match.group("unit").lower()
    return int(amount * _UNIT_DAYS[unit])


def product_warranty_text(product) -> Optional[str]:
    """The warranty to measure: the product's structured days (or lifetime) when set, else its free text."""
    if product is None:
        return None
    if getattr(product, "lifetime_warranty", False):
        return UNLIMITED
    days = getattr(product, "warranty_days", None)
    if days is not None:
        return "no warranty" if int(days) == 0 else f"{int(days)} days"
    return product.warranty


def evaluate(
    *,
    warranty_text: Optional[str],
    purchased_on: Optional[date],
    today: Optional[date] = None,
) -> WarrantyVerdict:
    today = today or date.today()
    days = parse_warranty_days(warranty_text)

    if days is None:
        label = f'"{warranty_text}"' if warranty_text else "no warranty recorded"
        return WarrantyVerdict(
            "unknown", None, f"Could not read a warranty period from {label} — decide manually."
        )
    if days == 0:
        return WarrantyVerdict(
            "out_of_warranty", None, "Product is sold without warranty."
        )
    if days < 0:
        return WarrantyVerdict("in_warranty", None, "Lifetime warranty.")

    if not purchased_on:
        return WarrantyVerdict(
            "unknown",
            None,
            "Warranty period is known but there is no purchase date to measure from.",
        )

    expires = date.fromordinal(purchased_on.toordinal() + days)
    if expires >= today:
        left = (expires - today).days
        return WarrantyVerdict(
            "in_warranty", expires, f"{left} day(s) of warranty remaining (expires {expires})."
        )
    over = (today - expires).days
    return WarrantyVerdict(
        "out_of_warranty", expires, f"Warranty expired {over} day(s) ago on {expires}."
    )
