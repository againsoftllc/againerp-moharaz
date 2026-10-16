import { apiFetch } from "@/lib/api/client";
import {
  resolveAckStatus,
  type AcknowledgementStatus,
  type DocumentAcknowledgement,
} from "@/lib/mock-data/hrm-acknowledgements";
import type {
  DocumentCategory,
  DocumentCategoryIcon,
  DocumentCategoryStatus,
} from "@/lib/mock-data/hrm-document-categories";
import type {
  DocumentTemplate,
  DocumentTemplateFormat,
  DocumentTemplateStatus,
} from "@/lib/mock-data/hrm-document-templates";
import type {
  HrDocument,
  HrDocumentStatus,
} from "@/lib/mock-data/hrm-hr-documents";

type ApiListResponse<T> = {
  data: T[];
  meta?: { count?: number };
  errors?: string[];
};

type ApiItemResponse<T> = {
  data: T;
  errors?: string[];
};

export type ApiDocumentCategory = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  sort_order: number;
  is_mandatory: boolean;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiHrDocument = {
  id: string;
  company_id: string;
  title: string | null;
  description: string | null;
  category_id: string | null;
  file_name: string | null;
  file_path: string | null;
  file_type: string | null;
  file_size: number;
  version: string;
  status: string;
  effective_date: string | null;
  expiry_date: string | null;
  requires_acknowledgment: boolean;
  download_count: number;
  uploaded_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiDocumentTemplate = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  template_content: string | null;
  placeholders: string | null;
  default_values: string | null;
  is_default: boolean;
  file_format: string;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiDocumentAcknowledgment = {
  id: string;
  company_id: string;
  document_id: string | null;
  user_id: string | null;
  status: string;
  acknowledged_at: string | null;
  due_date: string | null;
  acknowledgment_note: string | null;
  ip_address: string | null;
  user_agent: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentLookups = {
  categoryName: (id: string | null | undefined) => string;
  categoryColor: (id: string | null | undefined) => string;
  employeeNameByUserId: (userId: string | null | undefined) => string;
  documentTitle: (id: string | null | undefined) => string;
  assignedByName: (userId: string | null | undefined) => string;
};

const ICONS = new Set([
  "folder",
  "shield",
  "user",
  "file",
  "briefcase",
  "scale",
  "wallet",
  "book",
]);

function blankToNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function ymd(value: string | null | undefined): string {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parsePlaceholders(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((x) => String(x).trim()).filter(Boolean);
    }
  } catch {
    /* comma / newline separated */
  }
  return raw
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function normalizeIcon(icon: string): DocumentCategoryIcon {
  return (ICONS.has(icon) ? icon : "folder") as DocumentCategoryIcon;
}

export function apiCategoryToView(
  row: ApiDocumentCategory,
  documentsCount = 0,
): DocumentCategory {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    color: row.color || "#3b82f6",
    icon: normalizeIcon(row.icon),
    isMandatory: row.is_mandatory,
    documentsCount,
    status: (row.status === "inactive" ? "inactive" : "active") as DocumentCategoryStatus,
    locked: false,
  };
}

export function apiHrDocumentToView(
  row: ApiHrDocument,
  lookups: Pick<DocumentLookups, "categoryName" | "categoryColor">,
  uploadedByName = "—",
): HrDocument {
  const categoryName = lookups.categoryName(row.category_id);
  return {
    id: row.id,
    title: row.title ?? "",
    description: row.description ?? "",
    category: categoryName as HrDocument["category"],
    version: row.version || "1.0",
    lastUpdate: ymd(row.updated_at) || ymd(row.created_at),
    status: (row.status as HrDocumentStatus) || "draft",
    requiresAcknowledgment: row.requires_acknowledgment,
    uploadedBy: uploadedByName,
    downloadCount: row.download_count ?? 0,
    fileName: row.file_name ?? "",
    fileType: row.file_type ?? "",
    fileSize: formatFileSize(row.file_size ?? 0),
    effectiveDate: ymd(row.effective_date),
    expiryDate: ymd(row.expiry_date),
    accentColor: lookups.categoryColor(row.category_id),
  };
}

export function apiTemplateToView(
  row: ApiDocumentTemplate,
  lookups: Pick<DocumentLookups, "categoryName" | "categoryColor">,
): DocumentTemplate {
  const categoryName = lookups.categoryName(row.category_id);
  const format = String(row.file_format || "PDF").toUpperCase();
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    category: categoryName as DocumentTemplate["category"],
    placeholders: parsePlaceholders(row.placeholders),
    content: row.template_content ?? "",
    fileFormat: (["PDF", "DOC", "DOCX"].includes(format)
      ? format
      : "PDF") as DocumentTemplateFormat,
    isDefault: row.is_default,
    status: (row.status === "inactive" ? "inactive" : "active") as DocumentTemplateStatus,
    createdAt: ymd(row.created_at),
    accentColor: lookups.categoryColor(row.category_id),
  };
}

