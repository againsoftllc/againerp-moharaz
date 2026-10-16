"""Rewrite competitor (Star Tech) branding to Againcart in HTML/text."""

from __future__ import annotations

import re
from urllib.parse import urlparse

from app.config import get_settings

STARTECH_HOST_RE = re.compile(
    r"(?:www\.)?startech\.com(?:\.bd)?",
    re.IGNORECASE,
)
BRAND_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bStar\s*Tech\b", re.IGNORECASE), "Againcart"),
    (re.compile(r"\bStarTech\b", re.IGNORECASE), "Againcart"),
    (re.compile(r"\bstartech\b", re.IGNORECASE), "Againcart"),
]
ABS_URL_RE = re.compile(
    r"""https?://(?:www\.)?startech\.com(?:\.bd)?(/[^\s"'<>]*)?""",
    re.IGNORECASE,
)
PROTO_REL_URL_RE = re.compile(
    r"""//(?:www\.)?startech\.com(?:\.bd)?(/[^\s"'<>]*)?""",
    re.IGNORECASE,
)
IMG_TAG_RE = re.compile(
    r"""<img\b[^>]*?(?:startech|star[\s_-]?tech)[^>]*?>""",
    re.IGNORECASE | re.DOTALL,
)


def storefront_base() -> str:
    settings = get_settings()
    base = (settings.storefront_public_url or "http://localhost:3010").strip().rstrip("/")
    return base or "http://localhost:3010"


def againcart_logo_url() -> str:
    return f"{storefront_base()}/images/againcart-logo.png"


def _rewrite_abs_url(match: re.Match[str]) -> str:
    path = match.group(1) or "/"
    if not path.startswith("/"):
        path = "/" + path
    return f"{storefront_base()}{path}"


def _rewrite_proto_rel(match: re.Match[str]) -> str:
    path = match.group(1) or "/"
    if not path.startswith("/"):
        path = "/" + path
    parsed = urlparse(storefront_base())
    scheme = parsed.scheme or "http"
    netloc = parsed.netloc
    return f"{scheme}://{netloc}{path}"


def _rewrite_img(_match: re.Match[str]) -> str:
    return (
        f'<img src="{againcart_logo_url()}" alt="Againcart" '
        f'width="160" height="40" loading="lazy" />'
    )


def rewrite_startech_to_againcart(value: str | None) -> str | None:
    """Replace Star Tech brand text, logos, and link base URLs with Againcart."""
    if value is None:
        return None
    if not str(value).strip():
        return value
    out = str(value)
    out = ABS_URL_RE.sub(_rewrite_abs_url, out)
    out = PROTO_REL_URL_RE.sub(_rewrite_proto_rel, out)
    out = IMG_TAG_RE.sub(_rewrite_img, out)
    for pattern, repl in BRAND_PATTERNS:
        out = pattern.sub(repl, out)
    if STARTECH_HOST_RE.search(out):
        out = STARTECH_HOST_RE.sub(urlparse(storefront_base()).netloc, out)
    return out
