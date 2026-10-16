"""Line up the PC Builder profile's tabs and slots with the storefront PC builder (/pc-builder).

The storefront reads its slots from /storefront/configurator/profiles/pc-builder, so the slots edited under
Website → PC Builder (= Workspace → Plugins → Smart PC Builder → Tabs & Slots) are what customers see. This
seeds that list once with the storefront's 20 slots, each bound to the catalog category it lists:

    python -m scripts.sync_pc_builder_slots            # dry run: prints what would change
    python -m scripts.sync_pc_builder_slots --apply    # writes it

Existing rows keep their ids (old seed slugs are renamed: ram → memory, case → casing …), so overrides and
Ready Build slots stay attached. Slots not in the list are set inactive, never deleted. Run it again any time:
a slot the admin has since renamed or re-bound is only touched where it still has the old seed values
(an empty catalog binding or a component-* placeholder).
"""

from __future__ import annotations

import argparse
from typing import Dict, List

from app.database import SessionLocal
from app.models.catalog_attribute_profile import CatalogAttributeProfile
from app.models.configurator_category import ConfiguratorCategory
from app.models.configurator_profile import ConfiguratorProfile
from app.models.configurator_slot_tab import ConfiguratorSlotTab

# tab slug → (name, sort order). The storefront shows them as Components / Extras / Peripherals.
TABS: Dict[str, tuple] = {
    "core-components": ("Components", 1),
    "power-extras": ("Extras", 2),
    "peripherals": ("Peripherals", 3),
}

# slug, name, tab, catalog category, required (shown on the storefront overview even when empty), several allowed, icon
SLOTS: List[tuple] = [
    ("casing", "Chassis", "core-components", "computer-case", True, False, "dns"),
    ("cpu", "CPU", "core-components", "processor", True, False, "memory"),
    ("cpu-cooler", "CPU Cooler", "core-components", "cpu-cooler", True, False, "ac_unit"),
    ("motherboard", "Motherboard", "core-components", "motherboard", True, False, "developer_board"),
    ("memory", "Memory", "core-components", "ram", True, True, "memory"),
    ("graphics-card", "Graphics Card", "core-components", "graphics-card", True, False, "videogame_asset"),
    ("power-supply", "PSU", "core-components", "power-supply", True, False, "power"),
    ("ssd", "SSD", "core-components", "ssd", True, True, "storage"),
    ("hdd", "HDD", "core-components", "hard-disk-drive", False, True, "storage"),
    ("internet-security", "Internet Security", "core-components", "antivirus", False, True, "security"),
    ("casing-fan", "Case Fans", "power-extras", "casing-cooler", False, True, "toys_fan"),
    ("wifi-adapter", "Network Adapter", "power-extras", "lan-card", False, False, "wifi"),
    ("thermal-paste", "Thermal Paste", "power-extras", "thermal-paste", False, True, "build"),
    ("monitor", "Monitors", "peripherals", "monitor", False, True, "desktop_windows"),
    ("mouse", "Mouse", "peripherals", "mouse", False, False, "mouse"),
    ("keyboard", "Keyboard", "peripherals", "keyboard", False, False, "keyboard"),
    ("mouse-pad", "Mouse Pad", "peripherals", "mouse-pad", False, False, "crop_landscape"),
    ("gamepad", "Gamepad", "peripherals", "gamepad", False, True, "sports_esports"),
    ("headphone", "Headphone", "peripherals", "headphone", False, False, "headset"),
    ("microphone", "Microphone", "peripherals", "microphone", False, False, "mic"),
]

# old seed slugs → the slugs above
RENAMES = {"ram": "memory", "gpu": "graphics-card", "psu": "power-supply", "case": "casing", "cooler": "cpu-cooler", "storage": "ssd"}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write the changes (default: dry run)")
    args = ap.parse_args()

    db = SessionLocal()
    profile = db.query(ConfiguratorProfile).filter(ConfiguratorProfile.slug == "pc-builder").one()
    attr_profiles = {p.code: p.id for p in db.query(CatalogAttributeProfile).all()}
    changes: List[str] = []

    def put(row, field: str, value, label: str, quiet: bool = False) -> None:
        if getattr(row, field) != value:
            if not quiet:
                    changes.append(f"{label}: {field} {getattr(row, field)!r} → {value!r}")
            setattr(row, field, value)

    tabs = {t.slug: t for t in db.query(ConfiguratorSlotTab).filter(ConfiguratorSlotTab.profile_id == profile.id)}
    for slug, (name, sort) in TABS.items():
        tab = tabs.get(slug)
        if not tab:
            tab = ConfiguratorSlotTab(profile_id=profile.id, company_id=profile.company_id, name=name, slug=slug, sort_order=sort)
            db.add(tab)
            db.flush()
            tabs[slug] = tab
            changes.append(f"tab {slug}: created")
        put(tab, "name", name, f"tab {slug}")
        put(tab, "sort_order", sort, f"tab {slug}")

    rows = {c.slug: c for c in db.query(ConfiguratorCategory).filter(ConfiguratorCategory.profile_id == profile.id)}
    for old, new in RENAMES.items():
        if old in rows and new not in rows:
            changes.append(f"slot {old}: renamed → {new}")
            rows[new] = rows.pop(old)
            rows[new].slug = new

    wanted = set()
    for sort, (slug, name, tab, cat, required, multi, icon) in enumerate(SLOTS, start=1):
        wanted.add(slug)
        row = rows.get(slug)
        fresh = row is None
        if fresh:
            row = ConfiguratorCategory(profile_id=profile.id, company_id=profile.company_id, slug=slug, name=name)
            db.add(row)
            rows[slug] = row
            changes.append(f"slot {slug}: created")
        label = f"slot {slug}"
        q = {"quiet": fresh}
        bound = (row.catalog_category_slug or "").strip()
        if fresh or not bound or bound.startswith("component-"):
            put(row, "catalog_category_slug", cat, label, **q)
            put(row, "name", name, label, **q)
            put(row, "icon", icon, label, **q)
        put(row, "tab_id", tabs[tab].id, label, **q)
        put(row, "sort_order", sort, label, **q)
        put(row, "is_required", required, label, **q)
        put(row, "selection_mode", "multiple" if multi else "single", label, **q)
        put(row, "min_select", 0, label, **q)
        put(row, "max_select", 4 if multi else 1, label, **q)
        put(row, "kind", "product", label, **q)
        put(row, "status", "active", label, **q)
        if not row.attribute_profile_id and attr_profiles.get(f"oc-{row.catalog_category_slug}"):
            put(row, "attribute_profile_id", attr_profiles[f"oc-{row.catalog_category_slug}"], label, **q)

    for slug, row in rows.items():
        if slug not in wanted and row.status == "active":
            put(row, "status", "inactive", f"slot {slug}")

    print("\n".join(changes) or "already in line — nothing to change")
    if args.apply:
        db.commit()
        print(f"applied {len(changes)} change(s)")
    else:
        db.rollback()
        print(f"dry run: {len(changes)} change(s) — run with --apply to write them")


if __name__ == "__main__":
    main()
