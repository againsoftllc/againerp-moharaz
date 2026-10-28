"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import { recordSupplierPayment } from "@/lib/api/supplier-ledger";
import { ChequeFormDrawer } from "@/components/finance/cheque-form-drawer";
import { fetchPaymentAccounts, type ApiFinancePaymentAccount } from "@/lib/api/finance";
import { formatCurrency } from "@/lib/utils";

function Field({ label, children, hidden }: { label: string; children: React.ReactNode; hidden?: boolean }) {
  if (hidden) return null;
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}

export function RecordPaymentDrawer({
  open,
  onOpenChange,
  supplierId,
  supplierName,
  outstanding,
  advance = 0,
  onRecorded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: string;
  supplierName?: string;
  outstanding: number;
  advance?: number;
  onRecorded?: () => void;
}) {
  const [amount, setAmount] = useState(outstanding > 0 ? String(outstanding) : "");
  const [method, setMethod] = useState("bank");
  const [paymentAccounts, setPaymentAccounts] = useState<ApiFinancePaymentAccount[]>([]);
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [writeOffAmount, setWriteOffAmount] = useState("");
  const [writeOffReason, setWriteOffReason] = useState("");
  const [showWriteOff, setShowWriteOff] = useState(false);
  const [saving, setSaving] = useState(false);
  const [chequeOpen, setChequeOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetchPaymentAccounts()
      .then((res) => {
        setPaymentAccounts(res.data);
        setPaymentAccountId((current) =>
          current || res.data.find((a) => a.is_default)?.id || res.data[0]?.id || "",
        );
      })
      .catch(() => setPaymentAccounts([]));
  }, [open]);

  const value = Number.parseFloat(amount) || 0;
  const writeOffValue = Number.parseFloat(writeOffAmount) || 0;
  const blocked = value <= 0 && writeOffValue <= 0;
  const overpaying = value > 0 && value + writeOffValue > outstanding && outstanding > 0;

  // A cheque is not money out yet: it has to be issued from a cheque book and followed until the bank honours or dishonours it.
  const byCheque = method === "cheque";

  const submit = async () => {
    if (blocked) return;
    if (byCheque) {
      setChequeOpen(true);
      return;
    }
    setSaving(true);
    try {
      const payment = await recordSupplierPayment(supplierId, {
        amount: value,
        paymentDate,
        paymentMethod: method,
        paymentAccountId: paymentAccountId || undefined,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        writeOffAmount: writeOffValue > 0 ? writeOffValue : undefined,
        writeOffReason: writeOffValue > 0 ? writeOffReason.trim() || undefined : undefined,
      });
      toast.success(
        payment.applied_to.length
          ? `${payment.payment_number} applied to ${payment.applied_to.join(", ")}`
          : `${payment.payment_number} recorded as advance`,
      );
      onOpenChange(false);
      onRecorded?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[420px] max-w-[92vw] flex-col p-0">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Record payment</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {supplierName ? `${supplierName} — ` : ""}
            {outstanding > 0
              ? `we owe ${formatCurrency(outstanding)}`
              : advance > 0
                ? `advance ${formatCurrency(advance)} on this account`
                : "no open bills — payment will be recorded as advance"}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <Field label="Amount">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="rounded-none"
            />
            {(overpaying || (outstanding <= 0 && Number.isFinite(value) && value > 0)) && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                {outstanding <= 0
                  ? "This will sit as advance until the next bill."
                  : "More than we owe — leftover will sit as advance."}
              </p>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="rounded-none"
              />
            </Field>
            <Field label="Method">
              <FilterSelect
                value={method}
                onChange={setMethod}
                width="w-full"
                ariaLabel="Payment method"
                options={[
                  { value: "bank", label: "Bank transfer" },
                  { value: "cash", label: "Cash" },
                  { value: "cheque", label: "Cheque" },
                  { value: "mobile", label: "Mobile money" },
                  { value: "card", label: "Card" },
                ]}
              />
            </Field>
          </div>

          {byCheque ? (
            <div className="space-y-1 border border-dashed border-border p-3 text-[11px] text-muted-foreground">
              <p className="text-xs font-medium text-foreground">Paying by cheque</p>
              <p>
                The cheque is issued from a cheque book and goes on this supplier&apos;s account now, so the bill is settled. The bank only
                moves when the bank honours it. If the bank dishonours it, the amount comes back onto the supplier&apos;s account and the bill.
              </p>
            </div>
          ) : null}

          <Field label="Payment account" hidden={byCheque}>
            <FilterSelect
              value={paymentAccountId}
              onChange={setPaymentAccountId}
              width="w-full"
              ariaLabel="Payment account"
              options={
                paymentAccounts.length
                  ? paymentAccounts.map((a) => ({
                      value: a.id,
                      label: `${a.name} (${formatCurrency(Number(a.balance))})`,
                    }))
                  : [{ value: "", label: "No accounts" }]
              }
            />
          </Field>

          <Field label="Reference" hidden={byCheque}>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Bank transaction id, cheque no…"
              className="rounded-none"
            />
          </Field>

          <Field label="Notes">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className="rounded-none"
            />
          </Field>

          {showWriteOff ? (
            <div className="space-y-3 border border-dashed border-border p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-foreground">Discount / write-off</p>
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setShowWriteOff(false);
                    setWriteOffAmount("");
                    setWriteOffReason("");
                  }}
                >
                  Remove
                </button>
              </div>
              <Field label="Amount">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={writeOffAmount}
                  onChange={(e) => setWriteOffAmount(e.target.value)}
                  className="rounded-none"
                />
              </Field>
              <Field label="Reason">
                <Input
                  value={writeOffReason}
                  onChange={(e) => setWriteOffReason(e.target.value)}
                  placeholder="e.g. Early payment discount"
                  className="rounded-none"
                />
              </Field>
              <p className="text-[11px] text-muted-foreground">
                Posted as a discount so the bill closes at ৳0 without needing exact cash.
              </p>
            </div>
          ) : (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => setShowWriteOff(true)}
            >
              + Add discount / payment adjustment
            </button>
          )}

          <p className="text-[11px] text-muted-foreground">
            Applied to the oldest open bills first.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={blocked || saving} onClick={() => void submit()}>
            {saving ? "Recording…" : byCheque ? "Issue cheque…" : "Record payment"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
      <ChequeFormDrawer
        open={chequeOpen}
        onOpenChange={setChequeOpen}
        initial={{ direction: "issued", partyId: supplierId, amount: value > 0 ? String(value) : undefined }}
        onCreated={(cheque) => {
          toast.success(`Cheque ${cheque.cheque_number} issued to ${supplierName ?? "the supplier"} — it follows the cheque until the bank honours it`);
          onOpenChange(false);
          onRecorded?.();
        }}
      />
    </>
  );
}
