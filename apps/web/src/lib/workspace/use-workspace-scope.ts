"use client";

import { useEffect, useState } from "react";
import { listHrmBranchRecords, type ApiHrmBranch } from "@/lib/api/hrm-branches";
import { userCompanyLabel } from "@/lib/auth/user-display";
import { useAdminAuth } from "@/lib/store/admin-auth-store";
import { useAppStore } from "@/lib/store/app-store";

let branchCache: { at: number; rows: ApiHrmBranch[] } | null = null;

export function invalidateWorkspaceBranchCache() {
  branchCache = null;
}

async function loadActiveBranches(): Promise<ApiHrmBranch[]> {
  if (branchCache && Date.now() - branchCache.at < 30_000) {
    return branchCache.rows;
  }
  const rows = await listHrmBranchRecords({ status: "active" });
  const active = rows.filter((row) => row.status !== "inactive");
  branchCache = { at: Date.now(), rows: active };
  return active;
}

/** Signed-in tenant company + workspace branches (not mock UrbanWear companies). */
export function useWorkspaceScope() {
  const user = useAdminAuth((s) => s.user);
  const branchId = useAppStore((s) => s.branchId);
  const setBranch = useAppStore((s) => s.setBranch);
  const setCompany = useAppStore((s) => s.setCompany);
  const [branches, setBranches] = useState<ApiHrmBranch[]>(branchCache?.rows ?? []);
  const [loading, setLoading] = useState(!branchCache);

  const companyId = user?.company_id ?? "";
  const companyName = userCompanyLabel(user);

  useEffect(() => {
    if (companyId) setCompany(companyId);
  }, [companyId, setCompany]);

  useEffect(() => {
    let cancelled = false;
    setLoading(!branchCache);
    void loadActiveBranches()
      .then((rows) => {
        if (cancelled) return;
        setBranches(rows);
        const current = useAppStore.getState().branchId;
        if (rows.length > 0 && !rows.some((row) => row.id === current)) {
          setBranch(rows[0]!.id);
        }
      })
      .catch(() => {
        if (!cancelled) setBranches([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setBranch]);

  const branch = branches.find((row) => row.id === branchId) ?? null;

  return {
    companyId,
    companyName,
    branches,
    branchId: branch?.id ?? "",
    branchName: branch?.name ?? "",
    setBranch,
    loading,
  };
}
