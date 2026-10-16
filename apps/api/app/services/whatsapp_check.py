"""Check whether a phone number appears available on WhatsApp."""

from __future__ import annotations

import re
from typing import Optional, Tuple

import httpx

_INVALID_MARKERS = (
    "phone number shared via url is invalid",
    "the phone number shared via url is invalid",
    "invalid phone number",
    "we couldn't find a page for that",
    "looking for something?",
)


def normalize_whatsapp_digits(phone: str) -> Optional[str]:
    digits = re.sub(r"\D", "", phone or "")
    if not digits:
        return None
    if digits.startswith("880") and len(digits) >= 13:
        return digits[:13] if len(digits) > 13 and digits.startswith("8801") else digits
    if digits.startswith("0") and len(digits) >= 11:
        return f"880{digits[1:11]}" if len(digits) >= 11 else f"880{digits[1:]}"
    if len(digits) == 10 and digits.startswith("1"):
        return f"880{digits}"
    if len(digits) >= 10:
        return digits
    return None


def is_plausible_mobile(digits: str) -> bool:
    """Bangladesh mobile or generic E.164 mobile length."""
    if digits.startswith("880"):
        # 880 + 1X + 8 digits = 13
        return len(digits) == 13 and digits[3] == "1"
    return 10 <= len(digits) <= 15


def check_whatsapp_number(phone: str) -> Tuple[bool, str]:
    """
    Return (available, message).

    Uses wa.me page signals + mobile format validation. Meta does not expose a
    public free "is on WhatsApp" API for arbitrary numbers.
    """
    digits = normalize_whatsapp_digits(phone)
    if not digits:
        return False, "Enter a valid phone number"
    if not is_plausible_mobile(digits):
        return False, "This does not look like a valid mobile number"

    url = f"https://wa.me/{digits}"
    try:
        with httpx.Client(
            timeout=12.0,
            follow_redirects=True,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/122.0.0.0 Safari/537.36"
                ),
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "en-US,en;q=0.9",
            },
        ) as client:
            res = client.get(url)
    except httpx.HTTPError:
        return False, "Could not reach WhatsApp to verify this number"

    body = (res.text or "").lower()
    if any(marker in body for marker in _INVALID_MARKERS):
        return False, "This number is not on WhatsApp"

    if res.status_code >= 400:
        return False, "WhatsApp could not verify this number"

    # Valid-looking wa.me pages for registered-format numbers land on send flow.
    if "whatsapp" in body or "send" in str(res.url).lower() or res.status_code == 200:
        return True, "WhatsApp is available on this number"

    return False, "Could not confirm WhatsApp on this number"
