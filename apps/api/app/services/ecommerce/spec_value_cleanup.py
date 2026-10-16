"""Tidies spec values the OpenCart import merged from several source fields.

The spec tidy (scripts/spec_tidy_engine.py) joined every source field routed to one spec as "Source: value" lines,
and some of those sources were the old shop filters — so a product page read

    Cache   Cache: 16 MB
            Cache: 14MB to 30MB          ← the old filter's range bucket

This is applied when the specification table is read (the stored values stay as they are). It only touches a
value whose lines repeat the spec's own name ("Cache: …" under Cache), i.e. one the import merged, and it:

  * drops filter range buckets ("14MB to 30MB", "32MB & above", "Up to 1MB", or a comma list of them)
  * drops a line that is only a vaguer copy of another ("Intel Core i5" next to "Intel Core i5-1335U")
  * under a frequency / clock spec drops MHz lines next to a GHz one (the GPU clock filed as the CPU's)
  * under Resolution drops a response time ("5ms (gtg)")
  * removes the repeated "Cache:" prefix, so the row reads "16 MB"
"""

from __future__ import annotations

import re
from typing import List

_NUM = r"\d+(?:\.\d+)?\s*[a-zA-Z]{0,4}"
_BUCKET = re.compile(
    rf"^(?:(?:up\s*to|under|below|above|over)\s+{_NUM}|{_NUM}\s*(?:to|-|–)\s*{_NUM}|{_NUM}\s*(?:&|and)\s*(?:above|below|more|over))$",
    re.I,
)


def _is_bucket(text: str) -> bool:
    parts = [p.strip() for p in text.split(",") if p.strip()]
    return bool(parts) and all(_BUCKET.match(p) for p in parts)


# specs the import made out of the old shop filters, whose values are the filters' range options ("26-30 Inch",
# "1-4ms", "700-799W") rather than the product's own figure
FILTER_BUCKET_SPECS = {
    "screen size", "refresh rate", "response time", "fan speed", "max dpi", "buttons", "wattage", "number of keys",
    "clock speed", "display size", "capacity", "maximum resolution",
}


def is_filter_bucket(label: str, value: str, repeats: int) -> bool:
    """A spec row that only repeats an old filter option: one of FILTER_BUCKET_SPECS, shaped like a range bucket, and
    the same text on several products (`repeats`) — a product's own range ("1300 - 2600 RPM") is not hidden."""
    return label.strip().lower() in FILTER_BUCKET_SPECS and repeats >= 3 and _is_bucket(value.strip())


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def clean_spec_value(label: str, value: str) -> str:
    lines = [ln.strip() for ln in (value or "").split("\n") if ln.strip()]
    if not lines or not label.strip():
        return value
    prefix = re.compile(rf"^{re.escape(label.strip())}\s*:+\s*", re.I)
    if sum(1 for ln in lines if prefix.match(ln)) < 1:
        return value  # not a merged value: leave it exactly as written

    # one entry per merged source: a "Label: …" line starts one, other lines continue it
    entries: List[str] = []
    for ln in lines:
        if prefix.match(ln) or not entries:
            entries.append(prefix.sub("", ln).replace("\\", "").strip())
        else:
            entries[-1] += "\n" + ln
    entries = [e for e in entries if e]
    if len(entries) > 1:
        kept = [e for e in entries if not _is_bucket(e)] or entries
        low = label.lower()
        if re.search(r"frequen|clock", low) and any(re.search(r"ghz", e, re.I) for e in kept):
            kept = [e for e in kept if not re.fullmatch(r"\s*\d+(?:\.\d+)?\s*mhz\s*", e, re.I)] or kept
        if "resolution" in low:
            kept = [e for e in kept if not re.match(r"^\s*\d+(?:\.\d+)?\s*ms\b", e, re.I)] or kept
        # a vaguer copy of another entry ("USB" next to "USB 3.0 …"; the same text twice)
        out: List[str] = []
        for i, e in enumerate(kept):
            n = _norm(e)
            covered = any(
                j != i and n and (n == _norm(o) and j < i or (n != _norm(o) and re.search(rf"(?:^| ){re.escape(n)}(?: |$)", _norm(o))))
                for j, o in enumerate(kept)
            )
            if not covered:
                out.append(e)
        entries = out or kept
    return "\n".join(entries)
