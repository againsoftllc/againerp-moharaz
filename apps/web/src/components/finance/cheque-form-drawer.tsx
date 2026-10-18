"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExternalLink } from "lucide-react";
import { FilterSelect } from "@/components/shared/filter-select";
import { AgainPartnerDrawer } from "@/components/shared/again-partner-drawer";
import { SupplierDetailDrawer } from "@/components/suppliers/supplier-detail-drawer";
import { getCommerceCustomer } from "@/lib/api/commerce-customers";
import type { Customer } from "@/lib/mock-data/customers";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api/client";
import {
  createFinanceCheque,
  fetchFinancePayablesForSupplier,
  fetchFinanceReceivables,
  type ApiFinanceCheque,
  type ChequeDirection,
} from "@/lib/api/finance";
import { BD_BANKS } from "@/lib/finance/bd-banks";
import { formatCurrency } from "@/lib/utils";

type PartyOption = { id: string; name: string };
type DocOption = { id: string; label: string; balance: number };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function loadParties(direction: ChequeDirection): Promise<PartyOption[]> {
  const path = direction === "received" ? "/api/v1/commerce/customers" : "/api/v1/commerce/suppliers";
  const res = await apiFetch<{ data: Array<{ id: string; name: string }> }>(`${path}?limit=500`);
  return res.data.map((row) => ({ id: row.id, name: row.name }));
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (cheque: ApiFinanceCheque) => void;
};

