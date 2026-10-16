"""Scheduled Price Compare sync on the server.

Every few hours (per company: plugin.auto_sync_hours, 0 = off) re-reads the saved competitor
links the server can read for free. Sites that currently block the server (Cloudflare browser
check, rate limit) are skipped — their links show as failed and the "Send to AgainERP" browser
extension's auto-sync picks those up. Only saved links are read: no search, no AI, no cost.
"""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timedelta

from sqlalchemy import text

from app.database import SessionLocal

logger = logging.getLogger(__name__)

CHECK_EVERY_SECONDS = 600
GAP_SECONDS = 1.0  # between page reads, on top of the per-site pacing in the reader
MAX_PER_RUN = 1000
_LOCK_ID = 727_401  # pg advisory lock: one sync at a time across API processes
_started = False


def _due(settings) -> bool:
    hours = int(settings.auto_sync_hours or 0)
    if hours <= 0 or not settings.installed or not settings.enabled:
        return False
    last = settings.last_auto_sync_at
    return last is None or datetime.utcnow() - last >= timedelta(hours=hours)


def run_company(db, settings) -> dict:
    from app.models.catalog_product import CatalogProduct
    from app.models.price_update_plugin import PriceUpdateMatch
    from app.services.plugins import price_update_service as svc
    from app.services.plugins.sitemap_matcher import blocked_for

    company_id = settings.company_id
    sites = {s.id: s for s in svc.enabled_competitors(db, company_id)}
    stale_before = datetime.utcnow() - timedelta(hours=max(1, int(settings.auto_sync_hours or 6)) * 0.8)
    rows = (
        db.query(PriceUpdateMatch)
        .filter(
            PriceUpdateMatch.company_id == company_id,
            PriceUpdateMatch.competitor.in_(list(sites) or [""]),
            PriceUpdateMatch.matched_url.isnot(None),
            PriceUpdateMatch.matched_url != "",
        )
        .all()
    )
    due = [m for m in rows if m.last_checked_at is None or m.last_checked_at < stale_before]
    due.sort(key=lambda m: m.last_checked_at or datetime.min)
    stats = {"checked": 0, "updated": 0, "skipped_blocked": 0}
    for m in due[:MAX_PER_RUN]:
        site = sites.get(m.competitor)
        if site is None:
            continue
        if blocked_for(site.domain) > 0:
            stats["skipped_blocked"] += 1
            continue
        product = db.get(CatalogProduct, m.product_id)
        if product is None:
            continue
        try:
            result = svc.refresh_product_competitor(
                db, company_id=company_id, product=product, competitor=m.competitor,
                settings=settings, allow_ai=False,
            )
            stats["checked"] += 1
            if result.status == "matched":
                stats["updated"] += 1
        except Exception:  # one bad page must not stop the run
            db.rollback()
            logger.exception("Price auto-sync failed for match %s", m.id)
        time.sleep(GAP_SECONDS)
    settings.last_auto_sync_at = datetime.utcnow()
    db.commit()
    return stats


def run_due_once() -> None:
    from app.models.price_update_plugin import PriceUpdatePlugin

    db = SessionLocal()
    try:
        got = db.execute(text("SELECT pg_try_advisory_lock(:id)"), {"id": _LOCK_ID}).scalar()
        if not got:
            return
        try:
            for settings in db.query(PriceUpdatePlugin).all():
                if _due(settings):
                    stats = run_company(db, settings)
                    logger.info("Price auto-sync for %s: %s", settings.company_id, stats)
        finally:
            db.execute(text("SELECT pg_advisory_unlock(:id)"), {"id": _LOCK_ID})
            db.commit()
    except Exception:
        db.rollback()
        logger.exception("Price auto-sync run failed")
    finally:
        db.close()


def start_background_loop() -> None:
    global _started
    if _started:
        return
    _started = True

    def loop() -> None:
        time.sleep(90)  # let startup finish first
        while True:
            run_due_once()
            time.sleep(CHECK_EVERY_SECONDS)

    threading.Thread(target=loop, name="price-auto-sync", daemon=True).start()
