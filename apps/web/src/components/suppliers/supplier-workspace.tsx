"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useCommerceSupplier } from "@/lib/api/use-commerce-suppliers";
import {
  deleteSupplierLink,
  fetchSupplierLinksBySupplier,
  updateSupplierLink,
  type ApiSupplierLink,
} from "@/lib/api/supplier-catalog";
import { SupplierFormDrawer } from "@/components/suppliers/supplier-form-drawer";
import { MapItemDrawer } from "@/components/suppliers/map-item-drawer";
import { InventoryProductQuickAdd } from "@/components/inventory/inventory-product-quick-add";
import { SupplierLedgerPanel } from "@/components/suppliers/supplier-ledger-panel";
import { SupplierPurchaseOrders } from "@/components/suppliers/supplier-purchase-orders";
import {
  SUPPLIER_DETAIL_TABS,
  SUPPLIER_DETAIL_TAB_LABELS,
  type Supplier,
  type SupplierDetail,
  type SupplierDetailTab,
} from "@/lib/mock-data/suppliers";
import { AgainFormNotebook, type AgainNotebookTab } from "@/components/again/again-form-sheet-layout";
import { PartnerStatusPill } from "@/components/customers/partner-customer-sections";
import { PartyExpenseTab } from "@/components/shared/party-expense-tab";
import { SUPPLIER_STOCK_STATUS_LABELS } from "@/lib/mock-data/vendor-product-mapping";
import {
  ResizableLineHeaderCell,
  useResizableLineColumns,
} from "@/components/shared/resizable-line-table";

const STATUS_TONE: Record<string, string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  preferred: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  blocked: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  preferred: "Preferred",
  blocked: "Blocked",
};

const NOTEBOOK_TABS: AgainNotebookTab<SupplierDetailTab>[] = SUPPLIER_DETAIL_TABS.map((id) => ({
  id,
  label: SUPPLIER_DETAIL_TAB_LABELS[id],
}));

const CATALOG_COLS = [
  "product",
  "sku",
  "title",
  "price",
  "stock",
  "status",
  "leadTime",
  "moq",
  "warranty",
  "preferred",
] as const;
type CatalogCol = (typeof CATALOG_COLS)[number];

const CATALOG_LABELS: Record<CatalogCol, string> = {
  product: "Product",
  sku: "SKU",
  title: "Title",
  price: "Price",
  stock: "Stock",
  status: "Status",
  leadTime: "Lead",
  moq: "MOQ",
  warranty: "Warranty",
  preferred: "Preferred",
};

const CATALOG_DEFAULT_WIDTHS: Record<CatalogCol, number> = {
  product: 220,
  sku: 120,
  title: 160,
  price: 88,
  stock: 64,
  status: 96,
  leadTime: 56,
  moq: 52,
  warranty: 100,
  preferred: 88,
};

const CATALOG_MIN_WIDTHS: Record<CatalogCol, number> = {
  product: 80,
  sku: 64,
  title: 72,
  price: 56,
  stock: 48,
  status: 72,
  leadTime: 44,
  moq: 40,
  warranty: 64,
  preferred: 64,
};

const CATALOG_RIGHT_COLS = new Set<CatalogCol>(["price", "stock", "leadTime", "moq"]);

function supplierListToDetail(row: Supplier): SupplierDetail {
  return {
    ...row,
    contacts: [],
    addresses: [],
    contracts: [],
    bills: [],
    performance: {
      onTimeDeliveryPct: 0,
      qualityRejectRatePct: 0,
      priceVariancePct: 0,
      avgLeadTimeDays: 0,
    },
    timeline: [],
    totalPos: 0,
    rfqCount: 0,
    receiptCount: 0,
    hasStockFeed: false,
  };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-border px-3 py-2 last:border-r-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex gap-3 border-b border-border py-1.5 last:border-b-0">
      <span className="w-[150px] shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words text-xs">{value || "—"}</span>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-border">
      <h3 className="border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold">
        {title}
      </h3>
      <div className="px-3 py-2">{children}</div>
    </section>
  );
}

