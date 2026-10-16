#!/usr/bin/env python3
"""Seed builder catalog packs (PC + CCTV) and publish builder profiles.

Usage:
  python scripts/seed_builder_catalog.py              # both packs, local+live
  python scripts/seed_builder_catalog.py --pack cctv  # CCTV only
  python scripts/seed_builder_catalog.py --pack pc --target local
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

PC_PARENT = {
    "name": "PC Components",
    "caption": "PC Components",
    "slug": "pc-components",
    "sort_order": 1,
    "is_active": True,
    "show_in_top_menu": True,
    "channel": "catalog",
    "description": "Parts for PC Builder",
}

PC_SLOTS = [
    ("cpu", "CPU", 1),
    ("motherboard", "Motherboard", 2),
    ("cpu-cooler", "CPU Cooler", 3),
    ("memory", "Memory", 4),
    ("storage", "Storage", 5),
    ("graphics-card", "Graphics Card", 6),
    ("power-supply", "Power Supply", 7),
    ("casing", "Casing", 8),
    ("casing-cooler", "Casing Cooler", 9),
    ("monitor", "Monitor", 10),
    ("keyboard", "Keyboard", 11),
    ("mouse", "Mouse", 12),
    ("headphone", "Headphone", 13),
    ("ups", "UPS", 14),
]

PC_BRANDS = [
    ("intel", "Intel", 1),
    ("amd", "AMD", 2),
    ("asus", "ASUS", 3),
    ("msi", "MSI", 4),
    ("gigabyte", "Gigabyte", 5),
    ("corsair", "Corsair", 6),
    ("nzxt", "NZXT", 7),
    ("cooler-master", "Cooler Master", 8),
    ("deepcool", "Deepcool", 9),
    ("samsung", "Samsung", 10),
    ("western-digital", "Western Digital", 11),
    ("seasonic", "Seasonic", 12),
    ("logitech", "Logitech", 13),
    ("razer", "Razer", 14),
    ("keychron", "Keychron", 15),
    ("sony", "Sony", 16),
    ("lg", "LG", 17),
    ("apc", "APC", 18),
    ("lian-li", "Lian Li", 19),
    ("teamgroup", "TeamGroup", 20),
]

PC_PRODUCTS: List[Tuple[str, str, str, str, str, int, Optional[int], int, str]] = [
    ("cpu", "intel", "Intel Core i5-14400F", "pcb-intel-core-i5-14400f", "PCB-CPU-I5-14400F", 22990, 24990, 25, "i5-14400f"),
    ("cpu", "intel", "Intel Core i7-14700K", "pcb-intel-core-i7-14700k", "PCB-CPU-I7-14700K", 42990, 45990, 18, "i7-14700k"),
    ("cpu", "amd", "AMD Ryzen 5 7600", "pcb-amd-ryzen-5-7600", "PCB-CPU-R5-7600", 24990, 26990, 22, "r5-7600"),
    ("cpu", "amd", "AMD Ryzen 7 7800X3D", "pcb-amd-ryzen-7-7800x3d", "PCB-CPU-R7-7800X3D", 48990, 52990, 12, "r7-7800x3d"),
    ("motherboard", "msi", "MSI MAG B650 Tomahawk WiFi", "pcb-msi-mag-b650-tomahawk-wifi", "PCB-MB-B650-TOM", 28990, 30990, 15, "b650-tom"),
    ("motherboard", "asus", "ASUS PRIME Z790-P WIFI", "pcb-asus-prime-z790-p-wifi", "PCB-MB-Z790-P", 31990, 33990, 10, "z790-p"),
    ("motherboard", "gigabyte", "Gigabyte B760M DS3H AX", "pcb-gigabyte-b760m-ds3h-ax", "PCB-MB-B760M", 18990, 20990, 20, "b760m"),
    ("cpu-cooler", "cooler-master", "Cooler Master Hyper 212 Black", "pcb-cooler-master-hyper-212-black", "PCB-CL-H212", 3990, 4490, 40, "hyper212"),
    ("cpu-cooler", "deepcool", "Deepcool AK620 Digital", "pcb-deepcool-ak620-digital", "PCB-CL-AK620", 7990, 8990, 18, "ak620"),
    ("memory", "corsair", "Corsair Vengeance 32GB (2x16) DDR5-6000", "pcb-corsair-vengeance-32gb-ddr5", "PCB-RAM-V32-D5", 14990, 16990, 30, "veng-ddr5"),
    ("memory", "teamgroup", "TeamGroup T-Force Delta RGB 16GB (2x8) DDR5-5600", "pcb-teamgroup-delta-16gb-ddr5", "PCB-RAM-TF16-D5", 7990, 8990, 35, "delta-ddr5"),
    ("storage", "samsung", "Samsung 990 PRO 1TB NVMe SSD", "pcb-samsung-990-pro-1tb", "PCB-SSD-990P-1T", 14990, 16990, 28, "990pro"),
    ("storage", "western-digital", "WD Black SN850X 2TB NVMe SSD", "pcb-wd-black-sn850x-2tb", "PCB-SSD-SN850X-2T", 22990, 24990, 14, "sn850x"),
    ("graphics-card", "asus", "ASUS Dual GeForce RTX 4060 OC 8GB", "pcb-asus-dual-rtx-4060-8gb", "PCB-GPU-4060-8G", 38990, 41990, 12, "rtx4060"),
    ("graphics-card", "msi", "MSI GeForce RTX 4070 SUPER Ventus 2X 12GB", "pcb-msi-rtx-4070-super-12gb", "PCB-GPU-4070S-12G", 79990, 84990, 8, "rtx4070s"),
    ("power-supply", "corsair", "Corsair RM750x 750W 80+ Gold", "pcb-corsair-rm750x-750w", "PCB-PSU-RM750X", 14990, 16990, 20, "rm750x"),
    ("power-supply", "seasonic", "Seasonic Focus GX-650 650W 80+ Gold", "pcb-seasonic-focus-gx-650", "PCB-PSU-GX650", 11990, 12990, 18, "gx650"),
    ("casing", "nzxt", "NZXT H5 Flow Mid Tower", "pcb-nzxt-h5-flow", "PCB-CASE-H5F", 9990, 10990, 16, "h5flow"),
    ("casing", "lian-li", "Lian Li Lancool 216 Mid Tower", "pcb-lian-li-lancool-216", "PCB-CASE-LC216", 11990, 12990, 12, "lancool216"),
    ("casing-cooler", "deepcool", "Deepcool FC120 ARGB 3-Pack", "pcb-deepcool-fc120-argb-3pack", "PCB-FAN-FC120-3", 4990, 5490, 30, "fc120"),
    ("monitor", "samsung", "Samsung Odyssey G5 27\" 165Hz", "pcb-samsung-odyssey-g5-27", "PCB-MON-G5-27", 32990, 35990, 10, "odyssey-g5"),
    ("keyboard", "keychron", "Keychron K2 Pro Wireless Mechanical", "pcb-keychron-k2-pro", "PCB-KB-K2PRO", 12990, 13990, 20, "k2pro"),
    ("mouse", "logitech", "Logitech G502 X", "pcb-logitech-g502-x", "PCB-MS-G502X", 6990, 7990, 25, "g502x"),
    ("headphone", "sony", "Sony WH-1000XM5", "pcb-sony-wh-1000xm5", "PCB-HP-XM5", 39990, 42990, 8, "xm5"),
    ("ups", "apc", "APC Back-UPS 1000VA", "pcb-apc-back-ups-1000va", "PCB-UPS-BX1000", 15990, 17990, 12, "apc1k"),
]

CCTV_PARENT = {
    "name": "CCTV Components",
    "caption": "CCTV Components",
    "slug": "cctv-components",
    "sort_order": 2,
    "is_active": True,
    "show_in_top_menu": True,
    "channel": "catalog",
    "description": "Parts for CCTV Builder",
}

CCTV_SLOTS = [
    ("dvr-nvr", "DVR / NVR", 1),
    ("cameras", "Cameras", 2),
    ("hdd-storage", "HDD / Storage", 3),
    ("poe-switch", "PoE Switch", 4),
    ("monitor", "Monitor", 5),
    ("cable", "Cable", 6),
    ("power-adapter", "Power Adapter", 7),
    ("connector", "Connector / BNC", 8),
]

CCTV_BRANDS = [
    ("hikvision", "Hikvision", 1),
    ("dahua", "Dahua", 2),
    ("tp-link", "TP-Link", 3),
    ("uniview", "Uniview", 4),
    ("western-digital", "Western Digital", 5),
    ("seagate", "Seagate", 6),
    ("samsung", "Samsung", 7),
    ("lg", "LG", 8),
]

CCTV_PRODUCTS: List[Tuple[str, str, str, str, str, int, Optional[int], int, str]] = [
    ("dvr-nvr", "hikvision", "Hikvision 8ch NVR 4K", "cctv-hikvision-8ch-nvr-4k", "CCTV-NVR-HK-8", 18990, 20990, 15, "hk-nvr8"),
    ("dvr-nvr", "dahua", "Dahua 16ch XVR Penta-brid", "cctv-dahua-16ch-xvr", "CCTV-XVR-DH-16", 24990, 27990, 10, "dh-xvr16"),
    ("dvr-nvr", "tp-link", "TP-Link VIGI 8 Channel NVR", "cctv-tplink-vigi-8ch-nvr", "CCTV-NVR-TP-8", 15990, 17990, 12, "tp-nvr8"),
    ("cameras", "hikvision", "Hikvision 2MP Dome IP Camera", "cctv-hikvision-2mp-dome", "CCTV-CAM-HK-D2", 3990, 4490, 40, "hk-dome2"),
    ("cameras", "hikvision", "Hikvision 4MP Bullet ColorVu", "cctv-hikvision-4mp-bullet", "CCTV-CAM-HK-B4", 5990, 6490, 30, "hk-bul4"),
    ("cameras", "dahua", "Dahua 2MP Turret IP Camera", "cctv-dahua-2mp-turret", "CCTV-CAM-DH-T2", 3490, 3990, 35, "dh-tur2"),
    ("cameras", "uniview", "Uniview 4MP Bullet EasyIP", "cctv-uniview-4mp-bullet", "CCTV-CAM-UV-B4", 5490, 5990, 20, "uv-bul4"),
    ("hdd-storage", "western-digital", "WD Purple 2TB Surveillance HDD", "cctv-wd-purple-2tb", "CCTV-HDD-WD-2T", 8990, 9990, 25, "wd-pur2"),
    ("hdd-storage", "seagate", "Seagate SkyHawk 4TB Surveillance", "cctv-seagate-skyhawk-4tb", "CCTV-HDD-SG-4T", 12990, 13990, 18, "sg-sky4"),
    ("hdd-storage", "western-digital", "WD Purple 6TB Surveillance HDD", "cctv-wd-purple-6tb", "CCTV-HDD-WD-6T", 18990, 20990, 10, "wd-pur6"),
    ("poe-switch", "tp-link", "TP-Link 8-Port Gigabit PoE+", "cctv-tplink-8port-poe", "CCTV-SW-TP-8POE", 9990, 10990, 14, "tp-poe8"),
    ("poe-switch", "tp-link", "TP-Link 16-Port Gigabit PoE+", "cctv-tplink-16port-poe", "CCTV-SW-TP-16POE", 18990, 20990, 8, "tp-poe16"),
    ("monitor", "samsung", "Samsung 24\" Full HD CCTV Monitor", "cctv-samsung-24-monitor", "CCTV-MON-SM-24", 14990, 16990, 12, "sm-mon24"),
    ("monitor", "lg", "LG 22\" Full HD CCTV Monitor", "cctv-lg-22-monitor", "CCTV-MON-LG-22", 11990, 12990, 15, "lg-mon22"),
    ("cable", "tp-link", "Cat6 UTP Cable 305m Box", "cctv-cat6-305m", "CCTV-CBL-CAT6-305", 8990, 9990, 20, "cat6-305"),
    ("cable", "hikvision", "RG59+Power Combined Cable 90m", "cctv-rg59-combo-90m", "CCTV-CBL-RG59-90", 3490, 3990, 30, "rg59-90"),
    ("power-adapter", "hikvision", "12V 2A Power Adapter", "cctv-12v-2a-adapter", "CCTV-PWR-12V2A", 490, 590, 100, "pwr-12v2a"),
    ("power-adapter", "dahua", "12V 5A Central Power Supply", "cctv-12v-5a-central", "CCTV-PWR-12V5A", 1990, 2490, 40, "pwr-12v5a"),
    ("connector", "hikvision", "BNC + DC Connector Kit (10pcs)", "cctv-bnc-dc-kit-10", "CCTV-CON-BNC-10", 890, 990, 80, "bnc-kit10"),
    ("connector", "tp-link", "RJ45 Connector Pack (100pcs)", "cctv-rj45-pack-100", "CCTV-CON-RJ45-100", 690, 790, 60, "rj45-100"),
]


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
            payload = {"detail": raw.decode("utf-8", errors="replace")[:300]}
        return exc.code, payload


def login(base: str) -> str:
    code, data = api(base, "POST", "/api/v1/auth/login", body=AUTH)
    if code >= 400 or not data.get("token"):
        raise RuntimeError(f"login failed {base}: {code} {data}")
    return data["token"]


def index_by_slug(rows: List[dict], channel: Optional[str] = None) -> Dict[str, dict]:
    out: Dict[str, dict] = {}
    for row in rows:
        slug = row.get("slug") or ""
        if not slug:
            continue
        if channel and row.get("channel") not in (None, channel):
            if slug in out and out[slug].get("channel") == channel:
                continue
        if slug not in out or row.get("channel") == channel:
            out[slug] = row
    return out


def list_all(base: str, token: str, path: str) -> List[dict]:
    code, data = api(base, "GET", f"{path}?per_page=200", token=token)
    if code >= 400:
        raise RuntimeError(f"list {path} failed: {code} {data}")
    return data.get("data") or []


def ensure_category(base: str, token: str, payload: dict, existing: Dict[str, dict]) -> str:
    slug = payload["slug"]
    row = existing.get(slug)
    if row:
        return row["id"]
    code, data = api(base, "POST", "/api/v1/catalog/categories", token=token, body=payload)
    if code in (200, 201):
        row = data.get("data") or data
        existing[slug] = row
        return row["id"]
    if code in (409, 400):
        rows = list_all(base, token, "/api/v1/catalog/categories")
        existing.update(index_by_slug(rows, "catalog"))
        if slug in existing:
            return existing[slug]["id"]
    raise RuntimeError(f"category {slug}: {code} {data}")


def ensure_brand(base: str, token: str, slug: str, name: str, sort_order: int, existing: Dict[str, dict]) -> str:
    catalog_slug = slug if slug.startswith("erp-") else f"erp-{slug}"
    for candidate in (catalog_slug, slug):
        row = existing.get(candidate)
        if row and row.get("channel") == "catalog":
            return row["id"]
    payload = {
        "name": name,
        "slug": catalog_slug,
        "sort_order": sort_order,
        "is_active": True,
        "channel": "catalog",
    }
    code, data = api(base, "POST", "/api/v1/catalog/brands", token=token, body=payload)
    if code in (200, 201):
        row = data.get("data") or data
        existing[row["slug"]] = row
        return row["id"]
    rows = list_all(base, token, "/api/v1/catalog/brands")
    existing.update(index_by_slug(rows))
    for candidate in (catalog_slug, slug):
        if candidate in existing:
            return existing[candidate]["id"]
    raise RuntimeError(f"brand {slug}: {code} {data}")


def ensure_product(
    base: str,
    token: str,
    *,
    slot: str,
    brand_id: str,
    brand_name: str,
    category_id: str,
    name: str,
    slug: str,
    sku: str,
    price: int,
    compare: Optional[int],
    stock: int,
    thumb_seed: str,
    tag: str,
    existing_slugs: Dict[str, dict],
) -> str:
    if slug in existing_slugs:
        pid = existing_slugs[slug]["id"]
        api(
            base,
            "PATCH",
            f"/api/v1/catalog/products/{pid}",
            token=token,
            body={
                "status": "published",
                "visibility": "public",
                "category_id": category_id,
                "brand_id": brand_id,
                "price": str(price),
            },
        )
        return pid

    thumb = f"https://picsum.photos/seed/{thumb_seed}/400/400"
    payload = {
        "name": name,
        "slug": slug,
        "sku": sku,
        "price": str(price),
        "compare_at_price": str(compare) if compare else None,
        "stock": stock,
        "status": "published",
        "product_type": "simple",
        "visibility": "public",
        "brand": brand_name,
        "brand_id": brand_id,
        "category": slot,
        "category_id": category_id,
        "thumbnail": thumb,
        "gallery_json": json.dumps([thumb]),
        "short_description": f"{tag} ready — {name}",
        "description": f"<p>{name} for custom builds.</p>",
        "tags": [tag, slot],
        "warranty": "1 Year",
    }
    code, data = api(base, "POST", "/api/v1/catalog/products", token=token, body=payload)
    if code in (200, 201):
        row = data.get("data") or data
        existing_slugs[slug] = row
        return row["id"]
    if code in (409, 400):
        rows = list_all(base, token, "/api/v1/catalog/products")
        for r in rows:
            existing_slugs[r.get("slug") or ""] = r
        if slug in existing_slugs:
            return existing_slugs[slug]["id"]
    raise RuntimeError(f"product {slug}: {code} {data}")


def publish_profile(base: str, token: str, slug: str) -> None:
    rows = list_all(base, token, "/api/v1/configurator/profiles")
    row = next((r for r in rows if r.get("slug") == slug), None)
    if not row:
        print(f"  profile {slug}: NOT FOUND")
        return
    code, data = api(
        base,
        "PATCH",
        f"/api/v1/configurator/profiles/{row['id']}",
        token=token,
        body={"status": "active"},
    )
    print(f"  profile {slug}: status patch {code}")


def seed_pack(
    base: str,
    token: str,
    *,
    parent: dict,
    slots: List[Tuple[str, str, int]],
    brands: List[Tuple[str, str, int]],
    products: List[Tuple[str, str, str, str, str, int, Optional[int], int, str]],
    profile_slug: str,
    tag: str,
    verify_slots: List[str],
) -> None:
    cats = index_by_slug(list_all(base, token, "/api/v1/catalog/categories"), "catalog")
    cats.update(index_by_slug(list_all(base, token, "/api/v1/catalog/categories")))

    parent_id = ensure_category(base, token, parent, cats)
    print(f"parent {parent['slug']} -> {parent_id[:8]}")

    slot_ids: Dict[str, str] = {}
    for slug, name, sort_order in slots:
        cid = ensure_category(
            base,
            token,
            {
                "name": name,
                "caption": name,
                "slug": slug,
                "parent_id": parent_id,
                "sort_order": sort_order,
                "is_active": True,
                "show_in_top_menu": False,
                "channel": "catalog",
                "description": f"{tag} slot: {name}",
            },
            cats,
        )
        slot_ids[slug] = cid
        print(f"  category {slug} -> {cid[:8]}")

    brand_rows = index_by_slug(list_all(base, token, "/api/v1/catalog/brands"))
    brand_ids: Dict[str, str] = {}
    brand_names: Dict[str, str] = {}
    for slug, name, sort_order in brands:
        bid = ensure_brand(base, token, slug, name, sort_order, brand_rows)
        brand_ids[slug] = bid
        brand_names[slug] = name
        print(f"  brand {slug} -> {bid[:8]}")

    product_rows = {r.get("slug"): r for r in list_all(base, token, "/api/v1/catalog/products") if r.get("slug")}
    for slot, brand_slug, name, slug, sku, price, compare, stock, thumb in products:
        ensure_product(
            base,
            token,
            slot=slot,
            brand_id=brand_ids[brand_slug],
            brand_name=brand_names[brand_slug],
            category_id=slot_ids[slot],
            name=name,
            slug=slug,
            sku=sku,
            price=price,
            compare=compare,
            stock=stock,
            thumb_seed=thumb,
            tag=tag,
            existing_slugs=product_rows,
        )
        print(f"  product {slug}")

    publish_profile(base, token, profile_slug)

    # Install Again Builder + enable this profile
    api(base, "POST", "/api/v1/plugins/again-builder/install", token=token)
    api(
        base,
        "PATCH",
        "/api/v1/plugins/again-builder",
        token=token,
        body={"enabled": True, "enabled_builders": ["pc-builder"]},
    )

    for slot in verify_slots:
        code, data = api(
            base,
            "GET",
            f"/api/v1/storefront/configurator/profiles/{profile_slug}/categories/{slot}/products?per_page=50",
        )
        rows = (data.get("data") or data) if isinstance(data, dict) else []
        if isinstance(rows, dict):
            rows = rows.get("products") or rows.get("items") or rows.get("data") or []
        print(f"  storefront {slot}: status={code} count={len(rows) if isinstance(rows, list) else rows}")


def seed_target(label: str, base: str, packs: List[str]) -> None:
    print(f"\n=== {label} ({base}) packs={packs} ===")
    token = login(base)
    if "pc" in packs:
        seed_pack(
            base,
            token,
            parent=PC_PARENT,
            slots=PC_SLOTS,
            brands=PC_BRANDS,
            products=PC_PRODUCTS,
            profile_slug="pc-builder",
            tag="pc-builder",
            verify_slots=["cpu", "motherboard", "memory", "graphics-card"],
        )
    if "cctv" in packs:
        seed_pack(
            base,
            token,
            parent=CCTV_PARENT,
            slots=CCTV_SLOTS,
            brands=CCTV_BRANDS,
            products=CCTV_PRODUCTS,
            profile_slug="cctv-builder",
            tag="cctv-builder",
            verify_slots=["dvr-nvr", "cameras", "hdd-storage", "poe-switch"],
        )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pack", choices=["pc", "cctv", "all"], default="all")
    parser.add_argument("--target", choices=["local", "live", "all"], default="all")
    args = parser.parse_args()
    packs = ["pc", "cctv"] if args.pack == "all" else [args.pack]
    targets = list(TARGETS.items()) if args.target == "all" else [(args.target, TARGETS[args.target])]
    for label, base in targets:
        try:
            seed_target(label, base, packs)
        except Exception as exc:
            print(f"FAILED {label}: {exc}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
