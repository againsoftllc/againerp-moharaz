"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Lock, Plus, Search, ShieldCheck, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/shared/filter-select";
import {
  AGAIN_DRAWER_FIELD_SHEET_CLASS,
  AgainDrawerButton,
  AgainDrawerCloseButton,
  AgainDrawerControlBar,
  AgainDrawerLayout,
  AgainDrawerPanel,
  AgainDrawerScrollBody,
} from "@/components/again/again-drawer";
import {
  AGAIN_FORM_RECORD_TITLE_CLASS,
  AgainFormRow,
  AgainUnderlineInput,
  AgainUnderlineTextarea,
} from "@/components/again/again-form-sheet";
import {
  createRmaTicket,
  fetchPriorRmas,
  fetchRmaCustomerLock,
  fetchRmaStores,
  generateRmaSerials,
  searchRmaOrders,
  submitRmaForApproval,
  decideRmaComplaint,
  traceRmaSerial,
  RMA_STATUS_LABEL,
  WARRANTY_LABEL,
  WARRANTY_TONE,
  type OrderSearchHit,
  type OrderSearchLine,
  type RmaCustomerLock,
  type RmaPrior,
  type RmaSaleSource,
  type RmaStore,
  type RmaTrace,
} from "@/lib/api/rma";
import { ProductCombobox } from "@/components/products/product-combobox";
import { AgainPartnerDrawer } from "@/components/shared/again-partner-drawer";
import { detectCustomerCreateDraft, type CustomerCreateDraft } from "@/lib/sales/detect-customer-create-draft";
import { apiFetch } from "@/lib/api/client";
import { fetchCatalogProductDetail } from "@/lib/api/catalog-products";
import { apiCustomerToCustomer, buildCustomerQuery, type ApiCustomerListResponse } from "@/lib/api/commerce-customers";
import { fetchAuthUsers } from "@/lib/api/auth-users";
import { useCommerceSuppliers } from "@/lib/api/use-commerce-suppliers";
import { usePermission } from "@/lib/auth/permissions";
import { openRmaReceipt } from "@/lib/rma/rma-print";
import { lookupSerial, type SerialLookupResponse } from "@/lib/api/inventory-serials";
import { useDrawerDraft } from "@/lib/hooks/use-drawer-draft";
import { cn } from "@/lib/utils";

const MATCH_BY_LABEL: Record<string, string> = {
  invoice: "Invoice",
  order_number: "Order",
  phone: "Phone",
  serial: "Serial",
};

type Form = {
  query: string;
  orderNumber: string;
  /** the customer has no invoice to show: the product is picked from the catalogue instead of read off a sale */
  noInvoice: boolean;
  noInvoiceReason: string;
  /** without an invoice: sold before this ERP (old invoice + sale date measure the warranty) or not known at all */
  saleSource: Exclude<RmaSaleSource, "system">;
  previousInvoiceNo: string;
  previousSaleDate: string;
  /** units coming back on a claim without an invoice; with generated serials each unit opens its own claim */
  units: string;
  /** the serial(s) came from Generate: the unit has none of its own */
  serialGenerated: boolean;
  generatedSerials: string[];
  productId: string;
  customerId: string;
  sku: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  productName: string;
  serial: string;
  fault: string;
  accessories: string;
  condition: string;
  receivedBy: string;
  priority: string;
  rmaType: string;
  assignedUserId: string;
  storeId: string;
  promisedDate: string;
  chargeEstimate: string;
  diagnosisRequired: boolean;
  diagnosisReport: string;
  supplierId: string;
  supplierReason: string;
  remote: boolean;
};

const EMPTY: Form = {
  query: "",
  orderNumber: "",
  noInvoice: false,
  noInvoiceReason: "",
  saleSource: "unknown",
  previousInvoiceNo: "",
  previousSaleDate: "",
  units: "1",
  serialGenerated: false,
  generatedSerials: [],
  productId: "",
  customerId: "",
  sku: "",
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  productName: "",
  serial: "",
  fault: "",
  accessories: "",
  condition: "",
  receivedBy: "",
  priority: "normal",
  rmaType: "customer",
  assignedUserId: "",
  storeId: "",
  promisedDate: "",
  chargeEstimate: "",
  diagnosisRequired: false,
  diagnosisReport: "",
  supplierId: "",
  supplierReason: "",
  remote: false,
};

type DraftValues = {
  form: Form;
  selectedOrder: OrderSearchHit | null;
  selectedLineIds: string[];
  pickedSerials?: string[];
  returnQty?: Record<string, number>;
  scrollTop: number;
};

/** One unit coming back = one claim: a ticked serial, or a count of units on a line that has no serials. */
type ClaimUnit = { line: OrderSearchLine; serial: string; quantity: number };

const NO_OPEN_CLAIMS: Record<string, string> = {};

function pickDefaultLines(hit: OrderSearchHit): OrderSearchLine[] {
  if (hit.matched_serial) {
    const matched = hit.lines.filter((line) => line.serial_numbers.includes(hit.matched_serial!));
    if (matched.length) return matched;
  }
  if (hit.lines.length === 1) return hit.lines;
  return [];
}

/** Which serials start ticked: the one that found the order, or the only one there is — never a guess between several. */
function pickDefaultSerials(hit: OrderSearchHit, lines: OrderSearchLine[]): string[] {
  if (hit.matched_serial && lines.some((line) => line.serial_numbers.includes(hit.matched_serial!))) return [hit.matched_serial];
  return lines.length === 1 && lines[0].serial_numbers.length === 1 ? [lines[0].serial_numbers[0]] : [];
}

/** The claims a selection will open, in order-line order. A serial that is already on an open claim is left out. */
function claimUnitsFor(
  order: OrderSearchHit | null,
  lineIds: string[],
  picked: string[],
  returnQty: Record<string, number>,
  openBySerial: Record<string, string>,
): ClaimUnit[] {
  const units: ClaimUnit[] = [];
  const seen = new Set<string>();
  for (const line of order?.lines ?? []) {
    if (line.serial_numbers.length) {
      for (const serial of line.serial_numbers) {
        if (!picked.includes(serial) || openBySerial[serial] || seen.has(serial)) continue;
        seen.add(serial);
        units.push({ line, serial, quantity: 1 });
      }
    } else if (lineIds.includes(line.id)) {
      const wanted = returnQty[line.id] ?? 1;
      units.push({ line, serial: "", quantity: Math.min(Math.max(wanted, 1), Math.max(line.quantity, 1)) });
    }
  }
  return units;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 border-b border-border/80 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function WarrantyBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("rounded-none text-[10px]", WARRANTY_TONE[status as keyof typeof WARRANTY_TONE])}>
      {WARRANTY_LABEL[status as keyof typeof WARRANTY_LABEL] ?? status}
    </Badge>
  );
}

