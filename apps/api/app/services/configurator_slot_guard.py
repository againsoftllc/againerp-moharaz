"""Keeps products that plainly belong to another kind out of a PC Builder slot.

A slot lists every product of its catalog category or attribute profile, so one product filed under the
wrong category / profile (a webcam under Motherboard, mouse pads under RAM, a CPU cooler under Casing)
shows up in the slot. `belongs()` drops a product whose name says it is something else — unless the name
also says it is this slot's kind ("Gaming Headset with Mic" stays a headphone). The admin can still
force a product in with the slot's Include override, which is applied after this.
"""

from __future__ import annotations

import re
from typing import Dict, Tuple

# things that are never a PC component, whatever category they were filed under
_NOT_A_COMPONENT = (
    r"web\s?cam|charger|tripod|cold shoe|mounting kit|boom arm|suspension|gpu (?:holder|support)|support bracket"
    r"|mouse\s?(?:pad|mat)|keyboard|\bmouse\b|combo|(?:external|portable) ssd|\bmixer\b|headphone|headset|microphone"
)

# slot → (name says it's something else, name says it's this slot's kind)
_RULES: Dict[str, Tuple[str, str]] = {
    "cpu": (_NOT_A_COMPONENT, r"processor|ryzen|core\s*(?:i\d|ultra)|athlon|pentium|celeron|xeon|threadripper"),
    "motherboard": (_NOT_A_COMPONENT, r"motherboard|mainboard"),
    "casing": (_NOT_A_COMPONENT + r"|cpu cooler|liquid cooler|air cooler", r"\bcase\b|casing|chassis|cabinet"),
    "cpu-cooler": (_NOT_A_COMPONENT + r"|\bfans?\b|controller", r"cooler|cooling|\baio\b|liquid|heat\s?sink|radiator"),
    "memory": (_NOT_A_COMPONENT + r"|.", r"ddr\d|\bram\b|memory|dimm"),  # RAM names always say so
    "graphics-card": (_NOT_A_COMPONENT, r"graphics|geforce|radeon|\brtx\b|\bgtx\b|\barc\b"),
    "monitor": (r"screen\s?bar|monitor (?:light|lamp|arm|mount|stand)|\blamp\b|light\s?bar", r"\d{2}(?:\.\d)?\s?(?:inch|\")|\bhz\b|\b(?:fhd|qhd|uhd|4k)\b"),
    "power-supply": (_NOT_A_COMPONENT + r"|\bfans?\b|fan kit|ddr\d|\bram\b",r"power supply|\bpsu\b|\b\d{3,4}\s?w\b|\bsfx|80\s?\+|80 plus"),
    "ssd": (_NOT_A_COMPONENT.replace(r"|(?:external|portable) ssd", ""), r"\bssd\b|nvme|m\.2"),
    "casing-fan": (_NOT_A_COMPONENT + r"|cpu (?:liquid |air )?cooler|liquid cooler|\baio\b", r"\bfans?\b"),
    "wifi-adapter": (_NOT_A_COMPONENT + r"|ddr\d|\bram\b|memory", r"wi-?fi|wireless|adapter|bluetooth|\blan\b|network"),
    "thermal-paste": (_NOT_A_COMPONENT, r"thermal|paste|compound"),
    "mouse-pad": (r"combo|grip|keyboard|\bmouse\b(?!\s*(?:pad|mat))", r"mouse\s?(?:pad|mat)|desk\s?mat|\bpad\b|\bmat\b"),
    "headphone": (r"\bmouse\b|keyboard|combo|microphone|\bmic\b", r"head\s?phone|headset|heaphone|earphone|earbud|neckband|\bear"),
    "microphone": (r"headphone|headset|earphone", r"microphone|\bmic\b|mixer|sound card|audio interface|podcast|caster"),
}


def belongs(slot_slug: str, name: str) -> bool:
    rule = _RULES.get(slot_slug)
    if not rule:
        return True
    foreign, own = rule
    return bool(re.search(own, name, re.I)) or not re.search(foreign, name, re.I)
