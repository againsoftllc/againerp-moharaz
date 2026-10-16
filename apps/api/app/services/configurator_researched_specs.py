"""Rule fields looked up on the makers' spec pages for products the catalog has no data for.

app/data/pc_builder_researched_specs.json maps a catalog product id to the values and the page they
came from: {"oc-prod-123": {"name": …, "values": {"gpu_length": 300}, "source": "https://…"}}.
They fill a field only while the product's own specs leave it empty, ahead of the derived fallbacks
(configurator_derived_fields); an admin Override still wins over both.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Dict

_PATH = Path(__file__).resolve().parent.parent / "data" / "pc_builder_researched_specs.json"


@lru_cache(maxsize=1)
def _load() -> Dict[str, Dict[str, str]]:
    try:
        data = json.loads(_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    out: Dict[str, Dict[str, str]] = {}
    for pid, row in data.items():
        values = {k: str(v) for k, v in (row.get("values") or {}).items() if v is not None and str(v).strip()}
        if values:
            out[pid] = values
    return out


def for_product(product_id: str) -> Dict[str, str]:
    return _load().get(product_id, {})
