export function htmlToPlainText(html: string): string {
  const trimmed = html.trim();
  if (!trimmed || trimmed === "<br>" || trimmed === "<div><br></div>") return "";

  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(trimmed, "text/html");
    return (doc.body.textContent ?? "").replace(/\u00a0/g, " ").trim();
  }

  return trimmed
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function countEditorStats(html: string): { words: number; characters: number } {
  const plain = htmlToPlainText(html);
  if (!plain) return { words: 0, characters: 0 };

  return {
    words: plain.split(/\s+/).filter(Boolean).length,
    characters: plain.length,
  };
}
