"use client";

import { HrmMasterCrud } from "@/components/hrm/hrm-master-crud";
import { jobCategoriesApi } from "@/lib/api/hrm-recruitment-masters";
import { JOB_CATEGORIES_CONFIG } from "@/lib/mock-data/hrm-recruitment-setup";

export default function Page() {
  return <HrmMasterCrud config={JOB_CATEGORIES_CONFIG} api={jobCategoriesApi} />;
}
