"use client";

import type { ApiSession } from "@/lib/api/auth";
import { formatDateTime } from "@/lib/utils";

/** Signed-in devices of a member (Account security drawer, user drawer → Security). */
export function SessionList({ sessions, loading }: { sessions: ApiSession[]; loading?: boolean }) {
  if (loading && sessions.length === 0) return <p className="py-3 text-[13px] text-muted-foreground">Loading…</p>;
  if (sessions.length === 0) return <p className="py-3 text-[13px] text-muted-foreground">Not signed in anywhere.</p>;
  return (
    <ul>
      {sessions.map((s) => (
        <li key={s.id} className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5 last:border-b-0">
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-foreground">
              {s.device}
              {s.current ? <span className="ml-1.5 text-[11px] font-normal text-[#00a09d]">this browser</span> : null}
            </span>
            <span className="block text-[11px] text-muted-foreground">
              Signed in {formatDateTime(s.created_at)}
              {s.ip ? ` · ${s.ip}` : ""}
            </span>
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground">until {formatDateTime(s.expires_at)}</span>
        </li>
      ))}
    </ul>
  );
}
