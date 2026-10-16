/** Workdo Assets list + detail (overview, assignment, maintenance, depreciation tabs). */

export type AssetStatus =
  | "available"
  | "assigned"
  | "under_maintenance"
  | "disposed";

export type AssetCondition = "new" | "good" | "fair" | "poor";

export type AssetAssignment = {
  id: string;
  employee: string;
  checkOutDate: string;
  returnDate: string | null;
  status: "assigned" | "returned";
};

export type AssetMaintenance = {
  id: string;
  date: string;
  type: string;
  cost: number;
  notes: string;
  status: "scheduled" | "completed" | "in_progress";
};

export type AssetDepreciationRow = {
  id: string;
  year: string;
  openingValue: number;
  depreciation: number;
  closingValue: number;
};

export type CompanyAsset = {
  id: string;
  name: string;
  assetType: string;
  assetCode: string;
  secondaryCode: string;
  serialNumber: string;
  status: AssetStatus;
  assignedTo: string | null;
  purchaseDate: string;
  purchaseCost: number;
  location: string;
  condition: AssetCondition;
  description: string;
  supplier: string;
  warrantyExpiry: string | null;
  /** e.g. "2 Year Manufacturer Warranty" */
  warrantyLabel: string | null;
  checkOutDate: string | null;
  assignmentNotes: string;
  assignments: AssetAssignment[];
  maintenance: AssetMaintenance[];
  depreciation: AssetDepreciationRow[];
};

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  available: "Available",
  assigned: "Assigned",
  under_maintenance: "Under Maintenance",
  disposed: "Disposed",
};

