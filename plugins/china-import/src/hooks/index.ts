"use client";

import { useEffect, useState } from "react";
import type { ApiLogEntry } from "../types";
import { clearApiLogs, getApiLogs, subscribeApiLogs } from "../providers/elim";

export function useApiLogs() {
  const [logs, setLogs] = useState<ApiLogEntry[]>(() => getApiLogs());

  useEffect(() => subscribeApiLogs(setLogs), []);

  return {
    logs,
    clear: clearApiLogs,
  };
}
