"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { ApiFinancePaymentAccount } from "@/lib/api/finance";
import { formatCurrency } from "@/lib/utils";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function money(value: unknown) {
  const n = Number(value);
  return formatCurrency(Number.isFinite(n) ? n : 0);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: ApiFinancePaymentAccount[];
  defaultFromId?: string | null;
  onTransfer: (input: {
    from_account_id: string;
    to_account_id: string;
    amount: string;
    payment_date?: string;
    reference?: string;
    notes?: string;
  }) => Promise<void>;
};

export function PaymentAccountTransferDrawer({
  open,
  onOpenChange,
  accounts,
  defaultFromId,
  onTransfer,
}: Props) {
  const active = React.useMemo(() => accounts.filter((a) => a.is_active), [accounts]);
  const [fromId, setFromId] = React.useState("");
  const [toId, setToId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [paymentDate, setPaymentDate] = React.useState(todayIso());
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const from =
      active.find((a) => a.id === defaultFromId)?.id ??
      active.find((a) => a.is_default)?.id ??
      active[0]?.id ??
      "";
    const to = active.find((a) => a.id !== from)?.id ?? "";
    setFromId(from);
    setToId(to);
    setAmount("");
    setPaymentDate(todayIso());
    setReference("");
    setNotes("");
  }, [open, active, defaultFromId]);

  const fromAccount = active.find((a) => a.id === fromId);
  const available = Number(fromAccount?.balance ?? 0);
  const canSubmit =
    Boolean(fromId && toId && fromId !== toId && amount.trim()) && !saving && active.length >= 2;

  async function handleSubmit() {
    if (!canSubmit) return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Enter an amount greater than zero");
      return;
    }
    if (n > available) {
      toast.error(`Insufficient balance in ${fromAccount?.name ?? "this account"}`);
      return;
    }
    setSaving(true);
    try {
      await onTransfer({
        from_account_id: fromId,
        to_account_id: toId,
        amount: n.toFixed(2),
        payment_date: paymentDate,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      const toName = active.find((a) => a.id === toId)?.name ?? "account";
      toast.success(`Transferred ${money(n)} to ${toName}`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" title="Transfer funds" className="w-full max-w-sm overflow-y-auto">
        <h2 className="pr-8 text-base font-semibold">Transfer funds</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Move money from one cash, bank, or wallet account to another.
        </p>

        {active.length < 2 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            You need at least two active payment accounts to transfer.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex flex-col gap-1.5">
              <Label>From</Label>
              <Select
                value={fromId}
                onChange={(e) => {
                  const next = e.target.value;
                  setFromId(next);
                  if (next === toId) {
                    setToId(active.find((a) => a.id !== next)?.id ?? "");
                  }
                }}
                className="w-full rounded-none"
                disabled={saving}
              >
                {active.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({money(a.balance)})
                  </option>
                ))}
              </Select>
              {fromAccount ? (
                <p className="text-[11px] text-muted-foreground">Available {money(fromAccount.balance)}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>To</Label>
              <Select
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                className="w-full rounded-none"
                disabled={saving}
              >
                {active
                  .filter((a) => a.id !== fromId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({money(a.balance)})
                    </option>
                  ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Amount</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                disabled={saving}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Date</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} disabled={saving} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Reference (optional)</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Cheque / transaction no."
                disabled={saving}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Notes (optional)</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Why this transfer"
                disabled={saving}
              />
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-input pt-4">
          <Button variant="outline" size="sm" className="rounded-none" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" className="rounded-none" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {saving ? "Transferring…" : "Transfer"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
