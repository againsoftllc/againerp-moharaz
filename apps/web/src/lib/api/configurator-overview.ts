import { apiFetch } from "@/lib/api/client";

export type OverviewIssueKind = "missing" | "profile" | "rule" | "lookup" | "alias";

export type OverviewSlot = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  required: boolean;
  shown: number;
  ready_pct: number;
  issue_count: number;
};

export type OverviewIssue = {
  kind: OverviewIssueKind;
  slot_id: string;
  slot_name: string;
  product_id: string;
  product_name: string;
  field_code: string | null;
  field_label: string | null;
  /** profile: the slot the product actually belongs to */
  from_slot?: string;
  /** lookup: the chipset with no lookup row · alias: the messy value · profile: the value found */
  value?: string;
  /** alias: the spelling the other products use */
  suggested?: string;
};

export type Overview = { slots: OverviewSlot[]; issues: OverviewIssue[]; total: number };

export const getConfiguratorOverview = (profile = "pc-builder") =>
  apiFetch<{ data: Overview }>(`/api/v1/configurator/overview?profile=${encodeURIComponent(profile)}`).then((r) => r.data);

/** a slot before its numbers have loaded */
export type OverviewSlotHead = Pick<OverviewSlot, "id" | "slug" | "name" | "icon" | "required">;

/** the slots alone — fast, shown while each slot's numbers load */
export const getOverviewSlots = (profile = "pc-builder") =>
  apiFetch<{ data: OverviewSlotHead[] }>(`/api/v1/configurator/overview/slots?profile=${encodeURIComponent(profile)}`).then((r) => r.data);

/** one slot's numbers and issues */
export const getOverviewSlot = (slotId: string, profile = "pc-builder") =>
  apiFetch<{ data: Overview }>(
    `/api/v1/configurator/overview?profile=${encodeURIComponent(profile)}&slot=${encodeURIComponent(slotId)}`,
  ).then((r) => r.data);

/** Loads the Overview slot by slot (a few at a time): `onSlots` gets the slot list at once, `onSlot` each slot's
    result as it arrives. Stops calling back once `signal` is aborted. */
export async function loadOverviewBySlot(
  { onSlots, onSlot, signal, concurrency = 4, profile = "pc-builder" }: {
    onSlots: (slots: OverviewSlotHead[]) => void;
    onSlot: (slotId: string, result: Overview | null) => void;
    signal?: AbortSignal;
    concurrency?: number;
    profile?: string;
  },
) {
  const slots = await getOverviewSlots(profile);
  if (signal?.aborted) return;
  onSlots(slots);
  const queue = [...slots];
  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      const result = await getOverviewSlot(s.id, profile).catch(() => null);
      if (signal?.aborted) return;
      onSlot(s.id, result);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, slots.length) }, worker));
}
