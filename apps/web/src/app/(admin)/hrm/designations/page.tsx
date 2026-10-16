"use client";

import { HrmMasterCrud } from "@/components/hrm/hrm-master-crud";
import { listHrmDepartments } from "@/lib/api/hrm-departments";
import {
  createHrmDesignation,
  deleteHrmDesignation,
  listHrmDesignations,
  updateHrmDesignation,
} from "@/lib/api/hrm-designations";
import type { MasterCrudApi } from "@/lib/mock-data/hrm-recruitment-setup";
import { DESIGNATIONS_CONFIG } from "@/lib/mock-data/hrm-workforce-masters";

const designationsApi: MasterCrudApi = {
  list: () => listHrmDesignations(),
  create: (payload) => createHrmDesignation(payload),
  update: (id, payload) => updateHrmDesignation(id, payload),
  remove: (id) => deleteHrmDesignation(id),
  optionLoaders: {
    department_id: async () => {
      const rows = await listHrmDepartments();
      return rows.map((r) => ({
        value: String(r.id),
        label: String(r.name ?? r.id),
      }));
    },
  },
};

export default function Page() {
  return <HrmMasterCrud config={DESIGNATIONS_CONFIG} api={designationsApi} />;
}
