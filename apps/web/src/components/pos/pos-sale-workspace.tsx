"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Trash2, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  addPosLine,
  browsePosProducts,
  clearPosCart,
  completePosCart,
  fetchActiveCart,
  fetchPosCategories,
  fetchPosSerials,
  fetchPosSession,
  fetchPosSettings,
  fetchPosTerminals,
  fetchPosWarehouses,
  holdPosCart,
  openPosSession,
  readStoredPosSessionId,
  removePosLine,
  scanPosBarcode,
  searchPosProducts,
  setPosCustomer,
  setPosOrderDiscount,
  storePosSessionId,
  updatePosLine,
  type PosCart,
  type PosProduct,
  type PosReceipt,
  type PosSession,
  type PosSettings,
  type PosTerminal,
} from "@/lib/api/pos";
import {
  apiFetch,
} from "@/lib/api/client";
import { createCommerceCustomer, type ApiCustomerListResponse } from "@/lib/api/commerce-customers";
import { usePermission } from "@/lib/auth/permissions";
import { cn, formatCurrency } from "@/lib/utils";
import { PosReceiptView } from "@/components/pos/pos-receipt-print";

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  bank: "Bank",
  mobile_banking: "Mobile Banking",
  other: "Other",
};

function money(value: string | number) {
  return formatCurrency(Number(value || 0));
}

const CART_WIDTH_KEY = "againerp-pos-cart-width";
const CART_MIN = 240;
const CART_MAX = 720;
const CART_DEFAULT = 320;

