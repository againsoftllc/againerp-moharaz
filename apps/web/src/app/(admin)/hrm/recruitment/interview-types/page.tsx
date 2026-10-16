"use client";

import { HrmMasterCrud } from "@/components/hrm/hrm-master-crud";
import { interviewTypesApi } from "@/lib/api/hrm-recruitment-masters";
import { INTERVIEW_TYPES_CONFIG } from "@/lib/mock-data/hrm-recruitment-setup";

export default function Page() {
  return <HrmMasterCrud config={INTERVIEW_TYPES_CONFIG} api={interviewTypesApi} />;
}
