"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { FilterSelect } from "@/components/shared/filter-select";
import { Textarea } from "@/components/ui/textarea";
import { BD_BANKS } from "@/lib/finance/bd-banks";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ChequeStatusBadge } from "@/components/finance/cheque-status-badge";
import {
  applyFinanceChequeAction,
  fetchFinanceCheque,
  fetchPaymentAccounts,
  updateFinanceCheque,
  type ApiFinanceChequeDetail,
  type ApiFinancePaymentAccount,
  type ChequeAction,
} from "@/lib/api/finance";
import { formatCurrency, formatDate } from "@/lib/utils";

const ACTION_LABEL: Record<ChequeAction, string> = {
  deposit: "Deposit",
  present: "Mark presented",
  clear: "Confirm honoured",
  bounce: "Mark dishonoured",
  cancel: "Cancel cheque",
  represent: "Present again",
  close: "Close",
};

const ACTION_HINT: Partial<Record<ChequeAction, string>> = {
  deposit: "Moves the cheque to Cheques Under Collection. The bank balance does not change yet.",
  clear: "The bank honoured (paid) the cheque — this is the only step that moves the bank balance.",
  bounce: "The bank returned the cheque. The posting is reversed and the amount goes back on the invoice or bill, so it is owed again. A bank penalty is booked to bank charges — never to the customer or supplier.",
  cancel: "Reverses the posting. The cheque stays in the history.",
  represent:
    "Sends the dishonoured cheque to the bank again. It pays the invoice or bill again; the bank balance still moves only when it is honoured.",
  close:
    "Closes the dishonoured cheque without posting anything. The amount stays owed on the account — settle it with a replacement cheque or another payment.",
};

/** Why a bank returns a cheque — recorded on the cheque's history so the next person knows what to fix. */
const DISHONOUR_REASONS = [
  "Insufficient funds",
  "Signature differs / missing",
  "Stale or post-dated cheque",
  "Payment stopped by drawer",
  "Account closed",
  "Amount in words and figures differ",
  "Other",
];

