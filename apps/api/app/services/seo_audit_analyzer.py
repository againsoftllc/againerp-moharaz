"""Walk the catalogue and website content, and report what would hurt ranking.

The audit reads the same entities the storefront publishes — products,
categories, brands, website pages, redirects and meta records — and turns
what it finds into `seo_audit_issues` rows under one `seo_audit_runs` row.

It deliberately does **not** read `seo_url_records`: the seed runs the audit
before the URL sync, so the audit derives the path universe from
`seo_url_sync.collect_desired_urls` and stays independent of table order.

A live crawl of the storefront is optional (`probe_live=True`). Performance and
mobile can only be judged from a real response, so when no crawl happens those
two categories report nothing and are left out of the score rather than being
credited with a perfect one.
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.catalog_brand import CatalogBrand
from app.models.catalog_category import CatalogCategory
from app.models.catalog_product import CatalogProduct
from app.models.seo_audit_issue import SeoAuditIssue
from app.models.seo_audit_run import SeoAuditRun, dump_json
from app.models.seo_meta_record import SeoMetaRecord
from app.models.seo_redirect import SeoRedirect
from app.models.website_menu import WebsiteMenu
from app.models.website_page import WebsitePage
from app.services.seo_url_sync import DesiredUrl, collect_desired_urls, normalize_path

COMPANY_DEFAULT = "default"

AUDIT_CATEGORIES = ("meta", "content", "technical", "links", "performance", "mobile")

# Google truncates around these lengths; the thresholds are the usual guidance.
TITLE_MAX = 60
TITLE_MIN = 25
DESCRIPTION_MAX = 160
DESCRIPTION_MIN = 120
THIN_CONTENT_CHARS = 300

SEVERITY_WEIGHT = {"high": 3, "medium": 2, "low": 1}

# Score ceiling: the worst a single entity can weigh on a category. Set to the
# heaviest realistic stack of findings for one page (a page missing its title,
# description, image and schema scores 3+2+2+1), so a page that fails every
# check lands at zero rather than saturating the whole category there.
MAX_PENALTY_PER_ENTITY = 8

_HREF = re.compile(r'href=["\'](/[^"\'#?]*)', re.IGNORECASE)
_TAG = re.compile(r"<[^>]+>")
_VIEWPORT = re.compile(r'<meta[^>]+name=["\']viewport["\']', re.IGNORECASE)
_H1 = re.compile(r"<h1[\s>]", re.IGNORECASE)


@dataclass
class Finding:
    issue_type: str
    category: str
    severity: str
    url: str
    entity: str
    suggestion: str
    affected_count: int = 1


@dataclass
class EntityView:
    """One publishable thing, flattened to the fields SEO cares about."""

    desired: DesiredUrl
    meta_title: str = ""
    meta_description: str = ""
    body: str = ""
    has_image: bool = False
    label: str = ""
    checked_categories: set[str] = field(default_factory=set)

    @property
    def url(self) -> str:
        return self.desired.slug

    @property
    def title(self) -> str:
        return self.desired.title


def _text(value: Optional[str]) -> str:
    return (value or "").strip()


def _plain(html: Optional[str]) -> str:
    return _TAG.sub(" ", html or "").strip()


def _entity_label(entity_type: str) -> str:
    return {
        "product": "product",
        "category": "category",
        "brand": "brand",
        "page": "page",
    }.get(entity_type, entity_type)


def _build_views(db: Session) -> list[EntityView]:
    """Join each desired URL back to the columns that carry its SEO content."""
    desired = collect_desired_urls(db)

    products = {row.id: row for row in db.query(CatalogProduct).all()}
    categories = {row.id: row for row in db.query(CatalogCategory).all()}
    brands = {row.id: row for row in db.query(CatalogBrand).all()}
    pages = {row.id: row for row in db.query(WebsitePage).all()}

    views: list[EntityView] = []
    for item in desired:
        view = EntityView(desired=item, label=f"{item.title} ({_entity_label(item.entity_type)})")

        if item.entity_type == "product":
            row = products.get(item.entity_id)
            if row is None:
                continue
            gallery = _text(row.gallery_json)
            view.meta_title = _text(row.seo_title)
            view.meta_description = _text(row.seo_description)
            view.body = _text(row.description) or _text(row.short_description)
            view.has_image = bool(_text(row.thumbnail)) or gallery not in ("", "[]")
        elif item.entity_type == "category":
            row = categories.get(item.entity_id)
            if row is None:
                continue
            view.meta_title = _text(row.meta_title)
            view.meta_description = _text(row.meta_description)
            view.body = _text(row.description)
            view.has_image = True  # categories have no own image slot to miss
        elif item.entity_type == "brand":
            row = brands.get(item.entity_id)
            if row is None:
                continue
            view.meta_title = _text(row.meta_title)
            view.meta_description = _text(row.meta_description)
            view.body = _text(row.description)
            view.has_image = bool(_text(row.logo_url) or _text(row.banner_url))
        elif item.entity_type == "page":
            row = pages.get(item.entity_id)
            if row is None:
                continue
            try:
                seo = json.loads(row.seo_json or "{}")
            except json.JSONDecodeError:
                seo = {}
            seo = seo if isinstance(seo, dict) else {}
            view.meta_title = _text(seo.get("meta_title"))
            view.meta_description = _text(seo.get("meta_description"))
            view.body = _plain(row.body_html) or _text(row.description)
            view.has_image = True  # pages carry their image inside the body
        else:
            continue

        views.append(view)

    return views


# ---------------------------------------------------------------- meta rules


def _check_meta(views: list[EntityView], meta_by_url: dict[str, SeoMetaRecord]) -> list[Finding]:
    findings: list[Finding] = []
    titles: dict[str, list[EntityView]] = {}

    for view in views:
        view.checked_categories.add("meta")
        label = view.label

        if not view.meta_title:
            findings.append(
                Finding(
                    "missing_meta_title",
                    "meta",
                    "high",
                    view.url,
                    label,
                    f"Add a meta title, e.g. '{view.title[:50]}'.",
                )
            )
        else:
            titles.setdefault(view.meta_title.lower(), []).append(view)
            if len(view.meta_title) > TITLE_MAX:
                findings.append(
                    Finding(
                        "title_too_long",
                        "meta",
                        "medium",
                        view.url,
                        label,
                        f"Title is {len(view.meta_title)} chars — trim under {TITLE_MAX} to avoid truncation.",
                    )
                )
            elif len(view.meta_title) < TITLE_MIN:
                findings.append(
                    Finding(
                        "title_too_short",
                        "meta",
                        "low",
                        view.url,
                        label,
                        f"Title is {len(view.meta_title)} chars — add context to reach {TITLE_MIN}+.",
                    )
                )

        if not view.meta_description:
            findings.append(
                Finding(
                    "missing_meta_description",
                    "meta",
                    "medium",
                    view.url,
                    label,
                    f"Write a {DESCRIPTION_MIN}–{DESCRIPTION_MAX} char description with the primary keyword.",
                )
            )
        elif len(view.meta_description) > DESCRIPTION_MAX:
            findings.append(
                Finding(
                    "description_too_long",
                    "meta",
                    "low",
                    view.url,
                    label,
                    f"Description is {len(view.meta_description)} chars — trim under {DESCRIPTION_MAX}.",
                )
            )
        elif len(view.meta_description) < DESCRIPTION_MIN:
            findings.append(
                Finding(
                    "short_description",
                    "meta",
                    "low",
                    view.url,
                    label,
                    f"Description is {len(view.meta_description)} chars — expand to {DESCRIPTION_MIN}–{DESCRIPTION_MAX}.",
                )
            )

        if not view.has_image:
            findings.append(
                Finding(
                    "missing_og_image",
                    "meta",
                    "medium",
                    view.url,
                    label,
                    "Add a 1200×630px image so social shares render a preview.",
                )
            )

        record = meta_by_url.get(view.url)
        if view.desired.indexable and (record is None or not _text(record.schema_type)):
            findings.append(
                Finding(
                    "missing_schema",
                    "meta",
                    "low",
                    view.url,
                    label,
                    "Add JSON-LD structured data for this page type.",
                )
            )

    for title, group in titles.items():
        if len(group) < 2:
            continue
        for view in group:
            findings.append(
                Finding(
                    "duplicate_title",
                    "meta",
                    "high",
                    view.url,
                    view.label,
                    f"{len(group)} pages share the title '{group[0].meta_title[:50]}' — make each unique.",
                    affected_count=len(group),
                )
            )

    return findings


# ------------------------------------------------------------- content rules


def _check_content(views: list[EntityView]) -> list[Finding]:
    findings: list[Finding] = []
    bodies: dict[str, list[EntityView]] = {}

    for view in views:
        view.checked_categories.add("content")
        body = view.body

        if not body:
            findings.append(
                Finding(
                    "missing_content",
                    "content",
                    "high",
                    view.url,
                    view.label,
                    "Page has no description at all — write unique copy for it.",
                )
            )
            continue

        if len(body) < THIN_CONTENT_CHARS:
            findings.append(
                Finding(
                    "thin_content",
                    "content",
                    "high" if view.desired.entity_type == "page" else "medium",
                    view.url,
                    view.label,
                    f"Only {len(body)} chars of copy — expand past {THIN_CONTENT_CHARS} for better ranking.",
                )
            )

        bodies.setdefault(body.lower()[:400], []).append(view)

    for group in bodies.values():
        if len(group) < 2:
            continue
        for view in group:
            findings.append(
                Finding(
                    "duplicate_content",
                    "content",
                    "high",
                    view.url,
                    view.label,
                    f"{len(group)} pages open with identical copy — write unique descriptions.",
                    affected_count=len(group),
                )
            )

    return findings


# ----------------------------------------------------------- technical rules


def _check_technical(
    db: Session,
    views: list[EntityView],
    known_paths: set[str],
    company_id: str,
) -> tuple[list[Finding], int]:
    findings: list[Finding] = []
    redirects = (
        db.query(SeoRedirect)
        .filter(SeoRedirect.company_id == company_id, SeoRedirect.status == "active")
        .all()
    )
    hops = {
        normalize_path(row.from_path): normalize_path(row.to_path)
        for row in redirects
        if normalize_path(row.from_path)
    }

    for source, target in hops.items():
        if not target:
            continue  # a 410 has no destination — nothing to verify
        if target == source:
            findings.append(
                Finding(
                    "redirect_loop",
                    "technical",
                    "high",
                    source,
                    "Redirect rule",
                    "Rule points at itself — remove it or set a real destination.",
                )
            )
            continue
        if target in hops:
            findings.append(
                Finding(
                    "redirect_chain",
                    "technical",
                    "medium",
                    source,
                    "Redirect rule",
                    f"{source} → {target} → … — collapse to a single hop.",
                )
            )
        elif target.startswith("/") and target not in known_paths:
            findings.append(
                Finding(
                    "broken_redirect_target",
                    "technical",
                    "high",
                    source,
                    "Redirect rule",
                    f"Destination {target} does not match any published page.",
                )
            )

    # Two entities publishing one path: the URL table can only hold one of them,
    # so the loser is invisible until somebody renames it.
    by_path: dict[str, list[EntityView]] = {}
    for view in views:
        by_path.setdefault(view.url, []).append(view)
    for path, group in by_path.items():
        if len(group) < 2:
            continue
        owners = ", ".join(sorted(v.label for v in group))
        for view in group:
            findings.append(
                Finding(
                    "duplicate_url",
                    "technical",
                    "high",
                    path,
                    view.label,
                    f"{len(group)} entities publish {path} ({owners}) — only one can own it.",
                    affected_count=len(group),
                )
            )

    for view in views:
        view.checked_categories.add("technical")
        if view.desired.published and not view.desired.indexable:
            findings.append(
                Finding(
                    "noindex_published_page",
                    "technical",
                    "medium",
                    view.url,
                    view.label,
                    "Page is live but excluded from indexing — confirm that is intended.",
                )
            )
        if view.url in hops:
            findings.append(
                Finding(
                    "redirected_live_page",
                    "technical",
                    "high",
                    view.url,
                    view.label,
                    "A live page is shadowed by an active redirect — visitors never reach it.",
                )
            )

    return findings, len(hops)


# --------------------------------------------------------------- link rules


def _menu_hrefs(db: Session, company_id: str) -> set[str]:
    hrefs: set[str] = set()

    def walk(nodes: Iterable) -> None:
        for node in nodes:
            if not isinstance(node, dict):
                continue
            href = normalize_path(node.get("href"))
            if href:
                hrefs.add(href)
            children = node.get("children")
            if isinstance(children, list):
                walk(children)

    rows = (
        db.query(WebsiteMenu)
        .filter(WebsiteMenu.company_id == company_id, WebsiteMenu.active.is_(True))
        .all()
    )
    for row in rows:
        try:
            items = json.loads(row.items_json or "[]")
        except json.JSONDecodeError:
            continue
        if isinstance(items, list):
            walk(items)
    return hrefs


def _check_links(
    db: Session,
    views: list[EntityView],
    known_paths: set[str],
    redirect_sources: set[str],
    company_id: str,
) -> list[Finding]:
    findings: list[Finding] = []
    linked = _menu_hrefs(db, company_id)

    # Internal links written into page bodies are the only link graph we can read.
    for row in db.query(WebsitePage).all():
        targets = {normalize_path(href) for href in _HREF.findall(row.body_html or "")}
        for target in targets:
            if not target:
                continue
            linked.add(target)
            if target in known_paths or target in redirect_sources:
                continue
            findings.append(
                Finding(
                    "broken_link",
                    "links",
                    "high",
                    normalize_path(row.url) or normalize_path(row.slug),
                    f"{row.name} (page)",
                    f"Internal link to {target} matches no page or redirect — fix or remove it.",
                )
            )

    for view in views:
        view.checked_categories.add("links")
        # Products are reached through listings, not menus; only navigable
        # entities are expected to be linked.
        if view.desired.entity_type == "product" or not view.desired.indexable:
            continue
        if view.url not in linked and view.url != "/":
            findings.append(
                Finding(
                    "orphan_page",
                    "links",
                    "medium",
                    view.url,
                    view.label,
                    "Nothing links here — add it to a menu or link from a related page.",
                )
            )

    return findings


# --------------------------------------------------------------- live crawl


def _crawl_live(views: list[EntityView], sample: int) -> tuple[list[Finding], int, bool]:
    """Fetch a sample of live pages. Returns findings, pages fetched, reachable."""
    import httpx

    settings = get_settings()
    base = (settings.storefront_public_url or settings.storefront_base_url or "").rstrip("/")
    if not base:
        return [], 0, False

    targets = [view for view in views if view.desired.indexable][:sample]
    if not targets:
        return [], 0, True

    findings: list[Finding] = []
    fetched = 0
    reachable = False

    try:
        with httpx.Client(timeout=5.0, follow_redirects=True) as client:
            for view in targets:
                try:
                    started = time.perf_counter()
                    response = client.get(f"{base}{view.url}")
                    elapsed_ms = int((time.perf_counter() - started) * 1000)
                except httpx.HTTPError:
                    continue

                reachable = True
                fetched += 1
                view.checked_categories.update({"performance", "mobile"})

                if response.status_code >= 400:
                    findings.append(
                        Finding(
                            "page_error",
                            "technical",
                            "high",
                            view.url,
                            view.label,
                            f"Storefront returns HTTP {response.status_code}.",
                        )
                    )
                    continue

                body = response.text
                size_kb = len(response.content) // 1024

                if elapsed_ms > 1500:
                    findings.append(
                        Finding(
                            "slow_response",
                            "performance",
                            "medium",
                            view.url,
                            view.label,
                            f"Responded in {elapsed_ms}ms — aim under 1500ms.",
                        )
                    )
                if size_kb > 500:
                    findings.append(
                        Finding(
                            "large_page",
                            "performance",
                            "low",
                            view.url,
                            view.label,
                            f"HTML payload is {size_kb}KB — trim inline assets.",
                        )
                    )
                if not _VIEWPORT.search(body):
                    findings.append(
                        Finding(
                            "missing_viewport",
                            "mobile",
                            "high",
                            view.url,
                            view.label,
                            "No viewport meta tag — the page will not scale on mobile.",
                        )
                    )
                if not _H1.search(body):
                    findings.append(
                        Finding(
                            "missing_h1",
                            "content",
                            "high",
                            view.url,
                            view.label,
                            "Rendered page has no H1 heading.",
                        )
                    )
    except Exception:  # noqa: BLE001 — a crawl failure must not fail the audit
        return findings, fetched, reachable

    return findings, fetched, reachable


# ------------------------------------------------------------------ scoring


def _score(findings: list[Finding], views: list[EntityView]) -> dict[str, int]:
    """Per-category score, only for categories that were actually checked."""
    checked: dict[str, int] = {}
    for view in views:
        for category in view.checked_categories:
            checked[category] = checked.get(category, 0) + 1

    penalties: dict[str, int] = {}
    for finding in findings:
        penalties[finding.category] = penalties.get(finding.category, 0) + SEVERITY_WEIGHT.get(
            finding.severity, 1
        )

    scores: dict[str, int] = {}
    for category in AUDIT_CATEGORIES:
        entities = checked.get(category, 0)
        if not entities:
            continue  # not inspected — no claim either way
        ceiling = entities * MAX_PENALTY_PER_ENTITY
        ratio = min(1.0, penalties.get(category, 0) / ceiling) if ceiling else 0.0
        scores[category] = int(round(100 * (1 - ratio)))
    return scores


def run_seo_audit(
    db: Session,
    *,
    company_id: str = COMPANY_DEFAULT,
    probe_live: bool = False,
    live_sample: int = 8,
) -> SeoAuditRun:
    """Analyse the storefront's content and record one audit run.

    Commits, like the other batch jobs the seed calls. `probe_live` adds an HTTP
    crawl of a sample of pages — off by default so seeding never reaches out to
    the network.
    """
    started_at = datetime.utcnow()
    clock = time.perf_counter()

    views = _build_views(db)
    known_paths = {view.url for view in views}
    meta_by_url = {
        normalize_path(row.url): row
        for row in db.query(SeoMetaRecord).filter(SeoMetaRecord.company_id == company_id).all()
    }

    findings: list[Finding] = []
    findings += _check_meta(views, meta_by_url)
    findings += _check_content(views)
    technical, _redirect_count = _check_technical(db, views, known_paths, company_id)
    findings += technical

    redirect_sources = {
        normalize_path(row.from_path)
        for row in db.query(SeoRedirect)
        .filter(SeoRedirect.company_id == company_id, SeoRedirect.status == "active")
        .all()
    }
    findings += _check_links(db, views, known_paths, redirect_sources, company_id)

    live_pages = 0
    # No crawl attempted is not a claim that the storefront is down, so the
    # column stays True unless a crawl actually failed to reach anything.
    reachable = True
    if probe_live:
        live_findings, live_pages, reachable = _crawl_live(views, live_sample)
        findings += live_findings

    scores = _score(findings, views)
    health = int(round(sum(scores.values()) / len(scores))) if scores else 100

    run = SeoAuditRun(
        company_id=company_id,
        pages_crawled=len(views),
        issues_found=len(findings),
        health_score=health,
        live_pages_crawled=live_pages,
        storefront_reachable=reachable,
        duration_ms=int((time.perf_counter() - clock) * 1000),
        category_scores_json=dump_json(scores),
        started_at=started_at,
        completed_at=datetime.utcnow(),
    )
    db.add(run)

    # An audit replaces its own previous output rather than stacking duplicates.
    # Issues raised by hand (`source != "auto"`) are none of its business, and an
    # issue the user chose to ignore stays ignored when it is detected again.
    previous = (
        db.query(SeoAuditIssue)
        .filter(SeoAuditIssue.company_id == company_id, SeoAuditIssue.source == "auto")
        .all()
    )
    ignored = {row.fingerprint for row in previous if row.status == "ignored"}
    for row in previous:
        db.delete(row)
    db.flush()

    for finding in findings:
        db.add(
            SeoAuditIssue(
                company_id=company_id,
                issue_type=finding.issue_type,
                category=finding.category,
                severity=finding.severity,
                url=finding.url,
                entity=finding.entity,
                suggestion=finding.suggestion,
                status="ignored" if (finding.issue_type, finding.url) in ignored else "open",
                affected_count=finding.affected_count,
                source="auto",
            )
        )

    db.commit()
    return run
