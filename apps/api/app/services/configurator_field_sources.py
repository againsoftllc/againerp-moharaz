"""Field Sources: which attribute feeds each built-in builder field.

The resolver (`storefront_configurator_service._view_specs_and_attributes`) calls `apply()` on a
product's stored spec values before anything else, so every consumer downstream (rules, slot
conditions, the Chipset Lookup, aliases, overrides, Test Build, Overview, the storefront chooser)
sees the same value under the built-in key whatever the attribute is called in the catalog.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.catalog_attribute import CatalogAttribute
from app.models.catalog_attribute_group import CatalogAttributeGroup
from app.models.catalog_attribute_profile import CatalogAttributeProfile
from app.models.catalog_product import CatalogProduct
from app.models.catalog_product_attribute_value import CatalogProductAttributeValue
from app.models.configurator_field_source import ConfiguratorFieldSource

_TEXTY = ("dropdown", "text", "multi_select", "multiselect")
_NUMBERY = ("number", "text", "dropdown")


@dataclass(frozen=True)
class FieldDef:
    key: str
    label: str
    component: str  # which part the value belongs to
    profile_code: str  # attribute profile shown first in the picker
    default_code: str  # attribute read when nothing is configured
    types: Tuple[str, ...]
    group: str  # "lookup" = feeds the Chipset Lookup, "engine" = values the engine normalises
    hint: str = ""


FIELDS: List[FieldDef] = [
    FieldDef("chipset", "Chipset", "Motherboard", "motherboard", "chipset", _TEXTY, "lookup",
             "Motherboard-এর Chipset দিয়েই Lookup থেকে Socket, Supported Gen আর BIOS আপডেট ঠিক হয়।"),
    FieldDef("socket", "CPU Socket", "Processor", "processor", "socket", _TEXTY, "lookup",
             "CPU-র Socket। মাদারবোর্ডের Socket-এর সাথে এটাই মেলানো হয়।"),
    FieldDef("generation", "CPU Generation", "Processor", "processor", "generation", _TEXTY, "lookup",
             "CPU-র জেনারেশন (যেমন Ryzen 5000)। Lookup-এর Supported Gen-এর সাথে মেলে।"),
    FieldDef("ram_type", "মাদারবোর্ডের মেমোরি টাইপ", "Motherboard", "motherboard", "ram_type", _TEXTY, "engine"),
    FieldDef("type", "RAM টাইপ", "Memory (RAM)", "memory", "type", _TEXTY, "engine"),
    FieldDef("socket_support", "কুলারের সাপোর্টেড সকেট", "CPU Cooler", "cpu_cooler", "socket_support", _TEXTY, "engine"),
    FieldDef("igpu", "Integrated Graphics (iGPU)", "Processor", "processor", "igpu", ("dropdown", "text", "boolean", "checkbox", "radio"), "engine",
             "iGPU নেই (No) হলে GPU বাধ্যতামূলক, এই রুলে লাগে।"),
    FieldDef("tdp", "CPU TDP (W)", "Processor", "processor", "tdp", _NUMBERY, "engine"),
    FieldDef("wattage", "PSU ওয়াটেজ (W)", "Power Supply", "power_supply", "wattage", _NUMBERY, "engine"),
    FieldDef("case_max_cooler_height", "কেসিংয়ে কুলারের সর্বোচ্চ উচ্চতা (mm)", "Casing", "casing", "case_max_cooler_height", _NUMBERY, "engine"),
    FieldDef("case_max_gpu_length", "কেসিংয়ে GPU-র সর্বোচ্চ দৈর্ঘ্য (mm)", "Casing", "casing", "case_max_gpu_length", _NUMBERY, "engine"),
]
BY_KEY: Dict[str, FieldDef] = {f.key: f for f in FIELDS}


class FieldSourceError(ValueError):
    pass


def load_map(db: Session) -> Dict[str, str]:
    """field key -> attribute code, only for fields pointed at a *different* attribute."""
    rows = (
        db.query(ConfiguratorFieldSource.field_key, CatalogAttribute.code)
        .join(CatalogAttribute, CatalogAttribute.id == ConfiguratorFieldSource.attribute_id)
        .filter(ConfiguratorFieldSource.attribute_id.isnot(None), CatalogAttribute.is_active.is_(True))
        .all()
    )
    return {key: code for key, code in rows if key in BY_KEY and code and code != key}


def apply(stored: Dict[str, str], fmap: Dict[str, str]) -> Dict[str, str]:
    """Copy each mapped attribute's value onto the built-in key. A product that has no value
    under the chosen attribute keeps whatever it carries under the built-in code."""
    if not fmap:
        return stored
    out = dict(stored)
    for key, code in fmap.items():
        value = str(stored.get(code) or "").strip()
        if value:
            out[key] = value
    return out


def source_code(fmap: Dict[str, str], key: str) -> str:
    return fmap.get(key, BY_KEY[key].default_code if key in BY_KEY else key)


def _default_attribute(db: Session, field: FieldDef) -> Optional[CatalogAttribute]:
    base = db.query(CatalogAttribute).filter(CatalogAttribute.code == field.default_code, CatalogAttribute.is_active.is_(True))
    profile = db.query(CatalogAttributeProfile).filter(CatalogAttributeProfile.code == field.profile_code).first()
    if profile:
        in_profile = (
            base.join(CatalogAttributeGroup, CatalogAttributeGroup.id == CatalogAttribute.group_id)
            .filter(CatalogAttributeGroup.profile_id == profile.id)
            .first()
        )
        if in_profile:
            return in_profile
    return base.order_by(CatalogAttribute.sort_order).first()


def _profile_of(db: Session, attribute: CatalogAttribute) -> Optional[CatalogAttributeProfile]:
    group = db.get(CatalogAttributeGroup, attribute.group_id)
    return db.get(CatalogAttributeProfile, group.profile_id) if group else None


def attribute_for(db: Session, key: str) -> Optional[CatalogAttribute]:
    """The attribute currently feeding this field (configured, else the default one)."""
    field = BY_KEY[key]
    row = db.query(ConfiguratorFieldSource).filter(ConfiguratorFieldSource.field_key == key).first()
    if row and row.attribute_id:
        attr = db.get(CatalogAttribute, row.attribute_id)
        if attr and attr.is_active:
            return attr
    return _default_attribute(db, field)


def predefined_values(attribute: Optional[CatalogAttribute]) -> List[str]:
    if not attribute:
        return []
    try:
        data = json.loads(attribute.predefined_values or "[]")
    except ValueError:
        return []
    return [str(v).strip() for v in data if str(v).strip()] if isinstance(data, list) else []


def _coverage(db: Session, attribute: CatalogAttribute, profile: Optional[CatalogAttributeProfile]) -> Dict[str, int]:
    filled = (
        db.query(func.count(func.distinct(CatalogProductAttributeValue.product_id)))
        .filter(
            CatalogProductAttributeValue.attribute_id == attribute.id,
            CatalogProductAttributeValue.value.isnot(None),
            func.length(func.trim(CatalogProductAttributeValue.value)) > 0,
        )
        .scalar()
        or 0
    )
    total = 0
    if profile:
        total = db.query(func.count(CatalogProduct.id)).filter(CatalogProduct.attribute_profile_id == profile.id).scalar() or 0
    return {"filled": int(filled), "total": int(max(total, filled))}


def describe(db: Session) -> List[Dict[str, Any]]:
    rows = {r.field_key: r for r in db.query(ConfiguratorFieldSource).all()}
    out: List[Dict[str, Any]] = []
    for field in FIELDS:
        row = rows.get(field.key)
        attr = attribute_for(db, field.key)
        custom = bool(row and row.attribute_id and attr and attr.id == row.attribute_id)
        profile = _profile_of(db, attr) if attr else None
        out.append(
            {
                "key": field.key,
                "label": field.label,
                "component": field.component,
                "group": field.group,
                "hint": field.hint,
                "types": list(field.types),
                "default_code": field.default_code,
                "default_profile_code": field.profile_code,
                "mode": "custom" if custom else ("default" if attr else "missing"),
                "attribute": (
                    {
                        "id": attr.id,
                        "code": attr.code,
                        "name": attr.name,
                        "field_type": attr.field_type,
                        "profile_id": profile.id if profile else None,
                        "profile_name": profile.name if profile else "",
                    }
                    if attr
                    else None
                ),
                "coverage": _coverage(db, attr, profile) if attr else {"filled": 0, "total": 0},
            }
        )
    return out


def set_source(db: Session, key: str, attribute_id: Optional[str]) -> None:
    field = BY_KEY.get(key)
    if not field:
        raise FieldSourceError("Unknown field")
    row = db.query(ConfiguratorFieldSource).filter(ConfiguratorFieldSource.field_key == key).first()
    if not attribute_id:
        if row:
            db.delete(row)
            db.commit()
        return
    attr = db.get(CatalogAttribute, attribute_id)
    if not attr or not attr.is_active:
        raise FieldSourceError("Attribute not found")
    if (attr.field_type or "") not in field.types:
        raise FieldSourceError(
            f'"{attr.name}" is a {attr.field_type} field. {field.label} needs one of: {", ".join(field.types)}.'
        )
    if row:
        row.attribute_id = attr.id
    else:
        db.add(ConfiguratorFieldSource(field_key=key, attribute_id=attr.id))
    db.commit()


def _norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def _stored_values(db: Session, attribute: CatalogAttribute) -> List[str]:
    """Distinct values products carry under this attribute (a multi-select cell holds several, comma separated)."""
    rows = (
        db.query(CatalogProductAttributeValue.value)
        .filter(CatalogProductAttributeValue.attribute_id == attribute.id, CatalogProductAttributeValue.value.isnot(None))
        .distinct()
        .all()
    )
    out: List[str] = []
    for (raw,) in rows:
        for part in str(raw).split(","):
            part = part.strip()
            if part:
                out.append(part)
    return out


def slot_profile_ids(db: Session) -> List[str]:
    """The attribute profiles of the PC Builder's active slots (Tabs & Slots): a slot's own attribute profile,
    else the profile scoped to the catalog category it is bound to. This is what "the builder's profiles"
    means everywhere, so a new slot or profile is picked up without touching code."""
    from app.models.configurator_category import ConfiguratorCategory
    from app.models.configurator_profile import ConfiguratorProfile
    from app.services import configurator_filters

    profile = db.query(ConfiguratorProfile).filter(ConfiguratorProfile.slug == "pc-builder").first()
    if not profile:
        return []
    ids: List[str] = []
    slots = (
        db.query(ConfiguratorCategory)
        .filter(ConfiguratorCategory.profile_id == profile.id, ConfiguratorCategory.status == "active")
        .order_by(ConfiguratorCategory.sort_order)
        .all()
    )
    for slot in slots:
        found = [slot.attribute_profile_id] if (slot.attribute_profile_id or "").strip() else []
        if not found and (slot.catalog_category_slug or "").strip():
            found = configurator_filters.profile_ids_for_catalog_category(db, slot.catalog_category_slug.strip())
        for pid in found:
            if pid and pid not in ids:
                ids.append(pid)
    return ids


def dropdown_attributes(db: Session) -> List[Tuple[CatalogAttribute, str]]:
    """Every active dropdown attribute of the builder's profiles, with its profile's name."""
    out: List[Tuple[CatalogAttribute, str]] = []
    for pid in slot_profile_ids(db):
        profile = db.get(CatalogAttributeProfile, pid)
        if not profile or not getattr(profile, "is_active", True):
            continue
        rows = (
            db.query(CatalogAttribute)
            .join(CatalogAttributeGroup, CatalogAttributeGroup.id == CatalogAttribute.group_id)
            .filter(CatalogAttributeGroup.profile_id == pid, CatalogAttribute.is_active.is_(True), CatalogAttribute.field_type == "dropdown")
            .order_by(CatalogAttributeGroup.sort_order, CatalogAttribute.sort_order)
            .all()
        )
        out.extend((a, profile.name) for a in rows)
    return out


def attribute_by_code(db: Session, code: str) -> Optional[CatalogAttribute]:
    """An active attribute of one of the builder's component profiles, found by its code."""
    ids = slot_profile_ids(db)
    if not ids:
        return None
    return (
        db.query(CatalogAttribute)
        .join(CatalogAttributeGroup, CatalogAttributeGroup.id == CatalogAttribute.group_id)
        .filter(CatalogAttribute.code == code, CatalogAttribute.is_active.is_(True), CatalogAttributeGroup.profile_id.in_(ids))
        .order_by(CatalogAttribute.sort_order)
        .first()
    )


