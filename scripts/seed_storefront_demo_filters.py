#!/usr/bin/env python3
"""Seed storefront demo filters on live (and optionally local) for practical QA.

Targets categories customers can open on the storefront:
  - laptops (dropshipping)
  - monitors (dropshipping)
  - casing (catalog / components — products already published)

Also refreshes PC — Casing form-factor variety and filter display types.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

TARGETS = {
    "local": "http://127.0.0.1:8010",
    "live": "https://againerp-production.up.railway.app",
}

AUTH = {"email": "admin@againerp.local", "password": "admin123"}

DEMO_PROFILES = [
    {
        "name": "Storefront Demo — Laptop",
        "code_hint": "sf_demo_laptop",
        "groups": [
            {
                "name": "Specs",
                "attributes": [
                    {
                        "name": "RAM",
                        "filterable": True,
                        "filter_display_type": "multi_select",
                        "storefront_filter_visible": True,
                        "predefined_values": ["8 GB", "16 GB", "32 GB"],
                    },
                    {
                        "name": "Storage",
                        "filterable": True,
                        "filter_display_type": "multi_select",
                        "storefront_filter_visible": True,
                        "predefined_values": ["256 GB", "512 GB", "1 TB"],
                    },
                    {
                        "name": "Screen Size",
                        "filterable": True,
                        "filter_display_type": "range",
                        "storefront_filter_visible": True,
                        "predefined_values": ["14", "15.6", "16"],
                    },
                ],
            }
        ],
    },
    {
        "name": "Storefront Demo — Monitor",
        "code_hint": "sf_demo_monitor",
        "groups": [
            {
                "name": "Specs",
                "attributes": [
                    {
                        "name": "Panel Type",
                        "filterable": True,
                        "filter_display_type": "multi_select",
                        "storefront_filter_visible": True,
                        "predefined_values": ["IPS", "VA", "OLED"],
                    },
                    {
                        "name": "Refresh Rate",
                        "filterable": True,
                        "filter_display_type": "multi_select",
                        "storefront_filter_visible": True,
                        "predefined_values": ["60 Hz", "144 Hz", "165 Hz", "240 Hz"],
                    },
                    {
                        "name": "Size inch",
                        "filterable": True,
                        "filter_display_type": "range",
                        "storefront_filter_visible": True,
                        "predefined_values": ["27", "32", "34"],
                    },
                ],
            }
        ],
    },
    {
        "name": "PC — Casing",
        "code_hint": "pc_casing",
        "groups": [
            {
                "name": "Specs",
                "attributes": [
                    {
                        "name": "Form Factor",
                        "filterable": True,
                        "filter_display_type": "multi_select",
                        "storefront_filter_visible": True,
                        "predefined_values": ["mid_tower", "full_tower", "mini_itx"],
                    },
                    {
                        "name": "Max GPU Length mm",
                        "filterable": True,
                        "filter_display_type": "range",
                        "storefront_filter_visible": True,
                        "predefined_values": ["365", "392", "410"],
                    },
                ],
            }
        ],
    },
]

# slug → (profile_name, {attr_code: value})
PRODUCT_SPECS: Dict[str, Tuple[str, Dict[str, str]]] = {
    # Laptops (dropshipping PLP /laptops)
    "hp-pavilion-14": (
        "Storefront Demo — Laptop",
        {"ram": "8 GB", "storage": "512 GB", "screen_size": "14"},
    ),
    "dell-inspiron-15": (
        "Storefront Demo — Laptop",
        {"ram": "16 GB", "storage": "512 GB", "screen_size": "15.6"},
    ),
    "lenovo-ideapad-slim-5": (
        "Storefront Demo — Laptop",
        {"ram": "16 GB", "storage": "1 TB", "screen_size": "14"},
    ),
    "asus-tuf-gaming-f15": (
        "Storefront Demo — Laptop",
        {"ram": "32 GB", "storage": "1 TB", "screen_size": "15.6"},
    ),
    "macbook-air-m2": (
        "Storefront Demo — Laptop",
        {"ram": "16 GB", "storage": "256 GB", "screen_size": "14"},
    ),
    # Monitors
    "samsung-odyssey-g5-27": (
        "Storefront Demo — Monitor",
        {"panel_type": "VA", "refresh_rate": "165 Hz", "size_inch": "27"},
    ),
    "lg-ultrawide-34wp65c": (
        "Storefront Demo — Monitor",
        {"panel_type": "IPS", "refresh_rate": "165 Hz", "size_inch": "34"},
    ),
    # Casing — varied form factors for filter demo
    "pcb-nzxt-h5-flow": (
        "PC — Casing",
        {"form_factor": "mid_tower", "max_gpu_length_mm": "365"},
    ),
    "pcb-lian-li-lancool-216": (
        "PC — Casing",
        {"form_factor": "full_tower", "max_gpu_length_mm": "392"},
    ),
    "pcb-cm-td500-mesh": (
        "PC — Casing",
        {"form_factor": "mini_itx", "max_gpu_length_mm": "410"},
    ),
}


def api(base: str, method: str, path: str, token: Optional[str] = None, body: Any = None) -> Tuple[int, Any]:
    data = None if body is None else json.dumps(body).encode()
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{base}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=90) as res:
            raw = res.read()
            return res.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            payload = json.loads(raw) if raw else {}
        except Exception:
            payload = {"detail": raw.decode("utf-8", errors="replace")[:500]}
        return exc.code, payload


def login(base: str) -> str:
    code, data = api(base, "POST", "/api/v1/auth/login", body=AUTH)
    if code >= 400 or not data.get("token"):
        raise RuntimeError(f"login failed: {code} {data}")
    return data["token"]


def list_all(base: str, token: str, path: str) -> List[dict]:
    code, data = api(base, "GET", f"{path}?per_page=200", token=token)
    if code >= 400:
        raise RuntimeError(f"list {path}: {code} {data}")
    return data.get("data") or []


def ensure_profile(base: str, token: str, spec: dict) -> Tuple[str, Dict[str, str]]:
    profiles = list_all(base, token, "/api/v1/catalog/attribute-profiles")
    existing = next((p for p in profiles if p.get("name") == spec["name"]), None)

    # When updating, keep attribute/group ids so in-use filter values aren't treated as removals.
    groups_payload = json.loads(json.dumps(spec["groups"]))
    if existing:
        code, data = api(
            base,
            "GET",
            f"/api/v1/catalog/attribute-profiles/{existing['id']}",
            token=token,
        )
        detail = (data.get("data") or data) if code < 400 else {}
        existing_groups = detail.get("groups") or []
        for gi, group in enumerate(groups_payload):
            if gi < len(existing_groups):
                eg = existing_groups[gi]
                group["id"] = eg.get("id")
                existing_attrs = {
                    (a.get("name") or "").strip().lower(): a
                    for a in (eg.get("attributes") or [])
                }
                for attr in group.get("attributes") or []:
                    match = existing_attrs.get((attr.get("name") or "").strip().lower())
                    if match and match.get("id"):
                        attr["id"] = match["id"]
                        # Keep any in-use values that aren't in the new predefined list.
                        old_vals = list(match.get("predefined_values") or [])
                        new_vals = list(attr.get("predefined_values") or [])
                        merged = list(dict.fromkeys([*new_vals, *old_vals]))
                        attr["predefined_values"] = merged

    bulk = {"profile_name": spec["name"], "groups": groups_payload}
    if existing:
        code, data = api(
            base,
            "PUT",
            f"/api/v1/catalog/attribute-profiles/{existing['id']}/bulk",
            token=token,
            body=bulk,
        )
        if code >= 400:
            raise RuntimeError(f"update {spec['name']}: {code} {data}")
        pid = existing["id"]
    else:
        code, data = api(
            base,
            "POST",
            "/api/v1/catalog/attribute-profiles/bulk",
            token=token,
            body=bulk,
        )
        if code >= 400:
            raise RuntimeError(f"create {spec['name']}: {code} {data}")
        pid = (data.get("data") or data)["id"]

    api(
        base,
        "PATCH",
        f"/api/v1/catalog/attribute-profiles/{pid}",
        token=token,
        body={"code": spec["code_hint"], "is_active": True},
    )
    code, data = api(base, "GET", f"/api/v1/catalog/attribute-profiles/{pid}", token=token)
    detail = data.get("data") or data
    amap: Dict[str, str] = {}
    for g in detail.get("groups") or []:
        for a in g.get("attributes") or []:
            amap[a["code"]] = a["id"]
            print(
                f"    attr {a.get('name')} filter={a.get('is_filterable')} "
                f"type={a.get('filter_display_type')} eye={a.get('storefront_filter_visible')} "
                f"vals={a.get('predefined_values')}"
            )
    print(f"  profile {spec['name']} -> {pid[:8]}… attrs={len(amap)}")
    return pid, amap


def seed_target(label: str, base: str) -> None:
    print(f"\n=== {label} ({base}) ===")
    token = login(base)

    profile_ids: Dict[str, str] = {}
    profile_attrs: Dict[str, Dict[str, str]] = {}
    for spec in DEMO_PROFILES:
        pid, amap = ensure_profile(base, token, spec)
        profile_ids[spec["name"]] = pid
        profile_attrs[spec["name"]] = amap

    products = {
        r.get("slug"): r
        for r in list_all(base, token, "/api/v1/catalog/products")
        if r.get("slug")
    }
    ok = 0
    for slug, (pname, specs) in PRODUCT_SPECS.items():
        row = products.get(slug)
        if not row:
            print(f"  SKIP missing product {slug}")
            continue
        pid = profile_ids[pname]
        amap = profile_attrs[pname]
        values = [
            {"attribute_id": amap[k], "value": v, "sort_order": i}
            for i, (k, v) in enumerate(specs.items())
            if k in amap
        ]
        missing = [k for k in specs if k not in amap]
        if missing:
            print(f"  WARN {slug} missing attr codes {missing} known={list(amap)}")
        code, body = api(
            base,
            "PUT",
            f"/api/v1/catalog/products/{row['id']}/specs",
            token=token,
            body={"attribute_profile_id": pid, "values": values},
        )
        if code < 400:
            ok += 1
            print(f"  OK {slug} -> {pname} ({len(values)} values)")
        else:
            print(f"  FAIL {slug} {code} {body}")
    print(f"  specs applied {ok}/{len(PRODUCT_SPECS)}")

    # Smoke facets for demo categories (may 404 attributes until new API is live)
    for slug in ("laptops", "monitors", "casing"):
        code, data = api(base, "GET", f"/api/v1/storefront/products/facets?category_slug={slug}")
        attrs = ((data.get("data") or {}).get("attributes")) if isinstance(data, dict) else None
        print(f"  facets {slug}: http={code} attributes={len(attrs or [])}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", choices=["local", "live", "all"], default="live")
    args = parser.parse_args()
    targets = list(TARGETS.items()) if args.target == "all" else [(args.target, TARGETS[args.target])]
    for label, base in targets:
        try:
            seed_target(label, base)
        except Exception as exc:
            print(f"FAILED {label}: {exc}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
