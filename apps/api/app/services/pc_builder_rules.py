"""Canonical PC Builder compatibility rules bound to catalog attribute codes."""

from __future__ import annotations

from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.models.configurator_compatibility_rule import (
    ConfiguratorCompatibilityRule,
    dump_json,
)

PC_BUILDER_PROFILE_ID = "pc-builder"
PC_BUILDER_PROFILE_ALIASES = ("pc-builder", "cfg_pc")

SLOT_TO_COMPONENT = {
    "cpu": "cap_cpu",
    "motherboard": "cap_mobo",
    "memory": "cap_ram",
    "ram": "cap_ram",
    "cpu-cooler": "cap_cooler",
    "casing": "cap_case",
    "power-supply": "cap_psu",
    "graphics-card": "cap_gpu",
    "storage": "cap_storage",
    "ssd": "cap_storage",
    "hdd": "cap_storage",
    "monitor": "cap_monitor",
}

PC_BUILDER_RULES: List[Dict[str, Any]] = [
    {
        "name": "CPU ↔ Motherboard Socket",
        "code": "socket_match",
        "description": "Motherboard socket list must include the CPU socket (multi-value safe).",
        "priority": 1,
        "active": True,
        "body": {
            "conditions": [
                {
                    "id": "c1",
                    "left": {"profileId": "cap_mobo", "fieldCode": "socket"},
                    "operator": "supports",
                    "right": {"profileId": "cap_cpu", "fieldCode": "socket"},
                }
            ],
            "then": {
                "status": "compatible",
                "message": "CPU socket matches the motherboard.",
            },
            "else": {
                "status": "incompatible",
                "message": "CPU socket does not match this motherboard.",
            },
        },
    },
    {
        "name": "Motherboard ↔ RAM Type",
        "code": "ram_type_match",
        "description": "Motherboard RAM type list must include the RAM kit type.",
        "priority": 2,
        "active": True,
        "body": {
            "conditions": [
                {
                    "id": "c1",
                    "left": {"profileId": "cap_mobo", "fieldCode": "ram_type"},
                    "operator": "supports",
                    "right": {"profileId": "cap_ram", "fieldCode": "type"},
                }
            ],
            "then": {
                "status": "compatible",
                "message": "RAM type is supported by the motherboard.",
            },
            "else": {
                "status": "incompatible",
                "message": "RAM type is not supported (DDR4/DDR5 mismatch).",
            },
        },
    },
    {
        "name": "Cooler ↔ CPU Socket",
        "code": "cooler_socket_match",
        "description": "CPU cooler socket support must include the CPU socket, or be universal.",
        "priority": 3,
        "active": True,
        "body": {
            "conditions": [
                {
                    "id": "c1",
                    "left": {"profileId": "cap_cooler", "fieldCode": "socket_support"},
                    "operator": "supports",
                    "right": {"profileId": "cap_cpu", "fieldCode": "socket"},
                }
            ],
            "then": {
                "status": "compatible",
                "message": "Cooler fits this CPU socket.",
            },
            "else": {
                "status": "incompatible",
                "message": "This cooler does not support the selected CPU socket.",
            },
        },
    },
    {
        "name": "CPU Generation ↔ Motherboard Chipset",
        "code": "generation_support",
        "description": "Motherboard chipset's supported CPU generations (from Chipset Lookup) must include the CPU's generation.",
        "priority": 4,
        "active": True,
        "body": {
            "conditions": [
                {
                    "id": "c1",
                    "left": {"profileId": "cap_mobo", "fieldCode": "supported_generations"},
                    "operator": "supports",
                    "right": {"profileId": "cap_cpu", "fieldCode": "generation"},
                }
            ],
            "then": {
                "status": "compatible",
                "message": "CPU generation is supported by this chipset.",
            },
            "else": {
                "status": "incompatible",
                "message": "This chipset does not support the selected CPU's generation.",
            },
        },
    },
    {
        "name": "BIOS Update May Be Required",
        "code": "bios_update_warning",
        "description": "Warn when the CPU's generation needs a BIOS update on this chipset (from Chipset Lookup).",
        "priority": 13,
        "active": True,
        "body": {
            "conditions": [
                {
                    "id": "c1",
                    "left": {"profileId": "cap_mobo", "fieldCode": "bios_update_generations"},
                    "operator": "supports",
                    "right": {"profileId": "cap_cpu", "fieldCode": "generation"},
                }
            ],
            "then": {
                "status": "warning",
                "message": "This motherboard may need a BIOS update before it supports the selected CPU's generation.",
            },
            "else": {
                "status": "compatible",
                "message": "No BIOS update expected for this CPU generation.",
            },
        },
    },
    {
        "name": "M.2 SSD Count ↔ Motherboard M.2 Slots",
        "code": "m2_slot_count",
        "description": "Number of Storage items picked must not exceed the motherboard's M.2 slot count.",
        "priority": 5,
        "active": True,
        "body": {
            "conditions": [
                {
                    "id": "c1",
                    "left": {"profileId": "cap_storage", "fieldCode": "__qty"},
                    "operator": "count_lte",
                    "right": {"profileId": "cap_mobo", "fieldCode": "m2_slots"},
                }
            ],
            "then": {
                "status": "compatible",
                "message": "Storage count fits the motherboard's M.2 slots.",
            },
            "else": {
                "status": "incompatible",
                "message": "Too many storage drives for this motherboard's M.2 slots.",
            },
        },
    },
    {
        "name": "Total Power Budget ↔ PSU",
        "code": "power_budget",
        "description": "Sum of CPU + GPU TDP, plus a 75W base load and 30% margin, must not exceed the selected PSU's wattage.",
        "priority": 15,
        "active": True,
        "body": {
            "conditions": [
                {
                    "id": "c1",
                    "left": {"profileId": "all", "fieldCode": "__power"},
                    "operator": "power",
                    "right": {"profileId": "cap_psu", "fieldCode": "wattage"},
                    "base": 75,
                    "margin": 30,
                }
            ],
            "then": {
                "status": "compatible",
                "message": "PSU wattage covers the whole build with headroom.",
            },
            "else": {
                "status": "incompatible",
                "message": "The PSU is undersized for this build's total power draw.",
            },
        },
    },
    {
        "name": "High TDP CPU Warning",
        "code": "tdp_warning",
        "description": "Warn when CPU TDP is above 125W.",
        "priority": 10,
        "active": True,
        "body": {
            "conditions": [
                {
                    "id": "c1",
                    "left": {"profileId": "cap_cpu", "fieldCode": "tdp"},
                    "operator": "greater_than",
                    "right": {"literal": 125},
                }
            ],
            "then": {
                "status": "warning",
                "message": "CPU TDP is over 125W — check cooler and PSU headroom.",
            },
            "else": {
                "status": "compatible",
                "message": "CPU TDP is within a typical cooling range.",
            },
        },
    },
    {
        "name": "PSU Wattage Warning",
        "code": "psu_wattage_warning",
        "description": "Warn when the PSU is under 550W.",
        "priority": 12,
        "active": True,
        "body": {
            "conditions": [
                {
                    "id": "c1",
                    "left": {"profileId": "cap_psu", "fieldCode": "wattage"},
                    "operator": "less_than",
                    "right": {"literal": 550},
                }
            ],
            "then": {
                "status": "warning",
                "message": "PSU is under 550W — confirm it covers CPU + GPU draw.",
            },
            "else": {
                "status": "compatible",
                "message": "PSU wattage looks sufficient for a typical build.",
            },
        },
    },
    {
        "name": "RAM স্টিক ≤ মেমোরি স্লট",
        "code": "ram_modules_fit",
        "description": "Total RAM sticks must not exceed the motherboard's memory slots.",
        "priority": 6,
        "active": True,
        "body": {
            "conditions": [
                {
                    "id": "c1",
                    "left": {"profileId": "cap_ram", "fieldCode": "ram_modules"},
                    "operator": "sum_lte",
                    "right": {"profileId": "cap_mobo", "fieldCode": "ram_slots"},
                }
            ],
            "then": {"status": "compatible", "message": "RAM sticks fit the motherboard's memory slots."},
            "else": {"status": "incompatible", "message": "Too many RAM sticks for this motherboard's memory slots."},
        },
    },
    {
        "name": "মোট RAM ≤ সর্বোচ্চ সাপোর্ট",
        "code": "ram_capacity_fit",
        "description": "Total RAM capacity must not exceed the motherboard's maximum.",
        "priority": 7,
        "active": True,
        "body": {
            "conditions": [
                {
                    "id": "c1",
                    "left": {"profileId": "cap_ram", "fieldCode": "ram_capacity"},
                    "operator": "sum_lte",
                    "right": {"profileId": "cap_mobo", "fieldCode": "max_ram"},
                }
            ],
            "then": {"status": "compatible", "message": "Total RAM is within the motherboard's maximum."},
            "else": {"status": "incompatible", "message": "Total RAM exceeds what this motherboard supports."},
        },
    },
    {
        "name": "মাদারবোর্ড কেসিংয়ে ফিট",
        "code": "mobo_case_fit",
        "description": "Motherboard form factor must be supported by the case.",
        "priority": 8,
        "active": True,
        "body": {
            "conditions": [
                {
                    "id": "c1",
                    "left": {"profileId": "cap_mobo", "fieldCode": "mb_form_factor"},
                    "operator": "overlap",
                    "right": {"profileId": "cap_case", "fieldCode": "case_motherboard_support"},
                }
            ],
            "then": {"status": "compatible", "message": "The motherboard fits this case."},
            "else": {"status": "incompatible", "message": "This motherboard's form factor doesn't fit the selected case."},
        },
    },
    {
        "name": "GPU দৈর্ঘ্য ≤ কেসিং",
        "code": "gpu_case_length",
        "description": "Graphics card length must fit the case's maximum GPU length.",
        "priority": 9,
        "active": True,
        "body": {
            "conditions": [
                {
                    "id": "c1",
                    "left": {"profileId": "cap_gpu", "fieldCode": "gpu_length"},
                    "operator": "lte",
                    "right": {"profileId": "cap_case", "fieldCode": "case_max_gpu_length"},
                }
            ],
            "then": {"status": "compatible", "message": "The graphics card fits the case."},
            "else": {"status": "incompatible", "message": "This graphics card is too long for the selected case."},
        },
    },
    {
        "name": "এয়ার কুলারের উচ্চতা ≤ কেসিং",
        "code": "air_cooler_height",
        "description": "Air cooler height must fit the case (only checked for air coolers).",
        "priority": 11,
        "active": True,
        "body": {
            "when": {"profileId": "cap_cooler", "fieldCode": "cooler_type", "value": "Air"},
            "conditions": [
                {
                    "id": "c1",
                    "left": {"profileId": "cap_cooler", "fieldCode": "cooler_height"},
                    "operator": "lte",
                    "right": {"profileId": "cap_case", "fieldCode": "case_max_cooler_height"},
                }
            ],
            "then": {"status": "compatible", "message": "The cooler fits the case."},
            "else": {"status": "incompatible", "message": "This air cooler is too tall for the selected case."},
        },
    },
    {
        "name": "AIO রেডিয়েটর ≤ কেসিং",
        "code": "aio_radiator_fit",
        "description": "AIO radiator size must fit the case (only checked for AIO coolers).",
        "priority": 14,
        "active": True,
        "body": {
            "when": {"profileId": "cap_cooler", "fieldCode": "cooler_type", "value": "AIO"},
            "conditions": [
                {
                    "id": "c1",
                    "left": {"profileId": "cap_cooler", "fieldCode": "cooler_radiator_size"},
                    "operator": "lte",
                    "right": {"profileId": "cap_case", "fieldCode": "case_max_radiator"},
                }
            ],
            "then": {"status": "compatible", "message": "The radiator fits the case."},
            "else": {"status": "incompatible", "message": "This AIO radiator is too large for the selected case."},
        },
    },
    {
        "name": "কুলার ক্ষমতা ≥ CPU TDP",
        "code": "cooler_tdp_rating",
        "description": "Cooler TDP rating should cover the CPU's TDP.",
        "priority": 16,
        "active": True,
        "body": {
            "conditions": [
                {
                    "id": "c1",
                    "left": {"profileId": "cap_cooler", "fieldCode": "cooler_tdp_rating"},
                    "operator": "gte",
                    "right": {"profileId": "cap_cpu", "fieldCode": "tdp"},
                }
            ],
            "then": {"status": "compatible", "message": "The cooler's rating covers the CPU."},
            "else": {"status": "warning", "message": "This cooler's TDP rating is lower than the CPU's TDP."},
        },
    },
    {
        "name": "SATA SSD ≤ SATA পোর্ট",
        "code": "sata_storage_count",
        "description": "SATA drives must not exceed the motherboard's SATA ports.",
        "priority": 17,
        "active": True,
        "body": {
            "when": {"profileId": "cap_storage", "fieldCode": "storage_interface", "value": "2.5\" SATA"},
            "conditions": [
                {
                    "id": "c1",
                    "left": {"profileId": "cap_storage", "fieldCode": "__qty"},
                    "operator": "count_lte",
                    "right": {"profileId": "cap_mobo", "fieldCode": "sata_ports"},
                }
            ],
            "then": {"status": "compatible", "message": "SATA drives fit the motherboard's SATA ports."},
            "else": {"status": "incompatible", "message": "Too many SATA drives for this motherboard's SATA ports."},
        },
    },
    {
        "name": "GPU-র প্রস্তাবিত PSU",
        "code": "psu_gpu_recommended",
        "description": "PSU wattage should meet the graphics card's recommended PSU.",
        "priority": 18,
        "active": True,
        "body": {
            "conditions": [
                {
                    "id": "c1",
                    "left": {"profileId": "cap_psu", "fieldCode": "wattage"},
                    "operator": "gte",
                    "right": {"profileId": "cap_gpu", "fieldCode": "gpu_recommended_psu"},
                }
            ],
            "then": {"status": "compatible", "message": "The PSU meets the graphics card's recommendation."},
            "else": {"status": "warning", "message": "This PSU is below the graphics card's recommended wattage."},
        },
    },
    {
        "name": "PSU কেসিংয়ে ফিট",
        "code": "psu_case_fit",
        "description": "PSU form factor must be supported by the case.",
        "priority": 19,
        "active": True,
        "body": {
            "conditions": [
                {
                    "id": "c1",
                    "left": {"profileId": "cap_psu", "fieldCode": "psu_form_factor"},
                    "operator": "overlap",
                    "right": {"profileId": "cap_case", "fieldCode": "case_psu_support"},
                }
            ],
            "then": {"status": "compatible", "message": "The PSU fits this case."},
            "else": {"status": "incompatible", "message": "This PSU's form factor doesn't fit the selected case."},
        },
    },
    {
        "name": "iGPU না থাকলে GPU বাধ্যতামূলক",
        "code": "gpu_required_without_igpu",
        "description": "A CPU without integrated graphics needs a graphics card.",
        "priority": 20,
        "active": True,
        "body": {
            "conditions": [
                {
                    "id": "c1",
                    "left": {"profileId": "cap_cpu", "fieldCode": "igpu"},
                    "operator": "requires",
                    "right": {"profileId": "cap_gpu", "fieldCode": "__selected"},
                    "value": "No",
                }
            ],
            "then": {"status": "compatible", "message": "Graphics output is covered."},
            "else": {"status": "incompatible", "message": "এই প্রসেসরে বিল্ট-ইন গ্রাফিক্স নেই, গ্রাফিক্স কার্ড যোগ করুন"},
        },
    },
    {
        "name": "মনিটর ও GPU-র কমন পোর্ট",
        "code": "monitor_gpu_ports",
        "description": "The monitor and graphics card should share at least one port type.",
        "priority": 21,
        "active": True,
        "body": {
            "conditions": [
                {
                    "id": "c1",
                    "left": {"profileId": "cap_monitor", "fieldCode": "monitor_ports"},
                    "operator": "overlap",
                    "right": {"profileId": "cap_gpu", "fieldCode": "gpu_ports"},
                }
            ],
            "then": {"status": "compatible", "message": "The monitor and graphics card share a port type."},
            "else": {"status": "warning", "message": "The monitor and graphics card have no port type in common."},
        },
    },
]


