"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FinanceGridSettingsMenu } from "@/components/finance/finance-grid-settings";
import { VoucherDrawer } from "@/components/finance/voucher-drawer";
import type { VoucherGridHandle } from "@/components/finance/voucher-grid";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";
import { useApiHealth } from "@/lib/api/use-api-health";
import {
  VOUCHER_TYPE_LABEL,
  fetchVoucherTemplates,
  fetchVouchers,
  type ApiVoucher,
  type ApiVoucherTemplate,
  type VoucherType,
} from "@/lib/api/finance-vouchers";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { formatCurrency } from "@/lib/utils";

const VoucherGrid = dynamic(() => import("@/components/finance/voucher-grid").then((module) => module.VoucherGrid), {
  ssr: false,
  loading: () => <ListGridOpenFallback label="Opening vouchers…" />,
});

const TYPES = Object.keys(VOUCHER_TYPE_LABEL) as VoucherType[];

function asType(value: string | null): VoucherType | null {
  return value && (TYPES as string[]).includes(value) ? (value as VoucherType) : null;
}

/** Finance → Vouchers: Debit / Payment, Credit / Receive, Contra, Journal and Voucher From Template (`?type=…`, `?from=template`). */
export default function FinanceVouchersPage() {
  return (
    <Suspense fallback={<ListGridOpenFallback label="Opening vouchers…" />}>
      <FinanceVouchersBody />
    </Suspense>
  );
}

function FinanceVouchersBody() {
  const params = useSearchParams();
  const router = useRouter();
  const type = asType(params.get("type"));
  const fromTemplate = params.get("from") === "template";
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const gridRef = useRef<VoucherGridHandle>(null);
  const [rows, setRows] = useState<ApiVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCount, setFilterCount] = useState(0);
  const [templates, setTemplates] = useState<ApiVoucherTemplate[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [newType, setNewType] = useState<VoucherType | null>(null);
  const [startTemplate, setStartTemplate] = useState<ApiVoucherTemplate | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await fetchVouchers({ voucher_type: type ?? undefined })).data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load vouchers");
    } finally {
      setLoading(false);
    }
  }, [type]);

  const loadTemplates = useCallback(() => {
    fetchVoucherTemplates({ voucher_type: type ?? undefined, activeOnly: true })
      .then((res) => setTemplates(res.data))
      .catch(() => setTemplates([]));
  }, [type]);

  useEffect(() => {
    void load();
    loadTemplates();
  }, [load, loadTemplates]);

  const startNew = (voucherType: VoucherType, template: ApiVoucherTemplate | null = null) => {
    setOpenId(null);
    setStartTemplate(template);
    setNewType(voucherType);
  };

  const title = fromTemplate ? "Voucher from template" : type ? `${VOUCHER_TYPE_LABEL[type]} vouchers` : "Vouchers";

  const headerLeftActions = (
    <ListGridHeaderStart title={title}>
      {canWrite ? (
        <DropdownMenu defaultOpen={fromTemplate}>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="rounded-none">
              <Plus className="mr-1 h-3.5 w-3.5" />
              New
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[14rem]">
            {(type ? [type] : TYPES).map((value) => (
              <DropdownMenuItem key={value} onClick={() => startNew(value)}>
                {VOUCHER_TYPE_LABEL[value]}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] text-muted-foreground">From template</DropdownMenuLabel>
            {templates.length === 0 ? (
              <DropdownMenuItem onClick={() => router.push("/finance/voucher-templates")}>No templates yet — create one…</DropdownMenuItem>
            ) : (
              templates.map((template) => (
                <DropdownMenuItem key={template.id} onClick={() => startNew(template.voucher_type, template)}>
                  {template.name}
                  <span className="ml-auto pl-3 text-[10px] text-muted-foreground">{VOUCHER_TYPE_LABEL[template.voucher_type]}</span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <FinanceGridSettingsMenu
        apiHealth={apiHealth}
        loading={loading}
        filterCount={filterCount}
        onRefresh={() => {
          void load();
          loadTemplates();
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
      <VoucherGrid
        ref={gridRef}
        rows={rows}
        fixedType={type}
        loading={loading && rows.length === 0}
        headerLeftActions={headerLeftActions}
        onOpen={(row) => {
          setNewType(null);
          setOpenId(row.id);
        }}
        onFilterCountChange={setFilterCount}
        footerLeftActions={(visible) => (
          <span className="px-2 text-[10px] text-muted-foreground">
            {loading
              ? "Loading…"
              : `${visible.length} shown · approved ${formatCurrency(
                  visible.filter((v) => v.status === "approved").reduce((sum, v) => sum + Number(v.amount), 0),
                )}`}
          </span>
        )}
        className="min-h-0 flex-1"
      />
      <VoucherDrawer
        voucherId={openId}
        newType={newType}
        startTemplate={startTemplate}
        canWrite={canWrite}
        onOpenChange={(open) => {
          if (!open) {
            setOpenId(null);
            setNewType(null);
            setStartTemplate(null);
          }
        }}
        onChanged={() => void load()}
      />
    </div>
  );
}