export function ChequeFormDrawer({ open, onOpenChange, onCreated }: Props) {
  const [direction, setDirection] = React.useState<ChequeDirection>("received");
  const [parties, setParties] = React.useState<PartyOption[]>([]);
  const [partyId, setPartyId] = React.useState("");
  const [docs, setDocs] = React.useState<DocOption[]>([]);
  const [docId, setDocId] = React.useState("");
  const [bankName, setBankName] = React.useState("");
  const [chequeNumber, setChequeNumber] = React.useState("");
  const [chequeDate, setChequeDate] = React.useState(todayIso());
  const [amount, setAmount] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [partnerRecord, setPartnerRecord] = React.useState<Customer | null>(null);
  const [partnerOpen, setPartnerOpen] = React.useState(false);
  const [supplierDrawerId, setSupplierDrawerId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setDirection("received");
    setPartyId("");
    setDocId("");
    setBankName("");
    setChequeNumber("");
    setChequeDate(todayIso());
    setAmount("");
    setNotes("");
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPartyId("");
    setParties([]);
    loadParties(direction)
      .then((rows) => !cancelled && setParties(rows))
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load parties"));
    return () => {
      cancelled = true;
    };
  }, [open, direction]);

  React.useEffect(() => {
    setDocId("");
    setDocs([]);
    if (!open || !partyId) return;
    let cancelled = false;
    const run = async () => {
      if (direction === "received") {
        const res = await fetchFinanceReceivables({ customer_id: partyId, limit: 200 });
        return res.data
          .filter((r) => r.status === "open" || r.status === "partial")
          .map((r) => ({ id: r.id, label: r.invoice_number, balance: Number(r.balance) }));
      }
      const res = await fetchFinancePayablesForSupplier(partyId);
      return res.data
        .filter((r) => r.status === "open" || r.status === "partial")
        .map((r) => ({ id: r.id, label: r.reference_number, balance: Number(r.balance) }));
    };
    run()
      .then((rows) => !cancelled && setDocs(rows))
      .catch(() => !cancelled && setDocs([]));
    return () => {
      cancelled = true;
    };
  }, [open, direction, partyId]);

  const selectedDoc = docs.find((d) => d.id === docId);
  const amountNum = Number(amount || 0);
  const overLimit = Boolean(selectedDoc) && amountNum > (selectedDoc?.balance ?? 0);
  const isValid =
    Boolean(partyId) && bankName.trim() !== "" && chequeNumber.trim() !== "" && amountNum > 0 && !overLimit;

  function pickDoc(id: string) {
    setDocId(id);
    const doc = docs.find((d) => d.id === id);
    if (doc && !amount) setAmount(String(doc.balance));
  }

  async function openParty() {
    if (!partyId) return;
    if (direction === "issued") {
      setSupplierDrawerId(partyId);
      return;
    }
    try {
      setPartnerRecord(await getCommerceCustomer(partyId));
      setPartnerOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load customer");
    }
  }

  async function submit() {
    if (!isValid) return;
    setSaving(true);
    try {
      const res = await createFinanceCheque({
        direction,
        party_id: partyId,
        bank_name: bankName.trim(),
        cheque_number: chequeNumber.trim(),
        cheque_date: chequeDate,
        amount,
        receivable_id: direction === "received" && docId ? docId : undefined,
        payable_id: direction === "issued" && docId ? docId : undefined,
        notes: notes.trim() || undefined,
      });
      toast.success(`Cheque ${res.data.cheque_number} recorded`);
      onOpenChange(false);
      onCreated(res.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save cheque");
    } finally {
      setSaving(false);
    }
  }

  const partyLabel = direction === "received" ? "Customer" : "Supplier";
  const docLabel = direction === "received" ? "Invoice" : "Bill";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" title="New cheque" className="w-full max-w-md overflow-y-auto">
        <div className="flex items-center justify-between gap-2 pr-8">
          <h2 className="text-base font-semibold">New cheque</h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void submit()} disabled={!isValid || saving}>
              {saving ? "Saving…" : "Save cheque"}
            </Button>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-1.5">
            {(["received", "issued"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={direction === value ? "default" : "outline"}
                className="rounded-none capitalize"
                onClick={() => setDirection(value)}
                disabled={saving}
              >
                {value}
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label>{partyLabel}</Label>
              {partyId ? (
                <button
                  type="button"
                  onClick={() => void openParty()}
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open {partyLabel.toLowerCase()}
                </button>
              ) : null}
            </div>
            <FilterSelect
              value={partyId}
              onChange={setPartyId}
              options={parties.map((p) => ({ value: p.id, label: p.name }))}
              searchThreshold={0}
              placeholder={`Select ${partyLabel.toLowerCase()}…`}
              searchPlaceholder={`Search ${partyLabel.toLowerCase()}…`}
              width="w-full"
              avoidCollisions
              ariaLabel={partyLabel}
              disabled={saving}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Bank name</Label>
              <FilterSelect
                value={bankName}
                onChange={setBankName}
                options={BD_BANKS.map((bank) => ({ value: bank, label: bank }))}
                searchThreshold={0}
                placeholder="Select bank…"
                searchPlaceholder="Search bank…"
                width="w-full"
              avoidCollisions
                ariaLabel="Bank name"
                disabled={saving}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Cheque number</Label>
              <Input value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} disabled={saving} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Cheque date</Label>
              <Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} disabled={saving} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Amount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{docLabel} (optional)</Label>
            <FilterSelect
              value={docId}
              onChange={pickDoc}
              options={[
                {
                  value: "",
                  label: !partyId
                    ? `Select a ${partyLabel.toLowerCase()} first`
                    : docs.length
                      ? "On account (no specific document)"
                      : `No open ${docLabel.toLowerCase()}s`,
                },
                ...docs.map((d) => ({ value: d.id, label: `${d.label} — due ${formatCurrency(d.balance)}` })),
              ]}
              width="w-full"
              avoidCollisions
              ariaLabel={docLabel}
              disabled={saving || !partyId}
            />
            {overLimit ? (
              <p className="text-[11px] text-red-600">Amount is more than the {formatCurrency(selectedDoc?.balance ?? 0)} outstanding.</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} disabled={saving} />
          </div>
        </div>
      </SheetContent>
      <AgainPartnerDrawer open={partnerOpen} customer={partnerRecord} mode="edit" onOpenChange={setPartnerOpen} />
      <SupplierDetailDrawer
        open={Boolean(supplierDrawerId)}
        supplierId={supplierDrawerId}
        onOpenChange={(next) => {
          if (!next) setSupplierDrawerId(null);
        }}
      />
    </Sheet>
  );
}
