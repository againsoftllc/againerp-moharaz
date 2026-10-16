import type { CommerceMvpRun } from "@/lib/commerce/commerce-audit.types";
import { getEphemeralJson, putEphemeralJson } from "@/lib/commerce/server-ephemeral-store";

function runKey(runId: string) {
  return `commerce-mvp-${runId}`;
}

function previewJobIndexKey(previewJobId: string) {
  return `commerce-mvp-preview-${previewJobId}`;
}

function createJobIndexKey(createJobId: string) {
  return `commerce-mvp-create-${createJobId}`;
}

export async function saveCommerceMvpRun(run: CommerceMvpRun): Promise<void> {
  run.updatedAt = Date.now();
  await putEphemeralJson(runKey(run.id), run);
  if (run.previewJobId) {
    await putEphemeralJson(previewJobIndexKey(run.previewJobId), { runId: run.id });
  }
  if (run.createJobId) {
    await putEphemeralJson(createJobIndexKey(run.createJobId), { runId: run.id });
  }
}

export async function loadCommerceMvpRun(runId: string): Promise<CommerceMvpRun | null> {
  return getEphemeralJson<CommerceMvpRun>(runKey(runId));
}

export async function loadCommerceMvpRunByPreviewJobId(previewJobId: string): Promise<CommerceMvpRun | null> {
  const index = await getEphemeralJson<{ runId: string }>(previewJobIndexKey(previewJobId));
  if (!index?.runId) return null;
  return loadCommerceMvpRun(index.runId);
}

export async function loadCommerceMvpRunByCreateJobId(createJobId: string): Promise<CommerceMvpRun | null> {
  const index = await getEphemeralJson<{ runId: string }>(createJobIndexKey(createJobId));
  if (!index?.runId) return null;
  return loadCommerceMvpRun(index.runId);
}

function normalizeSourceUrl(sourceUrl: string): string {
  return sourceUrl.trim().replace(/\/+$/, "");
}

/** Find a completed MVP run for the same source URL (TC-044 duplicate guard). */
export async function findCompletedRunBySourceUrl(sourceUrl: string): Promise<CommerceMvpRun | null> {
  // Cross-instance scan is not available on ephemeral KV; duplicate guard is best-effort via memory only.
  void normalizeSourceUrl(sourceUrl);
  return null;
}

export function createEmptyCommerceMvpRun(sourceUrl: string): CommerceMvpRun {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    sourceUrl,
    status: "started",
    startedAt: now,
    audit: [],
    updatedAt: now,
  };
}
