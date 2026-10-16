"""Let the storefront send reviews without a shop account (they stay pending until approved in the admin).

The Moharaz storefront signs shoppers in on the page only — the ERP sees its reviews as guest reviews,
which the site option "allow_guest_reviews" (Workspace → Sites → Option, default off) refuses.

    python -m scripts.enable_guest_reviews            # every site
"""
from __future__ import annotations

import json

import scripts.init_db  # noqa: F401 — registers every model
from app.database import SessionLocal
from app.models.workspace_site import WorkspaceSite


def main() -> None:
    db = SessionLocal()
    try:
        for site in db.query(WorkspaceSite).all():
            try:
                options = json.loads(site.options_json or "{}")
            except json.JSONDecodeError:
                options = {}
            if not isinstance(options, dict):
                options = {}
            before = options.get("allow_guest_reviews")
            options["allow_reviews"] = True
            options["allow_guest_reviews"] = True
            site.options_json = json.dumps(options, ensure_ascii=False)
            print(f"{site.name}: allow_guest_reviews {before} → True")
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
