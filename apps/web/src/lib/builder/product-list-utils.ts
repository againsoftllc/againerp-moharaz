import type { PcBuilderProduct, PcBuilderStepId } from "@/lib/builder/types";

export type BuilderSortOption = "price_asc" | "price_desc" | "name_asc" | "stock";

export const BUILDER_SORT_OPTIONS: { value: BuilderSortOption; label: string }[] = [
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "name_asc", label: "Name: A–Z" },
  { value: "stock", label: "In Stock First" },
];

export type BuilderFilterFacet = {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  match: (product: PcBuilderProduct, value: string) => boolean;
};

function capacityLabel(gb: number): string {
  if (gb >= 1000) return `${gb / 1000}TB`;
  return `${gb}GB`;
}

const HDD_CAPACITY_OPTIONS = [
  { value: "480-512", label: "480GB - 512GB", min: 480, max: 512 },
  { value: "1000", label: "1TB", min: 1000, max: 1000 },
  { value: "2000", label: "2TB", min: 2000, max: 2000 },
  { value: "3000", label: "3TB", min: 3000, max: 3000 },
  { value: "4000", label: "4TB", min: 4000, max: 4000 },
  { value: "6000", label: "6TB", min: 6000, max: 6000 },
  { value: "8000", label: "8TB", min: 8000, max: 8000 },
];

export const BUILDER_STEP_FACETS: Partial<Record<PcBuilderStepId, BuilderFilterFacet[]>> = {
  ram: [
    {
      id: "capacity",
      label: "Capacity",
      options: [
        { value: "16", label: "16 GB" },
        { value: "32", label: "32 GB" },
        { value: "64", label: "64 GB" },
      ],
      match: (p, v) => String(p.attributes.capacity) === v,
    },
    {
      id: "brand",
      label: "Brand",
      options: [
        { value: "Corsair", label: "Corsair" },
        { value: "Kingston", label: "Kingston" },
        { value: "Crucial", label: "Crucial" },
        { value: "G.Skill", label: "G.Skill" },
      ],
      match: (p, v) => p.brand === v,
    },
  ],
  ssd: [
    {
      id: "capacity",
      label: "Storage Capacity",
      options: [
        { value: "500", label: "500 GB" },
        { value: "1000", label: "1 TB" },
        { value: "2000", label: "2 TB" },
      ],
      match: (p, v) => String(p.attributes.capacity) === v,
    },
    {
      id: "brand",
      label: "Brand",
      options: [
        { value: "Samsung", label: "Samsung" },
        { value: "WD", label: "WD" },
        { value: "Kingston", label: "Kingston" },
        { value: "Crucial", label: "Crucial" },
      ],
      match: (p, v) => p.brand === v,
    },
  ],
  hdd: [
    {
      id: "capacity",
      label: "Storage Capacity",
      options: HDD_CAPACITY_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
      match: (p, v) => {
        const cap = Number(p.attributes.capacity ?? 0);
        const range = HDD_CAPACITY_OPTIONS.find((o) => o.value === v);
        if (!range) return false;
        return cap >= range.min && cap <= range.max;
      },
    },
    {
      id: "brand",
      label: "Brand",
      options: [
        { value: "Seagate", label: "Seagate" },
        { value: "WD", label: "WD" },
        { value: "Toshiba", label: "Toshiba" },
      ],
      match: (p, v) => p.brand === v,
    },
  ],
  gpu: [
    {
      id: "vram",
      label: "VRAM",
      options: [
        { value: "8", label: "8 GB" },
        { value: "12", label: "12 GB" },
        { value: "16", label: "16 GB" },
      ],
      match: (p, v) => String(p.attributes.vram) === v,
    },
    {
      id: "brand",
      label: "Brand",
      options: [
        { value: "NVIDIA", label: "NVIDIA" },
        { value: "AMD", label: "AMD" },
      ],
      match: (p, v) => p.brand === v,
    },
  ],
  cpu: [
    {
      id: "brand",
      label: "Brand",
      options: [
        { value: "Intel", label: "Intel" },
        { value: "AMD", label: "AMD" },
      ],
      match: (p, v) => p.brand === v,
    },
  ],
};

export function applyBuilderQuickFilter(products: PcBuilderProduct[], query: string): PcBuilderProduct[] {
  const q = query.trim().toLowerCase();
  if (!q) return products;
  return products.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.brand.toLowerCase().includes(q) ||
      p.specs.some((s) => s.value.toLowerCase().includes(q)),
  );
}

export function applyBuilderFacetFilters(
  products: PcBuilderProduct[],
  stepId: PcBuilderStepId,
  active: Record<string, string[]>,
): PcBuilderProduct[] {
  const facets = BUILDER_STEP_FACETS[stepId];
  if (!facets) return products;

  return products.filter((product) =>
    facets.every((facet) => {
      const selected = active[facet.id];
      if (!selected?.length) return true;
      return selected.some((value) => facet.match(product, value));
    }),
  );
}

export function sortBuilderProducts(products: PcBuilderProduct[], sort: BuilderSortOption): PcBuilderProduct[] {
  const list = [...products];
  switch (sort) {
    case "price_desc":
      return list.sort((a, b) => b.price - a.price);
    case "name_asc":
      return list.sort((a, b) => a.name.localeCompare(b.name));
    case "stock":
      return list.sort((a, b) => {
        const score = (p: PcBuilderProduct) =>
          p.stockStatus === "In Stock" ? 0 : p.stockStatus === "Low Stock" ? 1 : 2;
        return score(a) - score(b) || a.price - b.price;
      });
    default:
      return list.sort((a, b) => a.price - b.price);
  }
}

export function countActiveBuilderFilters(active: Record<string, string[]>): number {
  return Object.values(active).reduce((sum, vals) => sum + vals.length, 0);
}

export function formatCapacityGb(gb: number): string {
  return capacityLabel(gb);
}
