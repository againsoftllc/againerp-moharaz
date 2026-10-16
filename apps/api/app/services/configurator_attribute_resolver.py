"""Admin-editable layer in front of the Phase-1 attribute resolution.

`storefront_configurator_service._builder_attributes()` already resolves a
product's spec dict (stored attribute → hardcoded alias/inference). This adds
three admin-editable corrections on top, in priority order, without touching
the rule engine itself:

  1. Product override — a manually-set value for one product+field, wins over
     everything.
  2. Attribute alias — normalizes a raw value the stored/inferred pipeline
     produced (e.g. odd casing or wording) to the canonical value rules
     compare against.
  3. Chipset-derived socket — if a motherboard only carries `chipset` and no
     `socket` came out of steps 1-2, derive it from the chipset lookup table.
"""

from __future__ import annotations

import re
from typing import Dict, Optional

from sqlalchemy.orm import Session

from app.models.configurator_attribute_alias import ConfiguratorAttributeAlias
from app.models.configurator_chipset_lookup import ConfiguratorChipsetLookup
from app.models.configurator_product_override import ConfiguratorProductOverride


class ResolverContext:
    """The small admin tables the resolver reads (product overrides, aliases, the chipset lookup), loaded once so that
    resolving hundreds of products (Overview, the slot lists) does not run three queries per product."""

    def __init__(self, overrides: Dict[str, list], aliases: Dict[str, list], chipsets: Dict[str, ConfiguratorChipsetLookup]) -> None:
        self.overrides = overrides
        self.aliases = aliases
        self.chipsets = chipsets

    @classmethod
    def load(cls, db: Session) -> "ResolverContext":
        overrides: Dict[str, list] = {}
        for row in db.query(ConfiguratorProductOverride).all():
            overrides.setdefault(row.product_id, []).append(row)
        aliases: Dict[str, list] = {}
        for row in db.query(ConfiguratorAttributeAlias).all():
            aliases.setdefault(row.field_code, []).append(row)
        chipsets: Dict[str, ConfiguratorChipsetLookup] = {}
        for row in db.query(ConfiguratorChipsetLookup).all():
            chipsets.setdefault((row.chipset or "").lower(), row)
        return cls(overrides, aliases, chipsets)


_CHIPSET_CODE = re.compile(r"\b((?:TRX|WRX)\d{2}|[ABHQXZ]\d{2,3}[A-Z]?)\b", re.I)


def chipset_row(ctx: "ResolverContext", chipset: str) -> Optional[ConfiguratorChipsetLookup]:
    """The lookup row for a board's chipset as products spell it: "B760", "Intel B760", "AMD X870E" (→ X870E,
    else X870), "B650M chipset"."""
    exact = ctx.chipsets.get(chipset.strip().lower())
    if exact:
        return exact
    m = _CHIPSET_CODE.search(chipset)
    if not m:
        return None
    code = m.group(1).lower()
    return ctx.chipsets.get(code) or (ctx.chipsets.get(code[:-1]) if code[-1].isalpha() and code[:-1][-1].isdigit() else None)


def resolve(
    db: Session,
    product_id: str,
    attrs: Dict[str, str],
    field_map: Optional[Dict[str, str]] = None,
    ctx: Optional[ResolverContext] = None,
) -> Dict[str, str]:
    ctx = ctx or ResolverContext.load(db)
    resolved = dict(attrs)

    for row in ctx.overrides.get(product_id, []):
        resolved[row.field_code] = row.value

    if resolved:
        for field, value in list(resolved.items()):
            # An alias written against the attribute that feeds a built-in field (Field Sources) fixes the built-in value too.
            source_code = (field_map or {}).get(field)
            candidates = ctx.aliases.get(field, []) + (ctx.aliases.get(source_code, []) if source_code else [])
            for alias in candidates:
                if str(value).strip().lower() == alias.raw_pattern.strip().lower():
                    resolved[field] = alias.normalized_value
                    break

    if resolved.get("chipset"):
        row = chipset_row(ctx, str(resolved["chipset"]))
        if row:
            resolved.setdefault("socket", row.socket)
            resolved.setdefault("socket_support", row.socket)
            if row.supported_generations:
                resolved.setdefault("supported_generations", row.supported_generations)
            if row.bios_update_generations:
                resolved.setdefault("bios_update_generations", row.bios_update_generations)

    # the generation rules compare tokens, so the CPU and the lookup / override must spell them alike
    from app.services.configurator_derived_fields import canonical_generations

    for key in ("generation", "supported_generations", "bios_update_generations"):
        if str(resolved.get(key) or "").strip():
            resolved[key] = canonical_generations(resolved[key])

    return resolved
