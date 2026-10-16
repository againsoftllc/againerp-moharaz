"use client";

import { HrmMasterCrud } from "@/components/hrm/hrm-master-crud";
import {
  createHrmBranch,
  deleteHrmBranch,
  listHrmBranches,
  updateHrmBranch,
} from "@/lib/api/hrm-branches";
import { BRANCHES_CONFIG } from "@/lib/mock-data/hrm-workforce-masters";
import type { MasterCrudApi } from "@/lib/mock-data/hrm-recruitment-setup";

const branchesApi: MasterCrudApi = {
  list: () => listHrmBranches(),
  create: (payload) => createHrmBranch(payload),
  update: (id, payload) => updateHrmBranch(id, payload),
  remove: (id) => deleteHrmBranch(id),
};

export default function Page() {
  return <HrmMasterCrud config={BRANCHES_CONFIG} api={branchesApi} />;
}
