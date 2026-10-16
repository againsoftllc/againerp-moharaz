"use client";

import { HrmMasterCrud } from "@/components/hrm/hrm-master-crud";
import {
  createHrmLeaveType,
  deleteHrmLeaveType,
  listHrmLeaveTypes,
  updateHrmLeaveType,
} from "@/lib/api/hrm-leave-types";
import type { MasterCrudApi } from "@/lib/mock-data/hrm-recruitment-setup";
import { LEAVE_TYPES_CONFIG } from "@/lib/mock-data/hrm-workforce-masters";

const leaveTypesApi: MasterCrudApi = {
  list: () => listHrmLeaveTypes(),
  create: (payload) => createHrmLeaveType(payload),
  update: (id, payload) => updateHrmLeaveType(id, payload),
  remove: (id) => deleteHrmLeaveType(id),
};

export default function Page() {
  return <HrmMasterCrud config={LEAVE_TYPES_CONFIG} api={leaveTypesApi} />;
}
