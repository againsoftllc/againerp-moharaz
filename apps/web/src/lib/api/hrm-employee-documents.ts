import { apiFetch } from "@/lib/api/client";
import type { EmployeeDocument } from "@/lib/mock-data/employees";

export type ApiHrmEmployeeDocument = {
  id: string;
  company_id: string;
  employee_id: string | null;
  document_type_id: string | null;
  file_path: string | null;
  file_name: string | null;
  expiry_date: string | null;
  verification_status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiListResponse = {
  data: ApiHrmEmployeeDocument[];
  meta: { count: number };
  errors: string[];
};

type ApiItemResponse = {
  data: ApiHrmEmployeeDocument;
  errors: string[];
};

export type DocumentTypeNameLookup = (id: string | null | undefined) => string;

/** Prefer stored name; avoid junk segments from placeholder URLs (…/480/480). */
export function displayNameFromFilePath(path: string, fallback = "document"): string {
  const raw = path.trim();
  if (!raw) return fallback;
  try {
    const noQuery = raw.split("?")[0] || raw;
    const parts = noQuery.split("/").filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = decodeURIComponent(parts[i] || "");
      if (!part) continue;
      if (/^\d+$/.test(part)) continue; // skip "480", "666"
      if (/^\d+x\d+$/i.test(part)) continue; // skip "480x480"
      if (part.includes(".") || part.length > 3) return part;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function apiEmployeeDocumentToUi(
  row: ApiHrmEmployeeDocument,
  typeName: DocumentTypeNameLookup,
): EmployeeDocument {
  const path = (row.file_path ?? "").trim();
  const storedName = (row.file_name ?? "").trim();
  return {
    id: row.id,
    documentTypeId: row.document_type_id ?? "",
    type: typeName(row.document_type_id),
    fileName: storedName || displayNameFromFilePath(path),
    filePath: path || undefined,
  };
}

export async function listHrmEmployeeDocuments(params?: {
  employee_id?: string;
  document_type_id?: string;
  verification_status?: string;
}): Promise<ApiHrmEmployeeDocument[]> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  if (params?.employee_id) qs.set("employee_id", params.employee_id);
  if (params?.document_type_id) qs.set("document_type_id", params.document_type_id);
  if (params?.verification_status) qs.set("verification_status", params.verification_status);
  const res = await apiFetch<ApiListResponse>(
    `/api/v1/hrm/employee-documents?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

export async function createHrmEmployeeDocument(input: {
  employeeId: string;
  documentTypeId: string;
  filePath: string;
  fileName?: string;
  verificationStatus?: string;
}): Promise<ApiHrmEmployeeDocument> {
  const res = await apiFetch<ApiItemResponse>("/api/v1/hrm/employee-documents", {
    method: "POST",
    body: JSON.stringify({
      company_id: "default",
      employee_id: input.employeeId,
      document_type_id: input.documentTypeId,
      file_path: input.filePath,
      file_name: input.fileName || undefined,
      verification_status: input.verificationStatus ?? "pending",
    }),
  });
  return res.data;
}

export async function updateHrmEmployeeDocument(
  id: string,
  input: {
    documentTypeId?: string;
    filePath?: string;
    fileName?: string;
    verificationStatus?: string;
  },
): Promise<ApiHrmEmployeeDocument> {
  const body: Record<string, string> = {};
  if (input.documentTypeId) body.document_type_id = input.documentTypeId;
  if (input.filePath) body.file_path = input.filePath;
  if (input.fileName) body.file_name = input.fileName;
  if (input.verificationStatus) body.verification_status = input.verificationStatus;
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/employee-documents/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return res.data;
}

export async function deleteHrmEmployeeDocument(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/employee-documents/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}

/** Create / update / delete to match the form list. */
export async function syncEmployeeDocuments(
  employeeId: string,
  nextDocs: EmployeeDocument[],
  previousDocs: EmployeeDocument[],
  typeName: DocumentTypeNameLookup,
  resolveTypeId?: (doc: EmployeeDocument) => string | undefined,
): Promise<EmployeeDocument[]> {
  const prevById = new Map(
    previousDocs.filter((d) => d.id).map((d) => [d.id!, d]),
  );
  const nextIds = new Set(nextDocs.filter((d) => d.id).map((d) => d.id!));

  for (const prev of previousDocs) {
    if (prev.id && !nextIds.has(prev.id)) {
      await deleteHrmEmployeeDocument(prev.id);
    }
  }

  const result: EmployeeDocument[] = [];
  for (const doc of nextDocs) {
    const typeId = (
      resolveTypeId?.(doc) ||
      doc.documentTypeId ||
      ""
    ).trim();
    const filePath = (doc.filePath || doc.fileName || "").trim();
    const fileName = (doc.fileName || displayNameFromFilePath(filePath)).trim();
    if (!typeId || !filePath) {
      throw new Error(
        `Document “${doc.type || "file"}” is missing a valid type or file. Re-select from Media Library.`,
      );
    }
    if (typeId.length < 8 || typeId === "NID" || typeId.includes(" ")) {
      throw new Error(
        `Document type “${typeId}” is invalid. Pick a document type from the list and add again.`,
      );
    }

    if (doc.id && prevById.has(doc.id)) {
      const prev = prevById.get(doc.id)!;
      const prevPath = (prev.filePath || prev.fileName || "").trim();
      if (
        prev.documentTypeId !== typeId ||
        prevPath !== filePath ||
        (prev.fileName || "") !== fileName
      ) {
        const row = await updateHrmEmployeeDocument(doc.id, {
          documentTypeId: typeId,
          filePath,
          fileName,
        });
        result.push(apiEmployeeDocumentToUi(row, typeName));
      } else {
        result.push(doc);
      }
    } else {
      const row = await createHrmEmployeeDocument({
        employeeId,
        documentTypeId: typeId,
        filePath,
        fileName,
      });
      result.push(apiEmployeeDocumentToUi(row, typeName));
    }
  }
  return result;
}