export const ASSET_CONDITION_LABEL: Record<AssetCondition, string> = {
  new: "New",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

export const ASSET_STATUS_OPTIONS = (
  Object.keys(ASSET_STATUS_LABEL) as AssetStatus[]
).map((k) => ({ value: k, label: ASSET_STATUS_LABEL[k] }));

export const ASSET_CONDITION_OPTIONS = (
  Object.keys(ASSET_CONDITION_LABEL) as AssetCondition[]
).map((k) => ({ value: k, label: ASSET_CONDITION_LABEL[k] }));

export const ASSET_TYPES = [
  "Network Equipment",
  "Vehicles",
  "Computer Hardware",
  "Mobile Devices",
  "Office Equipment",
  "Furniture",
] as const;

export const ASSET_LOCATIONS = [
  "Main Office",
  "North Branch",
  "West Branch",
  "Warehouse",
] as const;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function buildDepreciation(
  idPrefix: string,
  cost: number,
  purchaseYear: number,
  years = 3,
  rate = 0.2,
): AssetDepreciationRow[] {
  const rows: AssetDepreciationRow[] = [];
  let value = cost;
  for (let i = 0; i < years; i++) {
    const dep = round2(value * rate);
    const closing = round2(value - dep);
    rows.push({
      id: `${idPrefix}_d${i + 1}`,
      year: String(purchaseYear + i),
      openingValue: value,
      depreciation: dep,
      closingValue: closing,
    });
    value = closing;
  }
  return rows;
}

function emptyDetail(): Pick<
  CompanyAsset,
  | "warrantyLabel"
  | "checkOutDate"
  | "assignmentNotes"
  | "assignments"
  | "maintenance"
  | "depreciation"
> {
  return {
    warrantyLabel: null,
    checkOutDate: null,
    assignmentNotes: "",
    assignments: [],
    maintenance: [],
    depreciation: [],
  };
}

export const ASSETS_SEED: CompanyAsset[] = [
  {
    id: "ast_1",
    name: "TP-Link Wireless Router",
    assetType: "Network Equipment",
    assetCode: "NET002",
    secondaryCode: "TP001",
    serialNumber: "TPL-8821-A",
    status: "available",
    assignedTo: null,
    purchaseDate: "2025-01-15",
    purchaseCost: 8000,
    location: "Main Office",
    condition: "good",
    description: "Office Wi-Fi router",
    supplier: "TP-Link",
    warrantyExpiry: "2027-01-15",
    warrantyLabel: "2 Year Manufacturer Warranty",
    checkOutDate: null,
    assignmentNotes: "",
    assignments: [],
    maintenance: [],
    depreciation: buildDepreciation("ast_1", 8000, 2025),
  },
  {
    // Workdo demo: https://demo.workdo.io/hrm/hr/assets/16
    id: "ast_2",
    name: "Cisco Catalyst Switch",
    assetType: "Network Equipment",
    assetCode: "NET001",
    secondaryCode: "CS001",
    serialNumber: "CS001",
    status: "assigned",
    assignedTo: "Employee",
    purchaseDate: "2025-01-15",
    purchaseCost: 75000,
    location: "Main Office",
    condition: "new",
    description: "Standard Network Equipment for business operations.",
    supplier: "Tech Solutions Pvt Ltd",
    warrantyExpiry: "2027-01-15",
    warrantyLabel: "2 Year Manufacturer Warranty",
    checkOutDate: "2025-09-19",
    assignmentNotes: "Asset assigned for regular business use",
    assignments: [
      {
        id: "ast_2_a1",
        employee: "Employee",
        checkOutDate: "2025-09-19",
        returnDate: null,
        status: "assigned",
      },
    ],
    maintenance: [],
    depreciation: buildDepreciation("ast_2", 75000, 2025),
  },
  {
    id: "ast_3",
    name: "Honda City 2022",
    assetType: "Vehicles",
    assetCode: "VEH002",
    secondaryCode: "HC001",
    serialNumber: "VIN-HC2022-01",
    status: "available",
    assignedTo: null,
    purchaseDate: "2025-01-15",
    purchaseCost: 1_800_000,
    location: "Main Office",
    condition: "good",
    description: "Company pool car",
    supplier: "Honda",
    warrantyExpiry: "2027-01-15",
    warrantyLabel: "2 Year Manufacturer Warranty",
    checkOutDate: null,
    assignmentNotes: "",
    assignments: [
      {
        id: "ast_3_a1",
        employee: "Karim Ahmed",
        checkOutDate: "2025-03-01",
        returnDate: "2025-06-15",
        status: "returned",
      },
    ],
    maintenance: [
      {
        id: "ast_3_m1",
        date: "2025-06-20",
        type: "Service",
        cost: 8500,
        notes: "Routine service",
        status: "completed",
      },
    ],
    depreciation: buildDepreciation("ast_3", 1_800_000, 2025),
  },
  {
    id: "ast_4",
    name: "Dell OptiPlex 7080",
    assetType: "Computer Hardware",
    assetCode: "HW001",
    secondaryCode: "DO7080",
    serialNumber: "DLL-7080-X1",
    status: "assigned",
    assignedTo: "Karim Ahmed",
    purchaseDate: "2024-06-10",
    purchaseCost: 95000,
    location: "Main Office",
    condition: "good",
    description: "Desktop workstation",
    supplier: "Dell",
    warrantyExpiry: "2027-06-10",
    warrantyLabel: "3 Year On-site Warranty",
    checkOutDate: "2024-06-12",
    assignmentNotes: "Assigned to engineering desk",
    assignments: [
      {
        id: "ast_4_a1",
        employee: "Karim Ahmed",
        checkOutDate: "2024-06-12",
        returnDate: null,
        status: "assigned",
      },
    ],
    maintenance: [],
    depreciation: buildDepreciation("ast_4", 95000, 2024),
  },
  {
    id: "ast_5",
    name: 'MacBook Pro 16"',
    assetType: "Computer Hardware",
    assetCode: "HW002",
    secondaryCode: "MBP16",
    serialNumber: "APL-MBP16-02",
    status: "assigned",
    assignedTo: "Nusrat Jahan",
    purchaseDate: "2024-09-01",
    purchaseCost: 280000,
    location: "Main Office",
    condition: "new",
    description: "Laptop for finance",
    supplier: "Apple",
    warrantyExpiry: "2026-10-12",
    warrantyLabel: "AppleCare+",
    checkOutDate: "2024-09-05",
    assignmentNotes: "Finance department laptop",
    assignments: [
      {
        id: "ast_5_a1",
        employee: "Nusrat Jahan",
        checkOutDate: "2024-09-05",
        returnDate: null,
        status: "assigned",
      },
    ],
    maintenance: [],
    depreciation: buildDepreciation("ast_5", 280000, 2024),
  },
  {
    id: "ast_6",
    name: "iPhone 14 Pro",
    assetType: "Mobile Devices",
    assetCode: "MOB001",
    secondaryCode: "IP14P",
    serialNumber: "APL-IP14-03",
    status: "assigned",
    assignedTo: "Tanvir Hasan",
    purchaseDate: "2024-11-05",
    purchaseCost: 120000,
    location: "North Branch",
    condition: "good",
    description: "Company mobile",
    supplier: "Apple",
    warrantyExpiry: "2026-11-05",
    warrantyLabel: "1 Year Limited Warranty",
    checkOutDate: "2024-11-08",
    assignmentNotes: "HR field phone",
    assignments: [
      {
        id: "ast_6_a1",
        employee: "Tanvir Hasan",
        checkOutDate: "2024-11-08",
        returnDate: null,
        status: "assigned",
      },
    ],
    maintenance: [],
    depreciation: buildDepreciation("ast_6", 120000, 2024),
  },
  {
    id: "ast_7",
    name: "Canon imageRUNNER Printer",
    assetType: "Office Equipment",
    assetCode: "OE001",
    secondaryCode: "CNIR",
    serialNumber: "CAN-IR-04",
    status: "assigned",
    assignedTo: "Farzana Islam",
    purchaseDate: "2023-08-20",
    purchaseCost: 185000,
    location: "Main Office",
    condition: "fair",
    description: "Floor printer",
    supplier: "Canon",
    warrantyExpiry: "2026-08-20",
    warrantyLabel: "3 Year Service Plan",
    checkOutDate: "2023-08-25",
    assignmentNotes: "Shared floor printer",
    assignments: [
      {
        id: "ast_7_a1",
        employee: "Farzana Islam",
        checkOutDate: "2023-08-25",
        returnDate: null,
        status: "assigned",
      },
    ],
    maintenance: [
      {
        id: "ast_7_m1",
        date: "2025-02-10",
        type: "Toner & Rollers",
        cost: 4200,
        notes: "Consumables replaced",
        status: "completed",
      },
    ],
    depreciation: buildDepreciation("ast_7", 185000, 2023),
  },
  {
    id: "ast_8",
    name: "Executive Office Desk",
    assetType: "Furniture",
    assetCode: "FUR001",
    secondaryCode: "EOD01",
    serialNumber: "FUR-DESK-05",
    status: "assigned",
    assignedTo: "Rafiqul Islam",
    purchaseDate: "2023-03-12",
    purchaseCost: 45000,
    location: "West Branch",
    condition: "good",
    description: "Executive desk",
    supplier: "OfficeMax",
    warrantyExpiry: null,
    warrantyLabel: null,
    checkOutDate: "2023-03-15",
    assignmentNotes: "Sales lead desk",
    assignments: [
      {
        id: "ast_8_a1",
        employee: "Rafiqul Islam",
        checkOutDate: "2023-03-15",
        returnDate: null,
        status: "assigned",
      },
    ],
    maintenance: [],
    depreciation: buildDepreciation("ast_8", 45000, 2023, 3, 0.1),
  },
  {
    id: "ast_9",
    name: "Company Van — Toyota Hiace",
    assetType: "Vehicles",
    assetCode: "VEH001",
    secondaryCode: "TH01",
    serialNumber: "VIN-TH2021-02",
    status: "under_maintenance",
    assignedTo: null,
    purchaseDate: "2021-05-18",
    purchaseCost: 2_200_000,
    location: "Warehouse",
    condition: "fair",
    description: "Logistics van",
    supplier: "Toyota",
    warrantyExpiry: "2024-05-18",
    warrantyLabel: "3 Year / 100,000 km Warranty",
    checkOutDate: null,
    assignmentNotes: "",
    assignments: [
      {
        id: "ast_9_a1",
        employee: "Sadia Rahman",
        checkOutDate: "2024-01-10",
        returnDate: "2025-06-01",
        status: "returned",
      },
    ],
    maintenance: [
      {
        id: "ast_9_m1",
        date: "2025-06-05",
        type: "Engine Overhaul",
        cost: 85000,
        notes: "In workshop — under maintenance",
        status: "in_progress",
      },
      {
        id: "ast_9_m2",
        date: "2024-11-12",
        type: "Tire Replacement",
        cost: 28000,
        notes: "All four tires",
        status: "completed",
      },
    ],
    depreciation: buildDepreciation("ast_9", 2_200_000, 2021, 4, 0.15),
  },
];

export function createAssetId(existing: CompanyAsset[]): string {
  const n = existing.reduce((max, r) => {
    const m = /^ast_(\d+)$/.exec(r.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `ast_${n + 1}`;
}

export function formatAssetCost(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

/** Default detail fields for newly created assets. */
export function defaultAssetDetail(
  purchaseCost: number,
  purchaseDate: string,
  status: AssetStatus,
  assignedTo: string | null,
): ReturnType<typeof emptyDetail> & {
  depreciation: AssetDepreciationRow[];
} {
  const year = Number(purchaseDate.slice(0, 4)) || new Date().getFullYear();
  const checkOutDate =
    status === "assigned" && assignedTo ? purchaseDate : null;
  return {
    ...emptyDetail(),
    warrantyLabel: null,
    checkOutDate,
    assignmentNotes:
      status === "assigned" && assignedTo
        ? "Asset assigned for regular business use"
        : "",
    assignments:
      status === "assigned" && assignedTo
        ? [
            {
              id: `new_a1`,
              employee: assignedTo,
              checkOutDate: purchaseDate,
              returnDate: null,
              status: "assigned",
            },
          ]
        : [],
    depreciation: buildDepreciation("new", purchaseCost || 0, year),
  };
}
