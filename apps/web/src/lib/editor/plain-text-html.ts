/**
 * Plain text → editor HTML, for product copy saved before imports wrote HTML
 * (apps/api/app/services/catalog_ai/content_html.py does the same on the server).
 * Text that already contains HTML is returned unchanged.
 */

const HTML_TAG = /<\s*(p|ul|ol|li|br|div|h[1-6]|strong|b|em|i|span|table|tr|td)\b[^>]*>/i;
const BULLET = /^\s*(?:[-•*·▪●◦]|\d+[.)])\s+/;

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function isHtml(text: string | null | undefined): boolean {
  return Boolean(text && HTML_TAG.test(text));
}

/** One bullet per non-empty line — how short descriptions are shown. */
export function plainTextToListHtml(text: string | null | undefined): string {
  if (!text || !text.trim() || isHtml(text)) return text ?? "";
  const items = text
    .split(/\r?\n/)
    .map((line) => line.replace(BULLET, "").trim())
    .filter(Boolean);
  return items.length ? `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` : text;
}

/** Blank-line separated blocks (or, when there are none, each line) → paragraphs. */
export function plainTextToParagraphHtml(text: string | null | undefined): string {
  if (!text || !text.trim() || isHtml(text)) return text ?? "";
  let blocks = text.trim().split(/\r?\n\s*\r?\n/).filter((b) => b.trim());
  if (blocks.length === 1) blocks = blocks[0].split(/\r?\n/).filter((b) => b.trim());
  return blocks
    .map((block) => {
      const lines = block.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length > 1 && lines.every((l) => BULLET.test(l))) return plainTextToListHtml(lines.join("\n"));
      return `<p>${lines.map((l) => escapeHtml(l.trim())).join("<br>")}</p>`;
    })
    .join("");
}
