import { apiFetch, getApiBaseUrl } from "@/lib/api/client";
import { getStoredAuthToken } from "@/lib/store/admin-auth-store";

export const COLLAB_ENTITY_ITEM = "item";

export type CollabOwnership = {
  id: string;
  entity_type: string;
  entity_id: string;
  created_by: string | null;
  assigned_to: string | null;
  source: "user" | "ai" | "api" | "import";
  created_at: string;
  updated_at: string;
};

export type CollabActivity = {
  id: string;
  action: string;
  performed_by: string | null;
  performed_by_name: string | null;
  performed_by_type: string;
  old_value: string | null;
  new_value: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type CollabComment = {
  id: string;
  user_id: string | null;
  author_type: string;
  comment: string;
  parent_comment_id: string | null;
  visibility: string;
  mentions: string[];
  attachments: string[];
  created_at: string;
  updated_at: string;
};

export type CollabLabel = {
  id: string;
  label: string;
  label_display: string;
  color: string | null;
  applied_by: string | null;
  created_at: string;
};

export type CollabFile = {
  id: string;
  file_type: string;
  storage_ref: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
};

export type CollabAiNote = {
  id: string;
  note_type: string;
  title: string | null;
  content: Record<string, unknown>;
  confidence: number | null;
  status: string;
  agent_id: string | null;
  created_at: string;
};

export type CollabApproval = {
  id: string;
  status: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  archived_at: string | null;
  updated_at: string;
};

export type CollabWorkspaceSummary = {
  ownership: CollabOwnership | null;
  approval: CollabApproval | null;
  labels: CollabLabel[];
  recent_activity: CollabActivity[];
  comment_count: number;
  file_count: number;
  pending_ai_notes: number;
};

function collabPath(entityType: string, entityId: string, suffix: string) {
  return `/api/v1/collaboration/${entityType}/${entityId}${suffix}`;
}

export async function fetchCollabWorkspace(
  entityType: string,
  entityId: string,
): Promise<CollabWorkspaceSummary> {
  const res = await apiFetch<{ data: CollabWorkspaceSummary }>(
    collabPath(entityType, entityId, "/workspace"),
  );
  return res.data;
}

export async function fetchCollabActivity(
  entityType: string,
  entityId: string,
  params?: { limit?: number; offset?: number },
): Promise<{ data: CollabActivity[]; meta: { count: number } }> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  const query = qs.toString();
  return apiFetch(
    collabPath(entityType, entityId, `/activity${query ? `?${query}` : ""}`),
  );
}

export async function fetchCollabComments(
  entityType: string,
  entityId: string,
): Promise<CollabComment[]> {
  return apiFetch(collabPath(entityType, entityId, "/comments"));
}

export async function createCollabComment(
  entityType: string,
  entityId: string,
  payload: {
    comment: string;
    visibility?: string;
    parent_comment_id?: string;
    mentions?: string[];
  },
): Promise<CollabComment> {
  return apiFetch(collabPath(entityType, entityId, "/comments"), {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchCollabLabels(
  entityType: string,
  entityId: string,
): Promise<CollabLabel[]> {
  return apiFetch(collabPath(entityType, entityId, "/labels"));
}

export async function addCollabLabel(
  entityType: string,
  entityId: string,
  label: string,
): Promise<CollabLabel> {
  return apiFetch(collabPath(entityType, entityId, "/labels"), {
    method: "POST",
    body: JSON.stringify({ label }),
  });
}

export async function removeCollabLabel(
  entityType: string,
  entityId: string,
  label: string,
): Promise<void> {
  await apiFetch(collabPath(entityType, entityId, `/labels/${label}`), {
    method: "DELETE",
  });
}

export async function fetchCollabFiles(
  entityType: string,
  entityId: string,
  fileType?: string,
): Promise<CollabFile[]> {
  const qs = fileType ? `?file_type=${encodeURIComponent(fileType)}` : "";
  return apiFetch(collabPath(entityType, entityId, `/files${qs}`));
}

export async function createCollabFile(
  entityType: string,
  entityId: string,
  payload: {
    filename: string;
    storage_ref: string;
    file_type?: string;
    mime_type?: string;
    size_bytes?: number;
  },
): Promise<CollabFile> {
  return apiFetch(collabPath(entityType, entityId, "/files"), {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteCollabFile(
  entityType: string,
  entityId: string,
  fileId: string,
): Promise<void> {
  await apiFetch(collabPath(entityType, entityId, `/files/${fileId}`), {
    method: "DELETE",
  });
}

/** Uploads raw bytes to the media store, then registers the result against an entity. */
export async function uploadCollabFile(
  entityType: string,
  entityId: string,
  file: File,
  fileType: "image" | "document" | "certificate" | "contract" | "shipping_document" | "other" = "other",
): Promise<CollabFile> {
  const token = getStoredAuthToken();
  const form = new FormData();
  form.append("files", file);
  const res = await fetch(`${getApiBaseUrl()}/api/v1/media/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Upload failed (${res.status})`);
  }
  const body = (await res.json()) as { data: { url: string }[] };
  const url = body.data[0]?.url;
  if (!url) {
    throw new Error("Upload response missing URL");
  }
  return createCollabFile(entityType, entityId, {
    filename: file.name,
    storage_ref: url,
    file_type: fileType,
    mime_type: file.type || "application/octet-stream",
    size_bytes: file.size,
  });
}

export async function fetchCollabAiNotes(
  entityType: string,
  entityId: string,
  status?: string,
): Promise<CollabAiNote[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch(collabPath(entityType, entityId, `/ai-notes${qs}`));
}

export async function updateCollabOwnership(
  entityType: string,
  entityId: string,
  payload: { assigned_to?: string | null; source?: string },
): Promise<CollabOwnership> {
  return apiFetch(collabPath(entityType, entityId, "/ownership"), {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function updateCollabApproval(
  entityType: string,
  entityId: string,
  status: string,
  rejectionReason?: string,
): Promise<CollabApproval> {
  return apiFetch(collabPath(entityType, entityId, "/approval"), {
    method: "PATCH",
    body: JSON.stringify({ status, rejection_reason: rejectionReason }),
  });
}

export const COLLAB_ACTION_LABELS: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  stock_change: "Stock Change",
  price_change: "Price Change",
  published: "Published",
  archived: "Archived",
  comment: "Comment",
  approval: "Approval",
  assignment: "Assignment",
  status_changed: "Status Changed",
  milestone_added: "Milestone Added",
  milestone_completed: "Milestone Completed",
  time_logged: "Time Logged",
  member_added: "Member Added",
  feedback_added: "Feedback Received",
};

export const APPROVAL_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  review: "In Review",
  approved: "Approved",
  published: "Published",
  archived: "Archived",
  rejected: "Rejected",
};

export const LABEL_OPTIONS = [
  { id: "draft", label: "Draft" },
  { id: "seo_pending", label: "SEO Pending" },
  { id: "qc_pending", label: "QC Pending" },
  { id: "ready", label: "Ready" },
  { id: "published", label: "Published" },
] as const;
