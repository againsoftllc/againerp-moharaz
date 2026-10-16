/** Normalize editor link hrefs — internal paths only, external full URLs. */

function getBrowserOrigin(): string | null {
  if (typeof window === "undefined") return null;
  return window.location.origin;
}

function isInternalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return true;
  const origin = getBrowserOrigin();
  if (!origin) return false;
  try {
    return new URL(origin).hostname.toLowerCase() === host;
  } catch {
    return false;
  }
}

export function normalizeLinkForStorage(input: string): {
  href: string;
  isInternal: boolean;
  preview: string;
} {
  const trimmed = input.trim();
  if (!trimmed) {
    return { href: "", isInternal: false, preview: "" };
  }

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return { href: trimmed, isInternal: true, preview: trimmed };
  }

  if (
    !trimmed.includes("://") &&
    !trimmed.startsWith("mailto:") &&
    !trimmed.startsWith("tel:") &&
    !trimmed.startsWith("#")
  ) {
    const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    return { href: path, isInternal: true, preview: path };
  }

  try {
    const parsed = new URL(trimmed);
    if (isInternalHostname(parsed.hostname)) {
      const path = `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
      return { href: path, isInternal: true, preview: path };
    }
    return { href: parsed.href, isInternal: false, preview: parsed.href };
  } catch {
    return { href: trimmed, isInternal: false, preview: trimmed };
  }
}

export function buildAnchorHtml({
  href,
  text,
  openInNewWindow,
}: {
  href: string;
  text: string;
  openInNewWindow: boolean;
}) {
  const safeHref = href.replace(/"/g, "&quot;");
  const safeText = text || href;
  const target = openInNewWindow ? ' target="_blank" rel="noopener noreferrer"' : "";
  return `<a href="${safeHref}"${target}>${safeText}</a>`;
}

export function normalizeEditorHtmlLinks(html: string): string {
  if (!html) return html;

  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("a[href]").forEach((node) => {
      const href = node.getAttribute("href") ?? "";
      const { href: normalized } = normalizeLinkForStorage(href);
      if (normalized) node.setAttribute("href", normalized);
    });
    return doc.body.innerHTML;
  }

  return html.replace(
    /(<a\b[^>]*\bhref=["'])([^"']*)(["'][^>]*>)/gi,
    (_match, prefix: string, href: string, suffix: string) => {
      const { href: normalized } = normalizeLinkForStorage(href);
      return `${prefix}${normalized}${suffix}`;
    },
  );
}

export function insertHtmlIntoContentEditable(
  container: HTMLElement,
  savedRange: Range | null,
  html: string,
): boolean {
  container.focus();

  let range: Range | null = null;
  if (savedRange) {
    try {
      range = savedRange.cloneRange();
    } catch {
      range = null;
    }
  }

  if (!range) {
    range = document.createRange();
    range.selectNodeContents(container);
    range.collapse(false);
  }

  const selection = window.getSelection();
  if (!selection) return false;

  selection.removeAllRanges();
  selection.addRange(range);

  const inserted = document.execCommand("insertHTML", false, html);
  if (inserted) return true;

  range.deleteContents();
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  const node = template.content.firstChild;
  if (!node) return false;

  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

export function cloneVisualSelectionRange(container: HTMLElement | null): Range | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !container) return null;

  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;

  try {
    return range.cloneRange();
  } catch {
    return null;
  }
}

export function wrapCodeSelectionWithLink(
  code: string,
  selectionStart: number,
  selectionEnd: number,
  anchorHtml: string,
): { next: string; cursor: number } {
  const selected = code.slice(selectionStart, selectionEnd);
  const before = code.slice(0, selectionStart);
  const after = code.slice(selectionEnd);

  if (selected) {
    const openTagEnd = anchorHtml.indexOf(">");
    const closeTagStart = anchorHtml.lastIndexOf("</a>");
    if (openTagEnd >= 0 && closeTagStart > openTagEnd) {
      const openTag = anchorHtml.slice(0, openTagEnd + 1);
      const closeTag = anchorHtml.slice(closeTagStart);
      const wrapped = `${openTag}${selected}${closeTag}`;
      const next = `${before}${wrapped}${after}`;
      return { next, cursor: before.length + wrapped.length };
    }
  }

  const next = `${before}${anchorHtml}${after}`;
  return { next, cursor: before.length + anchorHtml.length };
}
