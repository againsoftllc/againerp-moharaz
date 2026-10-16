import { apiFetch } from "@/lib/api/client";

export type SlotProductRow = {
  id: string;
  name: string;
  price: number;
  in_stock: boolean;
  attributes: Record<string, string>;
};

export type SlotWithProducts = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  kind: "product" | "service" | "toggle";
  tab_id: string | null;
  required: boolean;
  min_select: number;
  max_select: number;
  products: SlotProductRow[];
};

/** Every builder slot with the products it offers, read through the admin API so
 * it keeps working while the storefront's PC-builder page is switched off. Shared
 * for a few seconds so several admin tabs opening together make one request. */
let inflight: { at: number; promise: Promise<SlotWithProducts[]> } | null = null;

export function getSlotProducts(force = false): Promise<SlotWithProducts[]> {
  if (!force && inflight && Date.now() - inflight.at < 15_000) return inflight.promise;
  const promise = apiFetch<{ data: { slots: SlotWithProducts[] } }>("/api/v1/configurator/slot-products").then(
    (r) => r.data.slots,
  );
  inflight = { at: Date.now(), promise };
  promise.catch(() => {
    if (inflight?.promise === promise) inflight = null;
  });
  return promise;
}
