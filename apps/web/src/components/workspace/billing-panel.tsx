"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  Link2,
  Loader2,
  MoreHorizontal,
  Plus,
  Receipt,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FilterSelect } from "@/components/shared/filter-select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import {
  BILL_TYPE_LABEL,
  billPayUrl,
  cancelBill,
  createBill,
  fetchBills,
  fetchBillingSummary,
  fetchGatewaySettings,
  markBillPaid,
  regeneratePayLink,
  saveGatewaySettings,
  verifyGateway,
  type BillType,
  type BillingGatewaySettings,
  type BillingSummary,
  type ErpBill,
} from "@/lib/api/erp-billing";
import { cn, formatCurrency } from "@/lib/utils";

const TYPE_TABS: { id: "all" | BillType; label: string }[] = [
  { id: "all", label: "All" },
  { id: "subscription", label: "Subscription" },
  { id: "module", label: "Module" },
  { id: "plugin", label: "Plugin" },
];

function money(amount: string | number, currency = "BDT") {
  const n = Number(amount);
  return currency === "BDT" ? formatCurrency(n) : `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function formatDay(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function StatusBadge({ bill }: { bill: ErpBill }) {
  if (bill.status === "paid") return <Badge variant="success" className="rounded-none">Paid</Badge>;
  if (bill.status === "cancelled") return <Badge variant="muted" className="rounded-none">Cancelled</Badge>;
  if (bill.is_overdue)
    return (
      <Badge className="rounded-none border-transparent bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200">
        Overdue
      </Badge>
    );
  return <Badge variant="warning" className="rounded-none">Unpaid</Badge>;
}

function SummaryCard({
  icon: Icon,
  label,
  amount,
  hint,
  tone,
}: {
  icon: typeof Receipt;
  label: string;
  amount: string;
  hint: string;
  tone: "default" | "danger" | "good";
}) {
  return (
    <div className="flex items-start gap-3 border border-border bg-card p-3">
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center",
          tone === "danger" && "bg-red-500/10 text-red-600 dark:text-red-400",
          tone === "good" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          tone === "default" && "bg-primary/10 text-primary",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate text-lg font-semibold tabular-nums leading-tight">{amount}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

export function BillingPanel() {
  const canWrite = useAdminCanWrite();
  const [bills, setBills] = useState<ErpBill[]>([]);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | BillType>("all");
  const [status, setStatus] = useState("all");

  const [newOpen, setNewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paidTarget, setPaidTarget] = useState<ErpBill | null>(null);

  const load = useCallback(
    () =>
      Promise.all([fetchBills(), fetchBillingSummary()])
        .then(([list, sum]) => {
          setBills(list);
          setSummary(sum);
        })
        .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load bills"))
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bills.filter((b) => {
      if (type !== "all" && b.bill_type !== type) return false;
      if (status === "overdue" ? !b.is_overdue : status !== "all" && b.status !== status) return false;
      if (!q) return true;
      return `${b.title} ${b.bill_number} ${b.reference ?? ""}`.toLowerCase().includes(q);
    });
  }, [bills, query, type, status]);

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = { all: bills.length };
    for (const b of bills) c[b.bill_type] = (c[b.bill_type] ?? 0) + 1;
    return c;
  }, [bills]);

  const copyLink = async (bill: ErpBill) => {
    try {
      await navigator.clipboard.writeText(billPayUrl(bill.pay_token));
      toast.success(`Pay link for ${bill.bill_number} copied`);
    } catch {
      toast.error("Could not copy — open the link and copy it from the address bar");
    }
  };

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 pb-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">Billing</h1>
          <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
            Subscription, module and plugin bills for this ERP. Every bill has a pay link you can send to the
            customer — they pay online and the bill closes by itself.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9 rounded-none" onClick={() => setSettingsOpen(true)}>
            <Settings2 className="mr-1.5 h-3.5 w-3.5" />
            Payment gateway
          </Button>
          {canWrite ? (
            <Button size="sm" className="h-9 rounded-none" onClick={() => setNewOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New bill
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          icon={Receipt}
          label="Outstanding"
          amount={summary ? money(summary.unpaid_total) : "—"}
          hint={summary ? `${summary.unpaid_count} unpaid bill${summary.unpaid_count === 1 ? "" : "s"}` : " "}
          tone="default"
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Overdue"
          amount={summary ? money(summary.overdue_total) : "—"}
          hint={summary ? `${summary.overdue_count} past due date` : " "}
          tone="danger"
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Paid"
          amount={summary ? money(summary.paid_total) : "—"}
          hint={summary ? `${summary.paid_count} paid bill${summary.paid_count === 1 ? "" : "s"}` : " "}
          tone="good"
        />
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search bill, title or reference…"
              aria-label="Search bills"
              className="h-9 rounded-none pl-8 text-xs"
            />
          </div>
          <FilterSelect
            value={status}
            onChange={setStatus}
            width="w-[140px]"
            className="h-9"
            ariaLabel="Status"
            options={[
              { value: "all", label: "All statuses" },
              { value: "unpaid", label: "Unpaid" },
              { value: "overdue", label: "Overdue" },
              { value: "paid", label: "Paid" },
              { value: "cancelled", label: "Cancelled" },
            ]}
          />
        </div>
        <div role="tablist" aria-label="Bill type" className="inline-flex w-full gap-0.5 bg-muted/70 p-0.5 lg:w-auto">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={type === tab.id}
              onClick={() => setType(tab.id)}
              className={cn(
                "inline-flex h-8 flex-1 items-center justify-center gap-1.5 px-3 text-xs font-medium transition-colors lg:flex-none",
                type === tab.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              <span className="text-[10px] tabular-nums text-muted-foreground">{typeCounts[tab.id] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 border border-border bg-card py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading bills…
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-1 border border-dashed border-border px-4 py-14 text-center">
          <Receipt className="h-6 w-6 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">{bills.length === 0 ? "No bills yet" : "No bills match your filters"}</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            {bills.length === 0
              ? "Create a subscription, module or plugin bill and send its pay link to the customer."
              : "Try a different search, status or type."}
          </p>
          {bills.length === 0 && canWrite ? (
            <Button size="sm" className="mt-2 rounded-none" onClick={() => setNewOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New bill
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="overflow-hidden border border-border bg-card">
          <div className="hidden grid-cols-[minmax(0,2.4fr)_110px_120px_110px_130px] items-center gap-3 border-b border-border bg-muted/30 px-3 py-2 text-[11px] font-medium text-muted-foreground md:grid">
            <span>Bill</span>
            <span className="text-right">Amount</span>
            <span>Due</span>
            <span>Status</span>
            <span className="text-right">Pay link</span>
          </div>
          <ul className="divide-y divide-border">
            {visible.map((bill) => {
              const payable = bill.status === "unpaid";
              return (
                <li
                  key={bill.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-3 md:grid-cols-[minmax(0,2.4fr)_110px_120px_110px_130px]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{bill.title}</span>
                      <Badge variant="outline" className="rounded-none px-1.5 py-0 text-[10px]">
                        {BILL_TYPE_LABEL[bill.bill_type]}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {bill.bill_number}
                      {bill.period_label ? ` · ${bill.period_label}` : ""}
                      {bill.reference ? ` · ${bill.reference}` : ""}
                    </p>
                  </div>
                  <div className="text-right text-sm font-semibold tabular-nums md:order-none">
                    {money(bill.amount, bill.currency)}
                  </div>
                  <div className="col-span-1 text-xs text-muted-foreground md:col-span-1">
                    <span className="md:hidden">Due: </span>
                    {bill.status === "paid" ? `Paid ${formatDay(bill.paid_at)}` : formatDay(bill.due_date)}
                  </div>
                  <div className="justify-self-end md:justify-self-start">
                    <StatusBadge bill={bill} />
                  </div>
                  <div className="col-span-2 flex items-center justify-end gap-1 md:col-span-1">
                    {payable ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 rounded-none px-2 text-xs"
                          onClick={() => void copyLink(bill)}
                          title="Copy the link the customer pays from"
                        >
                          <Copy className="mr-1 h-3 w-3" />
                          Copy
                        </Button>
                        <Button asChild size="sm" className="h-7 rounded-none px-2 text-xs">
                          <a href={billPayUrl(bill.pay_token)} target="_blank" rel="noreferrer" title="Open the pay page">
                            <CreditCard className="mr-1 h-3 w-3" />
                            Pay
                          </a>
                        </Button>
                      </>
                    ) : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-none" aria-label={`Actions for ${bill.bill_number}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <a href={billPayUrl(bill.pay_token)} target="_blank" rel="noreferrer">
                            <ExternalLink className="mr-2 h-3.5 w-3.5" /> Open pay page
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void copyLink(bill)}>
                          <Link2 className="mr-2 h-3.5 w-3.5" /> Copy pay link
                        </DropdownMenuItem>
                        {canWrite && payable ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setPaidTarget(bill)}>
                              <Banknote className="mr-2 h-3.5 w-3.5" /> Mark as paid
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                void act(() => regeneratePayLink(bill.id), "New pay link created — the old one no longer works")
                              }
                            >
                              <Link2 className="mr-2 h-3.5 w-3.5" /> New pay link
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                if (window.confirm(`Cancel ${bill.bill_number}? Its pay link stops working.`)) {
                                  void act(() => cancelBill(bill.id), `${bill.bill_number} cancelled`);
                                }
                              }}
                            >
                              <X className="mr-2 h-3.5 w-3.5" /> Cancel bill
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <NewBillSheet
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={() => {
          setNewOpen(false);
          void load();
        }}
      />
      <GatewaySheet open={settingsOpen} onOpenChange={setSettingsOpen} />
      <MarkPaidDialog
        bill={paidTarget}
        onClose={() => setPaidTarget(null)}
        onDone={() => {
          setPaidTarget(null);
          void load();
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ new bill */

function NewBillSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New bill</SheetTitle>
          <SheetDescription>The customer gets a pay link as soon as the bill is created.</SheetDescription>
        </SheetHeader>
        <NewBillForm onCancel={() => onOpenChange(false)} onCreated={onCreated} />
      </SheetContent>
    </Sheet>
  );
}

function NewBillForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const [billType, setBillType] = useState<BillType>("subscription");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [period, setPeriod] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const refLabel = billType === "subscription" ? "Plan" : billType === "module" ? "Module" : "Plugin";

  const submit = async () => {
    const value = Number(amount);
    if (!title.trim()) return toast.error("Give the bill a title");
    if (!Number.isFinite(value) || value <= 0) return toast.error("Enter an amount above zero");
    setSaving(true);
    try {
      const bill = await createBill({
        bill_type: billType,
        title: title.trim(),
        description: description.trim() || undefined,
        reference: reference.trim() || undefined,
        period_label: period.trim() || undefined,
        amount: value,
        due_date: dueDate || null,
      });
      toast.success(`${bill.bill_number} created`);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the bill");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium">Type</label>
        <div role="tablist" aria-label="Bill type" className="inline-flex w-full gap-0.5 bg-muted/70 p-0.5">
          {(["subscription", "module", "plugin"] as BillType[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={billType === t}
              onClick={() => setBillType(t)}
              className={cn(
                "h-8 flex-1 text-xs font-medium transition-colors",
                billType === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {BILL_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium" htmlFor="bill-title">Title</label>
        <Input
          id="bill-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            billType === "subscription"
              ? "e.g. Business plan — November 2026"
              : billType === "module"
                ? "e.g. HRM module"
                : "e.g. Pathao Courier plugin"
          }
          className="rounded-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium" htmlFor="bill-ref">{refLabel} (optional)</label>
          <Input id="bill-ref" value={reference} onChange={(e) => setReference(e.target.value)} className="rounded-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" htmlFor="bill-period">Period (optional)</label>
          <Input id="bill-period" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="Nov 2026" className="rounded-none" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium" htmlFor="bill-amount">Amount (BDT)</label>
          <Input id="bill-amount" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" htmlFor="bill-due">Due date</label>
          <Input id="bill-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded-none" />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium" htmlFor="bill-desc">Note (optional)</label>
        <Textarea id="bill-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[80px] rounded-none" />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" className="rounded-none" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" className="rounded-none" onClick={() => void submit()} disabled={saving}>
          {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Create bill
        </Button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------------------- gateway setup */

function GatewaySheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Payment gateway</SheetTitle>
          <SheetDescription>
            The SSLCommerz merchant account that collects these bills. It is separate from your shop&apos;s own
            payment plugins, which only take money from your shoppers.
          </SheetDescription>
        </SheetHeader>
        <GatewayForm onClose={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

function GatewayForm({ onClose }: { onClose: () => void }) {
  const canWrite = useAdminCanWrite();
  const [settings, setSettings] = useState<BillingGatewaySettings | null>(null);
  const [storeId, setStoreId] = useState("");
  const [password, setPassword] = useState("");
  const [environment, setEnvironment] = useState<"sandbox" | "production">("sandbox");
  const [busy, setBusy] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchGatewaySettings()
      .then((s) => {
        if (cancelled) return;
        setSettings(s);
        setStoreId(s.store_id);
        setEnvironment(s.environment);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load the gateway settings"));
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (): Promise<boolean> => {
    setBusy(true);
    try {
      const s = await saveGatewaySettings({
        store_id: storeId,
        store_password: password || undefined,
        environment,
      });
      setSettings(s);
      setPassword("");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!(await save())) return;
    setBusy(true);
    try {
      const r = await verifyGateway();
      setVerifyMsg({ ok: r.status === "connected", text: r.message });
    } catch (err) {
      setVerifyMsg({ ok: false, text: err instanceof Error ? err.message : "Could not verify" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium">Status</span>
        {settings?.ready ? (
          <Badge variant="success" className="rounded-none">Ready to take payments</Badge>
        ) : (
          <Badge variant="warning" className="rounded-none">Not set up — pay links cannot charge yet</Badge>
        )}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium" htmlFor="gw-store">Store ID</label>
        <Input id="gw-store" value={storeId} onChange={(e) => setStoreId(e.target.value)} disabled={!canWrite} className="rounded-none font-mono text-xs" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium" htmlFor="gw-pass">Store password</label>
        <Input
          id="gw-pass"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={settings?.store_password_set ? "•••••••• (saved — leave blank to keep)" : "Store password"}
          disabled={!canWrite}
          autoComplete="new-password"
          className="rounded-none font-mono text-xs"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium">Environment</label>
        <div role="tablist" aria-label="Environment" className="inline-flex w-full gap-0.5 bg-muted/70 p-0.5">
          {(["sandbox", "production"] as const).map((env) => (
            <button
              key={env}
              type="button"
              role="tab"
              aria-selected={environment === env}
              disabled={!canWrite}
              onClick={() => setEnvironment(env)}
              className={cn(
                "h-8 flex-1 text-xs font-medium transition-colors",
                environment === env ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {env === "production" ? "Live" : "Sandbox (test)"}
            </button>
          ))}
        </div>
      </div>
      {verifyMsg ? (
        <p className={cn("text-xs", verifyMsg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
          {verifyMsg.text}
        </p>
      ) : null}
      {canWrite ? (
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" className="rounded-none" disabled={busy} onClick={() => void verify()}>
            Save &amp; test
          </Button>
          <Button
            size="sm"
            className="rounded-none"
            disabled={busy}
            onClick={() =>
              void save().then((ok) => {
                if (ok) {
                  toast.success("Gateway settings saved");
                  onClose();
                }
              })
            }
          >
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Save
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------------------- mark as paid */

function MarkPaidDialog({
  bill,
  onClose,
  onDone,
}: {
  bill: ErpBill | null;
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <Dialog.Root open={Boolean(bill)} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2 border border-input bg-background p-5 shadow-xl">
          <Dialog.Title className="text-base font-semibold">Mark as paid</Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-muted-foreground">
            For money received outside the pay link (bank transfer, cash…). {bill?.bill_number} —{" "}
            {bill ? money(bill.amount, bill.currency) : ""}
          </Dialog.Description>
          {bill ? <MarkPaidForm bill={bill} onClose={onClose} onDone={onDone} /> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function MarkPaidForm({ bill, onClose, onDone }: { bill: ErpBill; onClose: () => void; onDone: () => void }) {
  const [method, setMethod] = useState("bank");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await markBillPaid(bill.id, { method, reference: reference.trim() || undefined });
      toast.success(`${bill.bill_number} marked as paid`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mark as paid");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium">Received by</label>
          <FilterSelect
            value={method}
            onChange={setMethod}
            width="w-full"
            ariaLabel="Payment method"
            options={[
              { value: "bank", label: "Bank transfer" },
              { value: "cash", label: "Cash" },
              { value: "bkash", label: "bKash" },
              { value: "nagad", label: "Nagad" },
              { value: "other", label: "Other" },
            ]}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" htmlFor="paid-ref">Reference (optional)</label>
          <Input id="paid-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction / slip no." className="rounded-none" />
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" size="sm" className="rounded-none" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" className="rounded-none" onClick={() => void submit()} disabled={busy}>
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Mark paid
        </Button>
      </div>
    </>
  );
}
