"""Prices captured by the "Send to AgainERP" browser extension.

The extension reads a competitor's product page inside the admin's own browser (so Cloudflare
and other bot checks see a real person), then sends the name/price/stock here. Nothing is
fetched server-side: we only work out which competitor and which of our products it belongs to,
and store it like any other Price Compare match.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional
from urllib.parse import urlparse

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.models.price_update_plugin import PriceUpdateCompetitorSite, PriceUpdateMatch
from app.services.plugins import price_update_service as svc
from app.services.plugins.sitemap_matcher import is_code, tokens, verify

CAPTURED_MESSAGE = "Captured from your browser"


def _norm_url(url: Optional[str]) -> str:
    return (url or "").split("#")[0].split("?")[0].rstrip("/").lower().replace("://www.", "://")


def site_domain(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    return host.removeprefix("www.")


def competitor_for_url(db: Session, company_id: str, url: str) -> Optional[PriceUpdateCompetitorSite]:
    host = site_domain(url)
    if not host:
        return None
    for site in svc.list_competitor_sites(db, company_id):
        domain = (site.domain or "").lower().removeprefix("www.")
        if host == domain or host.endswith("." + domain):
            return site
    return None


def linked_products(db: Session, company_id: str, url: str) -> list[PriceUpdateMatch]:
    """Matches that already point at this exact page."""
    key = _norm_url(url)
    host = site_domain(url)
    rows = (
        db.query(PriceUpdateMatch)
        .filter(PriceUpdateMatch.company_id == company_id, PriceUpdateMatch.matched_url.ilike(f"%{host}%"))
        .all()
    )
    return [r for r in rows if _norm_url(r.matched_url) == key]


def suggest_products(
    db: Session, company_id: str, title: str, price: Optional[float], *, limit: int = 6,
) -> list[tuple[CatalogProduct, bool]]:
    """Our products that look like the page's product, best first; bool = passes the full check
    used for automatic matching (brand, model codes, sizes, variants, price range)."""
    words = tokens(title)
    if not words:
        return []
    # Model codes narrow fastest; fall back to the longest plain words.
    keys = [w for w in words if is_code(w) and len(w) >= 3] or sorted(words, key=len, reverse=True)[:4]
    keys = keys[:6]
    rows = (
        db.query(CatalogProduct)
        .filter(
            CatalogProduct.company_id == company_id,
            or_(*[CatalogProduct.name.ilike(f"%{k}%") for k in keys]),
        )
        .limit(200)
        .all()
    )
    page_words = set(words)
    scored: list[tuple[float, CatalogProduct, bool]] = []
    for product in rows:
        verdict = verify(
            title, price, name=product.name, brand=product.brand, model=product.model,
            our_price=float(product.price) if product.price else None,
        )
        ours = set(tokens(product.name))
        overlap = len(ours & page_words) / max(1, len(ours))
        scored.append(((2.0 if verdict.ok else 0.0) + overlap, product, verdict.ok))
    scored.sort(key=lambda s: s[0], reverse=True)
    return [(p, ok) for score, p, ok in scored[:limit] if score > 0.2]


def save_capture(
    db: Session, *, company_id: str, product_id: str, url: str, competitor: Optional[str],
    add_competitor_label: Optional[str], title: Optional[str], price: Optional[Decimal],
    regular_price: Optional[Decimal], in_stock: Optional[bool], stock_label: Optional[str] = None,
) -> PriceUpdateMatch:
    product = db.get(CatalogProduct, product_id)
    if not product or (product.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Send the page's full URL")
    if price is None or price <= 0:
        raise HTTPException(status_code=400, detail="No price was read from the page")

    site = (
        svc.get_competitor_site(db, company_id=company_id, competitor_id=competitor)
        if competitor
        else competitor_for_url(db, company_id, url)
    )
    if site is None and add_competitor_label is not None:
        if site_domain(url) in ("localhost", "127.0.0.1", "0.0.0.0") or "." not in site_domain(url):
            raise HTTPException(status_code=400, detail="This is a local address, not a competitor's website")
        site = svc.add_competitor_site(
            db, company_id=company_id, domain=site_domain(url), label=add_competitor_label or site_domain(url),
        )
    if site is None:
        raise HTTPException(
            status_code=400,
            detail=f"{site_domain(url)} isn't a Price Compare competitor yet — add it first",
        )

    match = (
        db.query(PriceUpdateMatch)
        .filter(
            PriceUpdateMatch.company_id == company_id,
            PriceUpdateMatch.product_id == product.id,
            PriceUpdateMatch.competitor == site.id,
        )
        .first()
    )
    if match and match.verified and _norm_url(match.matched_url) != _norm_url(url):
        raise HTTPException(
            status_code=409,
            detail=(
                f"{product.name} already has a verified {site.label} link. Change it in Price Compare "
                f"(link icon) if this page is the right one."
            ),
        )
    if not match:
        match = PriceUpdateMatch(company_id=company_id, product_id=product.id, competitor=site.id)
        db.add(match)
    if not (match.verified and _norm_url(match.matched_url) == _norm_url(url)):
        match.matched_url = url.strip()[:1000]
    match.manual_url = True
    match.matched_title = (title or "").strip()[:500] or match.matched_title
    match.price = price
    match.regular_price = regular_price if regular_price and regular_price > price else None
    match.in_stock = in_stock
    match.stock_label = (stock_label or "").strip()[:80] or None
    match.status = "matched"
    match.status_message = CAPTURED_MESSAGE
    match.last_checked_at = datetime.utcnow()
    db.commit()
    db.refresh(match)
    return match


# ── Auto-sync: the extension re-reads saved links in the background ──────────

AUTO_MESSAGE = "Auto-synced from your browser"


def sync_queue(
    db: Session, company_id: str, *, stale_hours: float, limit: int, only_failed: bool = False,
) -> list[tuple[PriceUpdateMatch, CatalogProduct, PriceUpdateCompetitorSite]]:
    """Saved competitor links due for a browser re-read: failed/blocked ones first, then the
    longest-unchecked. Links checked within `stale_hours` successfully are skipped."""
    settings = svc.get_or_create_settings(db, company_id)
    if not settings.installed or not settings.enabled:
        return []
    sites = {s.id: s for s in svc.enabled_competitors(db, company_id)}
    if not sites:
        return []
    cutoff = datetime.utcnow() - timedelta(hours=stale_hours)
    base = db.query(PriceUpdateMatch, CatalogProduct).join(CatalogProduct, CatalogProduct.id == PriceUpdateMatch.product_id).filter(
        PriceUpdateMatch.company_id == company_id,
        PriceUpdateMatch.competitor.in_(list(sites)),
        PriceUpdateMatch.matched_url.isnot(None),
        PriceUpdateMatch.matched_url != "",
    )
    stale = or_(PriceUpdateMatch.last_checked_at.is_(None), PriceUpdateMatch.last_checked_at <= cutoff)
    if only_failed:
        # Browser only for what the server can't read: links that failed, and every link on a site that
        # blocks the server (a Cloudflare browser check) - including links that were never read yet, e.g.
        # thousands imported from that site's sitemap, which the server can't check to find that out itself.
        from app.services.plugins.sitemap_matcher import blocked_for

        blocked = {
            row[0]
            for row in db.query(PriceUpdateMatch.competitor)
            .filter(
                PriceUpdateMatch.company_id == company_id,
                PriceUpdateMatch.status == "error",
                or_(PriceUpdateMatch.status_message.ilike("%protection%"), PriceUpdateMatch.status_message.ilike("%browser check%")),
            )
            .distinct()
        }
        blocked |= {sid for sid, site in sites.items() if blocked_for(site.domain) > 0}
        due = PriceUpdateMatch.status == "error"
        if blocked:
            due = or_(due, (PriceUpdateMatch.competitor.in_(list(blocked))) & stale)
    else:
        due = or_(PriceUpdateMatch.status == "error", stale)
    rows = (
        base.filter(due)
        .order_by((PriceUpdateMatch.status != "error"), PriceUpdateMatch.last_checked_at.asc().nullsfirst())
        .limit(limit)
        .all()
    )
    return [(m, p, sites[m.competitor]) for m, p in rows]


def _different_product(product: CatalogProduct, page_title: str) -> Optional[str]:
    """Reason the saved link's page is clearly another product, else None. For a link someone
    already chose, only flag obvious cases: the full matcher must reject it AND most of our
    product's name words must be missing — shop titles often drop the brand ("iPhone 15 Plus")
    or mention CPU names ("Core Ultra 5") that the strict matcher reads as a variant."""
    verdict = verify(page_title, None, name=product.name, brand=product.brand, model=product.model,
                     our_price=None, lenient=True)
    if verdict.ok:
        return None
    # A different capacity/wattage/refresh rate/speed (64GB vs 32GB, 650W vs 750W) is always
    # another product, however many other words match.
    if verdict.reason.startswith("different ") and "variant" not in verdict.reason:
        return verdict.reason
    ours = set(tokens(product.name)) - set(tokens(product.brand))
    if not ours:
        return None
    page = set(tokens(page_title))
    if len(ours & page) / len(ours) >= 0.5:
        return None
    return verdict.reason


def save_auto_result(
    db: Session, *, company_id: str, match_id: str, page_url: Optional[str], title: Optional[str],
    price: Optional[Decimal], regular_price: Optional[Decimal], in_stock: Optional[bool],
    stock_label: Optional[str], error: Optional[str],
) -> PriceUpdateMatch:
    match = db.get(PriceUpdateMatch, match_id)
    if not match or match.company_id != company_id:
        raise HTTPException(status_code=404, detail="Match not found")
    product = db.get(CatalogProduct, match.product_id)
    our_price = float(product.price) if product and product.price else None

    if error and error.startswith("the saved link is on "):
        # Wrong site — its old price isn't this competitor's, so don't keep showing it.
        match.status = "no_price"
        match.status_message = f"Auto-sync: {error} — fix the link"[:500]
    elif error:
        # Keep the last good price — a failed read says nothing about the competitor's price.
        match.status = "error"
        match.status_message = f"Auto-sync: {error}"[:500]
    elif price is None and (in_stock is False or stock_label):
        match.status = "no_price"
        match.in_stock = in_stock
        match.stock_label = (stock_label or "").strip()[:80] or None
        match.status_message = f"{stock_label or 'Not available'} on this site — no price listed right now"
    elif price is None or price <= 0:
        match.status = "no_price"
        match.status_message = "Auto-sync: the page loaded but no price was found on it"
    elif product and title and (mismatch := _different_product(product, title)):
        # The saved link now shows (or always showed) some other product — don't record its price.
        match.status = "no_price"
        match.status_message = (
            f"This {'verified ' if match.verified else ''}link now shows a different product "
            f"(“{title.strip()[:120]}” — {mismatch}) — check the link"
        )[:500]
    elif our_price and not (our_price * 0.1 <= float(price) <= our_price * 8):
        match.status = "no_price"
        match.status_message = (
            f"Found ৳{float(price):,.0f} on the page but it doesn't look related to our "
            f"price (৳{our_price:,.0f}) — check the link"
        )
    else:
        match.price = price
        match.regular_price = regular_price if regular_price and regular_price > price else None
        match.in_stock = in_stock
        match.stock_label = (stock_label or "").strip()[:80] or None
        match.status = "matched"
        match.status_message = AUTO_MESSAGE
        if title:
            match.matched_title = title.strip()[:500]
    match.last_checked_at = datetime.utcnow()
    db.commit()
    db.refresh(match)
    return match


# ── Link discovery through the browser (sites that block this server) ────────

DISCOVERED_MESSAGE = "Found and read through your browser"


def _match_row(db: Session, company_id: str, product_id: str, competitor: str) -> PriceUpdateMatch:
    match = (
        db.query(PriceUpdateMatch)
        .filter(
            PriceUpdateMatch.company_id == company_id,
            PriceUpdateMatch.product_id == product_id,
            PriceUpdateMatch.competitor == competitor,
        )
        .first()
    )
    if not match:
        match = PriceUpdateMatch(company_id=company_id, product_id=product_id, competitor=competitor)
        db.add(match)
    return match


def _product_and_site(db: Session, company_id: str, product_id: str, competitor: str):
    product = db.get(CatalogProduct, product_id)
    if not product or (product.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    site = svc.get_competitor_site(db, company_id=company_id, competitor_id=competitor)
    if not site:
        raise HTTPException(status_code=400, detail=f"Unknown competitor: {competitor}")
    return product, site


def discover_step(
    db: Session, *, company_id: str, product_id: str, competitor: str, documents: list[dict],
) -> dict:
    """One round of browser-assisted discovery: either more sitemap files the browser should
    read ({"need": [...]}), or the best-matching product pages to open ({"candidates": [...]})."""
    from app.services.plugins.sitemap_matcher import browser_crawl_step

    product, site = _product_and_site(db, company_id, product_id, competitor)
    need, index = browser_crawl_step(site.domain, documents)
    if need:
        return {"need": need, "candidates": [], "message": ""}
    if index is None or not index.urls:
        return {"need": [], "candidates": [], "message": f"Couldn't read {site.label}'s sitemap"}
    candidates = index.candidates(product.name, product.brand, product.model, limit=4)
    return {
        "need": [],
        "candidates": [url for url, _score in candidates],
        "message": "" if candidates else f"No page in {site.label}'s sitemap looks like this product",
    }


# Pages the browser read for a product that failed only on wording (see soft_reject), kept until
# the browser gives up on that product so the AI check can look at them together.
_NEAR_MISSES: dict[tuple[str, str, str], tuple[float, list[dict]]] = {}
_NEAR_MISS_TTL = 15 * 60


def _near_misses(key: tuple[str, str, str]) -> list[dict]:
    import time

    hit = _NEAR_MISSES.get(key)
    if not hit or time.time() - hit[0] > _NEAR_MISS_TTL:
        _NEAR_MISSES.pop(key, None)
        return []
    return hit[1]


def _save_page_as_link(
    db: Session, match: PriceUpdateMatch, *, url: str, title: Optional[str], price: Optional[Decimal],
    regular_price: Optional[Decimal], in_stock: Optional[bool], stock_label: Optional[str], message: str,
) -> PriceUpdateMatch:
    match.matched_url = url.strip()[:1000]
    from app.services.plugins.price_update_service import clean_page_title

    match.matched_title = clean_page_title(title or "")[:500] or None
    match.manual_url = False
    match.last_checked_at = datetime.utcnow()
    match.in_stock = in_stock
    match.stock_label = (stock_label or "").strip()[:80] or None
    if price and price > 0:
        match.price = price
        match.regular_price = regular_price if regular_price and regular_price > price else None
        match.status = "matched"
        match.status_message = message
    else:
        match.status = "no_price"
        match.status_message = (
            f"{stock_label or 'Not available'} on this site — no price listed right now"
            if in_stock is False or stock_label
            else "Link found through your browser, but the page shows no price"
        )
    db.commit()
    db.refresh(match)
    return match


def discover_confirm(
    db: Session, *, company_id: str, product_id: str, competitor: str, url: Optional[str],
    title: Optional[str], price: Optional[Decimal], regular_price: Optional[Decimal],
    in_stock: Optional[bool], stock_label: Optional[str], closest: Optional[str],
) -> tuple[bool, str, PriceUpdateMatch]:
    """Check a page the browser opened (same check as automatic sitemap discovery: brand, model,
    sizes, variant, price range) and save it as the link when it passes. url=None records that
    nothing passed."""
    product, site = _product_and_site(db, company_id, product_id, competitor)
    match = _match_row(db, company_id, product.id, site.id)
    our_price = float(product.price) if product.price else None
    if match.verified and match.matched_url:
        return False, "This product already has a verified link", match

    key = (company_id, product.id, site.id)
    if not url:
        # Nothing passed the rules. With "AI result picking" on, let AI look at the pages that
        # failed only on wording before giving up.
        near = _near_misses(key)
        _NEAR_MISSES.pop(key, None)
        settings = svc.get_or_create_settings(db, company_id)
        if near and settings.use_ai_pick:
            from app.services.plugins.price_update_ai import confirm_same_product
            from app.services.plugins.price_update_service import AI_CHECK_NOTE

            pick = confirm_same_product(
                db, company_id, product_name=product.name, brand=product.brand, our_price=our_price,
                pages=[{"title": p["title"], "price": p["price"]} for p in near],
            )
            if pick is not None:
                p = near[pick]
                match = _save_page_as_link(
                    db, match, url=p["url"], title=p["title"],
                    price=Decimal(str(p["price"])) if p["price"] else None,
                    regular_price=Decimal(str(p["regular_price"])) if p.get("regular_price") else None,
                    in_stock=p.get("in_stock"), stock_label=p.get("stock_label"), message=AI_CHECK_NOTE,
                )
                return True, "", match
        match.status = "not_found"
        match.status_message = (
            f"Not confirmed through your browser — closest page: {closest} (paste it if it's the right product)"
            if closest
            else f"No matching page found on {site.label} through your browser — paste the product link"
        )[:500]
        match.last_checked_at = datetime.utcnow()
        db.commit()
        db.refresh(match)
        return False, match.status_message, match

    verdict = verify(
        title or "", float(price) if price else None,
        name=product.name, brand=product.brand, model=product.model, our_price=our_price,
    )
    if not verdict.ok:
        from app.services.plugins.sitemap_matcher import ai_check_candidate

        # Near miss for the AI check: failed only on wording, priced within 85% of ours.
        if ai_check_candidate(verdict.reason, price, our_price):
            import time

            pages = _near_misses(key)
            pages.append({
                "url": url, "title": title or "", "price": float(price),
                "regular_price": float(regular_price) if regular_price else None,
                "in_stock": in_stock, "stock_label": stock_label,
            })
            _NEAR_MISSES[key] = (time.time(), pages[-5:])
        return False, verdict.reason, match

    _NEAR_MISSES.pop(key, None)
    match = _save_page_as_link(
        db, match, url=url, title=title, price=price, regular_price=regular_price,
        in_stock=in_stock, stock_label=stock_label, message=DISCOVERED_MESSAGE,
    )
    return True, "", match