def ensure_pc_builder_rules(db: Session) -> int:
    """Insert any missing essential PC Builder rules from real attribute codes (never overwrites an existing one)."""
    existing = {
        row.code: row
        for row in db.query(ConfiguratorCompatibilityRule).all()
    }
    changed = 0
    for item in PC_BUILDER_RULES:
        row = existing.get(item["code"])
        if row is None:
            db.add(
                ConfiguratorCompatibilityRule(
                    name=item["name"],
                    code=item["code"],
                    configurator_profile_id=PC_BUILDER_PROFILE_ID,
                    configurator_profile_name="PC Builder",
                    description=item.get("description"),
                    priority=item["priority"],
                    active=item["active"],
                    body_json=dump_json(item["body"]),
                )
            )
            changed += 1
            continue
        # Existing rows belong to the admin now (they edit them in the Rules tab);
        # only missing canonical rules are inserted.
        continue
    for row in existing.values():
        if row.code in {item["code"] for item in PC_BUILDER_RULES}:
            continue
        if row.configurator_profile_id in PC_BUILDER_PROFILE_ALIASES and row.code == "ddr5_speed_check" and row.active:
            row.active = False
            changed += 1
    if changed:
        db.commit()
    return changed


def pc_builder_profile_ids(slug: str | None) -> tuple[str, ...]:
    if slug in PC_BUILDER_PROFILE_ALIASES or slug in (None, ""):
        return PC_BUILDER_PROFILE_ALIASES
    return (slug,)