function formatSupplierAddress(supplier: {
  addresses?: { line1?: string; city?: string; country?: string }[];
}): string | undefined {
  const first = supplier.addresses?.[0];
  if (!first) return undefined;
  const line = [first.line1, first.city, first.country].filter(Boolean).join(", ");
  return line || undefined;
}

export function SupplierWorkspace({
  supplierId,
  initialSupplier,
  variant = "page",
  editOpen: editOpenProp,
  onEditOpenChange,
  onChanged,
}: {
  supplierId: string;
  initialSupplier?: Supplier | null;
  variant?: "page" | "drawer";
  editOpen?: boolean;
  onEditOpenChange?: (open: boolean) => void;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const canWrite = useAdminCanWrite();
  const { supplier: fetched, loading, refetch } = useCommerceSupplier(supplierId);
  const supplier =
    fetched ??
    (initialSupplier && initialSupplier.id === supplierId
      ? supplierListToDetail(initialSupplier)
      : null);
  const [tab, setTab] = useState<SupplierDetailTab>("overview");
  const [links, setLinks] = useState<ApiSupplierLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(true);
  const [localEditOpen, setLocalEditOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [viewProductId, setViewProductId] = useState<string | null>(null);
  const {
    order: catalogColOrder,
    widths: catalogColWidths,
    dragCol: catalogDragCol,
    setDragCol: setCatalogDragCol,
    moveColumn: moveCatalogColumn,
    startResize: startCatalogResize,
  } = useResizableLineColumns({
    cols: CATALOG_COLS,
    defaultWidths: CATALOG_DEFAULT_WIDTHS,
    minWidths: CATALOG_MIN_WIDTHS,
  });
  const editControlled = onEditOpenChange != null;
  const editOpen = editControlled ? Boolean(editOpenProp) : localEditOpen;
  const setEditOpen = editControlled ? onEditOpenChange : setLocalEditOpen;

  const loadLinks = useCallback(async () => {
    setLinksLoading(true);
    try {
      setLinks(await fetchSupplierLinksBySupplier(supplierId));
    } catch {
      setLinks([]);
    } finally {
      setLinksLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  useEffect(() => {
    setTab("overview");
  }, [supplierId]);

  const setPreferred = async (link: ApiSupplierLink) => {
    try {
      await updateSupplierLink(link.id, { is_preferred: true });
      toast.success(`${link.supplier_sku} set as preferred`);
      void loadLinks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  const unmap = async (link: ApiSupplierLink) => {
    try {
      await deleteSupplierLink(link.id);
      toast.success(`${link.supplier_sku} unmapped`);
      void loadLinks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unmap failed");
    }
  };

  const catalogValue = useMemo(
    () => links.reduce((sum, l) => sum + Number(l.supplier_price ?? 0), 0),
    [links],
  );

  if (!supplier) {
    if (variant === "drawer") {
      return loading ? null : (
        <p className="p-4 text-sm text-muted-foreground">Supplier not found</p>
      );
    }
    if (loading) {
      return <div className="p-4 text-sm text-muted-foreground">Loading supplier…</div>;
    }
    return (
      <div className="p-4">
        <p className="text-sm font-medium">Supplier not found</p>
        <Button size="sm" className="mt-3" onClick={() => router.push("/suppliers")}>
          Back to directory
        </Button>
      </div>
    );
  }

  const handleSaved = () => {
    void refetch();
    onChanged?.();
  };

  const tabBody = (
    <>
        {tab === "overview" && (
          <div className="grid grid-cols-2 gap-0 border border-border sm:grid-cols-5">
            <Stat label="Open POs" value={String(supplier.openPos)} />
            <Stat label="Total POs" value={String(supplier.totalPos ?? 0)} />
            <Stat label="Spend YTD" value={formatCurrency(supplier.spendYtd)} />
            <Stat label="Mapped items" value={String(links.length)} />
            <Stat label="Lead time" value={`${supplier.leadTimeDays}d`} />
          </div>
        )}

        {tab === "general" && (
          <div className="space-y-3">
            {variant === "drawer" ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <PartnerStatusPill
                  tone={
                    supplier.status === "blocked"
                      ? "danger"
                      : supplier.status === "preferred"
                        ? "brand"
                        : "success"
                  }
                >
                  {STATUS_LABEL[supplier.status] ?? supplier.status}
                </PartnerStatusPill>
              </div>
            ) : null}
            <Panel title="Details">
              {variant !== "drawer" ? (
                <>
                  <Row label="Email" value={supplier.email} />
                  <Row label="Phone" value={supplier.phone} />
                </>
              ) : null}
              <Row label="Website" value={supplier.website} />
              <Row label="Lead time" value={`${supplier.leadTimeDays} days`} />
              <Row label="Address" value={formatSupplierAddress(supplier)} />
              <Row label="Country" value={supplier.country} />
              <Row label="Tax ID" value={supplier.taxId} />
              <Row label="Currency" value={supplier.currency} />
              <Row label="Buyer" value={supplier.buyerName} />
              <Row label="Notes" value={supplier.notes} />
            </Panel>
            <Panel title="Contacts">
              {supplier.contacts.length === 0 ? (
                <p className="py-3 text-xs text-muted-foreground">No contacts recorded.</p>
              ) : (
                supplier.contacts.map((c, i) => (
                  <div key={i} className="border-b border-border py-2 last:border-b-0">
                    <p className="text-xs font-medium">{c.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {[c.role, c.email, c.phone].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                ))
              )}
            </Panel>
          </div>
        )}

        {tab === "terms" && (
          <div className="space-y-3">
            <Panel title="Terms">
              <Row
                label="Opening balance"
                value={formatCurrency(supplier.openingBalance ?? 0)}
              />
              <Row label="Credit limit" value={formatCurrency(supplier.creditLimit ?? 0)} />
              <Row label="Payment terms" value={supplier.paymentTerms} />
              <Row label="Payment schedule" value={supplier.paymentSchedule} />
            </Panel>
          </div>
        )}

        {tab === "catalog" && (
          <section className={cn(variant !== "drawer" && "border border-border")}>
            <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
              <h3 className="text-xs font-semibold">Mapped items</h3>
              <span className="text-[11px] text-muted-foreground">
                {links.length} link{links.length === 1 ? "" : "s"} · {formatCurrency(catalogValue)} list value
              </span>
              {canWrite && (
                <div className="ml-auto flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 rounded-none text-xs"
                    onClick={() => {
                      setViewProductId(null);
                      setQuickAddOpen(true);
                    }}
                  >
                    <Plus className="mr-1 h-3 w-3" /> New product
                  </Button>
                  <Button
                    size="sm"
                    className="h-6 rounded-none text-xs"
                    onClick={() => setMapOpen(true)}
                  >
                    <Plus className="mr-1 h-3 w-3" /> Map item
                  </Button>
                </div>
              )}
            </div>
            {linksLoading ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">Loading catalog…</p>
            ) : links.length === 0 ? (
              <div className="px-3 py-6 text-center">
                <Link2 className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden />
                <p className="mt-2 text-xs font-medium">Nothing mapped yet</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Add a new product for this supplier, or map an existing item you already stock.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table
                  className="w-full border-collapse text-xs"
                  style={{
                    tableLayout: "fixed",
                    minWidth:
                      catalogColOrder.reduce((sum, col) => sum + catalogColWidths[col], 0) +
                      (canWrite ? 40 : 0),
                  }}
                >
                  <colgroup>
                    {catalogColOrder.map((col) => (
                      <col key={col} style={{ width: catalogColWidths[col] }} />
                    ))}
                    {canWrite ? <col style={{ width: 40 }} /> : null}
                  </colgroup>
                  <thead>
                    <tr className="h-8 border-b border-border text-left text-[11px] text-muted-foreground">
                      {catalogColOrder.map((col) => (
                        <ResizableLineHeaderCell
                          key={col}
                          col={col}
                          label={CATALOG_LABELS[col]}
                          width={catalogColWidths[col]}
                          alignRight={CATALOG_RIGHT_COLS.has(col)}
                          dragCol={catalogDragCol}
                          onDragColChange={setCatalogDragCol}
                          onMoveColumn={moveCatalogColumn}
                          onResizeStart={startCatalogResize}
                        />
                      ))}
                      {canWrite ? <th className="w-10" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {links.map((l) => (
                      <tr key={l.id} className="border-b border-border last:border-b-0">
                        {catalogColOrder.map((col) => (
                          <td
                            key={col}
                            className={cn(
                              "overflow-hidden px-3 py-1.5",
                              CATALOG_RIGHT_COLS.has(col) && "text-right",
                            )}
                            style={{
                              width: catalogColWidths[col],
                              minWidth: catalogColWidths[col],
                              maxWidth: catalogColWidths[col],
                            }}
                          >
                            {col === "product" ? (
                              <>
                                {l.item_id ? (
                                  <button
                                    type="button"
                                    className="block w-full cursor-pointer truncate text-left font-medium text-foreground hover:text-primary focus-visible:outline-none"
                                    title={l.item_name || undefined}
                                    onClick={() => {
                                      setQuickAddOpen(false);
                                      setViewProductId(l.item_id);
                                    }}
                                  >
                                    {l.item_name || "—"}
                                  </button>
                                ) : (
                                  <p className="truncate font-medium">{l.item_name || "—"}</p>
                                )}
                                <p className="truncate font-mono text-[11px] text-muted-foreground">
                                  {l.item_sku || "—"}
                                </p>
                              </>
                            ) : null}
                            {col === "sku" ? (
                              <span className="block truncate font-mono text-[11px]">
                                {l.supplier_sku || "—"}
                              </span>
                            ) : null}
                            {col === "title" ? (
                              <span className="block truncate">{l.supplier_title || "—"}</span>
                            ) : null}
                            {col === "price" ? (
                              <span className="tabular-nums">
                                {l.supplier_price ? formatCurrency(Number(l.supplier_price)) : "—"}
                              </span>
                            ) : null}
                            {col === "stock" ? (
                              <span className="tabular-nums">
                                {l.supplier_stock != null ? l.supplier_stock : "—"}
                              </span>
                            ) : null}
                            {col === "status" ? (
                              <span className="block truncate">
                                {l.stock_status
                                  ? (SUPPLIER_STOCK_STATUS_LABELS[
                                      l.stock_status as keyof typeof SUPPLIER_STOCK_STATUS_LABELS
                                    ] ?? l.stock_status)
                                  : "—"}
                              </span>
                            ) : null}
                            {col === "leadTime" ? (
                              <span className="tabular-nums">
                                {l.lead_time_days != null ? `${l.lead_time_days}d` : "—"}
                              </span>
                            ) : null}
                            {col === "moq" ? (
                              <span className="tabular-nums">
                                {l.min_order_qty != null ? l.min_order_qty : "—"}
                              </span>
                            ) : null}
                            {col === "warranty" ? (
                              <span className="block truncate">{l.warranty || "—"}</span>
                            ) : null}
                            {col === "preferred" ? (
                              l.is_preferred ? (
                                <Badge variant="outline" className="rounded-none text-[10px]">
                                  Preferred
                                </Badge>
                              ) : canWrite ? (
                                <button
                                  type="button"
                                  className="text-[11px] text-muted-foreground hover:text-foreground"
                                  onClick={() => void setPreferred(l)}
                                >
                                  <Star className="mr-1 inline h-3 w-3" />
                                  Set
                                </button>
                              ) : null
                            ) : null}
                          </td>
                        ))}
                        {canWrite ? (
                          <td className="px-2 py-1.5 text-right">
                            <button
                              type="button"
                              aria-label="Unmap"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => void unmap(l)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {tab === "ledger" && (
          <SupplierLedgerPanel
            supplierId={supplierId}
            partyId={supplier.partyId}
            supplierName={supplier.name}
            supplierPhone={supplier.phone}
            supplierEmail={supplier.email}
            fillHeight={variant === "drawer"}
          />
        )}

        {tab === "expense" && (
          <div className="space-y-3">
            <PartyExpenseTab partyId={supplier.partyId} partyName={supplier.name} />
          </div>
        )}

        {tab === "purchase-orders" && (
          <SupplierPurchaseOrders
            supplierId={supplierId}
            supplierName={supplier.name}
            fillHeight={variant === "drawer"}
          />
        )}
    </>
  );

  const drawers = (
    <>
      <SupplierFormDrawer
        key={`edit:${editOpen}`}
        open={editOpen}
        onOpenChange={setEditOpen}
        supplier={supplier}
        onSaved={handleSaved}
      />
      <MapItemDrawer
        key={`map:${mapOpen}`}
        open={mapOpen}
        onOpenChange={setMapOpen}
        supplierId={supplierId}
        supplierName={supplier.name}
        onMapped={loadLinks}
      />
      <InventoryProductQuickAdd
        nested
        open={quickAddOpen || Boolean(viewProductId)}
        productId={viewProductId}
        onOpenChange={(next) => {
          if (!next) {
            setQuickAddOpen(false);
            setViewProductId(null);
          }
        }}
        supplierLink={{
          supplierId,
          supplierName: supplier.name,
          leadTimeDays: supplier.leadTimeDays,
        }}
        onSaved={() => {
          void loadLinks();
        }}
      />
    </>
  );

  if (variant === "drawer") {
    const initial = (supplier.name.trim() || "S").charAt(0).toUpperCase();
    return (
      <>
        <div
          className={cn(
            "-mx-4 flex min-h-0 flex-1 flex-col overflow-hidden sm:-mx-6",
            tab === "catalog" && "-mb-4",
          )}
        >
          <div className="shrink-0 border-b border-border bg-background px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setTab("general")}
                className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-none border border-border/80 bg-[#00a09d] text-[18px] font-bold text-white"
                aria-label="Open general"
              >
                {initial}
              </button>
              <div className="min-w-0 flex-1">
                <p className="min-w-0 truncate text-[15px] font-semibold text-foreground">
                  {supplier.name}
                </p>
                {supplier.phone ? (
                  <p className="truncate text-[12px] text-muted-foreground">{supplier.phone}</p>
                ) : null}
                {supplier.email ? (
                  <p className="truncate text-[12px] text-muted-foreground">{supplier.email}</p>
                ) : null}
                {!supplier.phone && !supplier.email ? (
                  <p className="truncate font-mono text-[12px] text-muted-foreground">
                    {supplier.vendorCode}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setTab("general")}
                  className={cn(
                    "inline-flex h-6 items-center gap-1 rounded-none border px-2 text-[11px] font-semibold transition-colors",
                    tab === "general"
                      ? "border-[#714B67] bg-[#714B67] text-white"
                      : "border-border bg-background text-foreground hover:border-[#00a09d] hover:text-[#00a09d]",
                  )}
                >
                  <User className="h-3 w-3" />
                  Profile
                </button>
              </div>
            </div>
          </div>
          <AgainFormNotebook
            tabs={NOTEBOOK_TABS.map((t) =>
              t.id === "catalog" ? { ...t, badge: links.length || undefined } : t,
            )}
            active={tab}
            onChange={setTab}
            className={cn(
              "border-t-0 min-h-0 flex-1",
              (tab === "ledger" || tab === "purchase-orders") && "overflow-hidden",
            )}
            contentClassName={cn(
              "bg-transparent dark:bg-transparent",
              (tab === "ledger" || tab === "purchase-orders") &&
                "flex min-h-0 flex-1 flex-col overflow-y-auto py-3",
              tab !== "ledger" && tab !== "purchase-orders" && "overflow-y-auto",
              tab === "catalog" && "p-0",
            )}
          >
            {tabBody}
          </AgainFormNotebook>
        </div>
        {drawers}
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 rounded-none px-1.5"
            onClick={() => router.push("/suppliers")}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{supplier.name}</h1>
            <p className="truncate font-mono text-[11px] text-muted-foreground">
              {supplier.vendorCode}
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn("rounded-none text-[10px]", STATUS_TONE[supplier.status])}
          >
            {supplier.status}
          </Badge>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-[26px] w-[26px] rounded-none"
              aria-label="Refresh"
              onClick={() => {
                void refetch();
                void loadLinks();
              }}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
            {canWrite && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-none"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="mr-1.5 h-3 w-3" /> Edit
              </Button>
            )}
          </div>
        </div>

        <div className="flex gap-0.5 overflow-x-auto border-t border-border px-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SUPPLIER_DETAIL_TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "shrink-0 border-b-2 px-2.5 py-1.5 text-xs",
                tab === t
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {SUPPLIER_DETAIL_TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">{tabBody}</div>
      {drawers}
    </div>
  );
}
