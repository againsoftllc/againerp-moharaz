"use client";

import { HrmMasterCrud } from "@/components/hrm/hrm-master-crud";
import { interviewRoundsApi } from "@/lib/api/hrm-recruitment-masters";
import { INTERVIEW_ROUNDS_CONFIG } from "@/lib/mock-data/hrm-recruitment-setup";

export default function Page() {
  return <HrmMasterCrud config={INTERVIEW_ROUNDS_CONFIG} api={interviewRoundsApi} />;
}
