"""Seed the primary Againcart workspace site (id=co1)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.database import SessionLocal  # noqa: E402
from app.models.website_settings import DEFAULT_WEBSITE_SETTINGS_ID, WebsiteSettings  # noqa: E402
from app.models.workspace_site import DEFAULT_SITE_ID, WorkspaceSite  # noqa: E402
from app.routers.workspace_sites import _sync_website_settings  # noqa: E402


PHONE = "01805049241"


def seed_primary_site(db) -> int:
    row = db.get(WorkspaceSite, DEFAULT_SITE_ID)
    created = 0
    if not row:
        row = WorkspaceSite(id=DEFAULT_SITE_ID)
        db.add(row)
        created = 1

    row.company_id = "default"
    row.code = "AGC"
    row.name = "Againcart"
    row.status = "active"
    row.plan = "Growth"
    row.owner = "Againsoft"
    row.primary_domain = "againerp-frontend.vercel.app"
    row.domain_aliases = "www.againsoft.com,againsoft.com,localhost:3010"
    row.storefront_url_local = "http://localhost:3010"
    row.storefront_url_preview = "https://againerp-frontend.vercel.app"
    row.storefront_url_production = "https://againerp-frontend.vercel.app"
    row.git_repo_url = ""
    row.git_default_branch = "main"
    row.vercel_project_id = ""
    row.vercel_project_name = ""
    row.vercel_team_slug = ""
    row.tagline = "IT store powered by AgainERP"
    row.logo_url = ""
    row.logo_mobile_url = ""
    row.favicon_url = ""
    row.address = (
        "Samir Tower, House No: 308, Level: 4, S J Jahanara Imam Sharani, "
        "New Elephant Rd, Dhaka 1205"
    )
    row.contact_phone = PHONE
    row.contact_email = "info@againsoft.com"
    row.whatsapp_number = PHONE
    row.copyright_text = "© 2026 Againcart. All rights reserved."
    row.business_hours = "Saturday – Thursday, 10:00 AM – 8:00 PM"
    row.meta_title = "Againcart"
    row.meta_description = "Shop IT products online in Bangladesh."
    row.meta_keywords = "laptop, computer, gadget, bangladesh, againcart"
    from app.services.site_store_options import dump_site_options

    row.options_json = dump_site_options({})
    row.currency = "BDT"
    row.timezone = "Asia/Dhaka"
    row.notes = "Primary storefront site"
    row.is_primary = True

    # Ensure no other primary
    for other in db.query(WorkspaceSite).filter(WorkspaceSite.id != DEFAULT_SITE_ID).all():
        other.is_primary = False

    _sync_website_settings(db, row)
    # Prefer Againcart naming on website_settings even if row existed with AgainERP defaults
    settings = db.get(WebsiteSettings, DEFAULT_WEBSITE_SETTINGS_ID)
    if settings:
        settings.site_name = row.name
        settings.contact_phone = row.contact_phone
        settings.contact_email = row.contact_email
        settings.whatsapp_number = row.whatsapp_number
        settings.address = row.address
        settings.copyright_text = row.copyright_text
        settings.tagline = row.tagline

    db.commit()
    return created


def main() -> None:
    db = SessionLocal()
    try:
        created = seed_primary_site(db)
        print(f"ok site={DEFAULT_SITE_ID} created={created}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
