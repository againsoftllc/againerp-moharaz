"use client";

import { HrmMasterCrud } from "@/components/hrm/hrm-master-crud";
import {
  createHrmAwardType,
  deleteHrmAwardType,
  listHrmAwardTypes,
  updateHrmAwardType,
} from "@/lib/api/hrm-award-types";
import type { MasterCrudApi } from "@/lib/mock-data/hrm-recruitment-setup";
import { AWARD_TYPES_CONFIG } from "@/lib/mock-data/hrm-workforce-masters";

const awardTypesApi: MasterCrudApi = {
  list: () => listHrmAwardTypes(),
  create: (payload) => createHrmAwardType(payload),
  update: (id, payload) => updateHrmAwardType(id, payload),
  remove: (id) => deleteHrmAwardType(id),
};

export default function Page() {
  return <HrmMasterCrud config={AWARD_TYPES_CONFIG} api={awardTypesApi} />;
}