type FoundCustomer = { id: string; name: string; phone: string; email: string };

/**
 * Finds a saved customer by name, phone or email so the claim lands on the customer's own record. When nobody matches,
 * "Create" (or the + button) opens the customer form, as in a sales order, and the new customer is picked.
 */
function CustomerFind({ onPick, onCreate }: { onPick: (customer: FoundCustomer) => void; onCreate: (draft: CustomerCreateDraft) => void }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ query: string; rows: FoundCustomer[] } | null>(null);
  const typed = query.trim();

  useEffect(() => {
    if (typed.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void apiFetch<ApiCustomerListResponse>(`/api/v1/commerce/customers${buildCustomerQuery({ search: typed, limit: 8 })}`, { cache: "no-store" })
        .then((res) => {
          if (cancelled) return;
          const rows = res.data.map(apiCustomerToCustomer).map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email }));
          setResult({ query: typed, rows });
        })
        .catch(() => !cancelled && setResult({ query: typed, rows: [] }));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [typed]);

  const rows = result && result.query === typed ? result.rows : null;
  const create = () => {
    onCreate(detectCustomerCreateDraft(typed));
    setQuery("");
    setResult(null);
  };
  return (
    <div className="relative">
      <div className="flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <AgainUnderlineInput value={query} onChange={setQuery} placeholder="Type to find a customer…" inputClassName="pl-5" autoComplete="off" />
        </div>
        <button
          type="button"
          title="Add customer"
          aria-label="Add customer"
          onClick={create}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-none text-[#00a09d] hover:bg-[#00a09d]/10"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      {typed.length >= 2 && (
        <div className="absolute left-0 right-0 z-30 mt-0.5 max-h-56 overflow-y-auto border border-border bg-popover shadow-md">
          {rows === null ? (
            <p className="px-3 py-2 text-[11px] text-muted-foreground">Searching…</p>
          ) : rows.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-muted-foreground">No saved customer found.</p>
          ) : (
            rows.map((row) => (
              <button
                key={row.id}
                type="button"
                className="flex w-full flex-col items-start border-b border-border px-3 py-1.5 text-left last:border-b-0 hover:bg-accent"
                onClick={() => {
                  onPick(row);
                  setQuery("");
                  setResult(null);
                }}
              >
                <span className="text-xs">{row.name}</span>
                <span className="text-[11px] text-muted-foreground">{[row.phone, row.email].filter(Boolean).join(" · ") || "No contact saved"}</span>
              </button>
            ))
          )}
          {rows !== null && (
            <button type="button" className="flex w-full items-center gap-1.5 border-t border-border px-3 py-1.5 text-left text-xs text-[#00a09d] hover:bg-accent" onClick={create}>
              <Plus className="h-3.5 w-3.5" />
              Create &quot;{typed}&quot;
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Intake for a warranty claim, in the common drawer (docs/common/drawercommon.md): Open claim / Cancel on top, drag the left
 * edge to resize, and a half-typed claim is kept as a draft when the drawer is closed by accident. Looking the order up first
 * fills the customer in and tells you whether the unit is still covered before you accept it.
 */
export function RmaIntakeDrawer({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
}) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [hits, setHits] = useState<OrderSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderSearchHit | null>(null);
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [pickedSerials, setPickedSerials] = useState<string[]>([]);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [openClaims, setOpenClaims] = useState<{ orderId: string; bySerial: Record<string, string> } | null>(null);
  const [serialLookup, setSerialLookup] = useState<SerialLookupResponse | null>(null);
  const [checkingSerial, setCheckingSerial] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stores, setStores] = useState<RmaStore[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [trace, setTrace] = useState<RmaTrace | null>(null);
  const [prior, setPrior] = useState<RmaPrior[]>([]);
  const [overrideSupplier, setOverrideSupplier] = useState(false);
  const [customerLock, setCustomerLock] = useState<RmaCustomerLock | null>(null);
  const [generating, setGenerating] = useState(false);
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [customerDraft, setCustomerDraft] = useState<CustomerCreateDraft>({});
  const canOverride = usePermission("rma_override", "write");
  // the Approve permission on RMA (Workspace › Roles) decides the complaint itself; everyone else sends it for approval
  const holdsRmaApprove = usePermission("rma", "approve");
  const canApprove = usePermission("rma_approve", "write") || holdsRmaApprove;
  const { suppliers } = useCommerceSuppliers();
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const searchSeq = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<number | null>(null);
  const patch = (changes: Partial<Form>) => setForm((current) => ({ ...current, ...changes }));

  // a fresh form every time it opens — declared before the draft hook so a saved draft is put back after this reset
  useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setHits([]);
    setSearchOpen(false);
    setSelectedOrder(null);
    setSelectedLineIds([]);
    setPickedSerials([]);
    setReturnQty({});
    setSerialLookup(null);
    setTrace(null);
    setPrior([]);
    setOverrideSupplier(false);
    setPartnerOpen(false);
    let cancelled = false;
    void fetchRmaStores()
      .then((rows) => {
        if (cancelled) return;
        setStores(rows);
        // the receiving store defaults to the only (or first) RMA store
        setForm((current) => (current.storeId || !rows.length ? current : { ...current, storeId: rows[0].id }));
      })
      .catch(() => !cancelled && setStores([]));
    void fetchAuthUsers()
      .then((rows) => !cancelled && setUsers(rows.map((u) => ({ id: u.id, name: u.name || u.username }))))
      .catch(() => !cancelled && setUsers([]));
    return () => {
      cancelled = true;
    };
  }, [open]);

  // the receiving store is pre-selected on open, so it alone does not count as something typed
  const dirty = selectedOrder !== null || JSON.stringify({ ...form, storeId: "" }) !== JSON.stringify({ ...EMPTY, storeId: "" });
  const { saveDraftIfDirty, clear: clearDraft } = useDrawerDraft<DraftValues>({
    key: "rma:new",
    ready: open,
    dirty,
    getValues: () => ({
      form,
      selectedOrder,
      selectedLineIds,
      pickedSerials,
      returnQty,
      scrollTop: scrollRef.current?.scrollTop ?? 0,
    }),
    restore: (values) => {
      // the type and unit-location controls are gone, so a saved draft cannot carry a hidden value for them
      setForm({ ...EMPTY, ...values.form, rmaType: EMPTY.rmaType, remote: EMPTY.remote });
      setSelectedOrder(values.selectedOrder ?? null);
      setSelectedLineIds(values.selectedLineIds ?? []);
      setPickedSerials(values.pickedSerials ?? []);
      setReturnQty(values.returnQty ?? {});
      pendingScroll.current = values.scrollTop;
    },
    onDiscard: () => {
      setForm(EMPTY);
      setSelectedOrder(null);
      setSelectedLineIds([]);
      setPickedSerials([]);
      setReturnQty({});
    },
    label: "RMA",
  });

  // put the scroll position back after a draft is restored
  useEffect(() => {
    if (pendingScroll.current == null) return;
    const top = pendingScroll.current;
    pendingScroll.current = null;
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top }));
  }, [form]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!searchBoxRef.current?.contains(e.target as Node)) setSearchOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // supplier / purchase invoice and earlier claims, resolved from the serial as it is typed
  useEffect(() => {
    const serialNo = form.serial.trim();
    if (serialNo.length < 3) {
      setTrace(null);
      setPrior([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void traceRmaSerial(serialNo)
        .then((row) => !cancelled && setTrace(row))
        .catch(() => !cancelled && setTrace(null));
      void fetchPriorRmas({ serial: serialNo })
        .then((rows) => !cancelled && setPrior(rows))
        .catch(() => !cancelled && setPrior([]));
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form.serial]);

  useEffect(() => {
    const q = form.query.trim();
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    if (selectedOrder && q === selectedOrder.order_number) {
      setHits([]);
      setSearching(false);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchRmaOrders(q)
        .then((rows) => {
          if (seq !== searchSeq.current) return;
          setHits(rows);
          setSearchOpen(true);
        })
        .catch((err) => {
          if (seq !== searchSeq.current) return;
          setHits([]);
          toast.error(err instanceof Error ? err.message : "Order search failed");
        })
        .finally(() => {
          if (seq === searchSeq.current) setSearching(false);
        });
    }, 280);
    return () => window.clearTimeout(timer);
  }, [form.query, selectedOrder]);

  // serials of this order that already sit on an open claim cannot come back again until that claim is closed
  useEffect(() => {
    if (!selectedOrder) return;
    const serials = [...new Set(selectedOrder.lines.flatMap((line) => line.serial_numbers))].slice(0, 40);
    if (!serials.length) return;
    let cancelled = false;
    void (async () => {
      const bySerial: Record<string, string> = {};
      await Promise.all(
        serials.map(async (serial) => {
          try {
            const res = await lookupSerial(serial);
            if (res.open_rma_number) bySerial[serial] = res.open_rma_number;
          } catch {
            // an unreadable serial is checked by the server when the claim is opened
          }
        }),
      );
      if (!cancelled) setOpenClaims({ orderId: selectedOrder.order_id, bySerial });
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedOrder]);
  const openBySerial = openClaims && openClaims.orderId === selectedOrder?.order_id ? openClaims.bySerial : NO_OPEN_CLAIMS;

  const claimUnits = useMemo(
    () => claimUnitsFor(selectedOrder, selectedLineIds, pickedSerials, returnQty, openBySerial),
    [selectedOrder, selectedLineIds, pickedSerials, returnQty, openBySerial],
  );
  const selectedLines = useMemo(() => {
    const ids = new Set(claimUnits.map((unit) => unit.line.id));
    return (selectedOrder?.lines ?? []).filter((line) => ids.has(line.id));
  }, [selectedOrder, claimUnits]);

  // every dismissal (outside click, Esc, the X) goes through here and keeps what was typed
  const handleOpenChange = (next: boolean) => {
    if (!next) saveDraftIfDirty();
    onOpenChange(next);
  };

  const cancel = () => {
    clearDraft();
    onOpenChange(false);
  };

  const applyOrder = (hit: OrderSearchHit) => {
    setSelectedOrder(hit);
    setHits([]);
    setSearchOpen(false);
    const preselected = pickDefaultLines(hit);
    setSelectedLineIds(preselected.filter((line) => !line.serial_numbers.length).map((line) => line.id));
    setPickedSerials(pickDefaultSerials(hit, preselected));
    setReturnQty({});
    const changes: Partial<Form> = {
      noInvoice: false,
      noInvoiceReason: "",
      productId: "",
      orderNumber: hit.order_number,
      query: hit.order_number,
      customerId: hit.customer_id ?? "",
      customerName: hit.customer_name ?? "",
      customerPhone: hit.customer_phone ?? "",
      customerEmail: hit.customer_email ?? "",
    };
    const first = preselected[0];
    if (first) {
      changes.sku = first.sku;
      changes.productName = first.name;
      const serialToUse =
        hit.matched_serial && first.serial_numbers.includes(hit.matched_serial)
          ? hit.matched_serial
          : first.serial_numbers.length === 1
            ? first.serial_numbers[0]
            : "";
      if (serialToUse) changes.serial = serialToUse;
    } else {
      changes.sku = "";
      changes.productName = "";
    }
    patch(changes);
  };

  // the customer cannot show an invoice: no sale is attached, the product comes from the catalogue
  const startNoInvoice = () => {
    setSelectedOrder(null);
    setSelectedLineIds([]);
    setPickedSerials([]);
    setReturnQty({});
    setHits([]);
    setSearchOpen(false);
    patch({ noInvoice: true, saleSource: "unknown", orderNumber: "", sku: "", productName: "", productId: "" });
  };

  // the combobox hands back the product's id; the claim needs its SKU and name, so read them from the catalogue
  const pickProduct = (id: string) => {
    if (!id) {
      patch({ productId: "", sku: "", productName: "" });
      return;
    }
    patch({ productId: id });
    void fetchCatalogProductDetail(id)
      .then((product) => patch({ productId: id, sku: product.sku ?? "", productName: product.name }))
      .catch(() => toast.error("Could not read that product — pick it again"));
  };

  const backToInvoice = () =>
    patch({
      noInvoice: false,
      noInvoiceReason: "",
      previousInvoiceNo: "",
      previousSaleDate: "",
      units: "1",
      productId: "",
      sku: "",
      productName: "",
      ...(form.serialGenerated ? { serial: "", serialGenerated: false, generatedSerials: [] } : {}),
    });

  // a customer whose RMA is locked (Customer › RMA locked) cannot hand in a complaint; the server refuses it too
  useEffect(() => {
    const id = form.customerId;
    if (!id) {
      setCustomerLock(null);
      return;
    }
    let cancelled = false;
    void fetchRmaCustomerLock(id)
      .then((lock) => {
        if (!cancelled) setCustomerLock(lock.locked ? lock : null);
      })
      .catch(() => {
        if (!cancelled) setCustomerLock(null);
      });
    return () => {
      cancelled = true;
    };
  }, [form.customerId]);

  const unitCount = Math.max(1, Math.min(100, Math.floor(Number(form.units) || 1)));

  /** A unit with no serial of its own (a non-serial product, a previous or unknown sale) gets one made up, one per unit. */
  const generateSerial = async () => {
    setGenerating(true);
    try {
      const serials = await generateRmaSerials(form.noInvoice ? unitCount : 1);
      patch({ serial: serials[0] ?? "", serialGenerated: true, generatedSerials: serials });
      setSerialLookup(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate a serial");
    } finally {
      setGenerating(false);
    }
  };

  /** Keeps the Unit section in step with what is ticked: one unit fills it in, several leave each claim to its own serial. */
  const syncUnit = (lineIds: string[], picked: string[], qty: Record<string, number>) => {
    const units = claimUnitsFor(selectedOrder, lineIds, picked, qty, openBySerial);
    if (units.length === 1) {
      patch({ sku: units[0].line.sku, productName: units[0].line.name, ...(units[0].serial ? { serial: units[0].serial } : {}) });
    } else if (units.length === 0) {
      patch({ sku: "", productName: "" });
    } else {
      patch({ serial: "" });
    }
  };

  // a product with no serials is ticked as a whole (and may bring several units back)
  const toggleLine = (line: OrderSearchLine) => {
    const next = selectedLineIds.includes(line.id)
      ? selectedLineIds.filter((id) => id !== line.id)
      : [...selectedLineIds, line.id];
    setSelectedLineIds(next);
    syncUnit(next, pickedSerials, returnQty);
  };

  // a product with serials is ticked unit by unit
  const toggleSerial = (serial: string) => {
    const next = pickedSerials.includes(serial) ? pickedSerials.filter((s) => s !== serial) : [...pickedSerials, serial];
    setPickedSerials(next);
    syncUnit(selectedLineIds, next, returnQty);
  };

  const toggleAllSerials = (line: OrderSearchLine) => {
    const free = line.serial_numbers.filter((serial) => !openBySerial[serial]);
    const allPicked = free.length > 0 && free.every((serial) => pickedSerials.includes(serial));
    const next = allPicked
      ? pickedSerials.filter((serial) => !free.includes(serial))
      : [...pickedSerials, ...free.filter((serial) => !pickedSerials.includes(serial))];
    setPickedSerials(next);
    syncUnit(selectedLineIds, next, returnQty);
  };

  const changeReturnQty = (line: OrderSearchLine, value: number) => {
    const next = { ...returnQty, [line.id]: Math.min(Math.max(Math.floor(value) || 1, 1), Math.max(line.quantity, 1)) };
    setReturnQty(next);
  };

  /**
   * Serial-first lookup: an order number is not required when the serial
   * itself is registered — the registry knows the sale.
   */
  const runSerialLookup = async () => {
    if (!form.serial.trim()) return;
    setCheckingSerial(true);
    try {
      const res = await lookupSerial(form.serial.trim());
      setSerialLookup(res);
      if (!res.data) {
        toast.message(`${form.serial.trim()} is not in the registry — proceeding as unregistered.`);
        return;
      }
      if (res.open_rma_number) return; // shown as a blocking banner below

      if (res.data.order_number) {
        patch({ query: res.data.order_number });
        try {
          const rows = await searchRmaOrders(res.data.order_number);
          const match = rows.find((row) => row.order_number === res.data?.order_number) ?? rows[0];
          // the typed serial is the unit that is coming back, so it starts ticked on its line
          if (match) applyOrder(match.matched_serial ? match : { ...match, matched_serial: form.serial.trim() });
        } catch {
          patch({ orderNumber: res.data.order_number });
        }
      }
      setForm((current) => ({
        ...current,
        sku: !current.sku.trim() && res.data?.sku ? res.data.sku : current.sku,
        productName: !current.productName.trim() && res.data?.product_name ? res.data.product_name : current.productName,
        customerName: !current.customerName.trim() && res.data?.customer_name ? res.data.customer_name : current.customerName,
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Serial lookup failed");
    } finally {
      setCheckingSerial(false);
    }
  };

  const serialConflict = Boolean(serialLookup?.open_rma_number);
  const needsProductPick = Boolean(selectedOrder && selectedOrder.lines.length > 0);
  // without an invoice nothing else says who the customer is or what came in, so both must be given
  const noInvoiceIncomplete = form.noInvoice && (!(form.customerName.trim() || form.customerPhone.trim()) || !form.sku.trim());
  const previousIncomplete = form.noInvoice && form.saleSource === "previous" && !form.previousSaleDate;
  const blocked =
    !form.fault.trim() ||
    serialConflict ||
    noInvoiceIncomplete ||
    previousIncomplete ||
    Boolean(customerLock) ||
    (needsProductPick ? claimUnits.length === 0 : !form.noInvoice && !form.orderNumber.trim() && !form.customerName.trim());

  const submit = async (mode: "save" | "print" = "save") => {
    if (blocked) return;
    // Printing opens its window now, while the click still counts as a user gesture (a popup blocker would stop it later).
    const printWindow = mode === "print" ? window.open("", "_blank") : null;
    setSaving(true);
    const created: { id: string; rma_number: string }[] = [];
    try {
      const groupId = claimUnits.length > 1 ? crypto.randomUUID() : undefined;
      const common = {
        fault_reported: form.fault.trim(),
        order_number: form.orderNumber.trim() || undefined,
        customer_id: form.customerId || undefined,
        internal_notes: form.noInvoice
          ? `Claimed without an invoice${form.noInvoiceReason.trim() ? ` — ${form.noInvoiceReason.trim()}` : ""}.`
          : undefined,
        customer_name: form.customerName.trim() || undefined,
        customer_phone: form.customerPhone.trim() || undefined,
        customer_email: form.customerEmail.trim() || undefined,
        accessories: form.accessories.trim() || undefined,
        condition_notes: form.condition.trim() || undefined,
        received_by: form.receivedBy.trim() || undefined,
        priority: form.priority,
        rma_type: form.rmaType,
        start_status: "draft" as const,
        warehouse_id: form.storeId || undefined,
        assigned_to_user_id: form.assignedUserId || undefined,
        promised_delivery_date: form.promisedDate || undefined,
        charge_estimate: Number(form.chargeEstimate || 0),
        diagnosis_required: form.diagnosisRequired,
        diagnosis_report: form.diagnosisReport.trim() || undefined,
        supplier_id: overrideSupplier && form.supplierId ? form.supplierId : undefined,
        supplier_override_reason: overrideSupplier ? form.supplierReason.trim() || undefined : undefined,
        unit_received: !form.remote,
        sale_source: form.noInvoice ? form.saleSource : undefined,
        previous_invoice_no: form.noInvoice && form.saleSource === "previous" ? form.previousInvoiceNo.trim() || undefined : undefined,
        previous_sale_date: form.noInvoice && form.saleSource === "previous" ? form.previousSaleDate || undefined : undefined,
      };
      // generated serials without an invoice: one claim per unit, each with its own serial
      const generatedUnits = form.noInvoice && form.serialGenerated && form.generatedSerials.length > 1 ? form.generatedSerials : [];
      const unitGroupId = generatedUnits.length > 1 ? crypto.randomUUID() : undefined;
      const payloads = claimUnits.length
        ? claimUnits.map(({ line, serial, quantity }) => ({
            ...common,
            order_item_id: line.id,
            sku: line.sku,
            product_name: line.name,
            // a ticked serial is its own claim; a line without serials may carry one typed in the Unit section
            serial_number: serial || (claimUnits.length === 1 ? form.serial.trim() : "") || undefined,
            serial_generated: !serial && claimUnits.length === 1 && form.serialGenerated,
            quantity,
            claim_group_id: groupId,
          }))
        : generatedUnits.length
          ? generatedUnits.map((serial) => ({
              ...common,
              sku: form.sku.trim() || undefined,
              product_name: form.productName.trim() || undefined,
              serial_number: serial,
              serial_generated: true,
              quantity: 1,
              claim_group_id: unitGroupId,
            }))
          : [
              {
                ...common,
                sku: form.sku.trim() || undefined,
                product_name: form.productName.trim() || undefined,
                serial_number: form.serial.trim() || undefined,
                serial_generated: form.serialGenerated,
                quantity: form.noInvoice && !form.serialGenerated ? unitCount : undefined,
              },
            ];

      for (const payload of payloads) {
        const ticket = await createRmaTicket(payload);
        created.push({ id: ticket.id, rma_number: ticket.rma_number });
      }
      const first = created[0];
      clearDraft();
      const numbers = created.map((row) => row.rma_number).join(", ");
      // Saving finalizes the complaint, as in Sales: an approver's is approved, anyone else's is sent for approval
      const failed: string[] = [];
      let failure = "";
      for (const row of created) {
        try {
          await (canApprove ? decideRmaComplaint(row.id, "approved") : submitRmaForApproval(row.id));
        } catch (err) {
          failed.push(row.rma_number);
          failure = err instanceof Error ? err.message : "it was refused";
        }
      }
      if (failed.length) {
        toast.error(`${failed.join(", ")} saved as a draft, but could not be ${canApprove ? "approved" : "sent for approval"}: ${failure}`);
      } else {
        toast.success(canApprove ? `${numbers} approved` : `${numbers} sent for approval`);
      }
      if (mode === "print" && first) {
        await openRmaReceipt(first.id, printWindow).catch((err) => {
          toast.error(err instanceof Error ? err.message : "Saved, but the receipt could not be opened");
        });
      }
      onOpenChange(false);
      if (first) onCreated?.(first.id);
    } catch (err) {
      printWindow?.close();
      const reason = err instanceof Error ? err.message : "Could not save the claim";
      // claims are opened one after the other: say which ones already exist so nothing is opened twice
      toast.error(
        created.length
          ? `${created.map((row) => row.rma_number).join(", ")} saved, but the next claim failed: ${reason}`
          : reason,
      );
    } finally {
      setSaving(false);
    }
  };

  const showSearchMenu = searchOpen && form.query.trim().length >= 2 && !(selectedOrder && form.query === selectedOrder.order_number);

  return (
    <>
      <AgainDrawerPanel
        open={open}
        onOpenChange={handleOpenChange}
        title="New RMA"
        resizable
        defaultWidth={560}
        minWidth={380}
        widthStorageKey="again-rma-intake-drawer-width"
      >
        <AgainDrawerLayout>
          <AgainDrawerControlBar trailing={<AgainDrawerCloseButton onClick={() => handleOpenChange(false)} />}>
            <AgainDrawerButton variant="primary" onClick={() => void submit("save")} disabled={blocked || saving}>
              {saving ? "Saving…" : "Save"}
            </AgainDrawerButton>
            <AgainDrawerButton onClick={() => void submit("print")} disabled={blocked || saving}>
              Save &amp; print receipt
            </AgainDrawerButton>
            <AgainDrawerButton onClick={cancel} disabled={saving}>
              Cancel
            </AgainDrawerButton>
          </AgainDrawerControlBar>

          <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS} scrollRef={scrollRef}>
            <div className="@container space-y-5">
              <div className="min-w-0">
                <h2 className={AGAIN_FORM_RECORD_TITLE_CLASS}>New RMA</h2>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {dirty ? "Unsaved changes" : "Find the sale, pick the products coming back, describe the problem, then save and send it for approval."}
                </p>
              </div>

              <Section title="Sale">
                <div ref={searchBoxRef} className="relative">
                  <AgainFormRow label="Find the sale">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <AgainUnderlineInput
                        value={form.query}
                        onChange={(value) => {
                          patch({
                            query: value,
                            ...(selectedOrder && value !== selectedOrder.order_number ? { orderNumber: "" } : {}),
                            // searching again means going back to an invoice
                            ...(form.noInvoice ? { noInvoice: false, noInvoiceReason: "", productId: "", sku: "", productName: "" } : {}),
                          });
                          if (selectedOrder && value !== selectedOrder.order_number) {
                            setSelectedOrder(null);
                            setSelectedLineIds([]);
                          }
                          setSearchOpen(true);
                        }}
                        onFocus={() => {
                          if (hits.length) setSearchOpen(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (hits.length === 1) applyOrder(hits[0]);
                          }
                          if (e.key === "Escape" && showSearchMenu) {
                            e.stopPropagation();
                            setSearchOpen(false);
                          }
                        }}
                        placeholder="Order no., phone, or serial"
                        inputClassName="pl-5"
                        autoComplete="off"
                      />
                    </div>
                  </AgainFormRow>
                  {showSearchMenu && (
                    <div className="absolute left-32 right-0 z-30 mt-0.5 max-h-64 overflow-y-auto border border-border bg-popover shadow-md">
                      {searching ? (
                        <p className="px-3 py-2 text-[11px] text-muted-foreground">Searching…</p>
                      ) : hits.length === 0 ? (
                        <div className="px-3 py-2">
                          <p className="text-[11px] text-muted-foreground">No matching orders.</p>
                          <button type="button" className="mt-1 text-[11px] text-primary hover:underline" onClick={startNoInvoice}>
                            Customer has no invoice — claim without one
                          </button>
                        </div>
                      ) : (
                        hits.map((hit) => (
                          <button
                            key={`${hit.source}:${hit.order_id}`}
                            type="button"
                            className="flex w-full flex-col items-start gap-0.5 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-accent"
                            onClick={() => applyOrder(hit)}
                          >
                            <span className="flex w-full items-center gap-2">
                              <span className="font-mono text-[11px]">{hit.order_number}</span>
                              <Badge variant="outline" className="rounded-none text-[10px]">
                                {MATCH_BY_LABEL[hit.matched_by] ?? hit.matched_by}
                              </Badge>
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {hit.customer_name || "—"}
                              {hit.customer_phone ? ` · ${hit.customer_phone}` : ""}
                              {hit.lines.length ? ` · ${hit.lines.length} product${hit.lines.length === 1 ? "" : "s"}` : ""}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {form.noInvoice ? (
                  <div className="mb-1 mt-1 border border-border bg-background">
                    <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      <span className="text-xs font-semibold">Claim without an invoice</span>
                      <button type="button" className="ml-auto text-[11px] text-primary hover:underline" onClick={backToInvoice}>
                        Find the invoice instead
                      </button>
                    </div>
                    <div className="space-y-2 px-3 py-2">
                      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Sale type">
                        {(
                          [
                            ["previous", "Previous sale", "Sold before this ERP"],
                            ["unknown", "Unknown sale", "No sale to go by"],
                          ] as const
                        ).map(([value, label, hint]) => (
                          <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={form.saleSource === value}
                            onClick={() => patch({ saleSource: value })}
                            className={cn(
                              "border px-2.5 py-1 text-left text-[12px]",
                              form.saleSource === value ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:bg-muted/40",
                            )}
                          >
                            <span className="block font-medium">{label}</span>
                            <span className="block text-[11px] text-muted-foreground">{hint}</span>
                          </button>
                        ))}
                      </div>
                      {form.saleSource === "previous" ? (
                        <div className="grid gap-x-6 @md:grid-cols-2">
                          <AgainFormRow label="Old invoice no.">
                            <AgainUnderlineInput
                              value={form.previousInvoiceNo}
                              onChange={(value) => patch({ previousInvoiceNo: value })}
                              placeholder="From the old system / paper"
                            />
                          </AgainFormRow>
                          <AgainFormRow label="Sale date">
                            <input
                              type="date"
                              value={form.previousSaleDate}
                              max={new Date().toISOString().slice(0, 10)}
                              onChange={(e) => patch({ previousSaleDate: e.target.value })}
                              aria-label="Previous sale date"
                              className="h-8 w-full border-0 border-b border-input bg-transparent text-[13px] outline-none"
                            />
                          </AgainFormRow>
                        </div>
                      ) : null}
                      <p className="text-[11px] text-muted-foreground">
                        {form.saleSource === "previous" ? (
                          <>The warranty is measured from this sale date and the product&apos;s warranty period.</>
                        ) : (
                          <>
                            With no sale there is no date to measure the warranty from, so the claim is marked{" "}
                            <span className="font-semibold text-foreground">Unverified</span>.
                          </>
                        )}{" "}
                        If the unit has a serial number, put it in first — a registered serial finds its sale even without the paper invoice.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mb-1 text-[11px] text-muted-foreground">
                    Type to find the sale, then pick the order.{" "}
                    {!selectedOrder && (
                      <button type="button" className="text-primary hover:underline" onClick={startNoInvoice}>
                        Customer has no invoice?
                      </button>
                    )}
                  </p>
                )}

                {selectedOrder && selectedOrder.lines.length > 0 ? (
                  <div className="mt-1">
                    <p className="mb-1 text-[13px]">Products on this order</p>
                    <div className="border border-border bg-background">
                      {selectedOrder.lines.map((line) => {
                        const hasSerials = line.serial_numbers.length > 0;
                        const freeSerials = line.serial_numbers.filter((serial) => !openBySerial[serial]);
                        const allPicked = freeSerials.length > 0 && freeSerials.every((serial) => pickedSerials.includes(serial));
                        const checked = selectedLineIds.includes(line.id);
                        const boxClass =
                          "mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary disabled:cursor-not-allowed disabled:opacity-40";
                        const Head = hasSerials ? "div" : "label";
                        return (
                          <div key={line.id} className="border-b border-border px-3 py-2 last:border-b-0">
                            <Head className={cn("flex items-start gap-2", !hasSerials && "cursor-pointer")}>
                              {!hasSerials && <input type="checkbox" checked={checked} onChange={() => toggleLine(line)} className={boxClass} />}
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2">
                                  <span className="font-mono text-[11px]">{line.sku || "—"}</span>
                                  <WarrantyBadge status={line.warranty_status} />
                                </span>
                                <span className="block text-xs">{line.name || "Unnamed product"}</span>
                                <span className="block text-[11px] text-muted-foreground">
                                  Qty {line.quantity}
                                  {hasSerials ? ` · pick the unit${line.serial_numbers.length === 1 ? "" : "s"} coming back` : ""}
                                </span>
                              </span>
                              {freeSerials.length > 1 && (
                                <button
                                  type="button"
                                  className="shrink-0 text-[11px] text-primary hover:underline"
                                  onClick={() => toggleAllSerials(line)}
                                >
                                  {allPicked ? "Clear" : "Select all"}
                                </button>
                              )}
                            </Head>
                            {hasSerials && (
                              <ul className="ml-1.5 mt-1.5 space-y-1 border-l-2 border-border pl-3">
                                {line.serial_numbers.map((serial) => {
                                  const claim = openBySerial[serial];
                                  return (
                                    <li key={serial}>
                                      <label className={cn("flex items-center gap-2", claim ? "cursor-not-allowed" : "cursor-pointer")}>
                                        <input
                                          type="checkbox"
                                          checked={!claim && pickedSerials.includes(serial)}
                                          disabled={Boolean(claim)}
                                          onChange={() => toggleSerial(serial)}
                                          className={cn(boxClass, "mt-0")}
                                        />
                                        <span className={cn("font-mono text-[11px]", claim && "text-muted-foreground line-through")}>{serial}</span>
                                        {claim && <span className="text-[10px] text-amber-700 dark:text-amber-400">already on {claim}</span>}
                                      </label>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                            {!hasSerials && checked && line.quantity > 1 && (
                              <div className="ml-6 mt-1.5 flex items-center gap-2 text-[11px]">
                                <span className="text-muted-foreground">Units coming back</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={line.quantity}
                                  value={returnQty[line.id] ?? 1}
                                  onChange={(e) => changeReturnQty(line, Number(e.target.value))}
                                  className="h-6 w-14 border border-input bg-background px-1.5 text-[12px] outline-none focus:border-primary"
                                />
                                <span className="text-muted-foreground">of {line.quantity}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {claimUnits.length > 1
                        ? `${claimUnits.length} units are coming back — each one opens its own claim.`
                        : "Tick every unit that is coming back. Each serial opens its own claim."}
                    </p>
                  </div>
                ) : form.noInvoice ? (
                  <>
                    <AgainFormRow label="Product" className="mt-1">
                      <ProductCombobox
                        products={[]}
                        value={form.productId}
                        onChange={pickProduct}
                        placeholder="Search the product that came in…"
                      />
                    </AgainFormRow>
                    {form.sku && !form.productId && (
                      <p className="text-[11px] text-muted-foreground">
                        Product taken from the serial registry: {form.productName || form.sku} ({form.sku}).
                      </p>
                    )}
                    <AgainFormRow label="Why no invoice">
                      <AgainUnderlineInput
                        value={form.noInvoiceReason}
                        onChange={(value) => patch({ noInvoiceReason: value })}
                        placeholder="Lost it, bought as a gift, old purchase…"
                      />
                    </AgainFormRow>
                    <AgainFormRow label="Units">
                      <AgainUnderlineInput
                        value={form.units}
                        onChange={(value) =>
                          patch({
                            units: value.replace(/[^0-9]/g, "").slice(0, 3),
                            // generated serials were made for the old count
                            ...(form.serialGenerated ? { serial: "", serialGenerated: false, generatedSerials: [] } : {}),
                          })
                        }
                        placeholder="1"
                      />
                    </AgainFormRow>
                  </>
                ) : (
                  <AgainFormRow label="Product SKU" className="mt-1">
                    <AgainUnderlineInput
                      value={form.sku}
                      onChange={(value) => patch({ sku: value })}
                      placeholder={selectedOrder ? "This order has no lines — enter the SKU" : "SKU-…"}
                    />
                  </AgainFormRow>
                )}

                {selectedLines.length === 1 && (
                  <div className="mt-2 border border-border bg-background">
                    <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      <span className="text-xs font-semibold">Warranty check</span>
                      <span className="ml-auto">
                        <WarrantyBadge status={selectedLines[0].warranty_status} />
                      </span>
                    </div>
                    <div className="space-y-1 px-3 py-2 text-[11px]">
                      <p className="text-muted-foreground">{selectedLines[0].warranty_note}</p>
                      <p>
                        <span className="text-muted-foreground">Sold on </span>
                        {selectedOrder?.purchased_at ?? "—"}
                      </p>
                    </div>
                  </div>
                )}
                {prior.length > 0 && (
                  <div className="mt-2 flex items-start gap-2 border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="min-w-0 text-[11px]">
                      <p className="font-semibold text-amber-700 dark:text-amber-300">
                        {prior.length} earlier claim{prior.length === 1 ? "" : "s"} on this unit — you can still continue.
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {prior.slice(0, 4).map((p) => (
                          <li key={p.id} className="truncate">
                            <span className="font-mono">{p.rma_number}</span> · {RMA_STATUS_LABEL[p.status] ?? p.status} · {p.fault_reported}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </Section>

              <Section title="Customer">
                <AgainFormRow label="Saved customer">
                  {form.customerId ? (
                    <div className="flex items-center gap-2 text-[13px]">
                      <span className="truncate">{form.customerName || "Saved customer"}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {selectedOrder ? "· from the sale" : "· saved customer"}
                      </span>
                      <button type="button" className="ml-auto shrink-0 text-[11px] text-primary hover:underline" onClick={() => patch({ customerId: "" })}>
                        Change
                      </button>
                    </div>
                  ) : (
                    <CustomerFind
                      onPick={(customer) =>
                        patch({ customerId: customer.id, customerName: customer.name, customerPhone: customer.phone, customerEmail: customer.email })
                      }
                      onCreate={(draft) => {
                        setCustomerDraft(draft);
                        setPartnerOpen(true);
                      }}
                    />
                  )}
                </AgainFormRow>
                {customerLock && (
                  <div role="alert" className="mt-1 flex items-start gap-2 border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>
                      RMA is locked for <span className="font-semibold">{customerLock.name}</span>: no complaint can be taken.
                      {customerLock.reason ? ` Reason: ${customerLock.reason}.` : ""} Unlock it on the customer first.
                    </span>
                  </div>
                )}
                <div className="grid gap-x-8 @md:grid-cols-2">
                  <AgainFormRow label="Customer">
                    <AgainUnderlineInput value={form.customerName} onChange={(value) => patch({ customerName: value, customerId: "" })} placeholder="Name" />
                  </AgainFormRow>
                  <AgainFormRow label="Phone">
                    <AgainUnderlineInput value={form.customerPhone} onChange={(value) => patch({ customerPhone: value, customerId: "" })} placeholder="Phone number" />
                  </AgainFormRow>
                </div>
                <AgainFormRow label="Email">
                  <AgainUnderlineInput value={form.customerEmail} onChange={(value) => patch({ customerEmail: value, customerId: "" })} placeholder="name@example.com" />
                </AgainFormRow>
              </Section>

              <Section title="Unit">
                {!selectedOrder && !form.noInvoice && (
                  <AgainFormRow label="Product">
                    <AgainUnderlineInput value={form.productName} onChange={(value) => patch({ productName: value })} placeholder="Product name" />
                  </AgainFormRow>
                )}
                <AgainFormRow label="Serial number">
                  <div className="flex items-center gap-1.5">
                    <AgainUnderlineInput
                      className="min-w-0 flex-1"
                      value={form.serial}
                      onChange={(value) => {
                        patch({ serial: value, serialGenerated: false, generatedSerials: [] });
                        setSerialLookup(null);
                      }}
                      placeholder="On the unit"
                    />
                    {claimUnits.length <= 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 gap-1 rounded-none px-2 text-[11px]"
                        title="The unit has no serial: make a unique 8-character one to track it through the RMA"
                        disabled={generating}
                        onClick={() => void generateSerial()}
                      >
                        <Wand2 className="h-3.5 w-3.5" aria-hidden />
                        {form.noInvoice && unitCount > 1 ? `Generate ${unitCount}` : "Generate"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 shrink-0 rounded-none"
                      aria-label="Look up this serial"
                      title="Look up this serial"
                      disabled={!form.serial.trim() || checkingSerial}
                      onClick={() => void runSerialLookup()}
                    >
                      <Search className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </AgainFormRow>
                <p className="text-[11px] text-muted-foreground">
                  {form.serialGenerated
                    ? form.generatedSerials.length > 1
                      ? `Generated ${form.generatedSerials.length} serials (${form.generatedSerials.join(", ")}) — each unit opens its own claim. Write them on the units.`
                      : "Generated serial — write it on the unit. It tracks the unit through the RMA only."
                    : claimUnits.length > 1
                      ? "Each ticked serial is used when opening its claim."
                      : "A registered unit can also find the sale for you."}
                </p>

                {serialLookup?.data && (
                  <div className="mt-2 border border-border bg-background">
                    <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      <span className="text-xs font-semibold">Registered unit</span>
                      {serialLookup.warranty_status && (
                        <span className="ml-auto">
                          <WarrantyBadge status={serialLookup.warranty_status} />
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 px-3 py-2 text-[11px]">
                      <p className="text-muted-foreground">{serialLookup.warranty_note}</p>
                      <p>
                        <span className="text-muted-foreground">Sold on </span>
                        {serialLookup.purchased_on ?? "—"}
                        {serialLookup.data.order_number && (
                          <>
                            <span className="text-muted-foreground"> · order </span>
                            {serialLookup.data.order_number}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {serialConflict && (
                  <div className="mt-2 flex items-start gap-2 border border-red-500/40 bg-red-500/10 px-3 py-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
                    <p className="text-[11px] text-red-700 dark:text-red-400">
                      {form.serial.trim()} is already on open claim <span className="font-semibold">{serialLookup?.open_rma_number}</span>. Close or cancel
                      it before receiving this unit again.
                    </p>
                  </div>
                )}

                {trace && (
                  <div className="mt-2 border border-border bg-background">
                    <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
                      <span className="text-xs font-semibold">Supplier and purchase</span>
                      <span className="ml-auto rounded-none border border-border px-1.5 text-[10px] text-muted-foreground">
                        {trace.source === "traced" ? "Auto-filled from the serial" : "No purchase trace"}
                      </span>
                    </div>
                    <div className="space-y-1 px-3 py-2 text-[11px]">
                      {trace.source === "traced" ? (
                        <>
                          <p>
                            <span className="text-muted-foreground">Supplier </span>
                            {trace.supplier_name}
                          </p>
                          <p>
                            <span className="text-muted-foreground">Purchase receipt </span>
                            {trace.purchase_receipt_no ?? "—"}
                            {trace.vendor_invoice_no ? (
                              <>
                                <span className="text-muted-foreground"> · vendor invoice </span>
                                {trace.vendor_invoice_no}
                              </>
                            ) : null}
                          </p>
                        </>
                      ) : (
                        <p className="text-muted-foreground">
                          This unit was not received through a purchase, so the supplier cannot be found automatically.
                        </p>
                      )}
                      {canOverride && (
                        <button type="button" className="text-[11px] text-[#00a09d] underline-offset-2 hover:underline" onClick={() => setOverrideSupplier((v) => !v)}>
                          {overrideSupplier ? "Use the traced supplier" : trace.source === "traced" ? "Override supplier" : "Choose the supplier by hand"}
                        </button>
                      )}
                    </div>
                    {overrideSupplier && canOverride && (
                      <div className="space-y-1 border-t border-border px-3 py-2">
                        <AgainFormRow label="Supplier">
                          <FilterSelect
                            value={form.supplierId}
                            onChange={(value) => patch({ supplierId: value })}
                            width="w-full"
                            avoidCollisions
                            ariaLabel="Supplier"
                            placeholder="Choose a supplier…"
                            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                          />
                        </AgainFormRow>
                        <AgainFormRow label="Reason">
                          <AgainUnderlineInput value={form.supplierReason} onChange={(value) => patch({ supplierReason: value })} placeholder="Why it is set by hand" />
                        </AgainFormRow>
                      </div>
                    )}
                  </div>
                )}
              </Section>

              <Section title="Problem">
                <AgainFormRow
                  label={
                    <>
                      Reported fault <span className="text-destructive">*</span>
                    </>
                  }
                >
                  <AgainUnderlineTextarea
                    value={form.fault}
                    onChange={(value) => patch({ fault: value })}
                    rows={2}
                    placeholder="What the customer says is wrong"
                  />
                </AgainFormRow>
                <div className="grid gap-x-8 @md:grid-cols-2">
                  <AgainFormRow label="Accessories">
                    <AgainUnderlineInput value={form.accessories} onChange={(value) => patch({ accessories: value })} placeholder="Box, cable, adapter…" />
                  </AgainFormRow>
                  <AgainFormRow label="Condition">
                    <AgainUnderlineInput value={form.condition} onChange={(value) => patch({ condition: value })} placeholder="Scratches, dents…" />
                  </AgainFormRow>
                </div>
                <label className="flex items-center gap-2 py-1 text-[13px]">
                  <input
                    type="checkbox"
                    checked={form.diagnosisRequired}
                    onChange={(e) => patch({ diagnosisRequired: e.target.checked })}
                    className="h-3.5 w-3.5 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                  />
                  Diagnosis report required before approval
                </label>
                {form.diagnosisRequired && (
                  <AgainFormRow label="Diagnosis report">
                    <AgainUnderlineTextarea value={form.diagnosisReport} onChange={(value) => patch({ diagnosisReport: value })} rows={2} placeholder="What the check found" />
                  </AgainFormRow>
                )}
              </Section>

              <Section title="Handling">
                <div className="grid gap-x-8 @md:grid-cols-2">
                  <AgainFormRow label="Assigned to">
                    <FilterSelect
                      value={form.assignedUserId}
                      onChange={(value) => patch({ assignedUserId: value })}
                      width="w-full"
                      avoidCollisions
                      ariaLabel="Assigned to"
                      placeholder="Unassigned"
                      options={users.map((u) => ({ value: u.id, label: u.name }))}
                    />
                  </AgainFormRow>
                  <AgainFormRow label="RMA store">
                    <FilterSelect
                      value={form.storeId}
                      onChange={(value) => patch({ storeId: value })}
                      width="w-full"
                      avoidCollisions
                      ariaLabel="Receiving RMA store"
                      placeholder="Choose the RMA store…"
                      options={stores.map((s) => ({ value: s.id, label: s.name }))}
                    />
                  </AgainFormRow>
                  <AgainFormRow label="Promised delivery">
                    <input
                      type="date"
                      value={form.promisedDate}
                      onChange={(e) => patch({ promisedDate: e.target.value })}
                      className="h-8 w-full border-0 border-b border-input bg-transparent text-[13px] outline-none"
                    />
                  </AgainFormRow>
                  <AgainFormRow label="Charge estimate">
                    <AgainUnderlineInput value={form.chargeEstimate} onChange={(value) => patch({ chargeEstimate: value.replace(/[^0-9.]/g, "") })} placeholder="0" />
                  </AgainFormRow>
                  <AgainFormRow label="Received by">
                    <AgainUnderlineInput value={form.receivedBy} onChange={(value) => patch({ receivedBy: value })} placeholder="Staff name" />
                  </AgainFormRow>
                  <AgainFormRow label="Priority">
                    <FilterSelect
                      value={form.priority}
                      onChange={(value) => patch({ priority: value })}
                      width="w-full"
                      avoidCollisions
                      ariaLabel="Priority"
                      options={[
                        { value: "low", label: "Low" },
                        { value: "normal", label: "Normal" },
                        { value: "high", label: "High" },
                        { value: "urgent", label: "Urgent" },
                      ]}
                    />
                  </AgainFormRow>
                </div>
              </Section>
            </div>
          </AgainDrawerScrollBody>
        </AgainDrawerLayout>
      </AgainDrawerPanel>
      <AgainPartnerDrawer
        open={partnerOpen}
        mode="create"
        customer={null}
        initialName={customerDraft.name ?? ""}
        initialEmail={customerDraft.email ?? ""}
        initialPhone={customerDraft.phone ?? ""}
        nested
        moduleLabel="RMA"
        onOpenChange={setPartnerOpen}
        onSaved={(saved) => {
          patch({ customerId: saved.id, customerName: saved.name, customerPhone: saved.phone ?? "", customerEmail: saved.email ?? "" });
          setPartnerOpen(false);
        }}
      />
    </>
  );
}
