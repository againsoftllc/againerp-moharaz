/**
 * Local-only draft persistence for "New X" drawers.
 *
 * See docs/ERP-UI-COMMON.md — "Drawers: save a draft on accidental close" for
 * the convention this implements. Drawers call `writeDraft` from
 * `onPointerDownOutside` / `onInteractOutside` / `onEscapeKeyDown` (not from
 * the explicit Cancel button — that stays an intentional discard), read it
 * back with `readDraft` when opening in create mode, and `clearDraft` after a
 * successful create.
 */

export type DraftEnvelope<T> = { savedAt: string; values: T };

function storageKey(key: string) {
  return `again-drawer-draft:${key}`;
}

export function readDraft<T>(key: string): DraftEnvelope<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftEnvelope<T>;
    if (!parsed || typeof parsed.savedAt !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeDraft<T>(key: string, values: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey(key),
      JSON.stringify({ savedAt: new Date().toISOString(), values }),
    );
  } catch {
    // Storage unavailable (private mode, quota) — losing the draft beats crashing.
  }
}

export function clearDraft(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(key));
  } catch {
    // ignore
  }
}

/** "3 minutes ago"-style label for the draft-restored toast. */
export function draftAgeLabel(savedAt: string): string {
  const ms = Date.now() - new Date(savedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "earlier";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "moments ago";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
