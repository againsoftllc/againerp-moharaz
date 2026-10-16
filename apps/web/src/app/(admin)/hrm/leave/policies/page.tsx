"use client";

import { HrmMasterCrud } from "@/components/hrm/hrm-master-crud";
import { listHrmLeaveTypes } from "@/lib/api/hrm-leave-types";
import {
  apiLeavePolicyToMasterRow,
  createHrmLeavePolicy,
  deleteHrmLeavePolicy,
  listHrmLeavePolicies,
  updateHrmLeavePolicy,
} from "@/lib/api/hrm-leave-policies";
import type { MasterCrudApi } from "@/lib/mock-data/hrm-recruitment-setup";
import { LEAVE_POLICIES_CONFIG } from "@/lib/mock-data/hrm-workforce-masters";

const leavePoliciesApi: MasterCrudApi = {
  list: async () => {
    const [types, policies] = await Promise.all([
      listHrmLeaveTypes(),
      listHrmLeavePolicies(),
    ]);
    const nameById = new Map(types.map((t) => [String(t.id), String(t.name ?? "")]));
    return policies.map((p) =>
      apiLeavePolicyToMasterRow(p, (id) => (id ? nameById.get(id) ?? id : "")),
    );
  },
  create: async (payload) => {
    const row = await createHrmLeavePolicy(payload);
    const types = await listHrmLeaveTypes();
    const nameById = new Map(types.map((t) => [String(t.id), String(t.name ?? "")]));
    return apiLeavePolicyToMasterRow(row, (id) => (id ? nameById.get(id) ?? id : ""));
  },
  update: async (id, payload) => {
    const row = await updateHrmLeavePolicy(id, payload);
    const types = await listHrmLeaveTypes();
    const nameById = new Map(types.map((t) => [String(t.id), String(t.name ?? "")]));
    return apiLeavePolicyToMasterRow(row, (id) => (id ? nameById.get(id) ?? id : ""));
  },
  remove: (id) => deleteHrmLeavePolicy(id),
  optionLoaders: {
    leave_type_id: async () => {
      const rows = await listHrmLeaveTypes({ status: "active" });
      return rows.map((r) => ({
        value: String(r.id),
        label: String(r.name ?? r.id),
      }));
    },
  },
};

export default function Page() {
  return <HrmMasterCrud config={LEAVE_POLICIES_CONFIG} api={leavePoliciesApi} />;
}
