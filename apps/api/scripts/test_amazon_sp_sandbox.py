#!/usr/bin/env python3
"""Smoke-test Amazon SP-API via AgainERP settings (.env) — Elim-style."""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import get_settings
from app.services.amazon_sp_client import (
    AmazonSpClientError,
    get_access_token,
    get_marketplace_participations,
    is_configured,
    search_catalog_items,
)


def main() -> int:
    # Reload settings if process already cached empty values
    get_settings.cache_clear()
    s = get_settings()
    print("=" * 60)
    print("Amazon SP-API (from apps/api/.env)")
    print("=" * 60)
    print(
        json.dumps(
            {
                "configured": is_configured(),
                "app_name": s.amazon_sp_app_name,
                "env": s.amazon_sp_env,
                "region": s.amazon_sp_region,
                "solution_id": s.amazon_sp_solution_id,
                "client_id_hint": (s.amazon_sp_client_id or "")[:40] + "…",
            },
            indent=2,
        )
    )
    if not is_configured():
        print("FAIL: missing AMAZON_SP_* credentials in .env")
        return 1

    try:
        token = get_access_token()
        print(f"\nAccess token OK: {token[:8]}…")
        markets = get_marketplace_participations()
        print("\nMarketplaces:")
        print(json.dumps(markets, indent=2)[:1200])
        try:
            catalog = search_catalog_items(keywords="shoes", page_size=5)
            print("\nCatalog search:")
            print(json.dumps(catalog, indent=2)[:800])
        except AmazonSpClientError as exc:
            print(f"\nCatalog search (expected sandbox limits): {exc}")
    except AmazonSpClientError as exc:
        print(f"FAIL: {exc}")
        return 1

    print("\nSUMMARY: WORKING")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
