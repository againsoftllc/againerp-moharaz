"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Download, Filter, Plus, RefreshCw, Settings2, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  AGAIN_DRAWER_ACTION_BTN,
  AGAIN_DRAWER_FIELD_SHEET_CLASS,
  AGAIN_DRAWER_PRIMARY_BTN,
  AGAIN_DRAWER_PRIMARY_COLOR,
  AgainDrawerControlBar,
} from "@/components/again/again-drawer";
import { FilterSelect } from "@/components/shared/filter-select";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";
import type { PurchaseBillGridHandle } from "@/components/purchase/purchase-bill-grid";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useApiHealth } from "@/lib/api/use-api-health";
import { useCommerceSuppliers } from "@/lib/api/use-commerce-suppliers";
import { fetchPurchaseOrders, type ApiPurchaseOrder } from "@/lib/api/purchase-orders";
import {
  fetchPurchaseBills,
  createPurchaseBill,
  matchPurchaseBill,
  approvePurchaseBill,
  postPurchaseBill,
  toVendorBill,
} from "@/lib/api/purchase-bills";
import type { VendorBill } from "@/lib/mock-data/purchase-bills";
import { cn, formatCurrency } from "@/lib/utils";

const PurchaseBillGrid = dynamic(
  () => import("@/components/purchase/purchase-bill-grid").then((m) => m.PurchaseBillGrid),
  { ssr: false, loading: () => <ListGridOpenFallback label="Opening bills…" /> },
);

function today() {
  return new Date().toISOString().slice(0, 10);
}

function plusDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </label>
      {children}
    </div>
  );
}

