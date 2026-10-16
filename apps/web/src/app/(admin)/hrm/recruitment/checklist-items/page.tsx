"use client";

import { HrmMasterCrud } from "@/components/hrm/hrm-master-crud";
import { checklistItemsApi } from "@/lib/api/hrm-recruitment-masters";
import { CHECKLIST_ITEMS_CONFIG } from "@/lib/mock-data/hrm-recruitment-setup";

export default function Page() {
  return <HrmMasterCrud config={CHECKLIST_ITEMS_CONFIG} api={checklistItemsApi} />;
}
