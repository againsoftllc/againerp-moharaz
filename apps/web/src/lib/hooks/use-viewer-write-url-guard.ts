"use client";

import { useEffect } from "react";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";

/** Clears create/edit URL params when the signed-in user is a viewer. */
export function useViewerWriteUrlGuard(
  blocked: boolean,
  onClear: () => void,
): void {
  const canWrite = useAdminCanWrite();

  useEffect(() => {
    if (!canWrite && blocked) {
      onClear();
    }
  }, [canWrite, blocked, onClear]);
}
