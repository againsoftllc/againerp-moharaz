import type { PcBuilderProduct } from "@/lib/builder/types";

const img = (seed: string) => `https://picsum.photos/seed/${seed}/400/400`;

/** Cooler catalog — recommendation-only (not a wizard step) */
export type CoolerProduct = Omit<PcBuilderProduct, "stepId"> & {
  stepId: "cooler";
};

export const coolerProductsSeed: CoolerProduct[] = [
  {
    id: "pcb_cooler_stock",
    slug: "stock-cpu-cooler",
    name: "Stock CPU Cooler",
    brand: "Included",
    price: 0,
    stock: 999,
    stockStatus: "In Stock",
    image: img("cooler-stock"),
    stepId: "cooler",
    categoryId: "cc_cooler",
    attributeProfileId: "cap_cooler",
    attributes: { tdp_rating: 65, type: "stock" },
    specs: [{ label: "TDP rating", value: "65W" }],
  },
  {
    id: "pcb_cooler_tower",
    slug: "deepcool-ak400",
    name: "DeepCool AK400 Tower",
    brand: "DeepCool",
    price: 3200,
    stock: 40,
    stockStatus: "In Stock",
    image: img("cooler-tower"),
    stepId: "cooler",
    categoryId: "cc_cooler",
    attributeProfileId: "cap_cooler",
    attributes: { tdp_rating: 150, type: "air" },
    specs: [{ label: "TDP rating", value: "150W" }, { label: "Type", value: "Air" }],
  },
  {
    id: "pcb_cooler_aio",
    slug: "corsair-h100i",
    name: "Corsair H100i RGB 240mm AIO",
    brand: "Corsair",
    price: 11500,
    stock: 15,
    stockStatus: "In Stock",
    image: img("cooler-aio"),
    stepId: "cooler",
    categoryId: "cc_cooler",
    attributeProfileId: "cap_cooler",
    attributes: { tdp_rating: 250, type: "aio_240" },
    specs: [{ label: "TDP rating", value: "250W" }, { label: "Type", value: "240mm AIO" }],
  },
];

export function getCoolerById(id: string): CoolerProduct | undefined {
  return coolerProductsSeed.find((c) => c.id === id);
}