export function apiAckToView(
  row: ApiDocumentAcknowledgment,
  lookups: DocumentLookups,
): DocumentAcknowledgement {
  const base: DocumentAcknowledgement = {
    id: row.id,
    employeeName: lookups.employeeNameByUserId(row.user_id),
    documentTitle: lookups.documentTitle(row.document_id),
    dueDate: ymd(row.due_date),
    acknowledgedAt: row.acknowledged_at
      ? String(row.acknowledged_at).slice(0, 19).replace("T", " ")
      : "",
    assignedBy: lookups.assignedByName(row.assigned_by),
    assignedAt: row.assigned_at
      ? ymd(row.assigned_at)
      : ymd(row.created_at),
    note: row.acknowledgment_note ?? "",
    status: (row.status as AcknowledgementStatus) || "pending",
  };
  return { ...base, status: resolveAckStatus(base) };
}

/** Extra fields kept on view rows for edit forms (not in mock types). */
export type HrDocumentApiExtras = {
  categoryId: string;
  fileSizeBytes: number;
};

export type DocumentTemplateApiExtras = {
  categoryId: string;
};

export type DocumentAckApiExtras = {
  documentId: string;
  userId: string;
};

// --- categories ---

export async function listHrmDocumentCategories(params?: {
  status?: string;
  q?: string;
}): Promise<ApiDocumentCategory[]> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  if (params?.status) qs.set("status", params.status);
  if (params?.q) qs.set("q", params.q);
  const res = await apiFetch<ApiListResponse<ApiDocumentCategory>>(
    `/api/v1/hrm/document-categories?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

export async function createHrmDocumentCategory(payload: {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  isMandatory?: boolean;
  status?: string;
  sortOrder?: number;
}): Promise<ApiDocumentCategory> {
  const res = await apiFetch<ApiItemResponse<ApiDocumentCategory>>(
    "/api/v1/hrm/document-categories",
    {
      method: "POST",
      body: JSON.stringify({
        company_id: "default",
        name: payload.name.trim(),
        description: blankToNull(payload.description),
        color: payload.color?.trim() || "#3b82f6",
        icon: payload.icon?.trim() || "folder",
        is_mandatory: Boolean(payload.isMandatory),
        status: payload.status || "active",
        sort_order: payload.sortOrder ?? 0,
      }),
    },
  );
  return res.data;
}

export async function updateHrmDocumentCategory(
  id: string,
  payload: {
    name?: string;
    description?: string | null;
    color?: string;
    icon?: string;
    isMandatory?: boolean;
    status?: string;
    sortOrder?: number;
  },
): Promise<ApiDocumentCategory> {
  const body: Record<string, unknown> = {};
  if (payload.name !== undefined) body.name = payload.name.trim();
  if (payload.description !== undefined)
    body.description = blankToNull(payload.description);
  if (payload.color !== undefined) body.color = payload.color.trim();
  if (payload.icon !== undefined) body.icon = payload.icon.trim();
  if (payload.isMandatory !== undefined) body.is_mandatory = payload.isMandatory;
  if (payload.status !== undefined) body.status = payload.status;
  if (payload.sortOrder !== undefined) body.sort_order = payload.sortOrder;
  const res = await apiFetch<ApiItemResponse<ApiDocumentCategory>>(
    `/api/v1/hrm/document-categories/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return res.data;
}

export async function deleteHrmDocumentCategory(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/document-categories/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}

// --- HR documents ---

