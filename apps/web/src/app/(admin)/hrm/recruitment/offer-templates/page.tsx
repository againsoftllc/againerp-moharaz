"use client";

import { HrmMasterCrud } from "@/components/hrm/hrm-master-crud";
import { offerTemplatesApi } from "@/lib/api/hrm-recruitment-masters";
import { OFFER_TEMPLATES_CONFIG } from "@/lib/mock-data/hrm-recruitment-setup";

export default function Page() {
  return <HrmMasterCrud config={OFFER_TEMPLATES_CONFIG} api={offerTemplatesApi} />;
}
