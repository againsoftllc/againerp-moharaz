"use client";

import type { ReactNode } from "react";
import { usePermission, type PermissionAction } from "@/lib/auth/permissions";

type CanProps = {
  module: string;
  action?: PermissionAction;
  children: ReactNode;
  fallback?: ReactNode;
};

/** Conditionally render children when the current user has module×action. */
export function Can({ module, action = "read", children, fallback = null }: CanProps) {
  const allowed = usePermission(module, action);
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
