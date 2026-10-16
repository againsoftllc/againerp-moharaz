export type StoreStatus = "active" | "inactive" | "setup";

export type StoreRecord = {
  id: string;
  name: string;
  code: string;
  domain: string;
  branches: number;
  products: number;
  orders: number;
  currency: string;
  timezone: string;
  status: StoreStatus;
  plan: string;
  owner: string;
  updatedAt: string;
};

export const storesList: StoreRecord[] = [
  {
    id: "co1",
    name: "UrbanWear Retail",
    code: "UWR",
    domain: "urbanwear.again.com.bd",
    branches: 2,
    products: 120,
    orders: 1842,
    currency: "BDT",
    timezone: "Asia/Dhaka",
    status: "active",
    plan: "Enterprise",
    owner: "Rakibul Hasan",
    updatedAt: "2026-06-12T10:00:00+06:00",
  },
  {
    id: "co2",
    name: "TechGadgets BD",
    code: "TGB",
    domain: "techgadgets.again.com.bd",
    branches: 1,
    products: 86,
    orders: 956,
    currency: "BDT",
    timezone: "Asia/Dhaka",
    status: "active",
    plan: "Growth",
    owner: "Fatema Begum",
    updatedAt: "2026-06-11T14:30:00+06:00",
  },
  {
    id: "co3",
    name: "Home & Living Co",
    code: "HLC",
    domain: "homeliving.again.com.bd",
    branches: 3,
    products: 204,
    orders: 421,
    currency: "BDT",
    timezone: "Asia/Dhaka",
    status: "active",
    plan: "Standard",
    owner: "Karim Uddin",
    updatedAt: "2026-06-10T09:15:00+06:00",
  },
  {
    id: "co4",
    name: "GlowUp Beauty",
    code: "GLW",
    domain: "glowup.again.com.bd",
    branches: 1,
    products: 0,
    orders: 0,
    currency: "BDT",
    timezone: "Asia/Dhaka",
    status: "setup",
    plan: "Trial",
    owner: "Nadia Islam",
    updatedAt: "2026-06-13T08:00:00+06:00",
  },
];

export function getStoreById(id: string) {
  return storesList.find((s) => s.id === id);
}

export const STORE_STATUS_LABELS: Record<StoreStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  setup: "Setup",
};
