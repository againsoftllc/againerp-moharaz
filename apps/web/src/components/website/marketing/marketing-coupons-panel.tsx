"use client";

import { useGridLayout } from "@/components/shared/use-grid-layout";
import "@/components/providers/ag-grid-provider";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CouponStatus, MarketingCoupon } from "@/lib/mock-data/marketing";
import {
  createMarketingCoupon,
  deleteMarketingCoupon,
  updateMarketingCoupon,
} from "@/lib/api/marketing-coupons";
import { useMarketingCoupons } from "@/lib/api/use-marketing-coupons";
import { useIsDark } from "@/lib/use-is-dark";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useViewerWriteUrlGuard } from "@/lib/hooks/use-viewer-write-url-guard";
import { useApiHealth } from "@/lib/api/use-api-health";
import { ApiRefreshButton } from "@/components/products/api-refresh-button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";

const PAGE_SIZE = 50;
const STATUS_OPTIONS: CouponStatus[] = ["active", "scheduled", "expired", "disabled"];

function buildUrl(params: URLSearchParams) {
  const q = params.toString();
  return q ? `/website/marketing/coupons?${q}` : "/website/marketing/coupons";
}

export function MarketingCouponsPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDark = useIsDark();
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const { coupons, loading, error, refetch } = useMarketingCoupons();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const createOpen = searchParams.get("create") === "1";
  const editId = searchParams.get("edit");
  const editCoupon = useMemo(
    () => (editId ? coupons.find((c) => c.id === editId) ?? null : null),
    [editId, coupons],
  );
  const formOpen = createOpen || !!editCoupon;

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "marketing-coupons-api" });
  }, [error]);

  const pushParams = (mutate: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("tab");
    mutate(p);
    router.push(buildUrl(p), { scroll: false });
  };

  const openCreate = () =>
    pushParams((p) => {
      p.delete("edit");
      p.set("create", "1");
    });

  const openEdit = (coupon: MarketingCoupon) =>
    pushParams((p) => {
      p.delete("create");
      p.set("edit", coupon.id);
    });

  const closeForm = () =>
    pushParams((p) => {
      p.delete("create");
      p.delete("edit");
    });

  useViewerWriteUrlGuard(formOpen, closeForm);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return coupons.filter((coupon) => {
      if (status !== "all" && coupon.status !== status) return false;
      if (!q) return true;
      return (
        coupon.code.toLowerCase().includes(q) ||
        coupon.name.toLowerCase().includes(q) ||
        coupon.discount.toLowerCase().includes(q)
      );
    });
  }, [coupons, search, status]);

  const columnDefs = useMemo<ColDef<MarketingCoupon>[]>(
    () => [
      {
        field: "code",
        headerName: "Code",
        width: 130,
        cellRenderer: (p: ICellRendererParams<MarketingCoupon>) =>
          p.data ? (
            <button
              type="button"
              className="font-mono text-left font-medium text-foreground hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                openEdit(p.data!);
              }}
            >
              {p.data.code}
            </button>
          ) : null,
      },
      { field: "name", headerName: "Name", flex: 1.4, minWidth: 160 },
      { field: "discount", headerName: "Discount", width: 120 },
      {
        field: "status",
        headerName: "Status",
        width: 110,
        cellRenderer: (p: ICellRendererParams<MarketingCoupon>) =>
          p.data ? (
            <Badge
              variant={p.data.status === "active" ? "default" : "secondary"}
              className="rounded-none capitalize"
            >
              {p.data.status}
            </Badge>
          ) : null,
      },
      {
        colId: "redemptions",
        headerName: "Redeemed",
        width: 110,
        valueGetter: (p) =>
          p.data
            ? p.data.limit != null
              ? `${p.data.redemptions}/${p.data.limit}`
              : String(p.data.redemptions)
            : "",
      },
      {
        colId: "dates",
        headerName: "Valid",
        flex: 1,
        minWidth: 170,
        valueGetter: (p) => (p.data ? `${p.data.startsAt} → ${p.data.endsAt}` : ""),
      },
      {
        colId: "actions",
        headerName: "",
        width: 56,
        pinned: "right",
        sortable: false,
        cellRenderer: (p: ICellRendererParams<MarketingCoupon>) =>
          p.data ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-none p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-none">
                <DropdownMenuItem onClick={() => openEdit(p.data!)}>
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Edit
                </DropdownMenuItem>
                {canWrite ? (
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => {
                      void (async () => {
                        try {
                          await deleteMarketingCoupon(p.data!.id);
                          toast.success("Coupon deleted");
                          await refetch();
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Delete failed");
                        }
                      })();
                    }}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null,
      },
    ],
    [canWrite, refetch],
  );

  // Column order + widths saved per admin (same as the other data tables).
  const layout = useGridLayout("marketing-coupons", columnDefs);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-stretch overflow-hidden rounded-none border border-border bg-card">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 px-2 py-1.5">
          <Input
            placeholder="Search code, name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-[260px] rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-[150px] shrink-0 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          >
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </Select>
          <ApiRefreshButton
            status={apiHealth.status}
            loading={loading}
            onRefresh={() => {
              void refetch();
              apiHealth.recheck();
            }}
            disabled={loading}
          />
        </div>
        {canWrite ? (
          <div className="flex shrink-0 items-center gap-2 border-l border-border bg-background px-2 py-1.5">
            <Button size="sm" className="gap-1.5 rounded-none" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              New coupon
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {loading && coupons.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-none border border-border bg-card">
            <p className="text-sm text-muted-foreground">Loading coupons…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-none border border-dashed border-border bg-card">
            <p className="text-sm text-muted-foreground">No coupons match your filters.</p>
          </div>
        ) : (
          <div
            style={layout.containerStyle}
            className={cn(
              "ag-theme-quartz control-border relative min-h-0 flex-1 overflow-hidden rounded-none bg-card [&_.ag-root-wrapper]:h-full",
              isDark && "ag-theme-quartz-dark",
            )}
          >
            <AgGridReact<MarketingCoupon>
              rowData={filtered}
              columnDefs={layout.columnDefs}
              {...layout.gridProps}
              getRowId={(p) => p.data.id}
              pagination
              paginationPageSize={PAGE_SIZE}
              paginationPageSizeSelector={[50, 100, 500, 1000]}
              suppressCellFocus
              animateRows={false}
            />
          </div>
        )}
      </div>

      <CouponFormSheet
        open={formOpen}
        mode={createOpen ? "create" : "edit"}
        coupon={editCoupon}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
        onSaved={async () => {
          await refetch();
          closeForm();
        }}
      />
    </div>
  );
}

