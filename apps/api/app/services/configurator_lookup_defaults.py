"""Starter data for the Smart PC Builder's Lookup & Alias tab: the chipset ->
socket/generation reference table and a few common value aliases.

Seeded once (a marker in platform_settings records that), only filling in rows
that don't exist yet, so an admin who edits or deletes them is never overwritten
or re-seeded. Generation labels follow the labels real CPU products carry
("10th Gen", "Ryzen 5000"), because the lookup is matched against those strings."""

from __future__ import annotations

from typing import List, Tuple

from sqlalchemy.orm import Session

from app.models.configurator_attribute_alias import ConfiguratorAttributeAlias
from app.models.configurator_chipset_lookup import ConfiguratorChipsetLookup
from app.models.platform_setting import PlatformSetting

SEED_KEY = "pcbuilder.lookup_defaults_seeded"

_I10 = "10th Gen"
_I11 = "10th Gen, 11th Gen"
_I12 = "12th Gen, 13th Gen, 14th Gen"
_AM4 = "Ryzen 3000, Ryzen 5000"
_AM5 = "Ryzen 7000, Ryzen 8000, Ryzen 9000"

# chipset, socket, supported generations, generations that need a BIOS update
DEFAULT_CHIPSETS: List[Tuple[str, str, str, str]] = [
    ("H410", "LGA1200", _I10, ""),
    ("B460", "LGA1200", _I10, ""),
    ("H470", "LGA1200", _I11, "11th Gen"),
    ("Z490", "LGA1200", _I11, "11th Gen"),
    ("H510", "LGA1200", _I11, ""),
    ("B560", "LGA1200", _I11, ""),
    ("H570", "LGA1200", _I11, ""),
    ("Z590", "LGA1200", _I11, ""),
    ("H610", "LGA1700", _I12, "13th Gen, 14th Gen"),
    ("B660", "LGA1700", _I12, "13th Gen, 14th Gen"),
    ("Z690", "LGA1700", _I12, "13th Gen, 14th Gen"),
    ("B760", "LGA1700", _I12, ""),
    ("Z790", "LGA1700", _I12, ""),
    ("H810", "LGA1851", "Core Ultra 200", ""),
    ("B860", "LGA1851", "Core Ultra 200", ""),
    ("Z890", "LGA1851", "Core Ultra 200", ""),
    ("A320", "AM4", _AM4, "Ryzen 5000"),
    ("B450", "AM4", _AM4, "Ryzen 5000"),
    ("A520", "AM4", _AM4, ""),
    ("B550", "AM4", _AM4, ""),
    ("X570", "AM4", _AM4, ""),
    ("A620", "AM5", _AM5, "Ryzen 9000"),
    ("B650", "AM5", _AM5, "Ryzen 9000"),
    ("X670", "AM5", _AM5, "Ryzen 9000"),
    ("B850", "AM5", _AM5, ""),
    ("X870", "AM5", _AM5, ""),
]

# field code, raw value as typed on a product, value the builder should read
DEFAULT_ALIASES: List[Tuple[str, str, str]] = [
    ("socket", "এল জি এ ১২০০", "LGA1200"),
    ("socket", "LGA 1200", "LGA1200"),
    ("socket", "Socket AM4", "AM4"),
]


def ensure_lookup_defaults(db: Session) -> None:
    if db.get(PlatformSetting, SEED_KEY) is not None:
        return
    have_chipsets = {r.chipset.strip().lower() for r in db.query(ConfiguratorChipsetLookup).all()}
    for chipset, socket, gens, bios in DEFAULT_CHIPSETS:
        if chipset.lower() in have_chipsets:
            continue
        db.add(
            ConfiguratorChipsetLookup(
                chipset=chipset, socket=socket, supported_generations=gens, bios_update_generations=bios
            )
        )
    have_aliases = {(a.field_code, a.raw_pattern.strip().lower()) for a in db.query(ConfiguratorAttributeAlias).all()}
    for field, raw, normalized in DEFAULT_ALIASES:
        if (field, raw.strip().lower()) in have_aliases:
            continue
        db.add(ConfiguratorAttributeAlias(field_code=field, raw_pattern=raw, normalized_value=normalized))
    db.add(PlatformSetting(key=SEED_KEY, value="1", description="Smart PC Builder lookup starter data was seeded"))
    db.commit()


# ---- v2: chipsets the catalog carries that the first seed left out, and AM4 generations it missed ----

