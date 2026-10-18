"""Send the model only what this message needs (docs/AI/ai.md, step 5.2 - cutting the tokens per call).

Every model call used to carry all 52 tool definitions (~7,500 tokens) and the whole system prompt (~6,800 tokens): 14,400 input tokens
for a one-word message, repeated at every step of the tool loop. This works out WHICH modules the message is about and sends only those
modules' tools, data map, definitions and glossary:

* module words come from the glossary (Bangla / Banglish / English terms already mapped to modules) plus a few extra stems;
* the last two user messages and the tools used in the previous reply count too, so a follow-up ("ar last month e?", "ha confirm koro")
  keeps the same tools;
* a few small groups are always there (record search / SQL, customers, memory);
* when NOTHING is recognised the full set is sent - a wrong guess must never hide the tool the user needs.

`scripts/run_ai_eval.py` applies the same routing, so the evaluation measures what production sends.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Iterable, Optional

from app.services.ai.orchestrator import OrchestratorTool

ALWAYS_MODULES = {"database", "customers", "ai_memory"}
# modules a tool belongs to besides its own (reports that live in finance but answer sales / purchase / stock questions)
EXTRA_MODULES: dict[str, set[str]] = {
    "get_sales_summary": {"sales"},
    "get_overdue_receivables": {"sales", "customers"},
    "get_overdue_payables": {"purchase"},
    "get_top_suppliers": {"purchase"},
    "get_product_profit": {"sales", "inventory", "catalog"},
    "forecast_sales": {"finance"},
    "forecast_collections": {"sales"},
    "check_stock_level": {"catalog", "sales"},
    "search_customer": {"sales"},
    "create_expense": {"finance"},
}
# extra stems per module, on top of the glossary
EXTRA_WORDS: dict[str, tuple[str, ...]] = {
    "sales": ("sales order", "so-", "quotation", "invoice", "delivery", "challan", "revenue", "bikri", "বিক্রি", "inv-", "customer payment", "joma peyechi"),
    "finance": ("expense", "profit", "cash flow", "cashflow", "receivable", "payable", "financial", "khoroch", "খরচ", "labh", "লাভ", "baki", "paona", "dena", "overdue", "net profit", "taka dei", "dei nai", "taka baki", "দেয়নি", "owe", "owes"),
    "inventory": ("stock", "warehouse", "reorder", "sku", "adjust", "damaged", "dead stock", "stockout", "মজুদ", "স্টক", "komao", "barao"),
    "purchase": ("purchase", "supplier", "vendor", "po-", "kroy", "kena", "সাপ্লায়ার"),
    "crm": ("lead", "deal", "follow up", "follow-up", "pipeline", "crm", "task"),
    "catalog": ("product", "upload", "import", "seo", "specification", "image", "description", "tags", "brand", "category", "publish", "draft", "warranty", "compare at", "ছবি"),
    "workspace": ("preset", "rule", "niyom", "নিয়ম"),
    "hrm": ("employee", "attendance", "hajira", "leave", "chuti", "salary", "payroll", "office e", "late", "absent", "কর্মী", "কর্মচারী", "ছুটি", "হাজিরা", "department"),
}
_KNOWLEDGE = Path(__file__).resolve().parent / "knowledge"
_BARE = re.compile(r"^\W*(yes|y|ok|okay|ha|haa|han|ji|confirm|accept|sure|হ্যাঁ|জি|ঠিক আছে|confirm koro|ha confirm koro|yes, confirm\.?|no|cancel|na)\W*$", re.I)


@lru_cache(maxsize=1)
def _word_index() -> list[tuple[str, str]]:
    """(lower-case word, module) from the glossary + EXTRA_WORDS; longest first so 'stock kom' wins over 'stock'."""
    pairs: list[tuple[str, str]] = []
    try:
        for e in json.loads((_KNOWLEDGE / "glossary.json").read_text(encoding="utf-8")).get("entries", []):
            if e.get("module") in (None, "general"):
                continue
            # a phrase ending in an action verb ("add koro", "upload koro") says WHAT to do, not which module - skip those
            pairs += [(w.lower(), e["module"]) for w in e.get("say", []) if len(w) >= 3 and not re.search(r"(koro|korun|dao|করো|দাও)$", w.strip().lower())]
    except (OSError, ValueError):
        pass
    for module, words in EXTRA_WORDS.items():
        pairs += [(w.lower(), module) for w in words]
    return sorted(set(pairs), key=lambda p: -len(p[0]))


def modules_in(text: str) -> set[str]:
    t = " " + " ".join((text or "").lower().split()) + " "
    return {module for word, module in _word_index() if word in t}


def detect_modules(message: str, history_user_texts: Iterable[str] = (), previous_tool_names: Iterable[str] = (), tools: Iterable[OrchestratorTool] = ()) -> Optional[set[str]]:
    """The modules this message needs, or None = send everything (nothing recognised, or a bare yes with no known context)."""
    found = modules_in(message)
    for h in list(history_user_texts)[-2:]:
        found |= modules_in(h)
    by_name = {t.definition.name: t for t in tools}
    prev = {n for n in previous_tool_names if n in by_name}
    for n in prev:
        found.add(by_name[n].module)
        found |= EXTRA_MODULES.get(n, set())
    if not found:
        return None
    return found


def route_tools(tools: list[OrchestratorTool], modules: Optional[set[str]], previous_tool_names: Iterable[str] = ()) -> list[OrchestratorTool]:
    if modules is None:
        return tools
    keep = set(modules) | ALWAYS_MODULES
    prev = set(previous_tool_names)
    out = []
    for t in tools:
        mods = {t.module} | EXTRA_MODULES.get(t.definition.name, set())
        if mods & keep or t.definition.name in prev:
            out.append(t)
    return out or tools
