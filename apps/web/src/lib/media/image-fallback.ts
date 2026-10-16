import type { SyntheticEvent } from "react";

export const IMAGE_FALLBACK_SRC = "/images/products/placeholder.svg";

/**
 * Catalog art points at whatever URL the product holds, so a dead host or a
 * deleted upload leaves a blank tile. Swapping in the placeholder keeps admin
 * showing the same thing the storefront does.
 */
export function applyImageFallback(event: SyntheticEvent<HTMLImageElement>) {
  const el = event.currentTarget;
  if (el.src.endsWith(IMAGE_FALLBACK_SRC)) return;
  el.src = IMAGE_FALLBACK_SRC;
}
