const HTTPS_URL = /https?:\/\/[^\s<>"']+/gi;

function trimTrailingPunctuation(url: string): string {
  return url.replace(/[.,;:!?)]+$/g, "");
}

function normalizeHttpsUrl(raw: string): URL | null {
  try {
    const parsed = new URL(trimTrailingPunctuation(raw.trim()));
    if (parsed.protocol !== "https:") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Extract the first plausible product-page URL from free text — any site,
 * AI extraction figures out the rest. Just filters out bare-domain links
 * (homepages) which are never a single product. */
export function extractSupportedProductUrl(text: string): string | null {
  const matches = text.match(HTTPS_URL);
  if (!matches?.length) return null;
  for (const match of matches) {
    const parsed = normalizeHttpsUrl(match);
    if (!parsed) continue;
    const path = parsed.pathname.replace(/^\/+|\/+$/g, "");
    if (!path) continue; // homepage, not a product page
    return parsed.toString();
  }
  return null;
}

/** @deprecated Prefer extractSupportedProductUrl — kept for old callers. */
export const extractProductUrl = extractSupportedProductUrl;
/** @deprecated Star Tech is no longer the only supported site. */
export const extractStartechProductUrl = extractSupportedProductUrl;

/** User-facing message when input looks like a URL but isn't usable. */
export function getUnsupportedUrlMessage(text: string): string | null {
  const trimmed = text.trim();
  const urlMatch = trimmed.match(/https?:\/\/[^\s]+/i)?.[0];
  if (!urlMatch) return null;

  const candidate = trimTrailingPunctuation(urlMatch);
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:") {
      return "Product URLs must use HTTPS.";
    }
    const path = parsed.pathname.replace(/^\/+|\/+$/g, "");
    if (!path) {
      return "That's a homepage, not a product page. Paste a direct product URL.";
    }
    return null;
  } catch {
    return "That does not look like a valid URL. Paste a full product page link.";
  }
}

export function isProductImportMessage(text: string): boolean {
  return extractSupportedProductUrl(text) !== null;
}
