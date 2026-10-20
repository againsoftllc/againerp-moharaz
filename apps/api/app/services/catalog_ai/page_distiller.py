"""A product page's full source -> a compact, structure-keeping view the AI reads (any shop, no per-site settings).

The AI import used to read the page as ONE flattened line of text cut at 20,000 characters: a spec table became a run of
words with the labels glued to the values, and on a long page the product's own block could fall off the end. This module
walks the whole page source instead and writes it out line by line the way a person reads it:

    # Headings                     (`#`, `##`, ...)
    Label | Value | Value          (table rows)
    Label: Value                   (definition lists and "label ... value" rows built from divs / spans / list items)
    - list item                    (bullet lists: key features, highlights)
    paragraph text

Chrome (scripts, styles, menus, footers, cookie / newsletter boxes) and other products on the page (related, similar,
"recently viewed" carousels - they carry other products' prices) are left out. Nothing is shop specific: the same rules read
every site, so a new shop needs no configuration.
"""

from __future__ import annotations

import re
from typing import Optional

from bs4 import BeautifulSoup, NavigableString, Tag

MAX_VIEW_CHARS = 30_000
_SKIP_TAGS = {"script", "style", "noscript", "svg", "iframe", "template", "head", "nav", "footer", "aside", "select", "option", "button", "canvas", "video", "audio", "map"}
# class / id words that mark page furniture or OTHER products (their prices and specs must not be read as this product's)
_NOISE = re.compile(
    r"(cookie|newsletter|subscribe|popup|modal|mega-?menu|navbar|offcanvas|related|similar|recommend|recently|you-?may-?also|also-?bought|"
    r"upsell|cross-?sell|bestseller|best-seller|top-?selling|compare-?bar|breadcrumb|social|share|chat-?widget|footer|sticky-?header)",
    re.I,
)
_BLOCK = {"div", "p", "ul", "ol", "table", "dl", "section", "article", "h1", "h2", "h3", "h4", "h5", "h6", "form", "li", "tr"}
_HEADINGS = {"h1": "#", "h2": "##", "h3": "###", "h4": "####", "h5": "#####", "h6": "######"}
_WS = re.compile(r"\s+")


def _text(node) -> str:
    return _WS.sub(" ", node.get_text(" ", strip=True)).strip()


def _noisy(node: Tag) -> bool:
    attrs = node.attrs or {}
    hint = " ".join([" ".join(attrs.get("class") or []), str(attrs.get("id") or "")])
    return bool(hint and _NOISE.search(hint))


def _has_block_child(node: Tag) -> bool:
    return any(isinstance(c, Tag) and (c.name in _BLOCK) for c in node.descendants)


def _pair(node: Tag) -> Optional[tuple[str, str]]:
    """A "label ... value" row built from two child elements (div / span / strong / label / li ...), as many spec lists are."""
    kids = [c for c in node.children if isinstance(c, Tag) and c.name not in _SKIP_TAGS and _text(c)]
    if len(kids) != 2 or any(isinstance(c, Tag) and _has_block_child(c) for c in kids):
        return None
    a, b = _text(kids[0]), _text(kids[1])
    if not a or not b or len(a) > 80 or len(b) > 400 or len(_text(node)) > 500:
        return None
    return a.rstrip(":"), b


def distill_page(soup: BeautifulSoup, *, max_chars: int = MAX_VIEW_CHARS) -> str:
    """The structure-keeping text view of a parsed page (see the module docstring). "" when nothing useful is found."""
    root = (
        soup.select_one("[itemtype*='schema.org/Product']")
        or soup.select_one("[itemtype*='/Product']")
        or soup.find("main")
        or soup.body
        or soup
    )
    lines: list[str] = []
    seen: set[str] = set()
    budget = [max_chars]

    def emit(line: str, *, keep_long: bool = False) -> None:
        line = line.strip()
        if len(line) < 2 or budget[0] <= 0:
            return
        if not keep_long:
            line = line[:400]
        else:
            line = line[:4000]
        if len(line) < 90 and line in seen:
            return
        seen.add(line)
        lines.append(line)
        budget[0] -= len(line) + 1

    def table(node: Tag) -> None:
        for tr in node.find_all("tr"):
            cells = [_text(c) for c in tr.find_all(["th", "td"], recursive=False) or tr.find_all(["th", "td"])]
            cells = [c for c in cells if c]
            if cells:
                emit(" | ".join(cells))

    def walk(node: Tag) -> None:
        if budget[0] <= 0:
            return
        name = node.name
        if name in _SKIP_TAGS or _noisy(node):
            return
        if name in _HEADINGS:
            emit(f"{_HEADINGS[name]} {_text(node)}")
            return
        if name == "table":
            table(node)
            return
        if name == "dl":
            term = None
            for c in node.find_all(["dt", "dd"]):
                if c.name == "dt":
                    term = _text(c)
                elif term is not None:
                    emit(f"{term.rstrip(':')}: {_text(c)}")
            return
        if name in ("ul", "ol"):
            for li in node.find_all("li", recursive=False):
                if _noisy(li):
                    continue
                pair = _pair(li)
                emit(f"{pair[0]}: {pair[1]}" if pair else f"- {_text(li)}")
            return
        if name == "p":
            emit(_text(node), keep_long=True)
            return
        pair = _pair(node) if name in ("div", "li", "tr", "section") else None
        if pair:
            emit(f"{pair[0]}: {pair[1]}")
            return
        if not _has_block_child(node):
            txt = _text(node)
            if txt:
                emit(txt, keep_long=len(txt) > 400)
            return
        for child in node.children:
            if isinstance(child, Tag):
                walk(child)
            elif isinstance(child, NavigableString):
                txt = _WS.sub(" ", str(child)).strip()
                if len(txt) > 20:  # loose text between blocks
                    emit(txt, keep_long=True)

    walk(root)
    view = "\n".join(lines)
    return view[:max_chars]


# ── grounding: what the AI returns must be on the page ───────────────────────────────────────────────────────────

def _key(text: str) -> str:
    return re.sub(r"[\W_]+", "", (text or "").lower(), flags=re.UNICODE)


def _tokens(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]{2,}", (text or "").lower())}


def grounded(value: str, haystack_key: str, haystack_tokens: set[str]) -> bool:
    """True when `value` (a spec value the AI returned) is written on the page: as-is (ignoring spacing / punctuation / case)
    or, for a re-worded value, with at least 70 % of its words. Text with no latin letters or digits cannot be checked and
    is accepted."""
    key = _key(value)
    if not key or not re.search(r"[a-z0-9]", key):
        return True
    if key in haystack_key:
        return True
    toks = _tokens(value)
    return bool(toks) and len(toks & haystack_tokens) / len(toks) >= 0.7
