"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { RefreshCw, Settings2 } from "lucide-react";
import {
  type Company,
  type DashboardStats,
  fetchDashboardStats,
  listCompanies,
} from "@/lib/api/super-admin";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";
import { CompanyDetailPanel } from "@/components/super-admin/company-detail-panel";
import { cn } from "@/lib/utils";

const CompanyGrid = dynamic(
  () => import("@/components/super-admin/company-grid").then((m) => m.CompanyGrid),
  { ssr: false, loading: () => <ListGridOpenFallback /> },
);

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex h-[26px] shrink-0 items-center gap-1 border border-border px-2 text-[11px] text-muted-foreground">
      <span className="font-semibold text-foreground">{value}</span> {label}
    </span>
  );
}

export default function SuperAdminCompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, dashStats] = await Promise.all([listCompanies(), fetchDashboardStats()]);
      setCompanies(rows);
      setStats(dashStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load companies");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const headerLeftActions = (
    <ListGridHeaderStart title="Companies">
      {stats ? (
        <div className="hidden items-center gap-1.5 lg:flex">
          <StatChip label="trialing" value={stats.trialing} />
          <StatChip label="active" value={stats.active} />
          <StatChip label="suspended" value={stats.suspended} />
        </div>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="relative h-[26px] w-[26px] shrink-0 rounded-none"
            aria-label="Settings"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[11rem]">
          <DropdownMenuItem onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("mr-1.5 h-3 w-3", loading && "animate-spin")} />
            Refresh
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ListGridHeaderStart>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      {error ? (
        <p className="shrink-0 border-b border-border px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <CompanyGrid
        companies={companies}
        loading={loading}
        onSelectCompany={setSelectedCompanyId}
        headerLeftActions={headerLeftActions}
        footerLeftActions={
          <span className="px-2 text-[10px] text-muted-foreground">
            {loading ? "Loading…" : `${companies.length} compan${companies.length === 1 ? "y" : "ies"}`}
          </span>
        }
        className="min-h-0 flex-1"
      />
      <CompanyDetailPanel
        companyId={selectedCompanyId}
        onOpenChange={(open) => {
          if (!open) setSelectedCompanyId(null);
        }}
        onChanged={() => void load()}
      />
    </div>
  );
}