SEED_V2_KEY = "pcbuilder.lookup_defaults_v2_seeded"

_AM4_ALL = "Ryzen 1000, Ryzen 2000, Ryzen 3000, Ryzen 4000, Ryzen 5000"
_AM4_LATE = "Ryzen 3000, Ryzen 4000, Ryzen 5000"
_LGA1151_8 = "8th Gen, 9th Gen"
_LGA1151_6 = "6th Gen, 7th Gen"

# chipset, socket, supported generations, BIOS-update generations — wins over the v1 row only where
# the admin never changed it (the row still holds exactly the v1 value)
DEFAULT_CHIPSETS_V2: List[Tuple[str, str, str, str]] = [
    ("A320", "AM4", _AM4_ALL, "Ryzen 4000, Ryzen 5000"),
    ("B450", "AM4", _AM4_ALL, "Ryzen 4000, Ryzen 5000"),
    ("A520", "AM4", _AM4_LATE, ""),
    ("B550", "AM4", _AM4_LATE, ""),
    ("X570", "AM4", "Ryzen 2000, Ryzen 3000, Ryzen 4000, Ryzen 5000", ""),
    ("B840", "AM5", _AM5, ""),
    ("Q570", "LGA1200", _I11, ""),
    ("H310", "LGA1151", _LGA1151_8, "9th Gen"),
    ("B360", "LGA1151", _LGA1151_8, "9th Gen"),
    ("H370", "LGA1151", _LGA1151_8, "9th Gen"),
    ("Z370", "LGA1151", _LGA1151_8, "9th Gen"),
    ("B365", "LGA1151", _LGA1151_8, ""),
    ("Z390", "LGA1151", _LGA1151_8, ""),
    ("H110", "LGA1151", _LGA1151_6, "7th Gen"),
    ("B150", "LGA1151", _LGA1151_6, "7th Gen"),
    ("H170", "LGA1151", _LGA1151_6, "7th Gen"),
    ("Z170", "LGA1151", _LGA1151_6, "7th Gen"),
    ("B250", "LGA1151", _LGA1151_6, ""),
    ("H270", "LGA1151", _LGA1151_6, ""),
    ("Z270", "LGA1151", _LGA1151_6, ""),
    ("H81", "LGA1150", "4th Gen", ""),
    ("B85", "LGA1150", "4th Gen", ""),
    ("H87", "LGA1150", "4th Gen", ""),
    ("Z87", "LGA1150", "4th Gen", ""),
    ("H97", "LGA1150", "4th Gen, 5th Gen", ""),
    ("Z97", "LGA1150", "4th Gen, 5th Gen", ""),
    ("H61", "LGA1155", "2nd Gen, 3rd Gen", "3rd Gen"),
    ("B75", "LGA1155", "2nd Gen, 3rd Gen", ""),
    ("H77", "LGA1155", "2nd Gen, 3rd Gen", ""),
    ("Z77", "LGA1155", "2nd Gen, 3rd Gen", ""),
    ("X299", "LGA2066", "", ""),
    ("TRX50", "sTR5", "", ""),
    ("WRX90", "sTR5", "", ""),
]


def ensure_lookup_defaults_v2(db: Session) -> None:
    """Adds the v2 rows once. An existing row is updated only while it still holds the v1 default."""
    if db.get(PlatformSetting, SEED_V2_KEY) is not None:
        return
    v1 = {c.lower(): (s, g, b) for c, s, g, b in DEFAULT_CHIPSETS}
    rows = {r.chipset.strip().lower(): r for r in db.query(ConfiguratorChipsetLookup).all()}
    for chipset, socket, gens, bios in DEFAULT_CHIPSETS_V2:
        row = rows.get(chipset.lower())
        if row is None:
            db.add(ConfiguratorChipsetLookup(chipset=chipset, socket=socket, supported_generations=gens, bios_update_generations=bios))
        elif (row.socket, row.supported_generations or "", row.bios_update_generations or "") == v1.get(chipset.lower()):
            row.supported_generations, row.bios_update_generations = gens, bios
    db.add(PlatformSetting(key=SEED_V2_KEY, value="1", description="Smart PC Builder lookup v2 rows were seeded"))
    db.commit()


def ensure_lookup_defaults_on_startup() -> None:
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        ensure_lookup_defaults(db)
        ensure_lookup_defaults_v2(db)
    finally:
        db.close()
