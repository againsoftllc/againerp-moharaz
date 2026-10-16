import { create } from "zustand";

/** Cross-tab jump signal for the standalone Smart PC Builder plugin panel —
 * lets a control inside one tab (e.g. Rules' "Test-এ দেখুন" button) switch
 * the panel's active section, which plugin-config-workspace.tsx otherwise
 * owns as local state with no other way in.
 *
 * `aliasDraft` / `chipsetDraft` carry a prefill from the Overview's fix
 * buttons to the Lookup & Alias tab; the cards there take it once and clear it. */
export type AliasDraft = { field_code: string; raw_pattern: string; normalized_value: string };
export type ChipsetDraft = { chipset: string };

type State = {
  jumpToken: number;
  targetSection: string | null;
  aliasDraft: AliasDraft | null;
  /** Badge numbers for the plugin nav (Overview issues, slot count, active rules). */
  badges: Record<string, number>;
  setBadges: (badges: Record<string, number>) => void;
  chipsetDraft: ChipsetDraft | null;
  jump: (section: string) => void;
  jumpWithAlias: (draft: AliasDraft) => void;
  jumpWithChipset: (draft: ChipsetDraft) => void;
  takeAliasDraft: () => AliasDraft | null;
  takeChipsetDraft: () => ChipsetDraft | null;
};

export const useSmartPcBuilderNavStore = create<State>()((set, get) => ({
  jumpToken: 0,
  targetSection: null,
  aliasDraft: null,
  badges: {},
  setBadges: (badges) => set({ badges: { ...get().badges, ...badges } }),
  chipsetDraft: null,
  jump: (section) => set({ jumpToken: get().jumpToken + 1, targetSection: section }),
  jumpWithAlias: (draft) =>
    set({ aliasDraft: draft, jumpToken: get().jumpToken + 1, targetSection: "lookup-alias" }),
  jumpWithChipset: (draft) =>
    set({ chipsetDraft: draft, jumpToken: get().jumpToken + 1, targetSection: "lookup-alias" }),
  takeAliasDraft: () => {
    const draft = get().aliasDraft;
    if (draft) set({ aliasDraft: null });
    return draft;
  },
  takeChipsetDraft: () => {
    const draft = get().chipsetDraft;
    if (draft) set({ chipsetDraft: null });
    return draft;
  },
}));
