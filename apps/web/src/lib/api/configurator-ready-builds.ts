import { apiFetch } from "@/lib/api/client";

export type ReadyBuildItem = {
  id?: string;
  product_id: string;
  product_name?: string | null;
  catalog_price?: number | null;
  build_price: number | null;
  is_default: boolean;
};

export type ReadyBuildSlot = {
  id?: string;
  category_id: string;
  mode: "locked" | "list" | "any" | "hidden";
  sort_order: number;
  items: ReadyBuildItem[];
};

export type ReadyBuildTotals = {
  regular: number;
  price: number;
  discount: number;
  final: number;
  changed: boolean;
  discount_applied: boolean;
};

export type ReadyBuild = {
  id: string;
  profile_id: string;
  name: string;
  slug: string;
  status: "draft" | "published";
  images: string[];
  tags: string[];
  category: string | null;
  fps_label: string | null;
  discount_type: "none" | "pct" | "fixed";
  discount_value: number;
  starts_at: string | null;
  ends_at: string | null;
  show_timer: boolean;
  discount_on_change: boolean;
  slots: ReadyBuildSlot[];
  totals?: ReadyBuildTotals;
};

export type ReadyBuildWrite = Omit<ReadyBuild, "id" | "slug" | "totals"> & { slug?: string };

const base = "/api/v1/configurator/ready-builds";

export const listReadyBuilds = () => apiFetch<{ data: ReadyBuild[]; meta: { count: number } }>(base);
export const getReadyBuild = (id: string) => apiFetch<{ data: ReadyBuild }>(`${base}/${id}`);
export const createReadyBuild = (payload: ReadyBuildWrite) =>
  apiFetch<{ data: ReadyBuild }>(base, { method: "POST", body: JSON.stringify(payload) });
export const updateReadyBuild = (id: string, payload: ReadyBuildWrite) =>
  apiFetch<{ data: ReadyBuild }>(`${base}/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteReadyBuild = (id: string) => apiFetch<void>(`${base}/${id}`, { method: "DELETE" });
export const publishReadyBuild = (id: string) => apiFetch<{ data: ReadyBuild }>(`${base}/${id}/publish`, { method: "POST" });
export const unpublishReadyBuild = (id: string) => apiFetch<{ data: ReadyBuild }>(`${base}/${id}/unpublish`, { method: "POST" });
