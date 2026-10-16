"use client";

import { HrmMasterCrud } from "@/components/hrm/hrm-master-crud";
import { listHrmBranches } from "@/lib/api/hrm-branches";
import {
  createHrmDepartment,
  deleteHrmDepartment,
  listHrmDepartments,
  updateHrmDepartment,
} from "@/lib/api/hrm-departments";
import type { MasterCrudApi } from "@/lib/mock-data/hrm-recruitment-setup";
import { DEPARTMENTS_CONFIG } from "@/lib/mock-data/hrm-workforce-masters";

const departmentsApi: MasterCrudApi = {
  list: () => listHrmDepartments(),
  create: (payload) => createHrmDepartment(payload),
  update: (id, payload) => updateHrmDepartment(id, payload),
  remove: (id) => deleteHrmDepartment(id),
  optionLoaders: {
    branch_id: async () => {
      const rows = await listHrmBranches();
      return rows.map((r) => ({
        value: String(r.id),
        label: String(r.name ?? r.id),
      }));
    },
  },
};

export default function Page() {
  return <HrmMasterCrud config={DEPARTMENTS_CONFIG} api={departmentsApi} />;
}
