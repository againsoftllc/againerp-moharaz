"use client";

import { HrmMasterCrud } from "@/components/hrm/hrm-master-crud";
import { onboardingChecklistsApi } from "@/lib/api/hrm-recruitment-masters";
import { ONBOARDING_CHECKLISTS_CONFIG } from "@/lib/mock-data/hrm-recruitment-setup";

export default function Page() {
  return <HrmMasterCrud config={ONBOARDING_CHECKLISTS_CONFIG} api={onboardingChecklistsApi} />;
}
