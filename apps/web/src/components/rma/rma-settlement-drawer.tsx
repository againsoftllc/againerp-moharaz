"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
  DIRECTION_LABEL,
  PARTY_TYPES,
  PARTY_TYPE_LABEL,
  PURPOSES,
  SETTLEMENT_STATUS_LABEL,
  SETTLEMENT_STATUS_TONE,
  cancelRmaSettlement,
  createRmaSettlement,
  decideRmaSettlement,
  fetchRmaSettlement,
  reverseRmaSettlement,
  fetchRmaSettlementSummary,
  searchSettlementParties,
  submitRmaSettlement,
  updateRmaSettlement,
  type RmaSettlement,
  type RmaSettlementInput,
  type RmaSettlementSummary,
  type SettlementDirection,
  type SettlementPartyOption,
  type SettlementPartyType,
  type SettlementPurpose,
} from "@/lib/api/rma-settlements";
import { fetchPaymentAccounts, type ApiFinancePaymentAccount } from "@/lib/api/finance";
import type { RmaTicket } from "@/lib/api/rma";
import { usePermission } from "@/lib/auth/permissions";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useDrawerDraft } from "@/lib/hooks/use-drawer-draft";
import { cn, formatCurrency } from "@/lib/utils";

type Form = {
  party_type: SettlementPartyType;
  party_id: string;
  party_name: string;
  direction: SettlementDirection;
  amount: string;
  purpose: SettlementPurpose;
  purpose_note: string;
  payment_account_id: string;
  transaction_date: string;
  reference: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const money = (v: number | string) => formatCurrency(Number(v) || 0);
const kindLabel = (kind?: string | null) => (kind ? kind.replace("_", " ").replace(/^./, (c) => c.toUpperCase()) : "");
const CHARGE_PURPOSES: SettlementPurpose[] = ["parts_service", "repair_labour"];

const toForm = (s: RmaSettlement): Form => ({
  party_type: s.party_type,
  party_id: s.party_id ?? "",
  party_name: s.party_name,
  direction: s.direction,
  amount: Number(s.amount) ? String(Number(s.amount)) : "",
  purpose: s.purpose,
  purpose_note: s.purpose_note ?? "",
  payment_account_id: s.payment_account_id ?? "",
  transaction_date: s.transaction_date ?? "",
  reference: s.reference ?? "",
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 border-b border-border/80 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Choice({ active, disabled, onClick, children, tone }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode; tone?: "in" | "out" }) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "border px-2.5 py-1 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        active
          ? tone === "out"
            ? "border-red-600 bg-red-600 font-medium text-white"
            : "border-[#00a09d] bg-[#00a09d] font-medium text-white"
          : "border-border/80 bg-background text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

/** Existing-party selector: searches the Party master under the role the party type needs; "Other Party" can also be a typed name. */
function PartyPicker({
  type,
  partyId,
  partyName,
  disabled,
  onPick,
}: {
  type: SettlementPartyType;
  partyId: string;
  partyName: string;
  disabled: boolean;
  onPick: (id: string, name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SettlementPartyOption[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSearching(true);
    const handle = window.setTimeout(() => {
      void searchSettlementParties(type, query)
        .then((rows) => !cancelled && setResults(rows))
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setSearching(false));
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [open, query, type]);

  if (partyName && (partyId || type === "other") && !open) {
    return (
      <div className="flex min-h-[28px] items-center justify-between gap-2 border-b border-input text-[13px]">
        <span className="min-w-0 truncate">
          {partyName}
          {!partyId ? <span className="ml-1 text-[11px] text-muted-foreground">(not in the party list)</span> : null}
        </span>
        {!disabled ? (
          <button
            type="button"
            className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => {
              onPick("", "");
              setQuery("");
              setOpen(true);
            }}
          >
            Change
          </button>
        ) : null}
      </div>
    );
  }

  const typed = query.trim();
  return (
    <div className="relative">
      <AgainUnderlineInput
        value={query}
        onChange={(v) => {
          setQuery(v);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        readOnly={disabled}
        placeholder={`Search ${PARTY_TYPE_LABEL[type].toLowerCase()}…`}
      />
      {open && !disabled ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto border border-input bg-popover shadow-md">
          {searching ? <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p> : null}
          {!searching && results.length === 0 ? <p className="px-3 py-2 text-xs text-muted-foreground">No matching {PARTY_TYPE_LABEL[type].toLowerCase()}</p> : null}
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] hover:bg-muted"
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(r.id, r.name);
                setOpen(false);
                setQuery("");
              }}
            >
              <span className="truncate">{r.name}</span>
            </button>
          ))}
          {type === "other" && typed ? (
            <button
              type="button"
              className="w-full border-t border-border/60 px-3 py-1.5 text-left text-[13px] hover:bg-muted"
              onMouseDown={(e) => {
                e.preventDefault();
                onPick("", typed);
                setOpen(false);
                setQuery("");
              }}
            >
              Use “{typed}” as a one-off name
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * RMA settlement (money in / money out), in the common drawer. One reusable form: party type + party, direction, amount,
 * purpose + the required reason, payment account / date / reference. Product delivery is a separate drawer: a settlement never
 * moves stock and a delivery never posts money. Nothing is posted until it is approved; approval goes through Finance once.
 * `settlementId` null = a new settlement (created as a draft on Save).
 */
export function RmaSettlementDrawer({
  open,
  onOpenChange,
  settlementId,
  ticket,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settlementId: string | null;
  ticket: RmaTicket;
  onDone: () => void;
}) {
  const canWrite = useAdminCanWrite();
  const canRecord = usePermission("rma_payment", "write");
  const canApprove = usePermission("rma_settlement_approve", "write");
  const [settlement, setSettlement] = useState<RmaSettlement | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [summary, setSummary] = useState<RmaSettlementSummary | null>(null);
  const [accounts, setAccounts] = useState<ApiFinancePaymentAccount[]>([]);
  const [reason, setReason] = useState("");
  const [reverseOpen, setReverseOpen] = useState(false);
  const [reverseReason, setReverseReason] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<number | null>(null);
  const isNew = !settlementId && !settlement;

  const blank = useCallback(
    (accountId: string): Form => ({
      party_type: "customer",
      party_id: ticket.customer_id ?? "",
      party_name: ticket.customer_id ? ticket.customer_name : "",
      direction: "in",
      amount: "",
      purpose: "parts_service",
      purpose_note: "",
      payment_account_id: accountId,
      transaction_date: today(),
      reference: "",
    }),
    [ticket.customer_id, ticket.customer_name],
  );

  useEffect(() => {
    setSettlement(null);
    setForm(null);
    setReason("");
    setReverseOpen(false);
    setReverseReason("");
    if (!open) return;
    let cancelled = false;
    void fetchRmaSettlementSummary(ticket.id)
      .then((s) => !cancelled && setSummary(s))
      .catch(() => undefined);
    void fetchPaymentAccounts()
      .then((res) => {
        if (cancelled) return;
        const active = res.data.filter((a) => a.is_active);
        setAccounts(active);
        if (!settlementId) setForm(blank(active.find((a) => a.is_default)?.id ?? active[0]?.id ?? ""));
      })
      .catch(() => {
        if (!cancelled && !settlementId) setForm(blank(""));
      });
    if (settlementId) {
      void fetchRmaSettlement(settlementId)
        .then((s) => {
          if (cancelled) return;
          setSettlement(s);
          setForm(toForm(s));
        })
        .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load the settlement"));
    }
    return () => {
      cancelled = true;
    };
  }, [open, settlementId, ticket.id, blank]);

  const status = settlement?.status;
  const editable = canWrite && canRecord && (isNew || status === "draft" || status === "correction_requested");
  // A reversal mirrors the settlement it undoes: only the explanation, date and reference stay editable.
  const coreLocked = !editable || Boolean(settlement?.reverses_id);
  const saved = useMemo(() => (settlement ? toForm(settlement) : null), [settlement]);
  const dirty = Boolean(form && (saved ? JSON.stringify(form) !== JSON.stringify(saved) : isNew && (form.amount || form.purpose_note || form.reference)));
  const draftKey = open ? (settlementId ? `rma-settlement:${settlementId}` : `rma-settlement:new:${ticket.id}`) : null;
  const { saveDraftIfDirty, clear: clearDraft } = useDrawerDraft<{ form: Form; scrollTop: number }>({
    key: draftKey,
    ready: Boolean(open && form && (settlementId ? settlement : true)),
    dirty,
    getValues: () => ({ form: form as Form, scrollTop: scrollRef.current?.scrollTop ?? 0 }),
    restore: (values) => {
      setForm(values.form);
      pendingScroll.current = values.scrollTop;
    },
    onDiscard: () => setForm(settlement ? toForm(settlement) : blank(accounts.find((a) => a.is_default)?.id ?? "")),
    label: "settlement",
  });
  useEffect(() => {
    if (pendingScroll.current == null) return;
    const top = pendingScroll.current;
    pendingScroll.current = null;
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top }));
  }, [form]);

  const handleOpenChange = (next: boolean) => {
    if (!next) saveDraftIfDirty();
    onOpenChange(next);
  };

  const patch = (changes: Partial<Form>) => setForm((current) => (current ? { ...current, ...changes } : current));
  const changeType = (type: SettlementPartyType) => {
    if (!form || type === form.party_type) return;
    const own = type === "customer" && ticket.customer_id;
    patch({ party_type: type, party_id: own ? ticket.customer_id ?? "" : "", party_name: own ? ticket.customer_name : "" });
  };

  const isReversal = Boolean(settlement?.reverses_id);
  const canReverse = Boolean(settlement && settlement.status === "approved" && settlement.payment_number && !settlement.reverses_id && !settlement.reversed_by_id && canWrite && canRecord);

  const payload = (f: Form): RmaSettlementInput =>
    settlement?.reverses_id
      ? {
          purpose_note: f.purpose_note.trim() || null,
          transaction_date: f.transaction_date || null,
          reference: f.reference.trim() || null,
        }
      : fullPayload(f);

  const fullPayload = (f: Form): RmaSettlementInput => ({
    party_type: f.party_type,
    party_id: f.party_id || null,
    party_name: f.party_id ? null : f.party_name.trim() || null,
    direction: f.direction,
    amount: Number(f.amount) || 0,
    purpose: f.purpose,
    purpose_note: f.purpose_note.trim() || null,
    payment_account_id: f.payment_account_id || null,
    transaction_date: f.transaction_date || null,
    reference: f.reference.trim() || null,
  });

  const run = async (fn: () => Promise<RmaSettlement>, done: string, close = false) => {
    setBusy(true);
    try {
      const next = await fn();
      setSettlement(next);
      setForm(toForm(next));
      clearDraft();
      toast.success(done);
      onDone();
      void fetchRmaSettlementSummary(ticket.id).then(setSummary).catch(() => undefined);
      if (close) onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the settlement");
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!form) return;
    return settlement ? run(() => updateRmaSettlement(settlement.id, payload(form)), "Saved") : run(() => createRmaSettlement(ticket.id, payload(form)), "Settlement saved as a draft");
  };

  const decide = (decision: "approved" | "rejected" | "correction_requested") => {
    if (!settlement) return;
    if (decision !== "approved" && !reason.trim()) {
      toast.error("Write the reason first — it is kept with the decision.");
      return;
    }
    void run(
      () => decideRmaSettlement(settlement.id, decision, reason.trim() || undefined),
      decision === "approved" ? "Settlement approved and posted" : decision === "rejected" ? "Settlement rejected" : "Sent back for correction",
    );
  };

  const reverse = () => {
    if (!settlement) return;
    if (reverseReason.trim().length < 3) {
      toast.error("Write why this settlement is being reversed.");
      return;
    }
    void run(() => reverseRmaSettlement(settlement.id, reverseReason.trim()), "Reversal opened as a draft — send it for approval");
  };

  const cancel = () => {
    if (!settlement || !window.confirm(`Cancel ${settlement.settlement_number}?`)) return;
    void run(() => cancelRmaSettlement(settlement.id), "Settlement cancelled", true);
  };

  const account = accounts.find((a) => a.id === form?.payment_account_id);
  const owed = Number(summary?.outstanding ?? 0);
  const isCharge = Boolean(form && CHARGE_PURPOSES.includes(form.purpose) && form.direction === "in");
  const noteTooShort = Boolean(form && form.purpose === "other" && form.purpose_note.trim().length < 20);
  const title = settlement?.settlement_number ?? "New settlement";

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={handleOpenChange}
      title="RMA settlement"
      nested
      resizable
      defaultWidth={620}
      minWidth={420}
      widthStorageKey="again-rma-settlement-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar trailing={<AgainDrawerCloseButton onClick={() => handleOpenChange(false)} />}>
          {form ? (
            editable && dirty ? (
              <>
                <AgainDrawerButton variant="primary" onClick={() => void save()} disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </AgainDrawerButton>
                <AgainDrawerButton
                  onClick={() => {
                    clearDraft();
                    setForm(settlement ? toForm(settlement) : blank(accounts.find((a) => a.is_default)?.id ?? ""));
                  }}
                  disabled={busy}
                >
                  Discard
                </AgainDrawerButton>
              </>
            ) : settlement ? (
              <>
                {(status === "draft" || status === "correction_requested") && (
                  <AgainDrawerButton variant="primary" onClick={() => void run(() => submitRmaSettlement(settlement.id), "Sent for approval")} disabled={busy || !canWrite || !canRecord}>
                    Send for approval
                  </AgainDrawerButton>
                )}
                {status === "pending_approval" && (
                  <>
                    <AgainDrawerButton variant="primary" onClick={() => decide("approved")} disabled={busy || !canApprove} title={canApprove ? undefined : "Needs the settlement approval permission"}>
                      Approve &amp; post
                    </AgainDrawerButton>
                    <AgainDrawerButton onClick={() => decide("correction_requested")} disabled={busy || !canApprove}>
                      Return for correction
                    </AgainDrawerButton>
                    <AgainDrawerButton variant="danger" onClick={() => decide("rejected")} disabled={busy || !canApprove}>
                      Reject
                    </AgainDrawerButton>
                  </>
                )}
                {canReverse && (
                  <AgainDrawerButton onClick={() => setReverseOpen((v) => !v)} disabled={busy}>
                    Reverse…
                  </AgainDrawerButton>
                )}
                {canWrite && canRecord && ["draft", "correction_requested", "pending_approval"].includes(settlement.status) && (
                  <AgainDrawerButton onClick={cancel} disabled={busy}>
                    Cancel
                  </AgainDrawerButton>
                )}
              </>
            ) : null
          ) : null}
        </AgainDrawerControlBar>

        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS} scrollRef={scrollRef}>
          {!form ? (
            <div className="space-y-3" aria-hidden>
              <div className="fb-shimmer h-8 w-56 rounded" />
              <div className="fb-shimmer h-32 w-full rounded" />
            </div>
          ) : (
            <div className="@container space-y-5">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className={cn(AGAIN_FORM_RECORD_TITLE_CLASS, settlement && "font-mono")}>{title}</h2>
                  <Badge variant="outline" className={cn("rounded-none text-[10px]", SETTLEMENT_STATUS_TONE[settlement?.status ?? "draft"])}>
                    {SETTLEMENT_STATUS_LABEL[settlement?.status ?? "draft"]}
                  </Badge>
                  <Badge variant="outline" className={cn("rounded-none text-[10px]", form.direction === "out" ? "border-red-500/40 text-red-600 dark:text-red-400" : "border-[#00a09d]/50 text-[#00a09d]")}>
                    {DIRECTION_LABEL[form.direction]}
                  </Badge>
                </div>
                <p className="text-[12px] text-muted-foreground">
                  For {ticket.rma_number} · {ticket.customer_name} · {ticket.product_name || ticket.sku}
                </p>
                {dirty ? <p className="text-[11px] text-muted-foreground">Unsaved changes</p> : null}
              </div>

              {settlement?.status === "correction_requested" && settlement.decision_reason ? (
                <p className="border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-[12px]">
                  <span className="font-semibold">Sent back for correction:</span> {settlement.decision_reason}
                </p>
              ) : null}
              {settlement?.status === "rejected" && settlement.decision_reason ? (
                <p className="border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px]">
                  <span className="font-semibold">Rejected:</span> {settlement.decision_reason}. Nothing was posted.
                </p>
              ) : null}
              {settlement?.status === "approved" ? (
                <p className="border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[12px]">
                  Approved {settlement.decided_at?.slice(0, 16).replace("T", " ")} by {settlement.decided_by_name}. Posted to Finance
                  {settlement.payment_number ? ` · Payment ${settlement.payment_number}` : ""}
                  {settlement.journal_number ? ` · Journal ${settlement.journal_number}` : ""}
                  {settlement.receivable_number ? ` · Invoice ${settlement.receivable_number}` : ""}.
                </p>
              ) : null}
              {isReversal ? (
                <p className="border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-[12px]">
                  <span className="font-semibold">Reversal.</span> This mirrors an approved settlement (opposite direction, same party, amount and account). The original is never edited; approving this posts the exact mirror through Finance.
                </p>
              ) : null}
              {settlement?.reversed_by_id ? (
                <p className="border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-[12px]">This settlement has been reversed. Its reversal is in the settlement list.</p>
              ) : null}
              {summary && !summary.can_settle && summary.blocker ? <p className="border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[12px]">{summary.blocker}</p> : null}
              {!canRecord && (isNew || status === "draft") ? (
                <p className="text-[11px] text-muted-foreground">Recording a settlement needs the RMA settlement permission.</p>
              ) : null}

              <Section title="Party">
                <AgainFormRow label="Party type">
                  <div className="flex flex-wrap gap-1.5 py-0.5" role="group" aria-label="Party type">
                    {PARTY_TYPES.map((p) => (
                      <Choice key={p.id} active={form.party_type === p.id} disabled={coreLocked} onClick={() => changeType(p.id)}>
                        {p.label}
                      </Choice>
                    ))}
                  </div>
                </AgainFormRow>
                <AgainFormRow label="Party">
                  <PartyPicker
                    key={form.party_type}
                    type={form.party_type}
                    partyId={form.party_id}
                    partyName={form.party_name}
                    disabled={coreLocked}
                    onPick={(id, name) => patch({ party_id: id, party_name: name })}
                  />
                </AgainFormRow>
              </Section>

              <Section title="Settlement">
                <AgainFormRow label="Direction">
                  <div className="flex flex-wrap gap-1.5 py-0.5" role="group" aria-label="Direction">
                    <Choice active={form.direction === "in"} disabled={coreLocked} onClick={() => patch({ direction: "in" })}>
                      {DIRECTION_LABEL.in}
                    </Choice>
                    <Choice active={form.direction === "out"} tone="out" disabled={coreLocked} onClick={() => patch({ direction: "out" })}>
                      {DIRECTION_LABEL.out}
                    </Choice>
                  </div>
                </AgainFormRow>
                <AgainFormRow label="Amount">
                  <AgainUnderlineInput
                    value={form.amount}
                    onChange={(v) => patch({ amount: v.replace(/[^0-9.]/g, "") })}
                    readOnly={coreLocked}
                    placeholder={isCharge && owed > 0 ? String(owed) : "0.00"}
                  />
                </AgainFormRow>
                {isCharge && summary && Number(summary.total) > 0 ? (
                  <p className="mb-1 text-[11px] text-muted-foreground">
                    RMA charges {money(summary.total)} · paid {money(summary.paid)} · owed {money(summary.outstanding)}. This settles the RMA&apos;s own invoice.
                  </p>
                ) : null}
                {isCharge && summary && Number(summary.total) <= 0 ? (
                  <p className="mb-1 border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[12px]">
                    This RMA has no charges, so there is nothing to collect (no receipt for zero is created). Add a charge to the RMA first, or choose{" "}
                    <button type="button" className="font-medium underline" disabled={!editable} onClick={() => patch({ purpose: "damage_compensation" })}>
                      Damage Compensation
                    </button>{" "}
                    /{" "}
                    <button type="button" className="font-medium underline" disabled={!editable} onClick={() => patch({ purpose: "other" })}>
                      Other
                    </button>
                    .
                  </p>
                ) : null}
                <AgainFormRow label="Purpose">
                  <FilterSelect
                    value={form.purpose}
                    onChange={(v) => patch({ purpose: v as SettlementPurpose })}
                    width="w-full"
                    avoidCollisions
                    ariaLabel="Purpose"
                    disabled={coreLocked}
                    options={PURPOSES.map((p) => ({ value: p.id, label: p.label }))}
                  />
                </AgainFormRow>
                <AgainFormRow label="Purpose details" help="Why is this money being received or paid? Required.">
                  <AgainUnderlineTextarea
                    value={form.purpose_note}
                    onChange={(v) => patch({ purpose_note: v })}
                    rows={3}
                    readOnly={!editable}
                    placeholder={form.purpose === "other" ? "Explain in detail (at least 20 characters)" : "Reason for this payment"}
                  />
                </AgainFormRow>
                {noteTooShort && editable && form.purpose_note.trim() ? (
                  <p className="mb-1 text-[11px] text-amber-700 dark:text-amber-300">“Other” needs a detailed explanation ({form.purpose_note.trim().length}/20).</p>
                ) : null}
              </Section>

              <Section title="Payment">
                <AgainFormRow label="Cash / bank account">
                  <FilterSelect
                    value={form.payment_account_id}
                    onChange={(v) => patch({ payment_account_id: v })}
                    width="w-full"
                    avoidCollisions
                    ariaLabel="Cash or bank account"
                    disabled={coreLocked}
                    placeholder="Pick an account"
                    options={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.kind.replace("_", " ")})` }))}
                  />
                </AgainFormRow>
                <AgainFormRow label="Payment method">
                  <AgainUnderlineInput value={kindLabel(account?.kind ?? settlement?.payment_method)} readOnly />
                </AgainFormRow>
                <div className="grid gap-x-8 @md:grid-cols-2">
                  <AgainFormRow label="Date">
                    <input
                      type="date"
                      value={form.transaction_date}
                      disabled={!editable}
                      onChange={(e) => patch({ transaction_date: e.target.value })}
                      className="h-8 w-full border-0 border-b border-input bg-transparent text-[13px] outline-none disabled:opacity-70"
                    />
                  </AgainFormRow>
                  <AgainFormRow label="Reference">
                    <AgainUnderlineInput value={form.reference} onChange={(v) => patch({ reference: v })} readOnly={!editable} placeholder="Receipt / bKash / cheque no." />
                  </AgainFormRow>
                </div>
              </Section>

              {settlement ? (
                <Section title="Approval">
                  <div className="grid gap-x-6 gap-y-1 text-[13px] @md:grid-cols-3">
                    <div>
                      <p className="text-[11px] text-muted-foreground">Status</p>
                      <p className="font-medium">{SETTLEMENT_STATUS_LABEL[settlement.status]}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Created by</p>
                      <p className="font-medium">{settlement.created_by_name || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Approved by</p>
                      <p className="font-medium">{settlement.status === "approved" ? settlement.decided_by_name || "—" : "—"}</p>
                    </div>
                  </div>
                </Section>
              ) : null}

              {reverseOpen && canReverse ? (
                <Section title="Reverse this settlement">
                  <AgainFormRow label="Why">
                    <AgainUnderlineTextarea value={reverseReason} onChange={setReverseReason} rows={2} placeholder="Required — kept with the reversal" />
                  </AgainFormRow>
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    Opens a draft that mirrors this settlement. It still has to be sent for approval; nothing is posted until it is approved.
                  </p>
                  <AgainDrawerButton variant="primary" onClick={reverse} disabled={busy}>
                    Open reversal draft
                  </AgainDrawerButton>
                </Section>
              ) : null}

              {status === "pending_approval" ? (
                <Section title="Decision">
                  <AgainFormRow label="Reason">
                    <AgainUnderlineTextarea value={reason} onChange={setReason} rows={2} placeholder="Required to reject or return for correction" />
                  </AgainFormRow>
                  <p className="text-[11px] text-muted-foreground">
                    Approving posts this once through Finance. Nothing reaches the accounts before that, and no stock moves.
                  </p>
                </Section>
              ) : null}
            </div>
          )}
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}
