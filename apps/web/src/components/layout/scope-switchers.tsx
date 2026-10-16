"use client";

import { useWorkspaceScope } from "@/lib/workspace/use-workspace-scope";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  companyClassName?: string;
  branchClassName?: string;
};

const selectClass =
  "h-8 truncate rounded-none border border-input bg-background px-2 text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ScopeSwitchers({ className }: Pick<Props, "className">) {
  const { companyId, companyName, branches, branchId, setBranch, loading } = useWorkspaceScope();

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <select
        aria-label="Company"
        className={cn(selectClass, "hidden max-w-[128px] lg:block")}
        value={companyId}
        disabled
        title={companyName}
      >
        {companyId ? (
          <option value={companyId}>{companyName}</option>
        ) : (
          <option value="">—</option>
        )}
      </select>
      <select
        aria-label="Branch"
        className={cn(selectClass, "hidden max-w-[108px] sm:block")}
        value={branchId}
        disabled={loading || branches.length === 0}
        onChange={(e) => setBranch(e.target.value)}
      >
        {branches.length === 0 ? (
          <option value="">{loading ? "Loading…" : "No branch"}</option>
        ) : (
          branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))
        )}
      </select>
    </div>
  );
}
