"use client";

import { HrmMasterCrud } from "@/components/hrm/hrm-master-crud";
import { candidateSourcesApi } from "@/lib/api/hrm-recruitment-masters";
import { CANDIDATE_SOURCES_CONFIG } from "@/lib/mock-data/hrm-recruitment-setup";

export default function Page() {
  return <HrmMasterCrud config={CANDIDATE_SOURCES_CONFIG} api={candidateSourcesApi} />;
}
