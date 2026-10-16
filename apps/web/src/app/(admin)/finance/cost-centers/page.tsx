"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FinanceGridSettingsMenu } from "@/components/finance/finance-grid-settings";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useApiHealth } from "@/lib/api/use-api-health";
import {
  createCostCenter,
  fetchCostCenters,
  updateCostCenter,
  type ApiCostCenter,
} from "@/lib/api/finance-allocation";
import type { CostCenterGridHandle } from "@/components/finance/cost-center-grid";

const CostCenterGrid = dynamic(
  () => import("@/components/finance/cost-center-grid").then((module) => module.CostCenterGrid),
  {
    ssr: false,
    loading: () => <ListGridOpenFallback label="Opening cost centers…" />,
  },
);

export default function FinanceCostCentersPage() {
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const gridRef = useRef<CostCenterGridHandle>(null);
  const [rows, setRows] = useState<ApiCostCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCount, setFilterCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ApiCostCenter | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCostCenters(true);
      setRows(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cost centers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "finance-cost-centers-api" });
  }, [error]);

  function openCreate() {
    setEditing(null);
    setCode("");
    setName("");
    setOpen(true);
  }

  function openEdit(row: ApiCostCenter) {
    setEditing(row);
    setCode(row.code);
    setName(row.name);
    setOpen(true);
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await updateCostCenter(editing.id, { name: name.trim() });
        toast.success("Cost center updated");
      } else {
        if (!code.trim()) return;
        await createCostCenter({ code: code.trim(), name: name.trim() });
        toast.success("Cost center created");
      }
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: ApiCostCenter) {
    try {
      await updateCostCenter(row.id, { is_active: !row.is_active });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
  }

  const headerLeftActions = (
    <ListGridHeaderStart title="Cost centers">
      <FinanceGridSettingsMenu
        apiHealth={apiHealth}
        loading={loading}
        filterCount={filterCount}
        onRefresh={() => {
          void load();
          apiHealth.recheck();
        }}
        onFilters={() => gridRef.current?.openFilters()}
        onColumns={() => gridRef.current?.openColumns()}
        onExport={() => gridRef.current?.exportCsv()}
        onResetFilters={() => gridRef.current?.resetFilters()}
      />
      {canWrite ? (
        <Button size="sm" className="h-[26px] rounded-none" onClick={openCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New
        </Button>
      ) : null}
    </ListGridHeaderStart>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <CostCenterGrid
        ref={gridRef}
        rows={rows}
        loading={loading && rows.length === 0}
        canWrite={canWrite}
        onFilterCountChange={setFilterCount}
        headerLeftActions={headerLeftActions}
        footerLeftActions={
          <span className="px-2 text-[10px] text-muted-foreground">
            {loading ? "Loading…" : `${rows.length} concerns`}
          </span>
        }
        onEdit={openEdit}
        onToggleActive={(row) => void toggleActive(row)}
      />

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          title={editing ? "Edit cost center" : "New cost center"}
          resizable
          closeButton="inside"
          className="min-w-[160px] w-[400px] max-w-[720px] rounded-none"
        >
          <h2 className="pr-8 text-base font-semibold">{editing ? "Edit cost center" : "New cost center"}</h2>
          <div className="mt-4 space-y-3.5">
            <div className="flex flex-col gap-1.5">
              <Label>Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="AS" disabled={Boolean(editing) || saving} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="AgainSoft" disabled={saving} />
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2 border-t border-input pt-4">
            <Button variant="outline" size="sm" className="rounded-none" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="rounded-none"
              onClick={() => void handleSave()}
              disabled={saving || !name.trim() || (!editing && !code.trim())}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
