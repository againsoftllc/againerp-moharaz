import { isReservedSlug } from "@/lib/url-slug/reserved-slugs";
import { isSlugTaken, normalizeSlug } from "@/lib/url-slug/resolver";

export const SLUG_INPUT_INVALID_CLASS =
  "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/40";

export type SlugValidationResult = {
  isValid: boolean;
  isEmpty: boolean;
  isReserved: boolean;
  isTaken: boolean;
  message: string | null;
};

export function validateSlug(slug: string, exclude?: { id: string }): SlugValidationResult {
  const normalized = normalizeSlug(slug);

  if (!normalized) {
    return {
      isValid: true,
      isEmpty: true,
      isReserved: false,
      isTaken: false,
      message: null,
    };
  }

  if (isReservedSlug(normalized)) {
    return {
      isValid: false,
      isEmpty: false,
      isReserved: true,
      isTaken: false,
      message: "Reserved system URL — choose another slug",
    };
  }

  if (isSlugTaken(normalized, exclude)) {
    return {
      isValid: false,
      isEmpty: false,
      isReserved: false,
      isTaken: true,
      message: "This URL is already in use",
    };
  }

  return {
    isValid: true,
    isEmpty: false,
    isReserved: false,
    isTaken: false,
    message: null,
  };
}

export function slugHasError(slug: string, exclude?: { id: string }) {
  const normalized = normalizeSlug(slug);
  if (!normalized) return false;
  return !validateSlug(slug, exclude).isValid;
}
