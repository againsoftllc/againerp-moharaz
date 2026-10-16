"use client";

import { HrmMasterCrud } from "@/components/hrm/hrm-master-crud";
import { listHrmBranches } from "@/lib/api/hrm-branches";
import {
  apiHolidayToMasterRow,
  createHrmHoliday,
  deleteHrmHoliday,
  listHrmHolidays,
  updateHrmHoliday,
} from "@/lib/api/hrm-holidays";
import type { MasterCrudApi } from "@/lib/mock-data/hrm-recruitment-setup";
import { HOLIDAYS_CONFIG } from "@/lib/mock-data/hrm-workforce-masters";

const holidaysApi: MasterCrudApi = {
  list: async () => {
    const [branches, holidays] = await Promise.all([
      listHrmBranches(),
      listHrmHolidays(),
    ]);
    const nameById = new Map(branches.map((b) => [String(b.id), String(b.name ?? "")]));
    return holidays.map((h) =>
      apiHolidayToMasterRow(h, (id) => (id ? nameById.get(id) ?? id : "")),
    );
  },
  create: async (payload) => {
    const row = await createHrmHoliday(payload);
    const branches = await listHrmBranches();
    const nameById = new Map(branches.map((b) => [String(b.id), String(b.name ?? "")]));
    return apiHolidayToMasterRow(row, (id) => (id ? nameById.get(id) ?? id : ""));
  },
  update: async (id, payload) => {
    const row = await updateHrmHoliday(id, payload);
    const branches = await listHrmBranches();
    const nameById = new Map(branches.map((b) => [String(b.id), String(b.name ?? "")]));
    return apiHolidayToMasterRow(row, (id) => (id ? nameById.get(id) ?? id : ""));
  },
  remove: (id) => deleteHrmHoliday(id),
  optionLoaders: {
    branch_id: async () => {
      const rows = await listHrmBranches();
      return [
        { value: "", label: "All branches" },
        ...rows.map((r) => ({
          value: String(r.id),
          label: String(r.name ?? r.id),
        })),
      ];
    },
  },
};

export default function Page() {
  return <HrmMasterCrud config={HOLIDAYS_CONFIG} api={holidaysApi} />;
}
