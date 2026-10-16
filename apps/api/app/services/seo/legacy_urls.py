"""Old-shop URLs → one canonical key, so a redirect row matches every way the same page was linked.

OpenCart (the previous Moharaz shop) linked one page many ways:
  /index.php?route=product/product&product_id=42&path=20_27&search=x
  /index.php?route=product/category&path=1463_1467        (category = the last id of the path)
  /index.php?route=product/manufacturer.info&manufacturer_id=69
  /index.php?route=information/information&information_id=4
and SEO keywords with spaces, upper case, dots or "²". The key keeps only what identifies the page:
  /index.php?route=product/product&product_id=42
  /index.php?route=product/category&path=1467
  /some keyword → /some keyword (decoded, trimmed, lower case, no trailing slash)
`seo_redirects.from_path` rows are stored in this form; lookups normalise the request the same way.
"""
from __future__ import annotations

from urllib.parse import parse_qs, unquote, urlsplit

# route → the query parameter that identifies the page
_ID_PARAM = {
    "product/product": "product_id",
    "product/category": "path",
    "product/manufacturer.info": "manufacturer_id",
    "product/manufacturer/info": "manufacturer_id",
    "information/information": "information_id",
}


def legacy_key(raw: str) -> str:
    """Canonical lookup key for an old URL (path + optional query), e.g. "/Index.php?route=product/category&path=1_2"."""
    parts = urlsplit(raw.strip())
    path = unquote(parts.path or "/").strip()
    path = "/" + path.strip("/").strip()
    query = parse_qs(parts.query, keep_blank_values=False)
    route = (query.get("route") or [""])[0].strip().lower().replace("|", ".")
    if path.lower() in ("/index.php", "/index.php/") or route:
        if not route:
            return "/index.php?route=common/home"
        param = _ID_PARAM.get(route)
        if param and query.get(param):
            value = query[param][0].strip()
            if param == "path":
                value = value.split("_")[-1]
            if route == "product/manufacturer/info":
                route = "product/manufacturer.info"
            return f"/index.php?route={route}&{param}={value}"
        return f"/index.php?route={route}"
    return path.lower() if path != "/" else "/"