export async function listHrmHrDocuments(params?: {
  category_id?: string;
  status?: string;
  q?: string;
}): Promise<ApiHrDocument[]> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  if (params?.category_id) qs.set("category_id", params.category_id);
  if (params?.status) qs.set("status", params.status);
  if (params?.q) qs.set("q", params.q);
  const res = await apiFetch<ApiListResponse<ApiHrDocument>>(
    `/api/v1/hrm/hr-documents?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

export async function createHrmHrDocument(payload: {
  title: string;
  description?: string;
  categoryId?: string | null;
  fileName?: string;
  filePath?: string;
  fileType?: string;
  fileSize?: number;
  version?: string;
  effectiveDate?: string;
  expiryDate?: string;
  requiresAcknowledgment?: boolean;
}): Promise<ApiHrDocument> {
  const res = await apiFetch<ApiItemResponse<ApiHrDocument>>(
    "/api/v1/hrm/hr-documents",
    {
      method: "POST",
      body: JSON.stringify({
        company_id: "default",
        title: payload.title.trim(),
        description: blankToNull(payload.description),
        category_id: blankToNull(payload.categoryId),
        file_name: blankToNull(payload.fileName),
        file_path: blankToNull(payload.filePath),
        file_type: blankToNull(payload.fileType),
        file_size: payload.fileSize ?? 0,
        version: payload.version?.trim() || "1.0",
        effective_date: blankToNull(payload.effectiveDate),
        expiry_date: blankToNull(payload.expiryDate),
        requires_acknowledgment: Boolean(payload.requiresAcknowledgment),
      }),
    },
  );
  return res.data;
}

export async function updateHrmHrDocument(
  id: string,
  payload: {
    title?: string;
    description?: string | null;
    categoryId?: string | null;
    fileName?: string | null;
    filePath?: string | null;
    fileType?: string | null;
    fileSize?: number;
    version?: string;
    status?: string;
    effectiveDate?: string | null;
    expiryDate?: string | null;
    requiresAcknowledgment?: boolean;
  },
): Promise<ApiHrDocument> {
  const body: Record<string, unknown> = {};
  if (payload.title !== undefined) body.title = payload.title.trim();
  if (payload.description !== undefined)
    body.description = blankToNull(payload.description);
  if (payload.categoryId !== undefined)
    body.category_id = blankToNull(payload.categoryId);
  if (payload.fileName !== undefined) body.file_name = blankToNull(payload.fileName);
  if (payload.filePath !== undefined) body.file_path = blankToNull(payload.filePath);
  if (payload.fileType !== undefined) body.file_type = blankToNull(payload.fileType);
  if (payload.fileSize !== undefined) body.file_size = payload.fileSize;
  if (payload.version !== undefined) body.version = payload.version.trim();
  if (payload.status !== undefined) body.status = payload.status;
  if (payload.effectiveDate !== undefined)
    body.effective_date = blankToNull(payload.effectiveDate);
  if (payload.expiryDate !== undefined)
    body.expiry_date = blankToNull(payload.expiryDate);
  if (payload.requiresAcknowledgment !== undefined)
    body.requires_acknowledgment = payload.requiresAcknowledgment;
  const res = await apiFetch<ApiItemResponse<ApiHrDocument>>(
    `/api/v1/hrm/hr-documents/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return res.data;
}

export async function publishHrmHrDocument(id: string): Promise<ApiHrDocument> {
  const res = await apiFetch<ApiItemResponse<ApiHrDocument>>(
    `/api/v1/hrm/hr-documents/${encodeURIComponent(id)}/publish?company_id=default`,
    { method: "POST" },
  );
  return res.data;
}

export async function archiveHrmHrDocument(id: string): Promise<ApiHrDocument> {
  const res = await apiFetch<ApiItemResponse<ApiHrDocument>>(
    `/api/v1/hrm/hr-documents/${encodeURIComponent(id)}/archive?company_id=default`,
    { method: "POST" },
  );
  return res.data;
}

export async function deleteHrmHrDocument(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/hr-documents/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}

// --- templates ---

export async function listHrmDocumentTemplates(params?: {
  category_id?: string;
  status?: string;
  q?: string;
}): Promise<ApiDocumentTemplate[]> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  if (params?.category_id) qs.set("category_id", params.category_id);
  if (params?.status) qs.set("status", params.status);
  if (params?.q) qs.set("q", params.q);
  const res = await apiFetch<ApiListResponse<ApiDocumentTemplate>>(
    `/api/v1/hrm/document-templates?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

export async function createHrmDocumentTemplate(payload: {
  name: string;
  description?: string;
  categoryId?: string | null;
  content?: string;
  placeholders?: string[];
  isDefault?: boolean;
  fileFormat?: string;
  status?: string;
}): Promise<ApiDocumentTemplate> {
  const res = await apiFetch<ApiItemResponse<ApiDocumentTemplate>>(
    "/api/v1/hrm/document-templates",
    {
      method: "POST",
      body: JSON.stringify({
        company_id: "default",
        name: payload.name.trim(),
        description: blankToNull(payload.description),
        category_id: blankToNull(payload.categoryId),
        template_content: blankToNull(payload.content),
        placeholders: payload.placeholders?.length
          ? JSON.stringify(payload.placeholders)
          : null,
        is_default: Boolean(payload.isDefault),
        file_format: payload.fileFormat?.trim() || "PDF",
        status: payload.status || "active",
      }),
    },
  );
  return res.data;
}

export async function updateHrmDocumentTemplate(
  id: string,
  payload: {
    name?: string;
    description?: string | null;
    categoryId?: string | null;
    content?: string | null;
    placeholders?: string[];
    isDefault?: boolean;
    fileFormat?: string;
    status?: string;
  },
): Promise<ApiDocumentTemplate> {
  const body: Record<string, unknown> = {};
  if (payload.name !== undefined) body.name = payload.name.trim();
  if (payload.description !== undefined)
    body.description = blankToNull(payload.description);
  if (payload.categoryId !== undefined)
    body.category_id = blankToNull(payload.categoryId);
  if (payload.content !== undefined) body.template_content = blankToNull(payload.content);
  if (payload.placeholders !== undefined)
    body.placeholders = payload.placeholders.length
      ? JSON.stringify(payload.placeholders)
      : null;
  if (payload.isDefault !== undefined) body.is_default = payload.isDefault;
  if (payload.fileFormat !== undefined) body.file_format = payload.fileFormat.trim();
  if (payload.status !== undefined) body.status = payload.status;
  const res = await apiFetch<ApiItemResponse<ApiDocumentTemplate>>(
    `/api/v1/hrm/document-templates/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return res.data;
}

