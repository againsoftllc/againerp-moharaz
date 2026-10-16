"use client";

import { HrmMasterCrud } from "@/components/hrm/hrm-master-crud";
import { jobTypesApi } from "@/lib/api/hrm-recruitment-masters";
import { JOB_TYPES_CONFIG } from "@/lib/mock-data/hrm-recruitment-setup";

export default function Page() {
  return <HrmMasterCrud config={JOB_TYPES_CONFIG} api={jobTypesApi} />;
}
