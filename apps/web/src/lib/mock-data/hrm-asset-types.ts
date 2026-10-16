/** Workdo Asset Types: Name+description, assets count badge. */

export type AssetTypeStatus = "active" | "inactive";

export type AssetType = {
  id: string;
  name: string;
  description: string;
  depreciationRate: number;
  assetsCount: number;
  status: AssetTypeStatus;
};

export const ASSET_TYPE_STATUS_LABEL: Record<AssetTypeStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};

export const ASSET_TYPE_STATUS_OPTIONS = (
  Object.keys(ASSET_TYPE_STATUS_LABEL) as AssetTypeStatus[]
).map((k) => ({ value: k, label: ASSET_TYPE_STATUS_LABEL[k] }));

export const ASSET_TYPES_SEED: AssetType[] = [
  {
    id: "at_1",
    name: "Network Equipment",
    description: "Networking hardware",
    depreciationRate: 20,
    assetsCount: 2,
    status: "active",
  },
  {
    id: "at_2",
    name: "Vehicles",
    description: "Company vehicles",
    depreciationRate: 15,
    assetsCount: 2,
    status: "active",
  },
  {
    id: "at_3",
    name: "Furniture",
    description:
      "Office furniture including desks, chairs, cabinets, conference tables, and other workspace fixtures used across branches.",
    depreciationRate: 10,
    assetsCount: 3,
    status: "active",
  },
  {
    id: "at_4",
    name: "Computer Hardware",
    description: "Desktops, laptops, and servers",
    depreciationRate: 25,
    assetsCount: 4,
    status: "active",
  },
  {
    id: "at_5",
    name: "Mobile Devices",
    description: "Phones and tablets issued to employees",
    depreciationRate: 30,
    assetsCount: 3,
    status: "active",
  },
  {
    id: "at_6",
    name: "Office Equipment",
    description: "Printers, projectors, and shared office devices",
    depreciationRate: 18,
    assetsCount: 3,
    status: "active",
  },
];

export function createAssetTypeId(existing: AssetType[]): string {
  const n = existing.reduce((max, r) => {
    const m = /^at_(\d+)$/.exec(r.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `at_${n + 1}`;
}
