#!/usr/bin/env python3
"""Seed separate PC Builder attribute profiles (CPU, Motherboard, Memory, …).

One Catalog product = one attribute profile. Prefer per-component profiles so
the Specs tab only shows relevant fields.

Usage:
  python scripts/seed_pc_builder_attributes.py --target live
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

PROFILES = [
    {
        "name": "PC — CPU",
        "code_hint": "pc_cpu",
        "groups": [{
            "name": "Specs",
            "attributes": [
                {"name": "Socket", "filterable": True, "predefined_values": ["lga_1700", "am5", "am4"]},
                {"name": "Platform", "filterable": True, "predefined_values": ["Intel", "AMD"]},
                {"name": "TDP", "filterable": True, "predefined_values": []},
                {"name": "Cores", "filterable": True, "predefined_values": []},
            ],
        }],
    },
    {
        "name": "PC — Motherboard",
        "code_hint": "pc_motherboard",
        "groups": [{
            "name": "Specs",
            "attributes": [
                {"name": "Socket", "filterable": True, "predefined_values": ["lga_1700", "am5", "am4"]},
                {"name": "RAM Type", "filterable": True, "predefined_values": ["ddr5", "ddr4"]},
                {"name": "Platform", "filterable": True, "predefined_values": ["Intel", "AMD"]},
                {"name": "Chipset", "filterable": True, "predefined_values": []},
                {"name": "Form Factor", "filterable": True, "predefined_values": ["atx", "micro_atx", "mini_itx"]},
            ],
        }],
    },
    {
        "name": "PC — Memory",
        "code_hint": "pc_memory",
        "groups": [{
            "name": "Specs",
            "attributes": [
                {"name": "Type", "filterable": True, "predefined_values": ["ddr5", "ddr4"]},
                {"name": "Speed", "filterable": True, "predefined_values": []},
                {"name": "Capacity GB", "filterable": True, "predefined_values": []},
            ],
        }],
    },
    {
        "name": "PC — Cooler",
        "code_hint": "pc_cooler",
        "groups": [{
            "name": "Specs",
            "attributes": [
                {"name": "Socket Support", "filterable": True, "predefined_values": ["lga_1700", "am5", "universal"]},
                {"name": "Cooler Type", "filterable": True, "predefined_values": ["air", "aio"]},
            ],
        }],
    },
    {
        "name": "PC — Storage",
        "code_hint": "pc_storage",
        "groups": [{
            "name": "Specs",
            "attributes": [
                {"name": "Interface", "filterable": True, "predefined_values": ["nvme", "sata"]},
                {"name": "Capacity GB", "filterable": True, "predefined_values": []},
            ],
        }],
    },
    {
        "name": "PC — Graphics Card",
        "code_hint": "pc_graphics_card",
        "groups": [{
            "name": "Specs",
            "attributes": [
                {"name": "GPU Brand", "filterable": True, "predefined_values": ["NVIDIA", "AMD"]},
                {"name": "VRAM GB", "filterable": True, "predefined_values": []},
                {"name": "TGP", "filterable": True, "predefined_values": []},
            ],
        }],
    },
    {
        "name": "PC — Power Supply",
        "code_hint": "pc_power_supply",
        "groups": [{
            "name": "Specs",
            "attributes": [
                {"name": "Wattage", "filterable": True, "predefined_values": []},
                {"name": "Efficiency", "filterable": True, "predefined_values": ["80+ bronze", "80+ gold", "80+ platinum"]},
            ],
        }],
    },
    {
        "name": "PC — Casing",
        "code_hint": "pc_casing",
        "groups": [{
            "name": "Specs",
            "attributes": [
                {"name": "Form Factor", "filterable": True, "predefined_values": ["mid_tower", "full_tower", "mini_itx"]},
                {"name": "Max GPU Length mm", "filterable": True, "predefined_values": []},
            ],
        }],
    },
]

# slug → (profile_name, {attr_code: value})
PRODUCT_SPECS: Dict[str, Tuple[str, Dict[str, str]]] = {
    "pcb-intel-core-i5-14400f": ("PC — CPU", {"socket": "lga_1700", "platform": "Intel", "tdp": "148", "cores": "10"}),
    "pcb-intel-core-i7-14700k": ("PC — CPU", {"socket": "lga_1700", "platform": "Intel", "tdp": "125", "cores": "20"}),
    "pcb-amd-ryzen-5-7600": ("PC — CPU", {"socket": "am5", "platform": "AMD", "tdp": "65", "cores": "6"}),
    "pcb-amd-ryzen-7-7800x3d": ("PC — CPU", {"socket": "am5", "platform": "AMD", "tdp": "120", "cores": "8"}),
    "pcb-asus-prime-z790-p-wifi": ("PC — Motherboard", {"socket": "lga_1700", "ram_type": "ddr5", "platform": "Intel", "chipset": "z790", "form_factor": "atx"}),
    "pcb-gigabyte-b760m-ds3h-ax": ("PC — Motherboard", {"socket": "lga_1700", "ram_type": "ddr5", "platform": "Intel", "chipset": "b760", "form_factor": "micro_atx"}),
    "pcb-msi-mag-b650-tomahawk-wifi": ("PC — Motherboard", {"socket": "am5", "ram_type": "ddr5", "platform": "AMD", "chipset": "b650", "form_factor": "atx"}),
    "pcb-corsair-vengeance-32gb-ddr5": ("PC — Memory", {"type": "ddr5", "speed": "6000", "capacity_gb": "32"}),
    "pcb-teamgroup-delta-16gb-ddr5": ("PC — Memory", {"type": "ddr5", "speed": "5600", "capacity_gb": "16"}),
    "pcb-corsair-lpx-16gb-ddr4": ("PC — Memory", {"type": "ddr4", "speed": "3200", "capacity_gb": "16"}),
    "pcb-cooler-master-hyper-212-black": ("PC — Cooler", {"socket_support": "universal", "cooler_type": "air"}),
    "pcb-deepcool-ak620-digital": ("PC — Cooler", {"socket_support": "universal", "cooler_type": "air"}),
    "pcb-corsair-h100i-rgb-elite": ("PC — Cooler", {"socket_support": "universal", "cooler_type": "aio"}),
    "pcb-samsung-990-pro-1tb": ("PC — Storage", {"interface": "nvme", "capacity_gb": "1000"}),
    "pcb-wd-black-sn850x-2tb": ("PC — Storage", {"interface": "nvme", "capacity_gb": "2000"}),
    "pcb-samsung-870-evo-1tb": ("PC — Storage", {"interface": "sata", "capacity_gb": "1000"}),
    "pcb-asus-dual-rtx-4060-8gb": ("PC — Graphics Card", {"gpu_brand": "NVIDIA", "vram_gb": "8", "tgp": "115"}),
    "pcb-msi-rtx-4070-super-12gb": ("PC — Graphics Card", {"gpu_brand": "NVIDIA", "vram_gb": "12", "tgp": "220"}),
    "pcb-gigabyte-rx-7600-8gb": ("PC — Graphics Card", {"gpu_brand": "AMD", "vram_gb": "8", "tgp": "165"}),
    "pcb-corsair-rm750x-750w": ("PC — Power Supply", {"wattage": "750", "efficiency": "80+ gold"}),
    "pcb-seasonic-focus-gx-650": ("PC — Power Supply", {"wattage": "650", "efficiency": "80+ gold"}),
    "pcb-cm-mwe-gold-550-v2": ("PC — Power Supply", {"wattage": "550", "efficiency": "80+ gold"}),
    "pcb-nzxt-h5-flow": ("PC — Casing", {"form_factor": "mid_tower", "max_gpu_length_mm": "365"}),
    "pcb-lian-li-lancool-216": ("PC — Casing", {"form_factor": "mid_tower", "max_gpu_length_mm": "392"}),
    "pcb-cm-td500-mesh": ("PC — Casing", {"form_factor": "mid_tower", "max_gpu_length_mm": "410"}),
}

INTEL_BUILD = {
    "name": "Intel Gaming PC (LGA1700)",
    "slug": "intel-gaming-lga1700",
    "description": "Complete Intel 14th-gen build — LGA1700 + DDR5.",
    "parts": {
        "cpu": "pcb-intel-core-i5-14400f",
        "motherboard": "pcb-asus-prime-z790-p-wifi",
        "cpu-cooler": "pcb-cooler-master-hyper-212-black",
        "memory": "pcb-corsair-vengeance-32gb-ddr5",
        "storage": "pcb-samsung-990-pro-1tb",
        "graphics-card": "pcb-asus-dual-rtx-4060-8gb",
        "power-supply": "pcb-corsair-rm750x-750w",
        "casing": "pcb-nzxt-h5-flow",
    },
}

AMD_BUILD = {
    "name": "AMD Gaming PC (AM5)",
    "slug": "amd-gaming-am5",
    "description": "Complete AMD Ryzen 7000 build — AM5 + DDR5.",
    "parts": {
        "cpu": "pcb-amd-ryzen-5-7600",
        "motherboard": "pcb-msi-mag-b650-tomahawk-wifi",
        "cpu-cooler": "pcb-deepcool-ak620-digital",
        "memory": "pcb-teamgroup-delta-16gb-ddr5",
        "storage": "pcb-wd-black-sn850x-2tb",
        "graphics-card": "pcb-gigabyte-rx-7600-8gb",
        "power-supply": "pcb-seasonic-focus-gx-650",
        "casing": "pcb-lian-li-lancool-216",
    },
}


def api(base: str, method: str, path: str, token: Optional[str] = None, body: Any = None) -> Tuple[int, Any]:
    data = None if body is None else json.dumps(body).encode()
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{base}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            raw = res.read()
            return res.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            payload = json.loads(raw) if raw else {}
        except Exception:
            payload = {"detail": raw.decode("utf-8", errors="replace")[:400]}
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
    bulk = {"profile_name": spec["name"], "groups": spec["groups"]}
    if existing:
        code, data = api(base, "PUT", f"/api/v1/catalog/attribute-profiles/{existing['id']}/bulk", token=token, body=bulk)
        if code >= 400:
            raise RuntimeError(f"update {spec['name']}: {code} {data}")
        pid = existing["id"]
    else:
        code, data = api(base, "POST", "/api/v1/catalog/attribute-profiles/bulk", token=token, body=bulk)
        if code >= 400:
            raise RuntimeError(f"create {spec['name']}: {code} {data}")
        pid = (data.get("data") or data)["id"]
    api(base, "PATCH", f"/api/v1/catalog/attribute-profiles/{pid}", token=token, body={"code": spec["code_hint"], "is_active": True})
    code, data = api(base, "GET", f"/api/v1/catalog/attribute-profiles/{pid}", token=token)
    detail = data.get("data") or data
    amap: Dict[str, str] = {}
    for g in detail.get("groups") or []:
        for a in g.get("attributes") or []:
            amap[a["code"]] = a["id"]
    print(f"  profile {spec['name']} -> {pid[:8]}")
    return pid, amap


def upsert_template(base, token, profile_id, slot_cats, products_by_slug, build):
    templates = list_all(base, token, "/api/v1/configurator/templates")
    existing = next((t for t in templates if t.get("slug") == build["slug"]), None)
    components = []
    for slot, pslug in build["parts"].items():
        cat, prod = slot_cats.get(slot), products_by_slug.get(pslug)
        if not cat or not prod:
            continue
        components.append({
            "category_id": cat["id"],
            "category_name": cat.get("name") or slot,
            "product_id": prod["id"],
            "product_name": prod.get("name") or pslug,
            "quantity": 1,
        })
    payload = {
        "profile_id": profile_id,
        "name": build["name"],
        "slug": build["slug"],
        "description": build["description"],
        "components": components,
        "is_featured": True,
        "status": "active",
    }
    if existing:
        code, _ = api(base, "PATCH", f"/api/v1/configurator/templates/{existing['id']}", token=token, body=payload)
    else:
        code, _ = api(base, "POST", "/api/v1/configurator/templates", token=token, body=payload)
    print(f"  template {build['slug']}: {code} parts={len(components)}")


def seed_target(label: str, base: str) -> None:
    print(f"\n=== {label} ({base}) ===")
    token = login(base)

    profile_ids: Dict[str, str] = {}
    profile_attrs: Dict[str, Dict[str, str]] = {}
    for spec in PROFILES:
        pid, amap = ensure_profile(base, token, spec)
        profile_ids[spec["name"]] = pid
        profile_attrs[spec["name"]] = amap

    for p in list_all(base, token, "/api/v1/catalog/attribute-profiles"):
        if p.get("name") == "PC Builder Components":
            api(base, "PATCH", f"/api/v1/catalog/attribute-profiles/{p['id']}", token=token, body={"is_active": False})
            print("  deactivated mega profile")

    products = {r.get("slug"): r for r in list_all(base, token, "/api/v1/catalog/products") if r.get("slug")}
    ok = 0
    for slug, (pname, specs) in PRODUCT_SPECS.items():
        row = products.get(slug)
        if not row:
            print(f"  SKIP {slug}")
            continue
        pid = profile_ids[pname]
        amap = profile_attrs[pname]
        values = [{"attribute_id": amap[k], "value": v, "sort_order": i}
                  for i, (k, v) in enumerate(specs.items()) if k in amap]
        code, _ = api(base, "PUT", f"/api/v1/catalog/products/{row['id']}/specs", token=token,
                      body={"attribute_profile_id": pid, "values": values})
        if code < 400:
            ok += 1
        else:
            print(f"  FAIL {slug} {code}")
    print(f"  specs {ok}/{len(PRODUCT_SPECS)}")

    cfg = next(p for p in list_all(base, token, "/api/v1/configurator/profiles") if p.get("slug") == "pc-builder")
    cats = {
        c.get("slug"): c
        for c in list_all(base, token, "/api/v1/configurator/categories")
        if (c.get("profile_id") or c.get("profileId")) == cfg["id"]
    }
    upsert_template(base, token, cfg["id"], cats, products, INTEL_BUILD)
    upsert_template(base, token, cfg["id"], cats, products, AMD_BUILD)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", choices=["local", "live", "all"], default="all")
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