def _attribute_of(db: Session, key_or_code: str) -> Optional[CatalogAttribute]:
    """A built-in field resolves through its Field Source; any other code is looked up as an attribute code."""
    return attribute_for(db, key_or_code) if key_or_code in BY_KEY else attribute_by_code(db, key_or_code)


def _values_of(db: Session, attr: Optional[CatalogAttribute]) -> Dict[str, List[str]]:
    """An attribute's values: its predefined list first, then any value a product carries that the list does
    not. Nothing else (no starter lists, no values the builder merely guessed). "in_use" = just the values
    products actually carry."""
    if not attr:
        return {"values": [], "in_use": []}
    stored = _stored_values(db, attr)
    values: List[str] = []
    seen = set()
    for v in predefined_values(attr) + sorted(set(stored), key=str.lower):
        if _norm(v) and _norm(v) not in seen:
            seen.add(_norm(v))
            values.append(v)
    in_use: List[str] = []
    seen_use = set()
    for v in sorted(set(stored), key=str.lower):
        # report in the spelling the attribute list uses
        spelled = next((x for x in values if _norm(x) == _norm(v)), v)
        if _norm(spelled) not in seen_use:
            seen_use.add(_norm(spelled))
            in_use.append(spelled)
    return {"values": values, "in_use": in_use}


