"""Plain text → the HTML the product editor (a rich-text editor) stores and renders.

Imported and AI-written copy is plain text with line breaks; saved as-is, the editor and the
storefront collapse it into one run-on paragraph. Short descriptions become a bullet list (one
point per line, as the admin wants them shown); long descriptions become paragraphs. Text that
already contains HTML is returned unchanged.
"""

from __future__ import annotations

import html
import re
from typing import Optional

_HTML_TAG = re.compile(r"<\s*(p|ul|ol|li|br|div|h[1-6]|strong|b|em|i|span|table|tr|td)\b[^>]*>", re.I)
_BULLET = re.compile(r"^\s*(?:[-•*·▪●◦]|\d+[.)])\s+")


def is_html(text: Optional[str]) -> bool:
    return bool(text and _HTML_TAG.search(text))


def list_html(text: Optional[str]) -> Optional[str]:
    """One <li> per non-empty line (leading '-', '•', '1.' markers dropped)."""
    if not text or not text.strip() or is_html(text):
        return text
    items = [_BULLET.sub("", line).strip() for line in text.splitlines()]
    items = [i for i in items if i]
    if not items:
        return text
    return "<ul>" + "".join(f"<li>{html.escape(i, quote=False)}</li>" for i in items) + "</ul>"


def paragraphs_html(text: Optional[str]) -> Optional[str]:
    """Blank-line separated blocks (or, when there are none, each line) → <p>; a block whose
    lines are all bullet-marked → <ul>."""
    if not text or not text.strip() or is_html(text):
        return text
    blocks = [b for b in re.split(r"\n\s*\n", text.strip()) if b.strip()]
    if len(blocks) == 1:
        blocks = [b for b in blocks[0].splitlines() if b.strip()]
    out = []
    for block in blocks:
        lines = [line for line in block.splitlines() if line.strip()]
        if len(lines) > 1 and all(_BULLET.match(line) for line in lines):
            out.append(list_html("\n".join(lines)))
        else:
            out.append("<p>" + "<br>".join(html.escape(line.strip(), quote=False) for line in lines) + "</p>")
    return "".join(out)