export async function deleteHrmDocumentTemplate(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/document-templates/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}

// --- acknowledgments ---

export async function listHrmDocumentAcknowledgments(params?: {
  document_id?: string;
  user_id?: string;
  status?: string;
}): Promise<ApiDocumentAcknowledgment[]> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  if (params?.document_id) qs.set("document_id", params.document_id);
  if (params?.user_id) qs.set("user_id", params.user_id);
  if (params?.status) qs.set("status", params.status);
  const res = await apiFetch<ApiListResponse<ApiDocumentAcknowledgment>>(
    `/api/v1/hrm/document-acknowledgments?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

export async function createHrmDocumentAcknowledgment(payload: {
  documentId: string;
  userId: string;
  dueDate?: string;
  note?: string;
}): Promise<ApiDocumentAcknowledgment> {
  const res = await apiFetch<ApiItemResponse<ApiDocumentAcknowledgment>>(
    "/api/v1/hrm/document-acknowledgments",
    {
      method: "POST",
      body: JSON.stringify({
        company_id: "default",
        document_id: payload.documentId,
        user_id: payload.userId,
        due_date: blankToNull(payload.dueDate),
        acknowledgment_note: blankToNull(payload.note),
      }),
    },
  );
  return res.data;
}

export async function updateHrmDocumentAcknowledgment(
  id: string,
  payload: {
    dueDate?: string | null;
    note?: string | null;
    status?: string;
  },
): Promise<ApiDocumentAcknowledgment> {
  const body: Record<string, unknown> = {};
  if (payload.dueDate !== undefined) body.due_date = blankToNull(payload.dueDate);
  if (payload.note !== undefined) body.acknowledgment_note = blankToNull(payload.note);
  if (payload.status !== undefined) body.status = payload.status;
  const res = await apiFetch<ApiItemResponse<ApiDocumentAcknowledgment>>(
    `/api/v1/hrm/document-acknowledgments/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return res.data;
}

export async function acknowledgeHrmDocument(
  id: string,
  note?: string,
): Promise<ApiDocumentAcknowledgment> {
  const res = await apiFetch<ApiItemResponse<ApiDocumentAcknowledgment>>(
    `/api/v1/hrm/document-acknowledgments/${encodeURIComponent(id)}/acknowledge?company_id=default`,
    {
      method: "POST",
      body: JSON.stringify({
        acknowledgment_note: blankToNull(note),
      }),
    },
  );
  return res.data;
}

export async function deleteHrmDocumentAcknowledgment(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/document-acknowledgments/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}

export function buildDocumentLookups(opts: {
  categories: ApiDocumentCategory[];
  documents?: ApiHrDocument[];
  employees?: { name: string; auth_user_id: string | null }[];
}): DocumentLookups {
  const catById = new Map(opts.categories.map((c) => [c.id, c]));
  const docById = new Map((opts.documents ?? []).map((d) => [d.id, d]));
  const empByUser = new Map(
    (opts.employees ?? [])
      .filter((e) => e.auth_user_id)
      .map((e) => [e.auth_user_id as string, e.name]),
  );
  return {
    categoryName: (id) => (id ? catById.get(id)?.name ?? "—" : "—"),
    categoryColor: (id) => (id ? catById.get(id)?.color ?? "#3b82f6" : "#3b82f6"),
    employeeNameByUserId: (userId) =>
      userId ? empByUser.get(userId) ?? "—" : "—",
    documentTitle: (id) => (id ? docById.get(id)?.title ?? "—" : "—"),
    assignedByName: (userId) =>
      userId ? empByUser.get(userId) ?? "Admin" : "Admin",
  };
}
