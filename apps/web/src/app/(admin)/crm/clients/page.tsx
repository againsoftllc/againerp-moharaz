"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { ColDef } from "ag-grid-community";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/shared/filter-select";
import { AgainListGrid, NUMERIC_CELL, NUMERIC_HEADER } from "@/components/shared/again-list-grid";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { ClientCreateDrawer } from "@/components/crm/client-create-drawer";
import { ClientDetailDrawer } from "@/components/crm/client-detail-drawer";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { CUSTOMER_GROUP_LABELS, type CustomerGroup } from "@/lib/mock-data/customers";
import { fetchClients, fetchClientsCrmSummary, type ApiClient, type ApiClientCrmSummary } from "@/lib/api/crm-clients";
import { cn, formatCurrency } from "@/lib/utils";

type ClientRow = ApiClient & Partial<ApiClientCrmSummary>;

function money(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  return Number.isFinite(n) ? formatCurrency(n) : String(value);
}

const COLUMNS: ColDef<ClientRow>[] = [
  {
    field: "id",
    headerName: "ID",
    width: 100,
    cellClass: "text-muted-foreground",
    valueFormatter: (p) => (p.value ? String(p.value).slice(0, 8) : ""),
    tooltipValueGetter: (p) => p.value ?? "",
  },
  { field: "name", headerName: "Name", flex: 1.2, minWidth: 150, cellClass: "font-medium" },
  {
    colId: "primary_contact_name",
    headerName: "Primary contact",
    flex: 1,
    minWidth: 130,
    valueGetter: (p) => p.data?.primary_contact_name ?? "—",
  },
  {
    colId: "group",
    headerName: "Client groups",
    width: 130,
    cellClass: "capitalize",
    valueGetter: (p) => (p.data?.group ? CUSTOMER_GROUP_LABELS[p.data.group as CustomerGroup] ?? p.data.group : "—"),
  },
  {
    colId: "label_names",
    headerName: "Labels",
    flex: 1,
    minWidth: 130,
    sortable: false,
    valueGetter: (p) => (p.data?.label_names?.length ? p.data.label_names.join(", ") : "—"),
  },
  {
    colId: "project_count",
    headerName: "Projects",
    width: 90,
    headerClass: NUMERIC_HEADER,
    cellClass: NUMERIC_CELL,
    valueGetter: (p) => p.data?.project_count ?? 0,
  },
  {
    colId: "total_invoiced",
    headerName: "Total invoiced",
    width: 130,
    headerClass: NUMERIC_HEADER,
    cellClass: NUMERIC_CELL,
    valueFormatter: (p) => money(p.data?.total_invoiced),
  },
  {
    colId: "payment_received",
    headerName: "Payment Received",
    width: 150,
    headerClass: NUMERIC_HEADER,
    cellClass: NUMERIC_CELL,
    valueFormatter: (p) => money(p.data?.payment_received),
  },
  {
    colId: "due",
    headerName: "Due",
    width: 110,
    headerClass: NUMERIC_HEADER,
    cellClass: cn(NUMERIC_CELL, "text-red-600 dark:text-red-400"),
    valueFormatter: (p) => money(p.data?.due),
  },
];

export default function CrmClientsPage() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [clientsRes, summaryRes] = await Promise.all([
        fetchClients({ search: search || undefined, group }),
        fetchClientsCrmSummary(),
      ]);
      const summaryById = new Map(summaryRes.data.map((s) => [s.customer_id, s]));
      setRows(clientsRes.data.map((c) => ({ ...c, ...summaryById.get(c.id) })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load clients");
    } finally {
      setLoading(false);
    }
  }, [search, group]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "crm-clients-api" });
  }, [error]);

  const headerLeftActions = useMemo(
    () => (
      <ListGridHeaderStart title="Clients">
        {canWrite && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            New
          </Button>
        )}
      </ListGridHeaderStart>
    ),
    [canWrite],
  );

  return (
    <AgainListGrid<ClientRow>
      rowData={rows}
      columnDefs={COLUMNS}
      loading={loading}
      headerLeftActions={headerLeftActions}
      filterBar={
        <>
          <Input
            placeholder="Search clients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 w-[200px] rounded-none text-xs"
          />
          <FilterSelect
            value={group}
            onChange={setGroup}
            width="w-[150px]"
            ariaLabel="Client group filter"
            options={[
              { value: "all", label: "All groups" },
              ...Object.entries(CUSTOMER_GROUP_LABELS).map(([value, label]) => ({ value, label })),
            ]}
          />
        </>
      }
      emptyTitle="No clients match your filters"
      emptyHint="Try adjusting your search or filters."
      onResetFilters={() => {
        setSearch("");
        setGroup("all");
      }}
      onRowClicked={(row) => setDetailId(row.id)}
      footerLeftActions={
        <>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-1.5"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh clients"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
          <span className="text-[11px] text-muted-foreground">{loading ? "…" : `${rows.length} shown`}</span>
        </>
      }
    >
      <ClientCreateDrawer open={createOpen} onOpenChange={setCreateOpen} onCreated={() => void load()} />
      <ClientDetailDrawer
        open={detailId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
        customerId={detailId}
      />
    </AgainListGrid>
  );
}
