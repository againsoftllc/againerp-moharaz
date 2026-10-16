"use client";

import { HrmMasterCrud } from "@/components/hrm/hrm-master-crud";
import {
  createHrmDocumentType,
  deleteHrmDocumentType,
  listHrmDocumentTypes,
  updateHrmDocumentType,
} from "@/lib/api/hrm-document-types";
import type { MasterCrudApi } from "@/lib/mock-data/hrm-recruitment-setup";
import { DOCUMENT_TYPES_CONFIG } from "@/lib/mock-data/hrm-workforce-masters";

const documentTypesApi: MasterCrudApi = {
  list: () => listHrmDocumentTypes(),
  create: (payload) => createHrmDocumentType(payload),
  update: (id, payload) => updateHrmDocumentType(id, payload),
  remove: (id) => deleteHrmDocumentType(id),
};

export default function Page() {
  return <HrmMasterCrud config={DOCUMENT_TYPES_CONFIG} api={documentTypesApi} />;
}
