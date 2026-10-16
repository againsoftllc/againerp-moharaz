"use client";

import { HrmMasterCrud } from "@/components/hrm/hrm-master-crud";
import { customQuestionsApi } from "@/lib/api/hrm-recruitment-masters";
import { CUSTOM_QUESTIONS_CONFIG } from "@/lib/mock-data/hrm-recruitment-setup";

export default function Page() {
  return <HrmMasterCrud config={CUSTOM_QUESTIONS_CONFIG} api={customQuestionsApi} />;
}
