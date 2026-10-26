"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchApprovalSummary, type ApprovalSummary } from "@/lib/api/approvals";
import { APPROVALS_CHANGED_EVENT } from "@/lib/approvals/approval-pending";
import { useAdminAuth } from "@/lib/store/admin-auth-store";

const POLL_MS = 60_000;

/** The numbers behind the Approve menu badge and the Approve screen's group filter. Quietly stays empty when it cannot load. */
export function useApprovalSummary() {
  const token = useAdminAuth((s) => s.token);
  const [summary, setSummary] = useState<ApprovalSummary | null>(null);

  // for callers that just changed the queue and want the numbers now
  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setSummary(await fetchApprovalSummary());
    } catch {
      /* the badge is a convenience; the Approve screen shows the real error */
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = async () => {
      try {
        const next = await fetchApprovalSummary();
        if (!cancelled) setSummary(next);
      } catch {
        /* see above */
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    const onChanged = () => void load();
    window.addEventListener(APPROVALS_CHANGED_EVENT, onChanged);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(APPROVALS_CHANGED_EVENT, onChanged);
    };
  }, [token]);

  return { summary, refresh };
}
