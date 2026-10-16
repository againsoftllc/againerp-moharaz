import type { AuditEntry, AuditLevel, AuditPhase } from "@/lib/commerce/commerce-audit.types";

export function newAuditEntryId() {
  return `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function createAuditEntry(input: {
  phase: AuditPhase;
  step: string;
  level: AuditLevel;
  message: string;
  detail?: Record<string, unknown>;
  durationMs?: number;
}): AuditEntry {
  return {
    id: newAuditEntryId(),
    ts: Date.now(),
    phase: input.phase,
    step: input.step,
    level: input.level,
    message: input.message,
    detail: input.detail,
    durationMs: input.durationMs,
  };
}

/** Append-only audit journal — safe to reuse across workflow steps. */
export class CommerceAuditJournal {
  private readonly _entries: AuditEntry[] = [];

  get entries(): AuditEntry[] {
    return [...this._entries];
  }

  append(input: Parameters<typeof createAuditEntry>[0]): AuditEntry {
    const entry = createAuditEntry(input);
    this._entries.push(entry);
    return entry;
  }

  info(phase: AuditPhase, step: string, message: string, detail?: Record<string, unknown>) {
    return this.append({ phase, step, level: "info", message, detail });
  }

  action(phase: AuditPhase, step: string, message: string, detail?: Record<string, unknown>) {
    return this.append({ phase, step, level: "action", message, detail });
  }

  decision(phase: AuditPhase, step: string, message: string, detail?: Record<string, unknown>) {
    return this.append({ phase, step, level: "decision", message, detail });
  }

  warning(phase: AuditPhase, step: string, message: string, detail?: Record<string, unknown>) {
    return this.append({ phase, step, level: "warning", message, detail });
  }

  error(phase: AuditPhase, step: string, message: string, detail?: Record<string, unknown>) {
    return this.append({ phase, step, level: "error", message, detail });
  }

  success(phase: AuditPhase, step: string, message: string, detail?: Record<string, unknown>) {
    return this.append({ phase, step, level: "success", message, detail });
  }

  replace(entries: AuditEntry[]) {
    this._entries.length = 0;
    this._entries.push(...entries);
  }
}
