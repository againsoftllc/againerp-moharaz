"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import { PortalChrome } from "@/components/portal/portal-chrome";
import {
  fetchPortalItems,
  fetchPortalProducts,
  mapPortalProduct,
  upsertPortalProduct,
  type PortalItem,
  type PortalProduct,
} from "@/lib/api/portal";
import { cn, formatCurrency } from "@/lib/utils";

const STOCK_TONE: Record<string, string> = {
  in_stock: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  low: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  out: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  unknown: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

function money(value: string | number, currency = "BDT") {
  const n = typeof value === "number" ? value : Number(value);
  return formatCurrency(n, currency);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium">{label}</label>
      {children}
    </div>
  );
}

function ProductDrawer({
  open,
  onOpenChange,
  product,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  product: PortalProduct | null;
  onSaved: () => void;
}) {
  const [sku, setSku] = useState(product?.supplier_sku ?? "");
  const [title, setTitle] = useState(product?.supplier_title ?? "");
  const [price, setPrice] = useState(product ? String(Number(product.supplier_price)) : "");
  const [stock, setStock] = useState(product?.supplier_stock != null ? String(product.supplier_stock) : "");
  const [status, setStatus] = useState(product?.stock_status ?? "in_stock");
  const [lead, setLead] = useState(String(product?.lead_time_days ?? 7));
  const [moq, setMoq] = useState(String(product?.min_order_qty ?? 1));
  const [saving, setSaving] = useState(false);

  const priceValue = Number.parseFloat(price);
  const blocked = !sku.trim() || !title.trim() || !Number.isFinite(priceValue) || priceValue < 0;

  const submit = async () => {
    if (blocked) return;
    setSaving(true);
    try {
      const stockValue = Number.parseInt(stock, 10);
      await upsertPortalProduct({
        supplier_sku: sku.trim(),
        supplier_title: title.trim(),
        supplier_price: priceValue,
        supplier_stock: Number.isFinite(stockValue) ? stockValue : undefined,
        stock_status: status,
        lead_time_days: Number.parseInt(lead, 10) || undefined,
        min_order_qty: Number.parseInt(moq, 10) || undefined,
      });
      toast.success(product ? "Product updated" : "Product added");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[420px] max-w-[92vw] flex-col p-0">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{product ? "Update product" : "Add product"}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Your buyer sees these details when ordering.
          </p>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <Field label="Your SKU">
            <Input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="rounded-none"
              disabled={Boolean(product)}
            />
          </Field>
          <Field label="Product title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-none" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price">
              <Input
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="rounded-none"
              />
            </Field>
            <Field label="Stock on hand">
              <Input
                type="number"
                min={0}
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                placeholder="Optional"
                className="rounded-none"
              />
            </Field>
          </div>
          <Field label="Availability">
            <FilterSelect
              value={status}
              onChange={setStatus}
              width="w-full"
              ariaLabel="Availability"
              options={[
                { value: "in_stock", label: "In stock" },
                { value: "low", label: "Low" },
                { value: "out", label: "Out of stock" },
                { value: "unknown", label: "Unknown" },
              ]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Lead time (days)">
              <Input
                type="number"
                min={0}
                value={lead}
                onChange={(e) => setLead(e.target.value)}
                className="rounded-none"
              />
            </Field>
            <Field label="Min order qty">
              <Input
                type="number"
                min={1}
                value={moq}
                onChange={(e) => setMoq(e.target.value)}
                className="rounded-none"
              />
            </Field>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={blocked || saving} onClick={() => void submit()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MapDrawer({
  open,
  onOpenChange,
  product,
  onMapped,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  product: PortalProduct | null;
  onMapped: () => void;
}) {
  const [items, setItems] = useState<PortalItem[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchPortalItems();
        if (!cancelled) setItems(res.data);
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items.slice(0, 60);
    return items.filter((i) => `${i.sku} ${i.name}`.toLowerCase().includes(q)).slice(0, 60);
  }, [items, search]);

  const submit = async () => {
    if (!product || !selected) return;
    setSaving(true);
    try {
      await mapPortalProduct(product.id, selected);
      toast.success("Mapped to buyer item");
      onOpenChange(false);
      onMapped();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Mapping failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[420px] max-w-[92vw] flex-col p-0">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Map to buyer item</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {product ? `${product.supplier_sku} — ${product.supplier_title}` : ""}
          </p>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search buyer SKU or name…"
              className="rounded-none pl-7"
            />
          </div>
          <div className="max-h-[380px] overflow-y-auto border border-border">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                No items match
              </p>
            ) : (
              filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelected(item.id)}
                  className={cn(
                    "flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11px] hover:bg-muted",
                    selected === item.id && "bg-muted font-medium",
                  )}
                >
                  <span className="w-[140px] shrink-0 truncate font-mono">{item.sku}</span>
                  <span className="truncate text-muted-foreground">{item.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={!selected || saving} onClick={() => void submit()}>
            {saving ? "Mapping…" : "Map item"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function PortalCatalogPage() {
  const [products, setProducts] = useState<PortalProduct[]>([]);
  const [meta, setMeta] = useState({ count: 0, mapped: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editTarget, setEditTarget] = useState<PortalProduct | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [mapTarget, setMapTarget] = useState<PortalProduct | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchPortalProducts(search.trim() || undefined);
      setProducts(res.data);
      setMeta(res.meta);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load your catalog");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PortalChrome>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-sm font-semibold">My catalog</h1>
        <span className="text-[11px] text-muted-foreground">
          {meta.count} products · {meta.mapped} mapped
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 rounded-none"
          aria-label="Refresh"
          onClick={() => void load()}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
        <div className="relative ml-auto w-[220px]">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your products…"
            className="rounded-none pl-7"
          />
        </div>
        <Button
          size="sm"
          className="rounded-none"
          onClick={() => {
            setEditTarget(null);
            setEditOpen(true);
          }}
        >
          <Plus className="mr-1 h-3 w-3" /> Add product
        </Button>
      </div>

      <div className="border border-border">
        {loading ? (
          <p className="px-3 py-6 text-xs text-muted-foreground">Loading…</p>
        ) : products.length === 0 ? (
          <div className="px-3 py-10 text-center">
            <Link2 className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden />
            <p className="mt-2 text-sm font-medium">No products yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add what you supply so your buyer can order it.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-xs">
              <thead className="border-b border-border bg-muted/40 text-left text-[11px] text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 font-medium">Your SKU</th>
                  <th className="px-3 py-1.5 font-medium">Product</th>
                  <th className="px-3 py-1.5 text-right font-medium">Price</th>
                  <th className="px-3 py-1.5 text-right font-medium">Stock</th>
                  <th className="px-3 py-1.5 font-medium">Availability</th>
                  <th className="px-3 py-1.5 text-right font-medium">Lead</th>
                  <th className="px-3 py-1.5 font-medium">Buyer item</th>
                  <th className="px-3 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-1.5 font-mono text-[11px]">{p.supplier_sku}</td>
                    <td className="max-w-[220px] truncate px-3 py-1.5">{p.supplier_title}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {money(p.supplier_price, p.currency)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {p.supplier_stock ?? "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-none text-[10px]",
                          STOCK_TONE[p.stock_status] ?? STOCK_TONE.unknown,
                        )}
                      >
                        {p.stock_status.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{p.lead_time_days}d</td>
                    <td className="px-3 py-1.5">
                      {p.mapped_item_sku ? (
                        <span className="font-mono text-[11px]">{p.mapped_item_sku}</span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 rounded-none text-[11px]"
                          onClick={() => setMapTarget(p)}
                        >
                          Map
                        </Button>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 rounded-none text-[11px]"
                        onClick={() => {
                          setEditTarget(p);
                          setEditOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ProductDrawer
        key={`edit:${editTarget?.id ?? "new"}:${editOpen}`}
        open={editOpen}
        onOpenChange={setEditOpen}
        product={editTarget}
        onSaved={load}
      />
      <MapDrawer
        key={`map:${mapTarget?.id ?? "none"}`}
        open={!!mapTarget}
        onOpenChange={(o) => !o && setMapTarget(null)}
        product={mapTarget}
        onMapped={load}
      />
    </PortalChrome>
  );
}
