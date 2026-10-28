"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FinanceGridSettingsMenu } from "@/components/finance/finance-grid-settings";
import { VoucherDrawer } from "@/components/finance/voucher-drawer";
import { VoucherTemplateDrawer } from "@/components/finance/voucher-template-drawer";
import type { VoucherTemplateGridHandle } from "@/components/finance/voucher-template-grid";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";
import { useApiHealth } from "@/lib/api/use-api-health";
import { fetchVoucherTemplates, type ApiVoucherTemplate } from "@/lib/api/finance-vouchers";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";

const VoucherTemplateGrid = dynamic(
  () => import("@/components/finance/voucher-template-grid").then((module) => module.VoucherTemplateGrid),
  { ssr: false, loading: () => <ListGridOpenFallback label="Opening voucher templates…" /> },
);

/** Finance → Vouchers → Templates: vouchers kept for re-use; "New voucher from this" is OnerERP's Voucher From Template. */
export default function FinanceVoucherTemplatesPage() {
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const gridRef = useRef<VoucherTemplateGridHandle>(null);
  const [rows, setRows] = useState<ApiVoucherTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCount, setFilterCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openTemplate, setOpenTemplate] = useState<ApiVoucherTemplate | null>(null);
  const [useTemplate, setUseTemplate] = useState<ApiVoucherTemplate | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await fetchVoucherTemplates()).data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load voucher templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startVoucher = (template: ApiVoucherTemplate) => {
    setDrawerOpen(false);
    setUseTemplate(template);
  };

  const headerLeftActions = (
    <ListGridHeaderStart title="Voucher templates">
      {canWrite ? (
        <Button
          size="sm"
          className="rounded-none"
          onClick={() => {
            setOpenTemplate(null);
            setDrawerOpen(true);
          }}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          New
        </Button>
      ) : null}
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
    </ListGridHeaderStart>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <VoucherTemplateGrid
        ref={gridRef}
        rows={rows}
        loading={loading && rows.length === 0}
        headerLeftActions={headerLeftActions}
        onOpen={(row) => {
          setOpenTemplate(row);
          setDrawerOpen(true);
        }}
        onUse={startVoucher}
        onFilterCountChange={setFilterCount}
        footerLeftActions={(visible) => (
          <span className="px-2 text-[10px] text-muted-foreground">{loading ? "Loading…" : `${visible.length} shown`}</span>
        )}
        className="min-h-0 flex-1"
      />
      <VoucherTemplateDrawer
        open={drawerOpen}
        template={openTemplate}
        canWrite={canWrite}
        onOpenChange={setDrawerOpen}
        onChanged={() => void load()}
        onUse={startVoucher}
      />
      <VoucherDrawer
        voucherId={null}
        newType={useTemplate?.voucher_type ?? null}
        startTemplate={useTemplate}
        canWrite={canWrite}
        onOpenChange={(open) => !open && setUseTemplate(null)}
        onChanged={() => undefined}
      />
    </div>
  );
}
