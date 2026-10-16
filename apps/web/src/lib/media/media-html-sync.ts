import type { MediaLibraryItem } from "@/lib/mock-data/media-library";

function escapeAttr(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/** Refresh src/alt on <img data-media-id="..."> tags inside HTML content. */
export function refreshHtmlMediaRefs(
  html: string,
  mediaId: string,
  item: MediaLibraryItem,
): string {
  if (!html.includes(`data-media-id="${mediaId}"`) && !html.includes(`data-media-id='${mediaId}'`)) {
    return html;
  }

  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll(`img[data-media-id="${mediaId}"]`).forEach((node) => {
      node.setAttribute("src", item.url);
      node.setAttribute("alt", item.alt ?? item.title);
    });
    return doc.body.innerHTML;
  }

  const alt = escapeAttr(item.alt ?? item.title);
  const src = escapeAttr(item.url);

  return html.replace(
    new RegExp(
      `(<img[^>]*data-media-id=["']${mediaId}["'][^>]*)(>)`,
      "gi",
    ),
    (match, prefix: string, suffix: string) => {
      let next = prefix as string;
      next = next.replace(/\ssrc=["'][^"']*["']/i, "");
      next = next.replace(/\salt=["'][^"']*["']/i, "");
      return `${next} src="${src}" alt="${alt}"${suffix}`;
    },
  );
}
