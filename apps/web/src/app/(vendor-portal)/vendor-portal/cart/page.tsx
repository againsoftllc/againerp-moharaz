"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw, Search, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LineNumericInput } from "@/components/sales/sales-order-line-row-cells";
import { VendorPortalChrome } from "@/components/vendor-portal/vendor-portal-chrome";
import {
  fetchVendorPortalCart,
  fetchVendorPortalCredit,
  fetchVendorPortalProducts,
  setVendorPortalCartItem,
  submitVendorPortalCart,
  type VendorPortalCart,
  type VendorPortalCreditSummary,
  type VendorPortalProduct,
} from "@/lib/api/vendor-portal";
import { cn, formatMoney } from "@/lib/utils";

function money(value: string | number) {
  return formatMoney(value);
}

export default function VendorPortalCartPage() {
  const router = useRouter();
  const [cart, setCart] = useState<VendorPortalCart | null>(null);
  const [loading, setLoading] = useState(true);
  const [credit, setCredit] = useState<VendorPortalCreditSummary | null>(null);

  const [itemQuery, setItemQuery] = useState("");
  const [itemMatches, setItemMatches] = useState<VendorPortalProduct[]>([]);

  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [localQty, setLocalQty] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cartRes, creditRes] = await Promise.all([fetchVendorPortalCart(), fetchVendorPortalCredit()]);
      setCart(cartRes);
      setLocalQty(Object.fromEntries(cartRes.lines.map((l) => [l.item_id, l.quantity])));
      setCredit(creditRes);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load your cart");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (itemQuery.trim().length >= 2) {
        void fetchVendorPortalProducts({ search: itemQuery, limit: 8 }).then((res) =>
          setItemMatches(res.data.filter((p) => p.item_id && p.orderable)),
        );
      } else {
        setItemMatches([]);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [itemQuery]);

  async function commitQuantity(itemId: string, quantity: number) {
    try {
      const next = await setVendorPortalCartItem(itemId, quantity);
      setCart(next);
      setLocalQty(Object.fromEntries(next.lines.map((l) => [l.item_id, l.quantity])));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update quantity");
      void load();
    }
  }

  function scheduleQuantityUpdate(itemId: string, quantity: number) {
    setLocalQty((prev) => ({ ...prev, [itemId]: quantity }));
    clearTimeout(debounceTimers.current[itemId]);
    debounceTimers.current[itemId] = setTimeout(() => void commitQuantity(itemId, quantity), 450);
  }

  async function removeLine(itemId: string) {
    clearTimeout(debounceTimers.current[itemId]);
    await commitQuantity(itemId, 0);
  }

  async function addItem(p: VendorPortalProduct) {
    if (!p.item_id) return;
    const existing = cart?.lines.find((l) => l.item_id === p.item_id);
    const nextQty = (existing?.quantity ?? 0) + p.min_order_quantity;
    setItemQuery("");
    setItemMatches([]);
    await commitQuantity(p.item_id, nextQty);
  }

  const blocked = useMemo(() => {
    if (!cart || cart.lines.length === 0) return true;
    if (cart.has_blocking_issues) return true;
    return false;
  }, [cart]);

  async function submit() {
    if (!cart || blocked) return;
    setSubmitting(true);
    try {
      const orderRequest = await submitVendorPortalCart({
        notes: notes || undefined,
        delivery_address: deliveryAddress || undefined,
        requested_delivery_date: deliveryDate || undefined,
      });
      toast.success(`Order request ${orderRequest.order_request_number} submitted`);
      router.push("/vendor-portal/order-requests");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit your order");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <VendorPortalChrome>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-sm font-semibold">Cart</h1>
        <span className="text-[11px] text-muted-foreground">{cart?.lines.length ?? 0} lines</span>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 rounded-none"
          aria-label="Refresh"
          onClick={() => void load()}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={itemQuery}
          onChange={(e) => setItemQuery(e.target.value)}
          placeholder="Search products to add…"
          className="rounded-none pl-7"
        />
        {itemMatches.length > 0 && (
          <div className="absolute z-10 mt-0.5 w-full border border-border bg-popover shadow-md">
            {itemMatches.map((p) => (
              <button
                key={p.id}
                type="button"
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-muted"
                onClick={() => void addItem(p)}
              >
                <span>
                  <span className="font-mono text-[11px]">{p.sku}</span>{" "}
                  <span className="text-muted-foreground">{p.name}</span>
                </span>
                <span className="tabular-nums">{money(p.unit_price)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <p className="border border-border px-3 py-6 text-xs text-muted-foreground">Loading…</p>
      ) : !cart || cart.lines.length === 0 ? (
        <div className="border border-border px-3 py-10 text-center">
          <ShoppingCart className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm font-medium">Your cart is empty</p>
          <p className="mt-1 text-xs text-muted-foreground">Search above or browse the catalog to add products.</p>
        </div>
      ) : (
        <>
          <div className="border border-border">
            <table className="w-full text-xs" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col />
                <col style={{ width: "96px" }} />
                <col style={{ width: "110px" }} />
                <col style={{ width: "110px" }} />
                <col style={{ width: "36px" }} />
              </colgroup>
              <thead className="border-b border-border bg-muted/40 text-left text-[11px] text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 font-medium">Item</th>
                  <th className="px-3 py-1.5 text-right font-medium">Qty</th>
                  <th className="px-3 py-1.5 text-right font-medium">Unit price</th>
                  <th className="px-3 py-1.5 text-right font-medium">Line total</th>
                  <th className="px-3 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {cart.lines.map((l) => (
                  <tr key={l.item_id} className={cn("border-b border-border last:border-b-0", l.issue && "bg-red-500/5")}>
                    <td className="px-3 py-1.5">
                      <div className="font-mono text-[11px]">{l.sku}</div>
                      <div className="truncate text-muted-foreground">{l.name}</div>
                      {l.issue && (
                        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-red-600 dark:text-red-400">
                          <AlertTriangle className="h-3 w-3" /> {l.issue}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <LineNumericInput
                        value={localQty[l.item_id] ?? l.quantity}
                        min={0}
                        onChange={(next) => scheduleQuantityUpdate(l.item_id, next)}
                        className="w-full border border-input bg-transparent px-1.5 py-0.5 text-right text-[11px] outline-none focus:border-primary"
                        steppers
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{money(l.unit_price)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">{money(l.line_total)}</td>
                    <td className="px-3 py-1.5 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-none"
                        aria-label="Remove"
                        onClick={() => void removeLine(l.item_id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-2 flex items-center justify-between border border-border px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              {cart.min_order_quantity > 1 ? `Minimum order quantity: ${cart.min_order_quantity}` : ""}
            </span>
            <span className="font-medium">Subtotal: {money(cart.subtotal)}</span>
          </div>

          {credit && Number(credit.available_credit) < Number(cart.subtotal) && (
            <div className="mt-2 border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              This order may exceed your available credit ({money(credit.available_credit)} available). It can
              still be submitted for admin review.
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="vp-delivery-date">Requested delivery date</Label>
              <Input
                id="vp-delivery-date"
                type="date"
                className="rounded-none"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="vp-delivery-address">Delivery address</Label>
              <Input
                id="vp-delivery-address"
                className="rounded-none"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3">
            <Label htmlFor="vp-notes">Note to your buyer</Label>
            <Textarea id="vp-notes" rows={2} className="rounded-none" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="mt-4 border-t border-border pt-4">
            <Button className="rounded-none" disabled={blocked || submitting} onClick={() => void submit()}>
              {submitting ? "Submitting…" : "Submit order request"}
            </Button>
            {cart.has_blocking_issues && (
              <p className="mt-1.5 text-[11px] text-red-600 dark:text-red-400">
                Resolve the flagged lines above before submitting.
              </p>
            )}
          </div>
        </>
      )}
    </VendorPortalChrome>
  );
}
