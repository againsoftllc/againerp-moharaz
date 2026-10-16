/**
 * Browser-safe public URL for Media Library assets.
 * Local uploads are often stored as `http://127.0.0.1:8010/uploads/...` which
 * only works on the API host — rewrite to same-origin `/uploads/...` so the
 * Next.js proxy (`app/uploads/[...path]`) can serve them on erp.againerp.com.
 */
export function publicMediaUrl(url: string | null | undefined): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";

  // Already relative
  if (trimmed.startsWith("/uploads/")) return trimmed;
  if (trimmed.startsWith("/storage/media/uploads/")) {
    return `/uploads/media/${trimmed.split("/").pop()}`;
  }

  try {
    const parsed = new URL(trimmed, "http://local.invalid");
    const path = parsed.pathname || "";
    if (path.startsWith("/uploads/")) {
      return `${path}${parsed.search}${parsed.hash}`;
    }
    // Legacy local_path-style absolute URLs
    const marker = "/storage/media/uploads/";
    const idx = path.indexOf(marker);
    if (idx >= 0) {
      return `/uploads/media/${path.slice(idx + marker.length)}`;
    }
  } catch {
    /* keep original */
  }

  return trimmed;
}

/** First-frame seek hint for <video> poster-less cover previews. */
export function videoCoverSrc(url: string): string {
  const src = publicMediaUrl(url);
  if (!src) return "";
  if (/[?&#]t=/.test(src)) return src;
  return src.includes("#") ? src : `${src}#t=0.001`;
}

function extractYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace(/^\//, "").split("/")[0] || null;
    }
    if (parsed.hostname.includes("youtube.com") || parsed.hostname.includes("youtube-nocookie.com")) {
      const fromQuery = parsed.searchParams.get("v");
      if (fromQuery) return fromQuery;
      const parts = parsed.pathname.split("/").filter(Boolean);
      const embedIndex = parts.findIndex((part) => part === "embed" || part === "shorts");
      if (embedIndex >= 0 && parts[embedIndex + 1]) return parts[embedIndex + 1];
    }
  } catch {
    return null;
  }
  return null;
}

function extractVimeoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("vimeo.com")) return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts.at(-1) ?? null;
  } catch {
    return null;
  }
}

/** Static cover image URL for YouTube / Vimeo tiles (not playable file URLs). */
export function externalVideoCoverUrl(
  url: string,
  provider?: string | null,
): string | null {
  if (provider === "youtube" || /youtube|youtu\.be/i.test(url)) {
    const id = extractYouTubeId(url);
    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
  }
  if (provider === "vimeo" || /vimeo\.com/i.test(url)) {
    const id = extractVimeoId(url);
    return id ? `https://vumbnail.com/${id}.jpg` : null;
  }
  return null;
}
