"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiBaseUrl } from "@/lib/api/client";

export type ApiHealthStatus = "checking" | "connected" | "partial" | "disconnected";

type HealthPayload = {
  status: string;
  database?: { ok?: boolean };
};

export function useApiHealth() {
  const [status, setStatus] = useState<ApiHealthStatus>("checking");

  const check = useCallback(() => {
    setStatus("checking");
    fetch(`${getApiBaseUrl()}/health`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Health check failed");
        const text = await r.text();
        if (!text.trim()) throw new Error("Empty health response");
        return JSON.parse(text) as HealthPayload;
      })
      .then((data) => {
        setStatus(data.database?.ok === true ? "connected" : "partial");
      })
      .catch(() => setStatus("disconnected"));
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  return { status, recheck: check };
}