export default function PurchaseBillsPage() {
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const { suppliers } = useCommerceSuppliers();
  const gridRef = useRef<PurchaseBillGridHandle>(null);
  const [filterCount, setFilterCount] = useState(0);

  const [bills, setBills] = useState<VendorBill[]>([]);
  const [loadingBills, setLoadingBills] = useState(true);

  const [orders, setOrders] = useState<ApiPurchaseOrder[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [poId, setPoId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [creating, setCreating] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetchPurchaseOrders({ per_page: 300 });
      setOrders(res.data.filter((o) => o.status !== "cancelled" && o.status !== "draft"));
    } catch {
      setOrders([]);
    }
  }, []);

  const loadBills = useCallback(async () => {
    setLoadingBills(true);
    try {
      const res = await fetchPurchaseBills();
      setBills(res.data.map(toVendorBill));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load bills");
    } finally {
      setLoadingBills(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
    void loadBills();
  }, [loadOrders, loadBills]);

  const billedTotal = useMemo(() => bills.reduce((sum, b) => sum + b.total, 0), [bills]);

  const createFromPo = async () => {
    const po = orders.find((o) => o.id === poId);
    if (!po) {
      toast.error("Pick a purchase order");
      return;
    }
    setCreating(true);
    try {
      const res = await createPurchaseBill({
        purchase_order_id: po.id,
        vendor_invoice_number: invoiceNo.trim() || undefined,
        bill_date: today(),
        due_date: plusDays(30),
      });
      toast.success(`${res.data.bill_number} created — 3-way match evaluated`);
      setCreateOpen(false);
      setPoId("");
      setInvoiceNo("");
      void loadBills();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create bill");
    } finally {
      setCreating(false);
    }
  };

  const runAutoMatch = async (id: string) => {
    try {
      await matchPurchaseBill(id);
      void loadBills();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Match failed");
    }
  };

  const approveBill = async (id: string) => {
    try {
      await approvePurchaseBill(id);
      void loadBills();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approve failed");
    }
  };

  const postToFinance = async (bill: VendorBill) => {
    try {
      const res = await postPurchaseBill(bill.id);
      toast.success(
        res.matched_existing_payable
          ? "Matched — payable already in Finance from the goods receipt. No duplicate entry created."
          : `${bill.number} posted to Finance payables`,
      );
      void loadBills();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Post failed");
    }
  };

  const healthTitle =
    apiHealth.status === "connected"
      ? "API and database connected"
      : apiHealth.status === "partial"
        ? "API connected, database not connected"
        : apiHealth.status === "disconnected"
          ? "API/database not connected"
          : "Checking connection…";

  const headerLeftActions = (
    <ListGridHeaderStart title="Supplier bills">
      {canWrite ? (
        <Button size="sm" className="rounded-none" onClick={() => setCreateOpen(true)}>
          New
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(
              "relative h-[26px] w-[26px] shrink-0 rounded-none",
              apiHealth.status === "connected" &&
                "border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400",
              apiHealth.status === "partial" &&
                "border-amber-500/50 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400",
              apiHealth.status === "disconnected" &&
                "border-red-500/50 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400",
              apiHealth.status === "checking" && "text-muted-foreground",
            )}
            aria-label={`Settings (${healthTitle})`}
            title={healthTitle}
          >
            <Settings2 className="h-3.5 w-3.5" />
            {filterCount > 0 && (
              <span className="absolute -right-1 -top-1 rounded-none bg-primary px-1 text-[9px] leading-3 text-primary-foreground">
                {filterCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[11rem]">
          <DropdownMenuItem
            onClick={() => {
              void loadOrders();
              void loadBills();
              apiHealth.recheck();
            }}
          >
            <RefreshCw className="mr-1.5 h-3 w-3" />
            Refresh
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gridRef.current?.openFilters()}>
            <Filter className="mr-1.5 h-3 w-3" />
            Filters
            {filterCount > 0 ? (
              <span className="ml-auto text-[10px] text-muted-foreground">{filterCount}</span>
            ) : null}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gridRef.current?.openColumns()}>
            <SlidersHorizontal className="mr-1.5 h-3 w-3" />
            Columns
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => gridRef.current?.exportCsv()}>
            <Download className="mr-1.5 h-3 w-3" />
            Export
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gridRef.current?.resetFilters()}>
            Reset filters
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ListGridHeaderStart>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <PurchaseBillGrid
        ref={gridRef}
        bills={bills}
        suppliers={suppliers}
        onMatch={(row) => void runAutoMatch(row.id)}
        onApprove={(row) => void approveBill(row.id)}
        onPost={(row) => void postToFinance(row)}
        onFilterCountChange={setFilterCount}
        headerLeftActions={headerLeftActions}
        footerLeftActions={
          <span className="px-2 text-[10px] text-muted-foreground">
            {bills.length} bill{bills.length === 1 ? "" : "s"} · {formatCurrency(billedTotal)}
          </span>
        }
        className="min-h-0 flex-1"
      />

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent
          side="right"
          resizable
          resizeMaxWidth={720}
          closeButton="inside"
          className="flex min-w-[160px] w-[440px] max-w-[720px] flex-col gap-0 p-0"
          title="New bill"
        >
          <AgainDrawerControlBar>
            <button
              type="button"
              className={cn(AGAIN_DRAWER_PRIMARY_BTN, "h-6 px-2 text-[11px]")}
              style={{ backgroundColor: AGAIN_DRAWER_PRIMARY_COLOR }}
              onClick={() => void createFromPo()}
              disabled={creating}
            >
              {creating ? "Creating…" : "Create bill"}
            </button>
            <button
              type="button"
              className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
              onClick={() => setCreateOpen(false)}
            >
              Close
            </button>
            <span className="ml-1 text-[13px] font-medium text-foreground">New bill</span>
          </AgainDrawerControlBar>
          <div className={cn("min-h-0 flex-1 space-y-3 overflow-y-auto", AGAIN_DRAWER_FIELD_SHEET_CLASS)}>
            <Field label="Purchase order" required>
              <FilterSelect
                value={poId}
                onChange={setPoId}
                width="w-full"
                ariaLabel="Purchase order"
                options={[
                  { value: "", label: "Select PO…" },
                  ...orders.map((o) => ({
                    value: o.id,
                    label: `${o.po_number} · ${o.supplier_name ?? ""}`,
                  })),
                ]}
              />
            </Field>
            <Field label="Supplier invoice no.">
              <Input
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                className="rounded-none"
                placeholder="From the supplier invoice"
              />
            </Field>
            <p className="text-[11px] text-muted-foreground">
              Three-way match: PO qty / received / billed.
            </p>
          </div>
        </SheetContent>
      </Sheet>

      {canWrite && (
        <Button
          size="sm"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-none p-0 shadow-lg md:hidden"
          onClick={() => setCreateOpen(true)}
          aria-label="New bill"
        >
          <Plus className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}
