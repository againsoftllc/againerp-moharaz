import type { CommerceWorkflowSession } from "@/lib/commerce/commerce-workflow-types";
import { emptyCheckpoint } from "@/lib/commerce/commerce-workflow-types";
import { getEphemeralJson, putEphemeralJson } from "@/lib/commerce/server-ephemeral-store";

function sessionKey(sessionId: string) {
  return `commerce-wf-${sessionId}`;
}

function jobIndexKey(createJobId: string) {
  return `commerce-jobidx-${createJobId}`;
}

export async function saveWorkflowSession(session: CommerceWorkflowSession): Promise<void> {
  session.updatedAt = Date.now();
  const { _audit: _omit, ...persistable } = session;
  void _omit;
  await putEphemeralJson(sessionKey(session.id), persistable);
  await putEphemeralJson(jobIndexKey(session.createJobId), { sessionId: session.id });
}

export async function loadWorkflowSession(sessionId: string): Promise<CommerceWorkflowSession | null> {
  return getEphemeralJson<CommerceWorkflowSession>(sessionKey(sessionId));
}

export async function loadWorkflowSessionByCreateJobId(
  createJobId: string,
): Promise<CommerceWorkflowSession | null> {
  const index = await getEphemeralJson<{ sessionId: string }>(jobIndexKey(createJobId));
  if (!index?.sessionId) return null;
  return loadWorkflowSession(index.sessionId);
}

export function createWorkflowSession(input: {
  createJobId: string;
  previewJobId: string;
  canonical: Record<string, unknown>;
}): CommerceWorkflowSession {
  return {
    id: crypto.randomUUID(),
    createJobId: input.createJobId,
    previewJobId: input.previewJobId,
    canonical: input.canonical,
    status: "running",
    progress: { message: "Starting product create…", percent: 5 },
    checkpoint: emptyCheckpoint(),
    pendingQuestion: null,
    updatedAt: Date.now(),
  };
}