function CouponFormSheet({
  open,
  mode,
  coupon,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  coupon: MarketingCoupon | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState("10");
  const [status, setStatus] = useState<CouponStatus>("active");
  const [limit, setLimit] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [saving, setSaving] = useState(false);

  // Fill the form when the sheet opens or the record changes. Done while rendering (React's pattern for
  // resetting state on a prop change) so the sheet never shows the previous record first.
  const [loadedFor, setLoadedFor] = useState({ open: false, mode, coupon });
  if (loadedFor.open !== open || loadedFor.mode !== mode || loadedFor.coupon !== coupon) {
    setLoadedFor({ open, mode, coupon });
    if (open) fillForm();
  }

  function fillForm() {
    if (mode === "edit" && coupon) {
      setCode(coupon.code);
      setName(coupon.name);
      const isFixed = coupon.discount.toLowerCase().includes("fixed") || coupon.discount.includes("৳");
      setDiscountType(isFixed ? "fixed" : "percent");
      const num = coupon.discount.replace(/[^\d.]/g, "");
      setDiscountValue(num || "0");
      setStatus(coupon.status);
      setLimit(coupon.limit != null ? String(coupon.limit) : "");
      setStartsAt(coupon.startsAt.slice(0, 10));
      setEndsAt(coupon.endsAt.slice(0, 10));
      setMinOrder("");
      return;
    }
    const today = new Date();
    const end = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    setCode("");
    setName("");
    setDiscountType("percent");
    setDiscountValue("10");
    setStatus("active");
    setLimit("");
    setStartsAt(iso(today));
    setEndsAt(iso(end));
    setMinOrder("");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        resizable
        closeButton="chevron"
        className="flex w-[420px] min-w-[160px] max-w-[720px] flex-col rounded-none p-0"
      >
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle className="text-sm font-semibold">
            {mode === "create" ? "New coupon" : "Edit coupon"}
          </SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
          <Field label="Code">
            <Input
              className="rounded-none uppercase"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </Field>
          <Field label="Name">
            <Input className="rounded-none" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Discount type">
              <Select
                className="rounded-none"
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as "percent" | "fixed")}
              >
                <option value="percent">Percent</option>
                <option value="fixed">Fixed (৳)</option>
              </Select>
            </Field>
            <Field label="Value">
              <Input
                type="number"
                className="rounded-none"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Status">
            <Select
              className="rounded-none"
              value={status}
              onChange={(e) => setStatus(e.target.value as CouponStatus)}
            >
              {STATUS_OPTIONS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts">
              <Input
                type="date"
                className="rounded-none"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </Field>
            <Field label="Ends">
              <Input
                type="date"
                className="rounded-none"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Redemption limit">
              <Input
                type="number"
                className="rounded-none"
                placeholder="Unlimited"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
            </Field>
            <Field label="Min order (৳)">
              <Input
                type="number"
                className="rounded-none"
                placeholder="None"
                value={minOrder}
                onChange={(e) => setMinOrder(e.target.value)}
              />
            </Field>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="outline" className="rounded-none" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="rounded-none"
            disabled={saving}
            onClick={() => {
              void (async () => {
                if (!code.trim() || !name.trim()) {
                  toast.error("Code and name are required");
                  return;
                }
                setSaving(true);
                try {
                  const payload = {
                    code: code.trim().toUpperCase(),
                    name: name.trim(),
                    discount_type: discountType,
                    discount_value: Number(discountValue) || 0,
                    status,
                    redemption_limit: limit.trim() ? Number(limit) : null,
                    starts_at: startsAt,
                    ends_at: endsAt,
                    min_order_amount: minOrder.trim() ? Number(minOrder) : null,
                  };
                  if (mode === "create") {
                    await createMarketingCoupon(payload);
                    toast.success("Coupon created");
                  } else if (coupon) {
                    await updateMarketingCoupon(coupon.id, payload);
                    toast.success("Coupon updated");
                  }
                  await onSaved();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Save failed");
                } finally {
                  setSaving(false);
                }
              })();
            }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
