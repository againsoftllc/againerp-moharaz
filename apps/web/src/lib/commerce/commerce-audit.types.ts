export type AuditPhase = "preview" | "erp";

export type AuditLevel = "info" | "decision" | "action" | "warning" | "error" | "success";

export type AuditEntry = {
  id: string;
  ts: number;
  phase: AuditPhase;
  step: string;
  level: AuditLevel;
  message: string;
  detail?: Record<string, unknown>;
  durationMs?: number;
};

export type CommerceRunStatus =
  | "started"
  | "previewing"
  | "preview_ready"
  | "awaiting_approval"
  | "creating"
  | "awaiting_user"
  | "completed"
  | "failed"
  | "cancelled";

export type CommerceRunError = {
  code?: string;
  message: string;
  step?: string;
  phase?: AuditPhase;
};

export type CommerceMvpRun = {
  id: string;
  sourceUrl: string;
  status: CommerceRunStatus;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  previewJobId?: string;
  createJobId?: string;
  sessionId?: string;
  audit: AuditEntry[];
  canonical?: Record<string, unknown>;
  productId?: string;
  productSlug?: string;
  productName?: string;
  productSku?: string;
  productPageUrl?: string;
  error?: CommerceRunError;
  updatedAt: number;
};
