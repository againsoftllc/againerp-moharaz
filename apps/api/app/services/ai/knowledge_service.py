"""The AI's company knowledge: business definitions and the Bangla / Banglish glossary (docs/AI/ai.md, step 0.3).

Both live in plain JSON files under `knowledge/` so a business owner can read and correct them. `knowledge_text` turns the parts
the user may use (their readable modules) into prompt sections; the generated data dictionary
(`knowledge/data_dictionary.generated.json`) is for the schema tools, not for the prompt.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Iterable

_DIR = Path(__file__).resolve().parent / "knowledge"


@lru_cache(maxsize=8)
def _load(name: str) -> dict:
    try:
        return json.loads((_DIR / name).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def knowledge_text(modules: Iterable[str], glossary: bool = True, match: str | None = None) -> str:
    """Prompt sections for the modules the user may read: business definitions + words admins use. "" when there is nothing."""
    mods = set(modules) | {"general"}
    defs = _load("definitions.json")
    lines: list[str] = []
    for module, items in defs.items():
        if module.startswith("_") or module not in mods:
            continue
        for it in items:
            lines.append(f"- {it['term']}: {it['means']}")
    glossary_entries = [
        e for e in (_load("glossary.json").get("entries") or []) if e.get("module") in mods
    ] if glossary else []
    if match is not None:  # only the entries whose words the user actually used (ai.md 5.2)
        t = " " + " ".join(match.lower().split()) + " "
        glossary_entries = [e for e in glossary_entries if any(w.lower() in t for w in e.get("say", []))]
    out: list[str] = []
    if lines:
        out.append("# Business definitions (use exactly these, so chat answers match the ERP's own reports)\n" + "\n".join(lines))
    if glossary_entries:
        words = "\n".join(f"- {' / '.join(e['say'])} → {e['means']} ({e['use']})" for e in glossary_entries)
        out.append("# Words admins use (Bangla / Banglish / English) and what they mean here\n" + words)
    return "\n\n".join(out)


def table_note(table: str) -> dict:
    """{about, columns{name: note}} for a table, or {} - hand-written meaning (knowledge/table_notes.json)."""
    return _load("table_notes.json").get(table) or {}


@lru_cache(maxsize=1)
def _dictionary_index() -> dict:
    """table -> {column: [values seen]} from the generated data dictionary (values in use when it was built)."""
    out: dict = {}
    for module in (_load("data_dictionary.generated.json").get("modules") or {}).values():
        for name, t in (module.get("tables") or {}).items():
            out[name] = {c["name"]: c["values"] for c in t.get("columns", []) if c.get("values")}
    return out


def dictionary_values(table: str, column: str) -> list:
    """The values a status / type column has been seen to hold (used only when the live table has none to show)."""
    return list((_dictionary_index().get(table) or {}).get(column) or [])


def reload() -> None:
    """After editing the JSON files without restarting."""
    _load.cache_clear()
    _dictionary_index.cache_clear()
