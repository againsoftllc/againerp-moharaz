import { apiFetch } from "@/lib/api/client";
import { listHrmEmployees, type ApiHrmEmployee } from "@/lib/api/hrm-employees";
import type { AssetType } from "@/lib/mock-data/hrm-asset-types";
import type {
  AssetAssignment,
  AssetCondition,
  AssetDepreciationRow,
  AssetMaintenance,
  AssetStatus,
  CompanyAsset,
} from "@/lib/mock-data/hrm-assets";
import type { AssetDepreciationRow as AssetDepreciationReportRow } from "@/lib/mock-data/hrm-depreciation";
import type {
  AssetDistributionItem,
  ExpiringWarranty,
  RecentAssignment,
  UpcomingMaintenance,
} from "@/lib/mock-data/hrm-assets-dashboard";

type ApiListResponse<T> = {
  data: T[];
  meta: { count: number };
  errors: string[];
};

type ApiItemResponse<T> = {
  data: T;
  errors: string[];
};

type ApiAssetType = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  depreciation_rate: string | number | null;
  status: "active" | "inactive";
  assets_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiAsset = {
  id: string;
  company_id: string;
  name: string;
  asset_type_id: string | null;
  asset_type_name: string | null;
  serial_number: string | null;
  asset_code: string | null;
  secondary_code: string | null;
  purchase_date: string | null;
  purchase_cost: string | number | null;
  status: AssetStatus;
  condition: AssetCondition | null;
  description: string | null;
  location: string | null;
  supplier: string | null;
  warranty_info: string | null;
  warranty_expiry_date: string | null;
  images: string | null;
  documents: string | null;
  qr_code: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiAssetAssignment = {
  id: string;
  company_id: string;
  asset_id: string | null;
  employee_id: string | null;
  checkout_date: string | null;
  checkin_date: string | null;
  expected_return_date: string | null;
  checkout_condition: string | null;
  checkin_condition: string | null;
  notes: string | null;
  is_acknowledged: boolean;
  acknowledged_at: string | null;
  assigned_by: string | null;
  received_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiAssetMaintenance = {
  id: string;
  company_id: string;
  asset_id: string | null;
  maintenance_type: string | null;
  start_date: string | null;
  end_date: string | null;
  cost: string | number | null;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  details: string | null;
  completion_notes: string | null;
  supplier: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiAssetDepreciation = {
  id: string;
  company_id: string;
  asset_id: string | null;
  method: "straight_line" | "reducing_balance" | null;
  useful_life_years: number;
  salvage_value: string | number | null;
  current_value: string | number;
  last_calculated_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type AssetFormPayload = Omit<CompanyAsset, "id">;

function asNumber(value: string | number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function blankToUndef(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text === "" ? undefined : text;
}

function blankToNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildDepreciationSchedule(
  assetId: string,
  purchaseCost: number,
  purchaseDate: string,
  typeRate: number,
  dep: ApiAssetDepreciation | undefined,
): AssetDepreciationRow[] {
  const year = Number(purchaseDate.slice(0, 4)) || new Date().getFullYear();
  const usefulLife =
    dep?.useful_life_years && dep.useful_life_years > 0
      ? dep.useful_life_years
      : Math.max(1, Math.round(100 / Math.max(typeRate, 1)));
  const rate =
    dep?.method === "reducing_balance"
      ? 2 / usefulLife
      : Math.max(typeRate, 1) / 100;
  const salvageValue = asNumber(dep?.salvage_value);
  let openingValue = purchaseCost;
  const rows: AssetDepreciationRow[] = [];

  for (let i = 0; i < usefulLife; i += 1) {
    let depreciation = 0;
    if (dep?.method === "reducing_balance") {
      depreciation = round2(openingValue * rate);
      if (openingValue - depreciation < salvageValue) {
        depreciation = Math.max(0, round2(openingValue - salvageValue));
      }
    } else {
      const depreciable = Math.max(0, purchaseCost - salvageValue);
      depreciation = round2(depreciable / usefulLife);
      if (openingValue - depreciation < salvageValue) {
        depreciation = Math.max(0, round2(openingValue - salvageValue));
      }
    }
    const closingValue = round2(Math.max(salvageValue, openingValue - depreciation));
    rows.push({
      id: `${assetId}_dep_${i + 1}`,
      year: String(year + i),
      openingValue: round2(openingValue),
      depreciation,
      closingValue,
    });
    openingValue = closingValue;
  }

  return rows;
}

function employeeName(row: ApiHrmEmployee): string {
  return row.name.trim();
}

async function listApiAssetTypes(): Promise<ApiAssetType[]> {
  const qs = new URLSearchParams({ company_id: "default" });
  const res = await apiFetch<ApiListResponse<ApiAssetType>>(
    `/api/v1/hrm/asset-types?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

async function listApiAssets(): Promise<ApiAsset[]> {
  const qs = new URLSearchParams({ company_id: "default" });
  const res = await apiFetch<ApiListResponse<ApiAsset>>(`/api/v1/hrm/assets?${qs.toString()}`, {
    cache: "no-store",
  });
  return res.data ?? [];
}

async function listApiAssignments(): Promise<ApiAssetAssignment[]> {
  const qs = new URLSearchParams({ company_id: "default" });
  const res = await apiFetch<ApiListResponse<ApiAssetAssignment>>(
    `/api/v1/hrm/asset-assignments?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

async function listApiMaintenances(): Promise<ApiAssetMaintenance[]> {
  const qs = new URLSearchParams({ company_id: "default" });
  const res = await apiFetch<ApiListResponse<ApiAssetMaintenance>>(
    `/api/v1/hrm/asset-maintenances?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

async function listApiDepreciations(): Promise<ApiAssetDepreciation[]> {
  const qs = new URLSearchParams({ company_id: "default" });
  const res = await apiFetch<ApiListResponse<ApiAssetDepreciation>>(
    `/api/v1/hrm/asset-depreciations?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

function apiAssetTypeToView(row: ApiAssetType): AssetType {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    depreciationRate: asNumber(row.depreciation_rate),
    assetsCount: row.assets_count ?? 0,
    status: row.status,
  };
}

function mapAssignment(
  row: ApiAssetAssignment,
  employeeById: Map<string, string>,
): AssetAssignment | null {
  if (!row.asset_id) return null;
  return {
    id: row.id,
    employee: row.employee_id ? employeeById.get(row.employee_id) ?? row.employee_id : "Employee",
    checkOutDate: row.checkout_date ?? "",
    returnDate: row.checkin_date ?? null,
    status: row.checkin_date ? "returned" : "assigned",
  };
}

function mapMaintenance(row: ApiAssetMaintenance): AssetMaintenance | null {
  if (!row.asset_id) return null;
  return {
    id: row.id,
    date: row.end_date ?? row.start_date ?? "",
    type: row.maintenance_type ?? "Maintenance",
    cost: asNumber(row.cost),
    notes: row.completion_notes ?? row.details ?? "",
    status: row.status,
  };
}

function apiAssetToView(
  row: ApiAsset,
  typeById: Map<string, ApiAssetType>,
  assignmentsByAsset: Map<string, AssetAssignment[]>,
  rawAssignmentsByAsset: Map<string, ApiAssetAssignment[]>,
  maintenanceByAsset: Map<string, AssetMaintenance[]>,
  depreciationByAsset: Map<string, ApiAssetDepreciation>,
  employeeById: Map<string, string>,
): CompanyAsset {
  const type = row.asset_type_id ? typeById.get(row.asset_type_id) : undefined;
  const history = assignmentsByAsset.get(row.id) ?? [];
  const rawHistory = rawAssignmentsByAsset.get(row.id) ?? [];
  const activeRaw = rawHistory.find((item) => !item.checkin_date);
  const activeAssignment = history.find((item) => item.status === "assigned") ?? null;
  const typeRate = type ? asNumber(type.depreciation_rate) : 20;
  const dep = depreciationByAsset.get(row.id);

  return {
    id: row.id,
    name: row.name,
    assetType: row.asset_type_name ?? type?.name ?? "Uncategorized",
    assetCode: row.asset_code ?? "",
    secondaryCode: row.secondary_code ?? "",
    serialNumber: row.serial_number ?? "",
    status: row.status,
    assignedTo: activeAssignment?.employee ?? null,
    purchaseDate: row.purchase_date ?? "",
    purchaseCost: asNumber(row.purchase_cost),
    location: row.location ?? "",
    condition: row.condition ?? "good",
    description: row.description ?? "",
    supplier: row.supplier ?? "",
    warrantyExpiry: row.warranty_expiry_date ?? null,
    warrantyLabel: row.warranty_info ?? null,
    checkOutDate: activeAssignment?.checkOutDate ?? null,
    assignmentNotes: activeRaw?.notes ?? "",
    assignments: history,
    maintenance: maintenanceByAsset.get(row.id) ?? [],
    depreciation: buildDepreciationSchedule(
      row.id,
      asNumber(row.purchase_cost),
      row.purchase_date ?? "",
      typeRate,
      dep,
    ),
  };
}

export async function listHrmAssetTypesView(): Promise<AssetType[]> {
  const rows = await listApiAssetTypes();
  return rows.map(apiAssetTypeToView);
}

export async function createHrmAssetTypeView(payload: Omit<AssetType, "id">): Promise<AssetType> {
  const res = await apiFetch<ApiItemResponse<ApiAssetType>>("/api/v1/hrm/asset-types", {
    method: "POST",
    body: JSON.stringify({
      company_id: "default",
      name: payload.name.trim(),
      description: blankToNull(payload.description) ?? undefined,
      depreciation_rate: payload.depreciationRate,
      status: payload.status,
    }),
  });
  return apiAssetTypeToView(res.data);
}

export async function updateHrmAssetTypeView(
  id: string,
  payload: Omit<AssetType, "id">,
): Promise<AssetType> {
  const res = await apiFetch<ApiItemResponse<ApiAssetType>>(
    `/api/v1/hrm/asset-types/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        name: payload.name.trim(),
        description: blankToNull(payload.description) ?? undefined,
        depreciation_rate: payload.depreciationRate,
        status: payload.status,
      }),
    },
  );
  return apiAssetTypeToView(res.data);
}

export async function deleteHrmAssetTypeView(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/asset-types/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}

async function resolveEmployeeIdByName(name: string): Promise<string> {
  const desired = name.trim().toLowerCase();
  const { rows } = await listHrmEmployees({ per_page: 200 });
  const match = rows.find((row) => employeeName(row).toLowerCase() === desired);
  if (!match) {
    throw new Error(`Employee "${name}" not found`);
  }
  return match.id;
}

async function resolveAssetTypeIdByName(name: string): Promise<string | undefined> {
  const desired = name.trim().toLowerCase();
  const types = await listApiAssetTypes();
  const match = types.find((row) => row.name.trim().toLowerCase() === desired);
  return match?.id;
}

async function getActiveAssignment(assetId: string): Promise<ApiAssetAssignment | null> {
  const qs = new URLSearchParams({
    company_id: "default",
    asset_id: assetId,
    active_only: "true",
  });
  const res = await apiFetch<ApiListResponse<ApiAssetAssignment>>(
    `/api/v1/hrm/asset-assignments?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data?.[0] ?? null;
}

async function getOpenMaintenance(assetId: string): Promise<ApiAssetMaintenance | null> {
  const qs = new URLSearchParams({
    company_id: "default",
    asset_id: assetId,
  });
  const res = await apiFetch<ApiListResponse<ApiAssetMaintenance>>(
    `/api/v1/hrm/asset-maintenances?${qs.toString()}`,
    { cache: "no-store" },
  );
  return (res.data ?? []).find((row) => row.status === "scheduled" || row.status === "in_progress") ?? null;
}

async function syncAssetStatus(assetId: string, payload: AssetFormPayload): Promise<void> {
  const desiredStatus = payload.status;
  const desiredAssignee = payload.assignedTo?.trim() ?? "";
  const activeAssignment = await getActiveAssignment(assetId);
  const openMaintenance = await getOpenMaintenance(assetId);

  if (desiredStatus === "available") {
    if (activeAssignment) {
      await apiFetch(`/api/v1/hrm/asset-assignments/${encodeURIComponent(activeAssignment.id)}/checkin?company_id=default`, {
        method: "POST",
        body: JSON.stringify({
          checkin_date: payload.purchaseDate || undefined,
          checkin_condition: payload.condition,
          notes: payload.description || undefined,
        }),
      });
    }
    if (openMaintenance) {
      await apiFetch(
        `/api/v1/hrm/asset-maintenances/${encodeURIComponent(openMaintenance.id)}/cancel?company_id=default`,
        { method: "POST" },
      );
    }
    return;
  }

  if (desiredStatus === "assigned") {
    if (!desiredAssignee) throw new Error("Assigned employee is required");
    if (openMaintenance) {
      await apiFetch(
        `/api/v1/hrm/asset-maintenances/${encodeURIComponent(openMaintenance.id)}/complete?company_id=default`,
        { method: "POST" },
      );
    }
    const employeeId = await resolveEmployeeIdByName(desiredAssignee);
    if (activeAssignment && activeAssignment.employee_id === employeeId) {
      return;
    }
    if (activeAssignment) {
      await apiFetch(`/api/v1/hrm/asset-assignments/${encodeURIComponent(activeAssignment.id)}/checkin?company_id=default`, {
        method: "POST",
        body: JSON.stringify({
          checkin_condition: payload.condition,
          notes: payload.description || undefined,
        }),
      });
    }
    await apiFetch<ApiItemResponse<ApiAssetAssignment>>("/api/v1/hrm/asset-assignments", {
      method: "POST",
      body: JSON.stringify({
        company_id: "default",
        asset_id: assetId,
        employee_id: employeeId,
        checkout_date: blankToUndef(payload.purchaseDate),
        checkout_condition: payload.condition,
        notes: payload.description || "Asset assigned for regular business use",
      }),
    });
    return;
  }

  if (desiredStatus === "under_maintenance") {
    if (activeAssignment) {
      await apiFetch(`/api/v1/hrm/asset-assignments/${encodeURIComponent(activeAssignment.id)}/checkin?company_id=default`, {
        method: "POST",
        body: JSON.stringify({
          checkin_condition: payload.condition,
          notes: payload.description || undefined,
        }),
      });
    }
    const maintenance = openMaintenance
      ? openMaintenance
      : (
          await apiFetch<ApiItemResponse<ApiAssetMaintenance>>("/api/v1/hrm/asset-maintenances", {
            method: "POST",
            body: JSON.stringify({
              company_id: "default",
              asset_id: assetId,
              maintenance_type: "General maintenance",
              start_date: blankToUndef(payload.purchaseDate),
              cost: 0,
              details: payload.description || undefined,
              supplier: blankToUndef(payload.supplier),
            }),
          })
        ).data;
    if (maintenance.status === "scheduled") {
      await apiFetch(
        `/api/v1/hrm/asset-maintenances/${encodeURIComponent(maintenance.id)}/start?company_id=default`,
        { method: "POST" },
      );
    }
    return;
  }

  if (desiredStatus === "disposed") {
    if (activeAssignment) {
      await apiFetch(`/api/v1/hrm/asset-assignments/${encodeURIComponent(activeAssignment.id)}/checkin?company_id=default`, {
        method: "POST",
        body: JSON.stringify({
          checkin_condition: payload.condition,
          notes: payload.description || undefined,
        }),
      });
    }
    if (openMaintenance) {
      await apiFetch(
        `/api/v1/hrm/asset-maintenances/${encodeURIComponent(openMaintenance.id)}/complete?company_id=default`,
        { method: "POST" },
      );
    }
    await apiFetch<ApiItemResponse<ApiAsset>>(
      `/api/v1/hrm/assets/${encodeURIComponent(assetId)}/dispose?company_id=default`,
      { method: "POST" },
    );
  }
}

function assetPayloadToApiWrite(payload: AssetFormPayload, assetTypeId?: string) {
  return {
    company_id: "default",
    name: payload.name.trim(),
    asset_type_id: assetTypeId,
    serial_number: blankToUndef(payload.serialNumber),
    asset_code: blankToUndef(payload.assetCode),
    secondary_code: blankToUndef(payload.secondaryCode),
    purchase_date: blankToUndef(payload.purchaseDate),
    purchase_cost: payload.purchaseCost,
    condition: payload.condition,
    description: blankToUndef(payload.description),
    location: blankToUndef(payload.location),
    supplier: blankToUndef(payload.supplier),
    warranty_info: blankToUndef(payload.warrantyLabel),
    warranty_expiry_date: blankToUndef(payload.warrantyExpiry ?? ""),
  };
}

export async function listCompanyAssets(): Promise<CompanyAsset[]> {
  const [{ rows: employees }, types, assets, assignments, maintenances, depreciations] =
    await Promise.all([
      listHrmEmployees({ per_page: 200 }),
      listApiAssetTypes(),
      listApiAssets(),
      listApiAssignments(),
      listApiMaintenances(),
      listApiDepreciations(),
    ]);

  const employeeById = new Map(employees.map((row) => [row.id, employeeName(row)]));
  const typeById = new Map(types.map((row) => [row.id, row]));
  const assignmentsByAsset = new Map<string, AssetAssignment[]>();
  const rawAssignmentsByAsset = new Map<string, ApiAssetAssignment[]>();
  const maintenanceByAsset = new Map<string, AssetMaintenance[]>();
  const depreciationByAsset = new Map<string, ApiAssetDepreciation>();

  for (const row of assignments) {
    if (!row.asset_id) continue;
    const mapped = mapAssignment(row, employeeById);
    if (!mapped) continue;
    assignmentsByAsset.set(row.asset_id, [...(assignmentsByAsset.get(row.asset_id) ?? []), mapped]);
    rawAssignmentsByAsset.set(row.asset_id, [...(rawAssignmentsByAsset.get(row.asset_id) ?? []), row]);
  }

  for (const row of maintenances) {
    if (!row.asset_id) continue;
    const mapped = mapMaintenance(row);
    if (!mapped) continue;
    maintenanceByAsset.set(row.asset_id, [...(maintenanceByAsset.get(row.asset_id) ?? []), mapped]);
  }

  for (const row of depreciations) {
    if (!row.asset_id || depreciationByAsset.has(row.asset_id)) continue;
    depreciationByAsset.set(row.asset_id, row);
  }

  return assets.map((row) =>
    apiAssetToView(
      row,
      typeById,
      assignmentsByAsset,
      rawAssignmentsByAsset,
      maintenanceByAsset,
      depreciationByAsset,
      employeeById,
    ),
  );
}

export async function createCompanyAsset(payload: AssetFormPayload): Promise<CompanyAsset> {
  const assetTypeId = await resolveAssetTypeIdByName(payload.assetType);
  const res = await apiFetch<ApiItemResponse<ApiAsset>>("/api/v1/hrm/assets", {
    method: "POST",
    body: JSON.stringify(assetPayloadToApiWrite(payload, assetTypeId)),
  });
  await syncAssetStatus(res.data.id, payload);
  const rows = await listCompanyAssets();
  const created = rows.find((row) => row.id === res.data.id);
  if (!created) throw new Error("Created asset could not be loaded");
  return created;
}

export async function updateCompanyAsset(
  id: string,
  payload: AssetFormPayload,
): Promise<CompanyAsset> {
  const assetTypeId = await resolveAssetTypeIdByName(payload.assetType);
  await apiFetch<ApiItemResponse<ApiAsset>>(
    `/api/v1/hrm/assets/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify(assetPayloadToApiWrite(payload, assetTypeId)),
    },
  );
  await syncAssetStatus(id, payload);
  const rows = await listCompanyAssets();
  const updated = rows.find((row) => row.id === id);
  if (!updated) throw new Error("Updated asset could not be loaded");
  return updated;
}

export async function deleteCompanyAsset(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/hrm/assets/${encodeURIComponent(id)}?company_id=default`, {
    method: "DELETE",
  });
}

export async function listAssetDepreciationReportRows(): Promise<AssetDepreciationReportRow[]> {
  const [rows, depreciations] = await Promise.all([listCompanyAssets(), listApiDepreciations()]);
  const depByAssetId = new Map(
    depreciations.filter((row) => row.asset_id).map((row) => [String(row.asset_id), row]),
  );
  return rows.map((row) => {
    const latest = row.depreciation[row.depreciation.length - 1];
    const currentValue = latest ? latest.closingValue : row.purchaseCost;
    const dep = depByAssetId.get(row.id);
    return {
      id: row.id,
      assetName: row.name,
      assetType: row.assetType,
      purchaseDate: row.purchaseDate,
      purchaseCost: row.purchaseCost,
      method: dep?.method === "reducing_balance" ? "reducing_balance" : "straight_line",
      currentValue,
      depreciationAmount: round2(row.purchaseCost - currentValue),
    };
  });
}

export type AssetsDashboardData = {
  stats: {
    totalAssets: number;
    available: number;
    assigned: number;
    underMaintenance: number;
    totalPurchaseValue: number;
    totalCurrentValue: number;
    totalDepreciation: number;
  };
  distribution: AssetDistributionItem[];
  recentAssignments: RecentAssignment[];
  upcomingMaintenance: UpcomingMaintenance[];
  expiringWarranties: ExpiringWarranty[];
};

function daysFromToday(ymd: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const target = new Date(`${ymd}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export async function getAssetsDashboardData(): Promise<AssetsDashboardData> {
  const assets = await listCompanyAssets();
  const active = assets.filter((row) => row.status !== "disposed");

  let totalPurchaseValue = 0;
  let totalCurrentValue = 0;
  for (const row of active) {
    totalPurchaseValue += row.purchaseCost;
    const latest = row.depreciation[row.depreciation.length - 1];
    totalCurrentValue += latest ? latest.closingValue : row.purchaseCost;
  }
  totalPurchaseValue = round2(totalPurchaseValue);
  totalCurrentValue = round2(totalCurrentValue);

  const distributionMap = new Map<string, number>();
  for (const row of active) {
    const key = row.assetType || "Uncategorized";
    distributionMap.set(key, (distributionMap.get(key) ?? 0) + 1);
  }

  const recentAssignments: RecentAssignment[] = active
    .filter((row) => row.status === "assigned" && row.assignedTo)
    .map((row) => ({
      id: row.id,
      assetName: row.name,
      employeeName: row.assignedTo ?? "Employee",
      assignedDate: row.checkOutDate ?? row.purchaseDate,
    }))
    .sort((a, b) => String(b.assignedDate).localeCompare(String(a.assignedDate)))
    .slice(0, 8);

  const upcomingMaintenance: UpcomingMaintenance[] = active
    .flatMap((row) =>
      row.maintenance
        .filter((m) => m.status === "scheduled" || m.status === "in_progress")
        .map((m) => ({
          id: m.id,
          assetName: row.name,
          dueDate: m.date,
          type: m.type,
        })),
    )
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
    .slice(0, 8);

  const expiringWarranties: ExpiringWarranty[] = active
    .filter((row) => {
      if (!row.warrantyExpiry) return false;
      const days = daysFromToday(row.warrantyExpiry);
      return days != null && days >= 0 && days <= 180;
    })
    .map((row) => ({
      id: row.id,
      assetName: row.name,
      expiryDate: row.warrantyExpiry as string,
    }))
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
    .slice(0, 8);

  return {
    stats: {
      totalAssets: active.length,
      available: active.filter((row) => row.status === "available").length,
      assigned: active.filter((row) => row.status === "assigned").length,
      underMaintenance: active.filter((row) => row.status === "under_maintenance").length,
      totalPurchaseValue,
      totalCurrentValue,
      totalDepreciation: round2(totalPurchaseValue - totalCurrentValue),
    },
    distribution: Array.from(distributionMap.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
    recentAssignments,
    upcomingMaintenance,
    expiringWarranties,
  };
}
