"use client";

import "@/components/providers/ag-grid-provider";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { Settings2 } from "lucide-react";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { Input } from "@/components/ui/input";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { AgainListGrid } from "@/components/shared/again-list-grid";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Company } from "@/lib/api/super-admin";
import { formatDate } from "@/lib/utils";

const STATUS_BADGE: Record<Company["status"], { variant: "success" | "warning" | "muted" | "outline"; label: string }> = {
  active: { variant: "success", label: "Active" },
  trialing: { variant: "warning", label: "Trialing" },
  suspended: { variant: "outline", label: "Suspended" },
  cancelled: { variant: "muted", label: "Cancelled" },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return formatDate(iso);
}

export function CompanyGrid({
  companies,
  loading = false,
  onSelectCompany,
  headerLeftActions,
  footerLeftActions,
  className,
}: {
  companies: Company[];
  loading?: boolean;
  onSelectCompany: (id: string) => void;
  headerLeftActions?: ReactNode;
  footerLeftActions?: ReactNode;
  className?: string;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => `${c.name} ${c.slug}`.toLowerCase().includes(q));
  }, [companies, search]);

  const CompanyRowMenu = useCallback(
    ({ data }: { data: Company }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowActionsTrigger />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => onSelectCompany(data.id)}>
            <Settings2 className="mr-1.5 h-3 w-3" /> Manage
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [onSelectCompany],
  );

  const columnDefs = useMemo<ColDef<Company>[]>(
    () => [
      {
        colId: "actions",
        headerName: "",
        width: 26,
        maxWidth: 26,
        minWidth: 26,
        pinned: "left",
        resizable: false,
        suppressMovable: true,
        suppressHeaderMenuButton: true,
        suppressSizeToFit: true,
        sortable: false,
        headerComponent: GridFullscreenHeader,
        cellRenderer: (p: ICellRendererParams<Company>) =>
          p.data ? <CompanyRowMenu data={p.data} /> : null,
      },
      {
        colId: "name",
        field: "name",
        headerName: "Company",
        flex: 2,
        minWidth: 200,
        tooltipField: "name",
        cellRenderer: (p: ICellRendererParams<Company>) =>
          p.data ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectCompany(p.data!.id);
              }}
              className="cursor-pointer truncate text-left font-semibold text-foreground no-underline hover:text-primary"
              title={p.data.name}
            >
              {p.data.name}
              <span className="ml-1.5 font-mono text-[10px] font-normal text-muted-foreground">
                {p.data.slug}
              </span>
            </button>
          ) : null,
      },
      {
        colId: "status",
        field: "status",
        headerName: "Status",
        width: 120,
        minWidth: 100,
        cellRenderer: (p: ICellRendererParams<Company>) => {
          if (!p.data) return null;
          const s = STATUS_BADGE[p.data.status];
          return <GridChipBadge variant={s.variant}>{s.label}</GridChipBadge>;
        },
      },
      {
        colId: "trial_ends_at",
        field: "trial_ends_at",
        headerName: "Trial ends",
        width: 120,
        minWidth: 100,
        valueFormatter: (p) => fmtDate(p.value as string | null),
      },
      {
        colId: "subscription_ends_at",
        field: "subscription_ends_at",
        headerName: "Subscription ends",
        width: 150,
        minWidth: 120,
        valueFormatter: (p) => fmtDate(p.value as string | null),
      },
      {
        colId: "created_at",
        field: "created_at",
        headerName: "Created",
        width: 120,
        minWidth: 100,
        valueFormatter: (p) => fmtDate(p.value as string | null),
      },
    ],
    [CompanyRowMenu, onSelectCompany],
  );

  return (
    <AgainListGrid<Company>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      headerLeftActions={headerLeftActions}
      filterBar={
        <Input
          placeholder="Search by name or slug…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[240px] shrink-0 rounded-none"
        />
      }
      footerLeftActions={footerLeftActions}
      emptyTitle="No companies found"
      emptyHint="Companies appear here once they register or are created."
    />
  );
}