const EVENT_LABEL: Record<string, string> = {
  record: "Recorded",
  deposit: "Deposited",
  present: "Presented",
  clear: "Honoured",
  bounce: "Dishonoured",
  cancel: "Cancelled",
  represent: "Presented again",
  close: "Closed",
  edit: "Edited",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type Props = {
  chequeId: string | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
  /** After an issued cheque is dishonoured: start a replacement for the same supplier and bill. */
  onReplace?: (cheque: ApiFinanceChequeDetail) => void;
};

export function ChequeDetailDrawer({ chequeId, onOpenChange, onChanged, onReplace }: Props) {
  const [cheque, setCheque] = React.useState<ApiFinanceChequeDetail | null>(null);
  const [accounts, setAccounts] = React.useState<ApiFinancePaymentAccount[]>([]);
  const [action, setAction] = React.useState<ChequeAction | null>(null);
  const [accountId, setAccountId] = React.useState("");
  const [date, setDate] = React.useState(todayIso());
  const [charge, setCharge] = React.useState("");
  const [reason, setReason] = React.useState(DISHONOUR_REASONS[0]);
  const [reasonNote, setReasonNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [editBank, setEditBank] = React.useState("");
  const [editNumber, setEditNumber] = React.useState("");
  const [editDate, setEditDate] = React.useState("");
  const [editNotes, setEditNotes] = React.useState("");

  const load = React.useCallback(async (id: string) => {
    try {
      setCheque((await fetchFinanceCheque(id)).data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load cheque");
    }
  }, []);

  React.useEffect(() => {
    setAction(null);
    setEditing(false);
    setCheque(null);
    if (!chequeId) return;
    void load(chequeId);
    fetchPaymentAccounts()
      .then((res) => setAccounts(res.data.filter((a) => a.kind === "bank" && a.is_active)))
      .catch(() => setAccounts([]));
  }, [chequeId, load]);

  function startAction(next: ChequeAction) {
    setAction(next);
    setDate(todayIso());
    setCharge("");
    setReason(DISHONOUR_REASONS[0]);
    setReasonNote("");
    setAccountId(cheque?.payment_account_id ?? accounts[0]?.id ?? "");
  }

  const canEdit = cheque ? !["cleared", "bounced", "cancelled"].includes(cheque.status) : false;

  function startEdit() {
    if (!cheque) return;
    setEditBank(cheque.bank_name);
    setEditNumber(cheque.cheque_number);
    setEditDate(cheque.cheque_date);
    setEditNotes(cheque.notes ?? "");
    setAction(null);
    setEditing(true);
  }

  async function saveEdit() {
    if (!cheque) return;
    setSaving(true);
    try {
      const res = await updateFinanceCheque(cheque.id, {
        bank_name: editBank,
        cheque_number: editNumber.trim(),
        cheque_date: editDate,
        notes: editNotes,
      });
      setCheque(res.data);
      setEditing(false);
      toast.success("Cheque updated");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update cheque");
    } finally {
      setSaving(false);
    }
  }

  const needsAccount =
    action === "deposit" ||
    action === "clear" ||
    (action === "represent" && cheque?.direction === "received") ||
    (action === "bounce" && Number(charge || 0) > 0);

  async function confirm() {
    if (!cheque || !action) return;
    if (needsAccount && !accountId) {
      toast.error("Choose the bank account");
      return;
    }
    setSaving(true);
    try {
      const res = await applyFinanceChequeAction(cheque.id, {
        action,
        action_date: date,
        payment_account_id: needsAccount ? accountId : undefined,
        bank_charge: action === "bounce" && Number(charge || 0) > 0 ? charge : undefined,
        note:
          action === "bounce"
            ? [reason, reasonNote.trim()].filter(Boolean).join(" — ")
            : action === "represent" || action === "close"
              ? reasonNote.trim() || undefined
              : undefined,
      });
      setCheque(res.data);
      setAction(null);
      toast.success(`${ACTION_LABEL[action]} done`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
      if (cheque) void load(cheque.id);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={Boolean(chequeId)} onOpenChange={onOpenChange}>
      <SheetContent side="right" title="Cheque" className="w-full max-w-lg overflow-y-auto">
        {!cheque ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="flex items-center gap-2 pr-8">
              <h2 className="text-base font-semibold">Cheque {cheque.cheque_number}</h2>
              <ChequeStatusBadge status={cheque.status} />
            </div>
            <p className="mt-1 text-xs capitalize text-muted-foreground">
              {cheque.direction} · {cheque.bank_name}
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <dt className="text-muted-foreground">{cheque.party_type === "customer" ? "Customer" : "Supplier"}</dt>
              <dd className="text-right font-medium">{cheque.party_name ?? "—"}</dd>
              <dt className="text-muted-foreground">Amount</dt>
              <dd className="text-right font-medium tabular-nums">{formatCurrency(Number(cheque.amount))}</dd>
              <dt className="text-muted-foreground">Cheque date</dt>
              <dd className="text-right">{formatDate(cheque.cheque_date)}</dd>
              <dt className="text-muted-foreground">{cheque.direction === "received" ? "Invoice" : "Bill"}</dt>
              <dd className="text-right">{cheque.document_number ?? "On account"}</dd>
              <dt className="text-muted-foreground">Bank account</dt>
              <dd className="text-right">{cheque.payment_account_name ?? "—"}</dd>
              {Number(cheque.bank_charge) > 0 ? (
                <>
                  <dt className="text-muted-foreground">Bank charge</dt>
                  <dd className="text-right tabular-nums">{formatCurrency(Number(cheque.bank_charge))}</dd>
                </>
              ) : null}
            </dl>
            {cheque.notes ? <p className="mt-2 text-xs text-muted-foreground">{cheque.notes}</p> : null}

            {canEdit && !editing ? (
              <button type="button" onClick={startEdit} className="mt-2 text-[11px] text-primary hover:underline">
                Edit details
              </button>
            ) : null}

            {editing ? (
              <div className="mt-3 space-y-3 border border-input p-3">
                <p className="text-xs font-medium">Edit details</p>
                <p className="text-[11px] text-muted-foreground">
                  Amount, party and invoice are already posted. To change them, cancel this cheque and record a new one.
                </p>
                <div className="flex flex-col gap-1.5">
                  <Label>Bank name</Label>
                  <FilterSelect
                    value={editBank}
                    onChange={setEditBank}
                    options={[
                      ...(BD_BANKS.includes(editBank) ? [] : [{ value: editBank, label: editBank }]),
                      ...BD_BANKS.map((b) => ({ value: b, label: b })),
                    ]}
                    searchThreshold={0}
                    searchPlaceholder="Search bank…"
                    width="w-full"
              avoidCollisions
                    ariaLabel="Bank name"
                    disabled={saving}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>Cheque number</Label>
                    <Input value={editNumber} onChange={(e) => setEditNumber(e.target.value)} disabled={saving} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Cheque date</Label>
                    <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} disabled={saving} />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Notes</Label>
                  <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} disabled={saving} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                    Back
                  </Button>
                  <Button size="sm" onClick={() => void saveEdit()} disabled={saving || !editNumber.trim() || !editBank}>
                    {saving ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            ) : null}

            {cheque.available_actions.length > 0 && !action && !editing ? (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-input pt-4">
                {cheque.available_actions.map((a) => (
                  <Button
                    key={a}
                    size="sm"
                    variant={a === "bounce" || a === "cancel" || a === "close" ? "outline" : "default"}
                    className="rounded-none"
                    onClick={() => startAction(a)}
                  >
                    {ACTION_LABEL[a]}
                  </Button>
                ))}
              </div>
            ) : null}

            {cheque.status === "bounced" && cheque.direction === "issued" && onReplace && !action ? (
              <div className="mt-4 border border-input p-3">
                <p className="text-xs font-medium">This cheque was dishonoured</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  The amount is back on {cheque.party_name ?? "the supplier"}&apos;s account{cheque.document_number ? ` and bill ${cheque.document_number}` : ""}. Issue a
                  new cheque (or pay another way) to settle it.
                </p>
                <Button size="sm" className="mt-2 rounded-none" onClick={() => onReplace(cheque)}>
                  Issue replacement cheque
                </Button>
              </div>
            ) : null}

            {action ? (
              <div className="mt-4 space-y-3 border border-input p-3">
                <p className="text-xs font-medium">{ACTION_LABEL[action]}</p>
                {ACTION_HINT[action] ? <p className="text-[11px] text-muted-foreground">{ACTION_HINT[action]}</p> : null}
                {action !== "present" ? (
                  <div className="flex flex-col gap-1.5">
                    <Label>Date</Label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={saving} />
                  </div>
                ) : null}
                {action === "bounce" ? (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <Label>Reason the bank gave</Label>
                      <Select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full" disabled={saving}>
                        {DISHONOUR_REASONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Note (optional)</Label>
                      <Input value={reasonNote} onChange={(e) => setReasonNote(e.target.value)} disabled={saving} placeholder="Return memo no., who you spoke to…" />
                    </div>
                  </>
                ) : null}
                {action === "represent" || action === "close" ? (
                  <div className="flex flex-col gap-1.5">
                    <Label>Note (optional)</Label>
                    <Input
                      value={reasonNote}
                      onChange={(e) => setReasonNote(e.target.value)}
                      disabled={saving}
                      placeholder={action === "close" ? "Settled by replacement cheque no.…" : "Party asked to present again on…"}
                    />
                  </div>
                ) : null}
                {action === "bounce" ? (
                  <div className="flex flex-col gap-1.5">
                    <Label>Bank penalty charged to us (optional)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={charge}
                      onChange={(e) => setCharge(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                ) : null}
                {needsAccount ? (
                  <div className="flex flex-col gap-1.5">
                    <Label>Bank account</Label>
                    <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full" disabled={saving}>
                      {accounts.length === 0 ? <option value="">No bank accounts</option> : null}
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setAction(null)} disabled={saving}>
                    Back
                  </Button>
                  <Button size="sm" onClick={() => void confirm()} disabled={saving}>
                    {saving ? "Saving…" : "Confirm"}
                  </Button>
                </div>
              </div>
            ) : null}

            <h3 className="mt-5 border-b border-input pb-1 text-xs font-semibold uppercase text-muted-foreground">History</h3>
            <ul className="mt-2 space-y-1.5 text-xs">
              {cheque.events.map((e) => (
                <li key={e.id} className="flex justify-between gap-3">
                  <span>
                    <span className="capitalize">{EVENT_LABEL[e.action] ?? e.action.replace(/_/g, " ")}</span>
                    {e.note ? <span className="block text-[11px] text-muted-foreground">{e.note}</span> : null}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{formatDate(e.event_date)}</span>
                </li>
              ))}
            </ul>

            <h3 className="mt-5 border-b border-input pb-1 text-xs font-semibold uppercase text-muted-foreground">
              Accounting entries
            </h3>
            {cheque.journal_entries.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No entries yet.</p>
            ) : (
              <div className="mt-2 space-y-3">
                {cheque.journal_entries.map((entry) => (
                  <div key={entry.id} className="text-xs">
                    <p className="font-medium">
                      {entry.entry_number} <span className="font-normal text-muted-foreground">· {entry.description}</span>
                    </p>
                    <table className="mt-1 w-full">
                      <tbody>
                        {entry.lines.map((line) => (
                          <tr key={line.id} className="border-t border-border">
                            <td className="py-1">
                              {line.account_code} {line.account_name}
                            </td>
                            <td className="w-20 py-1 text-right tabular-nums">
                              {Number(line.debit) ? formatCurrency(Number(line.debit)) : ""}
                            </td>
                            <td className="w-20 py-1 text-right tabular-nums">
                              {Number(line.credit) ? formatCurrency(Number(line.credit)) : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
