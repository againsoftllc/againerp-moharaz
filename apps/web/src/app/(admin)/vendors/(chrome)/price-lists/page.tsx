"use client";

import * as React from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/utils";
import {
  createVendorPriceList,
  deleteVendorPriceListItem,
  fetchVendorPriceListItems,
  fetchVendorPriceLists,
  searchItems,
  upsertVendorPriceListItem,
  type ItemOption,
  type VendorPriceList,
  type VendorPriceListItem,
} from "@/lib/api/vendors";

export default function VendorPriceListsPage() {
  const [priceLists, setPriceLists] = React.useState<VendorPriceList[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newCode, setNewCode] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const [active, setActive] = React.useState<VendorPriceList | null>(null);
  const [items, setItems] = React.useState<VendorPriceListItem[]>([]);
  const [itemsLoading, setItemsLoading] = React.useState(false);

  const [query, setQuery] = React.useState("");
  const [matches, setMatches] = React.useState<ItemOption[]>([]);
  const [picked, setPicked] = React.useState<ItemOption | null>(null);
  const [unitPrice, setUnitPrice] = React.useState("");
  const [minQty, setMinQty] = React.useState("1");
  const [maxQty, setMaxQty] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setPriceLists(await fetchVendorPriceLists());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load price lists");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const handle = setTimeout(() => {
      if (query.trim().length >= 2) void searchItems(query).then(setMatches);
      else setMatches([]);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  async function handleCreate() {
    if (!newCode.trim() || !newName.trim()) {
      toast.error("Code and name are required");
      return;
    }
    setSaving(true);
    try {
      await createVendorPriceList({ code: newCode.trim(), name: newName.trim() });
      toast.success("Price list created");
      setCreateOpen(false);
      setNewCode("");
      setNewName("");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create price list");
    } finally {
      setSaving(false);
    }
  }

  async function openItems(pl: VendorPriceList) {
    setActive(pl);
    setItemsLoading(true);
    try {
      setItems(await fetchVendorPriceListItems(pl.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load price list items");
    } finally {
      setItemsLoading(false);
    }
  }

  async function handleAddItem() {
    if (!active || !picked || !unitPrice.trim()) {
      toast.error("Pick an item and enter a price");
      return;
    }
    try {
      await upsertVendorPriceListItem(active.id, {
        item_id: picked.id,
        unit_price: Number(unitPrice),
        min_qty: minQty ? Number(minQty) : 1,
        max_qty: maxQty ? Number(maxQty) : null,
      });
      toast.success(`${picked.sku} priced`);
      setPicked(null);
      setQuery("");
      setUnitPrice("");
      setMinQty("1");
      setMaxQty("");
      void openItems(active);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add price");
    }
  }

  async function handleDeleteItem(row: VendorPriceListItem) {
    if (!active) return;
    try {
      await deleteVendorPriceListItem(active.id, row.id);
      void openItems(active);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove item");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div>
          <h1 className="text-base font-semibold">Vendor Price Lists</h1>
          <p className="text-xs text-muted-foreground">Named tiers (Dealer, Gold Dealer, Distributor…) with quantity-break pricing.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New Price List
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Price list</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {priceLists.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                  No price lists yet.
                </TableCell>
              </TableRow>
            )}
            {priceLists.map((pl) => (
              <TableRow key={pl.id} className="cursor-pointer" onClick={() => void openItems(pl)}>
                <TableCell>
                  <div className="font-medium">{pl.name}</div>
                  <div className="text-muted-foreground">{pl.code}</div>
                </TableCell>
                <TableCell>{pl.currency}</TableCell>
                <TableCell>
                  <Badge variant={pl.is_active ? "success" : "muted"}>{pl.is_active ? "Active" : "Inactive"}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* create price list */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" title="New price list" className="w-full max-w-sm overflow-y-auto">
          <h2 className="pr-8 text-base font-semibold">New Price List</h2>
          <div className="mt-4 space-y-3">
            <div>
              <Label htmlFor="pl_code">Code</Label>
              <Input id="pl_code" value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="gold_dealer_pricing" />
            </div>
            <div>
              <Label htmlFor="pl_name">Name</Label>
              <Input id="pl_name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Gold Dealer Pricing" />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreate()} disabled={saving}>
              Create
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* manage items in a price list */}
      <Sheet open={!!active} onOpenChange={(open) => !open && setActive(null)}>
        <SheetContent side="right" title={active?.name ?? "Price list items"} className="w-full max-w-lg overflow-y-auto">
          <h2 className="pr-8 text-base font-semibold">{active?.name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Add per-SKU prices with optional quantity breaks — the lowest-matching min qty wins.
          </p>

          <div className="relative mt-4 space-y-2 border border-input p-3">
            <Label>Add item price</Label>
            <Input
              value={picked ? `${picked.sku} — ${picked.name}` : query}
              onChange={(e) => {
                setPicked(null);
                setQuery(e.target.value);
              }}
              placeholder="Search SKU or product name…"
            />
            {!picked && matches.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-48 w-[calc(100%-1.5rem)] overflow-auto border border-input bg-background shadow-md">
                {matches.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-xs hover:bg-muted"
                    onClick={() => {
                      setPicked(m);
                      setMatches([]);
                    }}
                  >
                    <span className="font-medium">{m.sku}</span> — {m.name}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label htmlFor="unit_price">Unit price</Label>
                <Input id="unit_price" type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="min_qty">Min qty</Label>
                <Input id="min_qty" type="number" value={minQty} onChange={(e) => setMinQty(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="max_qty">Max qty</Label>
                <Input id="max_qty" type="number" value={maxQty} onChange={(e) => setMaxQty(e.target.value)} placeholder="∞" />
              </div>
            </div>
            <Button size="sm" onClick={() => void handleAddItem()} disabled={!picked || !unitPrice.trim()}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add price
            </Button>
          </div>

          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemsLoading && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {!itemsLoading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                      No prices yet.
                    </TableCell>
                  </TableRow>
                )}
                {items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">{row.sku}</div>
                      <div className="text-muted-foreground">{row.product_name}</div>
                    </TableCell>
                    <TableCell>
                      {row.min_qty}
                      {row.max_qty ? `–${row.max_qty}` : "+"}
                    </TableCell>
                    <TableCell>{formatMoney(row.unit_price)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => void handleDeleteItem(row)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
