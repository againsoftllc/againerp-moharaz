"use client";

import { useMemo } from "react";
import { useAdminAuth } from "@/lib/store/admin-auth-store";

const NONE: string[] = [];

export type WarehouseAccess = {
  /** An admin limited this user to specific warehouses (none set = every warehouse). */
  restricted: boolean;
  allowedIds: string[];
  /** Where a new document starts; null when the user is unrestricted and nothing is forced. */
  defaultId: string | null;
  /**
   * The warehouses this user may pick from. `keep` (a record's current warehouse) stays listed even when it is outside
   * the user's access, so opening a colleague's record never blanks its own field.
   */
  pickable: <T extends { id: string }>(warehouses: T[], keep?: string | null) => T[];
};

/** The signed-in user's warehouse access, as set by an admin on the user (Settings → Users). */
export function useWarehouseAccess(): WarehouseAccess {
  const allowedIds = useAdminAuth((s) => s.user?.warehouse_ids) ?? NONE;
  const assignedDefault = useAdminAuth((s) => s.user?.default_warehouse_id) ?? null;

  return useMemo(() => {
    const restricted = allowedIds.length > 0;
    return {
      restricted,
      allowedIds,
      defaultId: restricted ? (assignedDefault && allowedIds.includes(assignedDefault) ? assignedDefault : allowedIds[0]) : null,
      pickable: (warehouses, keep) =>
        restricted ? warehouses.filter((w) => allowedIds.includes(w.id) || w.id === keep) : warehouses,
    };
  }, [allowedIds, assignedDefault]);
}