def attribute_values(db: Session, key: str) -> Dict[str, List[str]]:
    return _values_of(db, attribute_for(db, key))


def values_for_field(db: Session, key_or_code: str) -> List[str]:
    """Values offered for a field (a built-in key, or any builder attribute code, e.g. in the Alias form)."""
    return _values_of(db, _attribute_of(db, key_or_code))["values"]


def add_value(db: Session, key: str, value: str) -> str:
    """Append a value to the attribute's predefined list (so it lives in the attribute, not in the builder).
    Returns the spelling stored (an existing spelling wins if the value is already there)."""
    value = (value or "").strip()
    if not value:
        raise FieldSourceError("Value is empty")
    attr = _attribute_of(db, key)
    if not attr:
        raise FieldSourceError("Unknown field" if key not in BY_KEY else "No attribute is set for this field yet")
    if (attr.field_type or "") not in ("dropdown", "multi_select", "multiselect"):
        raise FieldSourceError(
            f'"{attr.name}" is a {attr.field_type} field, so it has no value list. Make it a dropdown first, or pick a dropdown attribute.'
        )
    current = predefined_values(attr)
    for existing in _values_of(db, attr)["values"]:
        if _norm(existing) == _norm(value):
            if existing not in current:
                current.append(existing)
                attr.predefined_values = json.dumps(current, ensure_ascii=False)
                db.commit()
            return existing
    current.append(value)
    attr.predefined_values = json.dumps(current, ensure_ascii=False)
    db.commit()
    return value
