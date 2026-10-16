/** Workdo Asset Dashboard: KPIs, value summary, distribution, recent assignments. */

export type AssetDashStatus = "available" | "assigned" | "under_maintenance";

export type AssetDistributionItem = {
  category: string;
  count: number;
};

export type RecentAssignment = {
  id: string;
  assetName: string;
  employeeName: string;
  assignedDate: string;
};

export type UpcomingMaintenance = {
  id: string;
  assetName: string;
  dueDate: string;
  type: string;
};

export type ExpiringWarranty = {
  id: string;
  assetName: string;
  expiryDate: string;
};

export const ASSET_DASHBOARD_STATS = {
  totalAssets: 17,
  available: 10,
  assigned: 7,
  underMaintenance: 0,
  totalPurchaseValue: 6_370_000,
  totalCurrentValue: 5_488_330,
  totalDepreciation: 881_670,
};

export const ASSET_DISTRIBUTION: AssetDistributionItem[] = [
  { category: "Computer Hardware", count: 4 },
  { category: "Mobile Devices", count: 3 },
  { category: "Office Equipment", count: 3 },
  { category: "Furniture", count: 3 },
  { category: "Vehicles", count: 2 },
  { category: "Network Equipment", count: 2 },
];

export const RECENT_ASSIGNMENTS: RecentAssignment[] = [
  {
    id: "ra_1",
    assetName: "Dell OptiPlex 7080",
    employeeName: "Karim Ahmed",
    assignedDate: "2025-09-19",
  },
  {
    id: "ra_2",
    assetName: 'MacBook Pro 16"',
    employeeName: "Nusrat Jahan",
    assignedDate: "2025-09-19",
  },
  {
    id: "ra_3",
    assetName: "iPhone 14 Pro",
    employeeName: "Tanvir Hasan",
    assignedDate: "2025-09-19",
  },
  {
    id: "ra_4",
    assetName: "Canon imageRUNNER Printer",
    employeeName: "Farzana Islam",
    assignedDate: "2025-09-19",
  },
  {
    id: "ra_5",
    assetName: "Executive Office Desk",
    employeeName: "Rafiqul Islam",
    assignedDate: "2025-09-19",
  },
];

export const UPCOMING_MAINTENANCE: UpcomingMaintenance[] = [
  {
    id: "um_1",
    assetName: "Company Van — Toyota Hiace",
    dueDate: "2026-08-15",
    type: "Service",
  },
  {
    id: "um_2",
    assetName: "Conference Room Projector",
    dueDate: "2026-09-01",
    type: "Inspection",
  },
];

export const EXPIRING_WARRANTIES: ExpiringWarranty[] = [
  {
    id: "ew_1",
    assetName: "MacBook Pro 16\"",
    expiryDate: "2026-10-12",
  },
  {
    id: "ew_2",
    assetName: "iPhone 14 Pro",
    expiryDate: "2026-11-05",
  },
];

export function formatAssetMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function pctOfTotal(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}
