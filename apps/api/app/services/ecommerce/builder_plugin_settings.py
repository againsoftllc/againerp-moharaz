"""Which storefront builder tools are turned on.

Unlike account_menu, these default to ON — PC Builder, CC Builder, the
storage calculator and the power calculator already work on the storefront
today. A business only sees one turn off once they actually install the
Again Builder plugin in Settings → Plugins and switch it off there.

Smart PC Builder is a separate plugin (its own install/enable row,
SmartPcBuilderPlugin) — not one of Again Builder's enabled_builders — but
its on/off state is merged into this same dict so the storefront's single
`requireBuilderPluginEnabled(slug)` gate keeps working unchanged for it.
"""

from __future__ import annotations

import json
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.builder_plugin import BuilderPlugin
from app.models.smart_pc_builder_plugin import SmartPcBuilderPlugin

BUILDER_PLUGIN_ID = "again-builder-default"
SMART_PC_BUILDER_PLUGIN_ID = "smart-pc-builder-default"

ALL_BUILDER_SLUGS = ("pc-builder", "cc-builder", "storage-calculator", "power-calculator")


def parse_builder_slugs(raw: Optional[str]) -> List[str]:
    if not raw:
        return list(ALL_BUILDER_SLUGS)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return list(ALL_BUILDER_SLUGS)
    if not isinstance(data, list):
        return list(ALL_BUILDER_SLUGS)
    out = [str(item).strip() for item in data if str(item).strip()]
    return out or list(ALL_BUILDER_SLUGS)


def load_builder_plugin_settings(db: Session) -> Dict[str, bool]:
    row = db.get(BuilderPlugin, BUILDER_PLUGIN_ID)
    if not row or not row.installed or not row.enabled:
        out = {slug: True for slug in ALL_BUILDER_SLUGS}
    else:
        enabled = set(parse_builder_slugs(row.enabled_builders_json))
        out = {slug: (slug in enabled) for slug in ALL_BUILDER_SLUGS}

    smart = db.get(SmartPcBuilderPlugin, SMART_PC_BUILDER_PLUGIN_ID)
    out["smart-pc-builder"] = bool(smart and smart.installed and smart.enabled)
    return out
