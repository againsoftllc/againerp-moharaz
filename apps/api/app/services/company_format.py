"""Company localisation (currency, date/time, number format).

Admin reads these through the full company profile, but portal users have no
`workspace:read` permission — they get just the formatting fields from here so
vendor/supplier screens print money and dates the same way the ERP does.
"""

from __future__ import annotations

from typing import Any, Dict

from sqlalchemy.orm import Session

from app.models.company import Company

LOCALIZATION_DEFAULTS: Dict[str, Any] = {
    "currency_code": "BDT",
    "language_code": "en",
    "timezone": "Asia/Dhaka",
    "date_format": "dd/mm/yyyy",
    "time_format": "12h",
    "decimal_places": 2,
    "number_grouping": "indian",
    "fiscal_year_start_month": 7,
}


def company_format_dict(db: Session, company_id: str = "default") -> Dict[str, Any]:
    """Formatting fields for `company_id`, falling back per field to defaults."""
    company = db.get(Company, company_id)
    values = dict(LOCALIZATION_DEFAULTS)
    if company is None:
        return values
    for key in LOCALIZATION_DEFAULTS:
        value = getattr(company, key, None)
        if isinstance(value, str):
            value = value.strip() or None
        if value is not None:
            values[key] = value
    return values
