"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AgainDrawerButton, AgainDrawerSwitch } from "@/components/again/again-drawer";
import { ProductSearchAdd } from "@/components/products/product-search-add";
import { searchCatalogProducts } from "@/lib/api/catalog-products";
import { fetchProductRelations, saveProductRelations, type ApiProductRelation } from "@/lib/api/product-masters";
import { formatCurrency } from "@/lib/utils";
import { PanelMessage } from "./drawer-shared";

type Pickable = { id: string; sku: string; name: string; price?: number };

/** Related and spare products (OnerERP RelatedOrSpareProduct): related ones are shown alongside, spares are parts RMA uses. */
export function ProductRelationsPanel({ productId, canWrite }: { productId: string; canWrite: boolean }) {
  const [rows, setRows] = useState<ApiProductRelation[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"related" | "spare">("related");
  const [items, setItems] = useState<Pickable[]>([]);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchProductRelations(productId)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load related products"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const search = (query: string) => {
    if (query.trim().length < 2) return setItems([]);
    void searchCatalogProducts(query.trim(), 20)
      .then((list) => setItems(list.filter((p) => p.id !== productId).map((p) => ({ id: p.id, sku: p.sku, name: p.name, price: p.price }))))
      .catch(() => undefined);
  };

  const add = (p: { id?: string; sku: string; name: string; price?: number }) => {
    const full = items.find((i) => i.sku === p.sku) ?? p;
    if (!full.id || full.id === productId) return;
    if (rows.some((r) => r.related_product_id === full.id && r.kind === kind)) return;
    setRows((list) => [...list, { related_product_id: full.id!, kind, note: null, sku: full.sku, name: full.name, price: full.price != null ? String(full.price) : null }]);
    setDirty(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      const saved = await saveProductRelations(
        productId,
        rows.map((r) => ({ related_product_id: r.related_product_id, kind: r.kind, note: r.note })),
      );
      setRows(saved);
      setDirty(false);
      toast.success("Related products saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PanelMessage title="Loading related products…" />;
  return (
    <div ref={setHost} className="space-y-3 p-4">
      {canWrite ? (
        <div className="flex flex-wrap items-center gap-2">
          <AgainDrawerSwitch
            label="Add as"
            value={kind}
            onChange={setKind}
            options={[
              { value: "related", label: "Related" },
              { value: "spare", label: "Spare part" },
            ]}
          />
          <div className="min-w-[260px] flex-1">
            <ProductSearchAdd items={items} portalHost={host} onPick={add} onQueryChange={search} />
          </div>
          <AgainDrawerButton variant="primary" onClick={() => void save()} disabled={busy || !dirty}>
            Save
          </AgainDrawerButton>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <PanelMessage title="No related or spare products" hint="Related products are offered alongside this one; spare parts are what RMA can use on it." />
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/70 text-left text-[11px] text-muted-foreground">
              <th className="w-[90px] py-1.5 pr-2 font-semibold">Kind</th>
              <th className="py-1.5 pr-2 font-semibold">Product</th>
              <th className="w-[110px] py-1.5 pr-2 text-right font-semibold">Price</th>
              {canWrite ? <th className="w-8" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.kind}-${r.related_product_id}`} className="border-b border-border/40">
                <td className="py-1.5 pr-2 text-muted-foreground">{r.kind === "spare" ? "Spare part" : "Related"}</td>
                <td className="py-1.5 pr-2">
                  <span className="font-medium">{r.sku ?? ""}</span> <span className="text-muted-foreground">{r.name ?? r.related_product_id}</span>
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{r.price != null ? formatCurrency(Number(r.price)) : "—"}</td>
                {canWrite ? (
                  <td className="py-1.5 text-right">
                    <button
                      type="button"
                      className="p-1 text-muted-foreground hover:text-destructive"
                      aria-label="Remove"
                      onClick={() => {
                        setRows((list) => list.filter((x) => x !== r));
                        setDirty(true);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
