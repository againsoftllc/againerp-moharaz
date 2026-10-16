import type { PendingQuestion } from "@/lib/commerce/commerce-workflow-types";
import { getEphemeralJson, putEphemeralJson } from "@/lib/commerce/server-ephemeral-store";

export type CommerceCreateJobStatus =
  | "pending"
  | "running"
  | "awaiting_user"
  | "completed"
  | "failed"
  | "cancelled";

export type CommerceCreateJob = {
  id: string;
  previewJobId: string;
  sessionId?: string;
  status: CommerceCreateJobStatus;
  progress: { message: string; percent: number };
  pendingQuestion?: PendingQuestion | null;
  productId?: string;
  productName?: string;
  productSku?: string;
  error?: string;
  updatedAt: number;
};

function jobKey(jobId: string) {
  return `commerce-create-${jobId}`;
}

export async function createCommerceCreateJob(previewJobId: string): Promise<CommerceCreateJob> {
  const job: CommerceCreateJob = {
    id: crypto.randomUUID(),
    previewJobId,
    status: "pending",
    progress: { message: "Queued…", percent: 0 },
    updatedAt: Date.now(),
  };
  await putEphemeralJson(jobKey(job.id), job);
  return job;
}

export async function getCommerceCreateJob(jobId: string): Promise<CommerceCreateJob | null> {
  return getEphemeralJson<CommerceCreateJob>(jobKey(jobId));
}

export async function updateCommerceCreateJob(
  jobId: string,
  patch: Partial<Omit<CommerceCreateJob, "id" | "previewJobId">>,
): Promise<CommerceCreateJob | null> {
  const current = await getCommerceCreateJob(jobId);
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: Date.now() };
  await putEphemeralJson(jobKey(jobId), next);
  return next;
}

export async function syncCreateJobFromWorkflow(
  jobId: string,
  workflow: {
    sessionId: string;
    status: CommerceCreateJobStatus;
    progress: { message: string; percent: number };
    pendingQuestion?: PendingQuestion | null;
    productId?: string;
    productName?: string;
    productSku?: string;
    error?: string;
    previewJobId?: string;
  },
): Promise<CommerceCreateJob | null> {
  const current = (await getCommerceCreateJob(jobId)) ?? {
    id: jobId,
    previewJobId: workflow.previewJobId ?? "",
    status: "running" as const,
    progress: { message: "Resuming…", percent: 0 },
    updatedAt: Date.now(),
  };
  const next: CommerceCreateJob = {
    ...current,
    sessionId: workflow.sessionId,
    status: workflow.status,
    progress: workflow.progress,
    pendingQuestion: workflow.pendingQuestion ?? null,
    productId: workflow.productId,
    productName: workflow.productName,
    productSku: workflow.productSku,
    error: workflow.error,
    updatedAt: Date.now(),
  };
  await putEphemeralJson(jobKey(jobId), next);
  return next;
}
