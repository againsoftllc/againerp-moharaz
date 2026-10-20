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

import * as React from "react";
import { toast } from "sonner";

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

type UseDrawerDraftOptions<T> = {
  /** One entry per drawer + record: "cheque-book:new", "cheque-book:<id>". Falsy = no draft (nothing to save yet). */
  key: string | null | undefined;
  /** The drawer is open and the record it shows has loaded. */
  ready: boolean;
  /** The user typed something that is not saved yet. */
  dirty: boolean;
  /** What to keep: the form values and, for "continue where I was", the scroll position. */
  getValues: () => T;
  /** Put a saved draft back on screen. */
  restore: (values: T) => void;
  /** Called when the user chooses Discard on the "restored" toast (reload the saved record into the form). */
  onDiscard?: () => void;
  /** Wording of the toast: "Restored unsaved {label} draft from …". */
  label: string;
};

/**
 * docs/common/drawercommon.md - a drawer that closes by accident (outside click, Esc, the X) keeps what was typed and, the next time
 * it opens for the same record, puts it back. `saveDraftIfDirty` goes into the drawer's close path, `clear` after a real save
 * or an explicit Discard. Works for "New X" and for editing an existing record (one key per record).
 */
export function useDrawerDraft<T>({ key, ready, dirty, getValues, restore, onDiscard, label }: UseDrawerDraftOptions<T>) {
  const latest = React.useRef({ getValues, restore, onDiscard, dirty, key });
  latest.current = { getValues, restore, onDiscard, dirty, key };
  const restoredFor = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!ready || !key) {
      restoredFor.current = null;
      return;
    }
    if (restoredFor.current === key) return;
    restoredFor.current = key;
    const draft = readDraft<T>(key);
    if (!draft) return;
    latest.current.restore(draft.values);
    toast.info(`Restored unsaved ${label} draft from ${draftAgeLabel(draft.savedAt)}`, {
      action: {
        label: "Discard",
        onClick: () => {
          clearDraft(key);
          latest.current.onDiscard?.();
        },
      },
    });
  }, [ready, key, label]);

  const saveDraftIfDirty = React.useCallback(() => {
    const { key: k, dirty: d, getValues: get } = latest.current;
    if (k && d) writeDraft<T>(k, get());
  }, []);

  const clear = React.useCallback(() => {
    if (latest.current.key) clearDraft(latest.current.key);
  }, []);

  return { saveDraftIfDirty, clear };
}
