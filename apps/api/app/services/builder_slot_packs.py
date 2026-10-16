"""Slot category packs for Again Builder profiles (PC, CCTV, …)."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.configurator_category import ConfiguratorCategory, ensure_configurator_category_catalog_column
from app.models.configurator_profile import ConfiguratorProfile
from app.models.configurator_slot_tab import ConfiguratorSlotTab

# tab slug/name/sort_order per profile type: the Core Components /
# Peripherals / Power & Extras grouping above the slot table.
PC_BUILDER_TAB_DEFS: List[Dict[str, Any]] = [
    {"slug": "core-components", "name": "Core Components", "sort_order": 1},
    {"slug": "peripherals", "name": "Peripherals", "sort_order": 2},
    {"slug": "power-extras", "name": "Power & Extras", "sort_order": 3},
]

# Icons are Material Icons names (an admin can also upload an SVG/PNG, stored as its URL).
PC_BUILDER_CATEGORY_DEFS: List[Dict[str, Any]] = [
    {"slug": "cpu", "name": "Processor", "sort_order": 1, "is_required": True, "selection_mode": "single", "tab": "core-components", "kind": "product", "icon": "memory", "conditions": [{"f": "socket", "op": "has"}]},
    {"slug": "motherboard", "name": "Motherboard", "sort_order": 2, "is_required": True, "selection_mode": "single", "tab": "core-components", "kind": "product", "icon": "developer_board", "conditions": [{"f": "chipset", "op": "has"}]},
    {"slug": "memory", "name": "RAM", "sort_order": 3, "is_required": True, "selection_mode": "multiple", "tab": "core-components", "kind": "product", "icon": "memory", "conditions": [{"f": "type", "op": "has"}]},
    {"slug": "storage", "name": "Storage", "sort_order": 4, "is_required": True, "selection_mode": "multiple", "tab": "core-components", "kind": "product", "icon": "storage", "conditions": [{"f": "storage_interface", "op": "has"}]},
    {"slug": "graphics-card", "name": "Graphics Card", "sort_order": 5, "is_required": False, "selection_mode": "single", "tab": "core-components", "kind": "product", "icon": "videogame_asset", "conditions": [{"f": "gpu_chipset", "op": "has"}]},
    {"slug": "power-supply", "name": "Power Supply", "sort_order": 6, "is_required": True, "selection_mode": "single", "tab": "core-components", "kind": "product", "icon": "power", "conditions": [{"f": "wattage", "op": "has"}]},
    {"slug": "casing", "name": "Casing", "sort_order": 7, "is_required": True, "selection_mode": "single", "tab": "core-components", "kind": "product", "icon": "dns", "conditions": [{"f": "case_motherboard_support", "op": "has"}]},
    {"slug": "cpu-cooler", "name": "CPU Cooler", "sort_order": 8, "is_required": False, "selection_mode": "single", "tab": "core-components", "kind": "product", "icon": "ac_unit", "conditions": [{"f": "socket_support", "op": "has"}]},
    # Monitor's catalog category holds the whole storefront's monitor range,
    # not just PC-Builder-curated stock, so it stays catalog-scoped only (no
    # condition), same as keyboard/mouse/etc below.
    {"slug": "monitor", "name": "Monitor", "sort_order": 9, "is_required": False, "selection_mode": "single", "tab": "peripherals", "kind": "product", "icon": "desktop_windows", "conditions": []},
    {"slug": "keyboard", "name": "Keyboard", "sort_order": 10, "is_required": False, "selection_mode": "single", "tab": "peripherals", "kind": "product", "icon": "keyboard", "conditions": []},
    {"slug": "mouse", "name": "Mouse", "sort_order": 11, "is_required": False, "selection_mode": "single", "tab": "peripherals", "kind": "product", "icon": "mouse", "conditions": []},
    {"slug": "headphone", "name": "Headphone", "sort_order": 12, "is_required": False, "selection_mode": "single", "tab": "peripherals", "kind": "product", "icon": "headset", "conditions": []},
    {"slug": "ups", "name": "UPS / IPS", "sort_order": 13, "is_required": False, "selection_mode": "single", "tab": "power-extras", "kind": "product", "icon": "battery_charging_full", "conditions": []},
    {"slug": "other-accessories", "name": "Other Accessories", "sort_order": 14, "is_required": False, "selection_mode": "single", "tab": "power-extras", "kind": "product", "icon": "settings_input_component", "conditions": []},
]

TAB_DEFS_BY_PROFILE_TYPE: Dict[str, List[Dict[str, Any]]] = {
    "pc_builder": PC_BUILDER_TAB_DEFS,
}
TAB_DEFS_BY_SLUG: Dict[str, List[Dict[str, Any]]] = {
    "pc-builder": PC_BUILDER_TAB_DEFS,
}

CCTV_BUILDER_CATEGORY_DEFS: List[Dict[str, Any]] = [
    {"slug": "dvr-nvr", "name": "DVR / NVR", "sort_order": 1, "is_required": True, "selection_mode": "single"},
    {"slug": "cameras", "name": "Cameras", "sort_order": 2, "is_required": True, "selection_mode": "multiple"},
    {"slug": "hdd-storage", "name": "HDD / Storage", "sort_order": 3, "is_required": True, "selection_mode": "multiple"},
    {"slug": "poe-switch", "name": "PoE Switch", "sort_order": 4, "is_required": False, "selection_mode": "single"},
    {"slug": "monitor", "name": "Monitor", "sort_order": 5, "is_required": False, "selection_mode": "single"},
    {"slug": "cable", "name": "Cable", "sort_order": 6, "is_required": False, "selection_mode": "multiple"},
    {"slug": "power-adapter", "name": "Power Adapter", "sort_order": 7, "is_required": False, "selection_mode": "multiple"},
    {"slug": "connector", "name": "Connector / BNC", "sort_order": 8, "is_required": False, "selection_mode": "multiple"},
]

LAPTOP_BUILDER_CATEGORY_DEFS: List[Dict[str, Any]] = [
    {"slug": "laptop", "name": "Laptop", "sort_order": 1, "is_required": True, "selection_mode": "single"},
    {"slug": "ram-upgrade", "name": "RAM Upgrade", "sort_order": 2, "is_required": False, "selection_mode": "single"},
    {"slug": "storage-upgrade", "name": "Storage Upgrade", "sort_order": 3, "is_required": False, "selection_mode": "single"},
    {"slug": "laptop-bag", "name": "Laptop Bag", "sort_order": 4, "is_required": False, "selection_mode": "single"},
    {"slug": "mouse", "name": "Mouse", "sort_order": 5, "is_required": False, "selection_mode": "single"},
    {"slug": "headphone", "name": "Headphone", "sort_order": 6, "is_required": False, "selection_mode": "single"},
]

# The catalog uses component-* slugs; builder slots stay cpu / memory / …
PC_SLOT_CATALOG_SLUGS: Dict[str, List[str]] = {
    "cpu": ["component-processor"],
    "motherboard": ["component-motherboard"],
    "cpu-cooler": ["component-cpu-cooler"],
    "memory": ["component-ram"],
    "storage": ["component-ssd-hdd"],
    "graphics-card": ["component-graphics-card"],
    "power-supply": ["component-power-supply"],
    "casing": ["component-casing"],
    "casing-cooler": ["component-cpu-cooler"],
    "monitor": ["monitor", "monitor-gaming-monitor", "monitor-office-monitor"],
    "keyboard": ["accessories-all-accessories", "accessories"],
    "mouse": ["accessories-all-accessories", "accessories"],
    "headphone": ["accessories-all-accessories", "gadget-all-gadget"],
    "ups": ["ups-ips", "ups-ips-online-ups", "ups-ips-offline-ups"],
    "operating-system": ["operating-system"],
    "wifi-adapter": ["wifi-adapter"],
    "other-accessories": ["accessories"],
}

# Old PC seed slugs → current storefront slugs
PC_SLUG_ALIASES = {
    "ram": "memory",
    "gpu": "graphics-card",
    "psu": "power-supply",
    "case": "casing",
    "cooler": "cpu-cooler",
}

PACKS_BY_PROFILE_TYPE: Dict[str, List[Dict[str, Any]]] = {
    "pc_builder": PC_BUILDER_CATEGORY_DEFS,
    "cctv_builder": CCTV_BUILDER_CATEGORY_DEFS,
    "laptop_builder": LAPTOP_BUILDER_CATEGORY_DEFS,
}

PACKS_BY_SLUG: Dict[str, List[Dict[str, Any]]] = {
    "pc-builder": PC_BUILDER_CATEGORY_DEFS,
    "cctv-builder": CCTV_BUILDER_CATEGORY_DEFS,
    "laptop-builder": LAPTOP_BUILDER_CATEGORY_DEFS,
}


def resolve_slot_pack(profile: ConfiguratorProfile) -> Optional[List[Dict[str, Any]]]:
    pack = PACKS_BY_SLUG.get(profile.slug)
    if pack:
        return pack
    return PACKS_BY_PROFILE_TYPE.get(profile.profile_type)


def ensure_slot_tabs_for_profile(db: Session, profile: ConfiguratorProfile) -> Dict[str, ConfiguratorSlotTab]:
    """Idempotently create this profile's tab-grouping rows; returns slug -> row.
    A profile type with no tab defs gets none (its categories stay tab_id=NULL,
    which the frontend treats as one implicit "Components" tab)."""
    defs = TAB_DEFS_BY_SLUG.get(profile.slug) or TAB_DEFS_BY_PROFILE_TYPE.get(profile.profile_type)
    if not defs:
        return {}
    existing = db.query(ConfiguratorSlotTab).filter(ConfiguratorSlotTab.profile_id == profile.id).all()
    by_slug = {row.slug: row for row in existing}
    if existing:
        # Seeded once; after that the admin owns the tabs (renaming or reordering must stick).
        return by_slug
    for spec in defs:
        row = by_slug.get(spec["slug"])
        if row:
            if row.name != spec["name"] or row.sort_order != spec["sort_order"]:
                row.name = spec["name"]
                row.sort_order = spec["sort_order"]
        else:
            row = ConfiguratorSlotTab(
                profile_id=profile.id, name=spec["name"], slug=spec["slug"], sort_order=spec["sort_order"],
            )
            db.add(row)
            db.flush()
            by_slug[spec["slug"]] = row
    return by_slug


def ensure_builder_slots_for_profile(db: Session, profile: ConfiguratorProfile) -> None:
    """Idempotently align configurator categories with the pack for this profile."""
    pack = resolve_slot_pack(profile)
    if not pack:
        return

    ensure_configurator_category_catalog_column()
    tabs_by_slug = ensure_slot_tabs_for_profile(db, profile)

    existing = (
        db.query(ConfiguratorCategory)
        .filter(ConfiguratorCategory.profile_id == profile.id)
        .all()
    )
    by_slug = {row.slug: row for row in existing}
    changed = False

    if existing and (profile.slug == "pc-builder" or profile.profile_type == "pc_builder"):
        # The PC Builder's slots are seeded once; after that the admin owns names, icons,
        # required flags and which slots exist, so a restart must not put them back.
        return

    if profile.slug == "pc-builder" or profile.profile_type == "pc_builder":
        for old, new in PC_SLUG_ALIASES.items():
            row = by_slug.get(old)
            if row and new not in by_slug:
                row.slug = new
                by_slug[new] = row
                del by_slug[old]
                changed = True

    for spec in pack:
        row = by_slug.get(spec["slug"])
        if row:
            if row.name != spec["name"]:
                row.name = spec["name"]
                changed = True
            if row.sort_order != spec["sort_order"]:
                row.sort_order = spec["sort_order"]
                changed = True
            if row.is_required != spec["is_required"]:
                row.is_required = spec["is_required"]
                changed = True
            if row.selection_mode != spec["selection_mode"]:
                row.selection_mode = spec["selection_mode"]
                changed = True
            if row.status != "active":
                row.status = "active"
                changed = True
            default_bind = (PC_SLOT_CATALOG_SLUGS.get(spec["slug"]) or [None])[0] or ""
            if default_bind and not (getattr(row, "catalog_category_slug", None) or "").strip():
                row.catalog_category_slug = default_bind
                changed = True
            tab_row = tabs_by_slug.get(spec.get("tab", ""))
            if tab_row and row.tab_id != tab_row.id:
                row.tab_id = tab_row.id
                changed = True
            if spec.get("kind") and row.kind != spec["kind"]:
                row.kind = spec["kind"]
                changed = True
            if spec.get("icon") and row.icon != spec["icon"]:
                row.icon = spec["icon"]
                changed = True
            # Conditions are admin-editable after rollout — only backfill
            # while still empty, never overwrite a saved condition-builder edit.
            if "conditions" in spec and (row.conditions_json or "[]") == "[]" and spec["conditions"]:
                row.conditions_json = json.dumps(spec["conditions"])
                changed = True
        else:
            default_bind = (PC_SLOT_CATALOG_SLUGS.get(spec["slug"]) or [None])[0] or ""
            tab_row = tabs_by_slug.get(spec.get("tab", ""))
            row = ConfiguratorCategory(
                profile_id=profile.id,
                name=spec["name"],
                slug=spec["slug"],
                sort_order=spec["sort_order"],
                is_required=spec["is_required"],
                selection_mode=spec["selection_mode"],
                catalog_category_slug=default_bind,
                product_count=0,
                status="active",
                tab_id=tab_row.id if tab_row else None,
                kind=spec.get("kind", "product"),
                icon=spec.get("icon", "settings_input_component"),
                conditions_json=json.dumps(spec.get("conditions", [])),
            )
            db.add(row)
            by_slug[spec["slug"]] = row
            changed = True

    if changed:
        profile.category_count = (
            db.query(ConfiguratorCategory)
            .filter(ConfiguratorCategory.profile_id == profile.id)
            .count()
        )
        db.flush()
