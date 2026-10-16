"use client";

import { HrmMasterCrud } from "@/components/hrm/hrm-master-crud";
import {
  createHrmAnnouncement,
  deleteHrmAnnouncement,
  listHrmAnnouncements,
  updateHrmAnnouncement,
} from "@/lib/api/hrm-announcements";
import type {
  MasterCrudApi,
  MasterEntityConfig,
} from "@/lib/mock-data/hrm-recruitment-setup";
import { ANNOUNCEMENTS_CONFIG } from "@/lib/mock-data/hrm-workforce-masters";

const announcementsApi: MasterCrudApi = {
  list: () => listHrmAnnouncements(),
  create: (payload) => createHrmAnnouncement(payload),
  update: (id, payload) => updateHrmAnnouncement(id, payload),
  remove: (id) => deleteHrmAnnouncement(id),
};

const announcementsApiConfig: MasterEntityConfig = {
  ...ANNOUNCEMENTS_CONFIG,
  fields: [
    { key: "name", label: "Title", type: "text", required: true },
    ...ANNOUNCEMENTS_CONFIG.fields.filter(
      (field) =>
        field.key !== "name" &&
        field.key !== "branch" &&
        field.key !== "department" &&
        field.key !== "status",
    ),
  ],
};

export default function Page() {
  return <HrmMasterCrud config={announcementsApiConfig} api={announcementsApi} />;
}
