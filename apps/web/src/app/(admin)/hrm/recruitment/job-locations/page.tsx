"use client";

import { HrmMasterCrud } from "@/components/hrm/hrm-master-crud";
import { jobLocationsApi } from "@/lib/api/hrm-recruitment-masters";
import { JOB_LOCATIONS_CONFIG } from "@/lib/mock-data/hrm-recruitment-setup";

export default function Page() {
  return <HrmMasterCrud config={JOB_LOCATIONS_CONFIG} api={jobLocationsApi} />;
}