export function PosSaleWorkspace() {
  const canWrite = usePermission("pos", "write") || usePermission("pos", "create");
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const [cartWidth, setCartWidth] = useState(CART_DEFAULT);
  const [cartDragging, setCartDragging] = useState(false);
  const [session, setSession] = useState<PosSession | null>(null);
  const [settings, setSettings] = useState<PosSettings | null>(null);
  const [terminals, setTerminals] = useState<PosTerminal[]>([]);
  const [cart, setCart] = useState<PosCart | null>(null);
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [serialOpen, setSerialOpen] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<PosProduct | null>(null);
  const [serials, setSerials] = useState<{ id: string; serial_number: string }[]>([]);
  const [receipt, setReceipt] = useState<PosReceipt | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<{ id: string; name: string; phone: string; email: string }[]>([]);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "" });
  const [orderDiscount, setOrderDiscount] = useState("");
  const [payments, setPayments] = useState<{ method: string; amount: string }[]>([{ method: "cash", amount: "" }]);
  const [openForm, setOpenForm] = useState({
    terminal_id: "",
    warehouse_id: "",
    opening_float: "0",
    opening_note: "",
  });

  const warehouseId = session?.warehouse_id || openForm.warehouse_id;

  const loadSession = useCallback(async () => {
    const stored = readStoredPosSessionId();
    const [settingRow, terminalRows, warehouseRows] = await Promise.all([
      fetchPosSettings().catch(() => null),
      fetchPosTerminals("active").catch(() => []),
      fetchPosWarehouses().catch(() => []),
    ]);
    if (settingRow) setSettings(settingRow);
    setTerminals(terminalRows);
    setWarehouses(warehouseRows);
    if (!stored) {
      setSession(null);
      setCart(null);
      return;
    }
    try {
      const row = await fetchPosSession(stored);
      if (row.status !== "open") {
        storePosSessionId(null);
        setSession(null);
        setCart(null);
        return;
      }
      setSession(row);
      setCart(await fetchActiveCart(row.id));
    } catch {
      storePosSessionId(null);
      setSession(null);
      setCart(null);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    if (!warehouseId) return;
    const rows = await browsePosProducts({
      warehouseId,
      category: category === "all" ? undefined : category,
      q: query.trim() || undefined,
    });
    setProducts(rows);
  }, [warehouseId, category, query]);

  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(CART_WIDTH_KEY));
      if (Number.isFinite(saved) && saved >= CART_MIN && saved <= CART_MAX) setCartWidth(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        await loadSession();
        setCategories(await fetchPosCategories().catch(() => []));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load POS");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadSession]);

  useEffect(() => {
    if (session) void loadProducts();
  }, [session, loadProducts]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (event.key === "F4") {
        event.preventDefault();
        setCustomerOpen(true);
      }
      if (event.key === "F6") {
        event.preventDefault();
        void onHold();
      }
      if (event.key === "F8") {
        event.preventDefault();
        if (cart?.lines.length) setPayOpen(true);
      }
      if (event.key === "F9" && payOpen) {
        event.preventDefault();
        void onPay();
      }
      if (event.key === "Escape") {
        setPayOpen(false);
        setCustomerOpen(false);
        setSerialOpen(false);
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedLineId && document.activeElement?.tagName !== "INPUT") {
        event.preventDefault();
        void onRemove(selectedLineId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function refreshCart() {
    if (!session) return;
    setCart(await fetchActiveCart(session.id));
  }

  async function onOpenSession() {
    setBusy(true);
    try {
      const row = await openPosSession({
        terminal_id: openForm.terminal_id || undefined,
        warehouse_id: openForm.terminal_id ? undefined : openForm.warehouse_id,
        opening_float: Number(openForm.opening_float || 0),
        opening_note: openForm.opening_note || undefined,
      });
      storePosSessionId(row.id);
      setSession(row);
      setCart(await fetchActiveCart(row.id));
      toast.success("Session opened");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open session");
    } finally {
      setBusy(false);
    }
  }

  async function addProduct(product: PosProduct, serial?: string) {
    if (!cart) return;
    if (product.track_serial && !serial) {
      setPendingProduct(product);
      try {
        setSerials(await fetchPosSerials(product.item_id, warehouseId));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No serials available");
        return;
      }
      setSerialOpen(true);
      return;
    }
    setBusy(true);
    try {
      const next = await addPosLine(cart.id, {
        item_id: product.item_id,
        quantity: 1,
        tax_rate: settings?.default_tax_rate ?? 0,
        serial_number: serial,
      });
      setCart(next);
      setQuery("");
      searchRef.current?.focus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add product");
    } finally {
      setBusy(false);
    }
  }

  async function onSearchSubmit(event: React.FormEvent) {
    event.preventDefault();
    const code = query.trim();
    if (!code || !warehouseId || !cart) return;
    setBusy(true);
    try {
      try {
        const scanned = await scanPosBarcode(code, warehouseId);
        await addProduct(scanned, scanned.scanned_serial || undefined);
        return;
      } catch {
        /* fall through to name search */
      }
      const rows = await searchPosProducts(code, warehouseId);
      setProducts(rows);
      if (rows.length === 1 && !rows[0].track_serial) {
        await addProduct(rows[0]);
      } else if (rows.length === 0) {
        toast.error("Product not found");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Product not found");
    } finally {
      setBusy(false);
    }
  }

  async function onQty(lineId: string, quantity: number) {
    try {
      setCart(await updatePosLine(lineId, { quantity }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update quantity");
    }
  }

  async function onRemove(lineId: string) {
    try {
      await removePosLine(lineId);
      await refreshCart();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove line");
    }
  }

  async function onHold() {
    if (!cart?.lines.length) return;
    try {
      await holdPosCart(cart.id);
      await refreshCart();
      toast.success("Order held");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not hold order");
    }
  }

  async function onClear() {
    if (!cart) return;
    try {
      setCart(await clearPosCart(cart.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not clear cart");
    }
  }

  async function searchCustomers(value: string) {
    setCustomerQuery(value);
    if (!value.trim()) {
      setCustomers([]);
      return;
    }
    const res = await apiFetch<ApiCustomerListResponse>(
      `/api/v1/commerce/customers?search=${encodeURIComponent(value.trim())}`,
      { cache: "no-store" },
    );
    setCustomers(
      res.data.slice(0, 12).map((row) => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
        email: row.email,
      })),
    );
  }

  async function chooseCustomer(id: string | null) {
    if (!cart) return;
    try {
      setCart(await setPosCustomer(cart.id, id));
      setCustomerOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not set customer");
    }
  }

  async function createCustomer() {
    if (!newCustomer.name.trim()) return;
    try {
      const created = await createCommerceCustomer({
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim(),
      });
      await chooseCustomer(created.id);
      setNewCustomer({ name: "", phone: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create customer");
    }
  }

  async function applyDiscount() {
    if (!cart) return;
    try {
      setCart(await setPosOrderDiscount(cart.id, Number(orderDiscount || 0)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not apply discount");
    }
  }

  const due = Number(cart?.total || 0);
  const paid = payments.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const change = Math.max(paid - due, 0);

  async function onPay() {
    if (!cart) return;
    const rows = payments
      .filter((row) => Number(row.amount) > 0)
      .map((row) => ({ payment_method: row.method, amount: Number(row.amount) }));
    if (!rows.length) {
      toast.error("Payment amount is insufficient");
      return;
    }
    setBusy(true);
    try {
      const result = await completePosCart(cart.id, rows, crypto.randomUUID());
      setReceipt(result.receipt);
      setPayOpen(false);
      setCart(await fetchActiveCart(session!.id));
      toast.success("Sale completed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment processing failed");
    } finally {
      setBusy(false);
    }
  }

  const customerName = useMemo(() => {
    if (!cart?.customer_id) return "Walk-in";
    const match = customers.find((c) => c.id === cart.customer_id);
    return match?.name || "Customer";
  }, [cart?.customer_id, customers]);

  function startCartResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    setCartDragging(true);
    const onMove = (ev: PointerEvent) => {
      const box = splitRef.current?.getBoundingClientRect();
      if (!box) return;
      const max = Math.min(CART_MAX, Math.max(CART_MIN, box.width - 280));
      const next = Math.min(Math.max(box.right - ev.clientX, CART_MIN), max);
      setCartWidth(next);
    };
    const onUp = (ev: PointerEvent) => {
      try {
        handle.releasePointerCapture(ev.pointerId);
      } catch {
        /* already released */
      }
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setCartDragging(false);
      setCartWidth((width) => {
        try {
          window.localStorage.setItem(CART_WIDTH_KEY, String(width));
        } catch {
          /* ignore */
        }
        return width;
      });
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  }

  if (loading) {
    return <p className="p-4 text-sm text-muted-foreground">Loading POS…</p>;
  }

  if (!session) {
    return (
      <div className="mx-auto w-full max-w-lg p-4">
        <h1 className="text-sm font-semibold">Open POS session</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Opening cash is recorded on this drawer. Sales deduct inventory from the terminal warehouse.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <Label>Terminal</Label>
            <select
              className="mt-1 flex h-8 w-full rounded-none border border-input bg-background px-2.5 text-xs"
              value={openForm.terminal_id}
              onChange={(e) => setOpenForm((s) => ({ ...s, terminal_id: e.target.value }))}
            >
              <option value="">Select terminal (or warehouse below)</option>
              {terminals.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} ({row.code})
                </option>
              ))}
            </select>
          </div>
          {!openForm.terminal_id ? (
            <div>
              <Label>Warehouse</Label>
              <select
                className="mt-1 flex h-8 w-full rounded-none border border-input bg-background px-2.5 text-xs"
                value={openForm.warehouse_id}
                onChange={(e) => setOpenForm((s) => ({ ...s, warehouse_id: e.target.value }))}
              >
                <option value="">Select warehouse</option>
                {warehouses.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <Label>Opening cash</Label>
            <Input
              className="mt-1"
              type="number"
              min={0}
              value={openForm.opening_float}
              onChange={(e) => setOpenForm((s) => ({ ...s, opening_float: e.target.value }))}
            />
          </div>
          <div>
            <Label>Opening note</Label>
            <Input
              className="mt-1"
              value={openForm.opening_note}
              onChange={(e) => setOpenForm((s) => ({ ...s, opening_note: e.target.value }))}
            />
          </div>
          <Button type="button" className="rounded-none" disabled={busy || (!openForm.terminal_id && !openForm.warehouse_id)} onClick={() => void onOpenSession()}>
            Open session
          </Button>
        </div>
      </div>
    );
  }

  if (receipt) {
    return (
      <div className="mx-auto w-full max-w-md p-4">
        <PosReceiptView
          receipt={receipt}
          onNewSale={() => {
            setReceipt(null);
            searchRef.current?.focus();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-2 py-1 text-[11px]">
        <span className="border border-border px-2 py-0.5">{session.register_name}</span>
        <span className="text-muted-foreground">{session.cashier_name}</span>
        <span className="text-muted-foreground">{cart?.cart_number}</span>
        <button type="button" className="ml-auto inline-flex items-center gap-1 border border-border px-2 py-0.5" onClick={() => setCustomerOpen(true)}>
          <UserRound className="h-3 w-3" />
          {customerName}
        </button>
      </div>

      <div ref={splitRef} className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col border-r border-border">
          <form className="flex shrink-0 items-stretch gap-1 border-b border-border px-2 py-1" onSubmit={(e) => void onSearchSubmit(e)}>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-7 w-[180px] shrink-0 rounded-none" aria-label="Category filter">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value="all" className="rounded-none">
                  All categories
                </SelectItem>
                {categories.map((name) => (
                  <SelectItem key={name} value={name} className="rounded-none">
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Scan barcode / serial or search name / SKU (F2)"
              className="h-7 flex-1"
              autoComplete="off"
            />
            <Button type="submit" className="h-7 rounded-none px-3" disabled={busy}>
              Add
            </Button>
          </form>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {products.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground">No products in this view. Search or scan a barcode.</p>
            ) : (
              <div className="grid grid-cols-5 gap-2">
                {products.map((product) => (
                  <button
                    key={product.item_id}
                    type="button"
                    disabled={!canWrite}
                    className="flex h-full flex-col border border-border bg-background p-1.5 text-left hover:bg-muted/30"
                    onClick={() => void addProduct(product)}
                  >
                    <div className="mb-1.5 flex aspect-square w-full shrink-0 items-center justify-center overflow-hidden border border-border bg-muted/20">
                      {product.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.thumbnail} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <span className="px-1 text-center text-[10px] text-muted-foreground">{product.name}</span>
                      )}
                    </div>
                    <p className="min-h-0 flex-1 line-clamp-2 text-[11px] font-medium leading-tight">{product.name}</p>
                    <p className="mt-auto flex items-baseline justify-between gap-2 pt-1 text-xs">
                      <span className="font-semibold tabular-nums">{money(product.unit_price)}</span>
                      <span className="text-[10px] text-muted-foreground">Stock {product.available}</span>
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside
          className="relative flex min-h-0 w-full shrink-0 flex-col border-t border-border max-lg:!w-full lg:border-t-0"
          style={{ width: cartWidth }}
        >
          <div
            aria-hidden
            role="separator"
            title="Drag to resize"
            onPointerDown={startCartResize}
            className="absolute inset-y-0 left-0 z-20 hidden w-3 cursor-col-resize touch-none items-center justify-center lg:flex"
          >
            <span
              className={cn(
                "h-10 w-1 rounded-none bg-border transition-colors",
                cartDragging ? "bg-primary" : "hover:bg-primary/50",
              )}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {cart?.lines.length ? (
              <ul className="text-xs">
                {cart.lines.map((line) => {
                  const product = products.find((p) => p.item_id === line.item_id);
                  const thumbnail = line.thumbnail || product?.thumbnail;
                  const stock = line.available ?? product?.available;
                  return (
                  <li
                    key={line.id}
                    className={cn(
                      "flex items-start gap-2 border-b border-border px-2 py-1.5",
                      selectedLineId === line.id && "bg-accent",
                    )}
                    onClick={() => setSelectedLineId(line.id)}
                  >
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden border border-border bg-muted/20">
                      {thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumbnail} alt="" className="h-full w-full object-contain" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium" title={line.name}>{line.name}</p>
                      {line.serial_number ? (
                        <p className="truncate text-[10px] text-muted-foreground">{line.serial_number}</p>
                      ) : null}
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-muted-foreground">
                          Stock {stock ?? "—"}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="tabular-nums">{money(line.line_total)}</span>
                          <div className="inline-flex items-center border border-border">
                            <button type="button" className="p-1" onClick={() => void onQty(line.id, line.quantity - 1)}>
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-6 text-center tabular-nums">{line.quantity}</span>
                            <button type="button" className="p-1" onClick={() => void onQty(line.id, line.quantity + 1)}>
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          <button
                            type="button"
                            className="flex h-5 w-5 shrink-0 items-center justify-center"
                            onClick={() => void onRemove(line.id)}
                            aria-label="Remove"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                  );
                })}
              </ul>
            ) : (
              <p className="p-4 text-xs text-muted-foreground">Cart is empty. Scan or tap a product.</p>
            )}
          </div>
          <div className="shrink-0 border-t border-border p-3 text-xs">
            <div className="mb-2 flex items-center gap-1">
              <Input
                placeholder="Order discount"
                value={orderDiscount}
                onChange={(e) => setOrderDiscount(e.target.value)}
                className="h-8"
              />
              <Button type="button" size="sm" variant="outline" className="rounded-none" onClick={() => void applyDiscount()}>
                Apply
              </Button>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{money(Number(cart?.subtotal || 0) + Number(cart?.order_discount || 0))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span className="tabular-nums">{money(cart?.discount_total || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="tabular-nums">{money(cart?.tax_total || 0)}</span>
            </div>
            <div className="mt-1 flex justify-between text-sm font-semibold">
              <span>Grand total</span>
              <span className="tabular-nums">{money(cart?.total || 0)}</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1">
              <Button type="button" variant="outline" className="rounded-none" disabled={!cart?.lines.length} onClick={() => void onHold()}>
                Hold
              </Button>
              <Button type="button" variant="outline" className="rounded-none" disabled={!cart?.lines.length} onClick={() => void onClear()}>
                Clear
              </Button>
              <Button type="button" className="rounded-none" disabled={!cart?.lines.length || !canWrite} onClick={() => setPayOpen(true)}>
                Pay
              </Button>
            </div>
          </div>
        </aside>
      </div>

      <Sheet open={customerOpen} onOpenChange={setCustomerOpen}>
        <SheetContent resizable className="min-w-[280px] w-[380px] max-w-[720px] rounded-none p-0" title="Customer">
          <SheetHeader className="border-b border-border px-3 py-2">
            <SheetTitle className="text-sm">Customer</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 p-3">
            <Button type="button" variant="outline" className="w-full rounded-none" onClick={() => void chooseCustomer(null)}>
              Walk-in customer
            </Button>
            <Input
              placeholder="Search name, phone, email"
              value={customerQuery}
              onChange={(e) => void searchCustomers(e.target.value)}
            />
            <div className="max-h-48 overflow-auto border border-border">
              {customers.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="block w-full border-b border-border px-2 py-1.5 text-left text-xs last:border-b-0 hover:bg-muted/30"
                  onClick={() => void chooseCustomer(row.id)}
                >
                  <p className="font-medium">{row.name}</p>
                  <p className="text-[10px] text-muted-foreground">{row.phone || row.email}</p>
                </button>
              ))}
            </div>
            <div className="border-t border-border pt-3">
              <p className="mb-2 text-xs font-medium">Quick create</p>
              <Input placeholder="Name" value={newCustomer.name} onChange={(e) => setNewCustomer((s) => ({ ...s, name: e.target.value }))} />
              <Input className="mt-1" placeholder="Phone" value={newCustomer.phone} onChange={(e) => setNewCustomer((s) => ({ ...s, phone: e.target.value }))} />
              <Button type="button" className="mt-2 rounded-none" onClick={() => void createCustomer()}>
                Create customer
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={serialOpen} onOpenChange={setSerialOpen}>
        <SheetContent resizable className="min-w-[280px] w-[360px] max-w-[720px] rounded-none p-0" title="Serial">
          <SheetHeader className="border-b border-border px-3 py-2">
            <SheetTitle className="text-sm">Select serial / IMEI</SheetTitle>
          </SheetHeader>
          <div className="p-3">
            {serials.length === 0 ? (
              <p className="text-xs text-muted-foreground">No available serials for this product.</p>
            ) : (
              serials.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="mb-1 block w-full border border-border px-2 py-1.5 text-left text-xs hover:bg-muted/30"
                  onClick={() => {
                    if (pendingProduct) void addProduct(pendingProduct, row.serial_number);
                    setSerialOpen(false);
                  }}
                >
                  {row.serial_number}
                </button>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={payOpen} onOpenChange={setPayOpen}>
        <SheetContent resizable className="min-w-[280px] w-[420px] max-w-[720px] rounded-none p-0" title="Payment">
          <SheetHeader className="border-b border-border px-3 py-2">
            <SheetTitle className="text-sm">Payment</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 p-3 text-xs">
            <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{money(Number(cart?.subtotal || 0) + Number(cart?.order_discount || 0))}</span></div>
            <div className="flex justify-between"><span>Discount</span><span className="tabular-nums">{money(cart?.discount_total || 0)}</span></div>
            <div className="flex justify-between"><span>Tax</span><span className="tabular-nums">{money(cart?.tax_total || 0)}</span></div>
            <div className="flex justify-between text-sm font-semibold"><span>Grand total</span><span className="tabular-nums">{money(due)}</span></div>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(METHOD_LABEL).map(([id, label]) => (
                <Button
                  key={id}
                  type="button"
                  variant="outline"
                  className="rounded-none"
                  onClick={() => setPayments([{ method: id, amount: String(due) }])}
                >
                  {label}
                </Button>
              ))}
              <Button
                type="button"
                variant="outline"
                className="rounded-none"
                onClick={() =>
                  setPayments([
                    { method: "cash", amount: "" },
                    { method: "card", amount: "" },
                  ])
                }
              >
                Split payment
              </Button>
            </div>
            {payments.map((row, index) => (
              <div key={`${row.method}-${index}`} className="flex items-center gap-1">
                <select
                  className="h-8 rounded-none border border-input bg-background px-2 text-xs"
                  value={row.method}
                  onChange={(e) =>
                    setPayments((prev) => prev.map((item, i) => (i === index ? { ...item, method: e.target.value } : item)))
                  }
                >
                  {Object.entries(METHOD_LABEL).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  min={0}
                  value={row.amount}
                  onChange={(e) =>
                    setPayments((prev) => prev.map((item, i) => (i === index ? { ...item, amount: e.target.value } : item)))
                  }
                />
                {payments.length > 1 ? (
                  <button type="button" onClick={() => setPayments((prev) => prev.filter((_, i) => i !== index))}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            ))}
            <div className="flex justify-between"><span>Paid</span><span className="tabular-nums">{money(paid)}</span></div>
            <div className="flex justify-between"><span>Due</span><span className="tabular-nums">{money(Math.max(due - paid, 0))}</span></div>
            <div className="flex justify-between"><span>Change</span><span className="tabular-nums">{money(change)}</span></div>
            <Button type="button" className="w-full rounded-none" disabled={busy || paid < due} onClick={() => void onPay()}>
              Complete sale
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
