"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  AGAIN_DRAWER_FIELD_SHEET_CLASS,
  AgainDrawerButton,
  AgainDrawerCloseButton,
  AgainDrawerControlBar,
  AgainDrawerLayout,
  AgainDrawerPanel,
  AgainDrawerScrollBody,
} from "@/components/again/again-drawer";
import { AGAIN_FORM_RECORD_TITLE_CLASS, AgainFormRow, AgainUnderlineInput, AgainUnderlineTextarea } from "@/components/again/again-form-sheet";
import {
  createSettlement,
  fetchSettlementDocuments,
  settledByLabel,
  type ApiSettlement,
  type ApiSettlementDocument,
  type SettlementPartyType,
} from "@/lib/api/finance-settlements";
import { searchTradingParties, type TradingParty } from "@/lib/api/party-search";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

const num = (value: string | undefined) => Number.parseFloat(value || "") || 0;
const decimal = (value: string) => value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
const round2 = (value: number) => Math.round(value * 100) / 100;

export const SETTLEMENT_TITLE: Record<SettlementPartyType, string> = {
  customer: "Party transaction settlement",
  supplier: "Payment settlement",
};

type Move = { take: string; put: string };

type Props = {
  /** New settlement for this kind of party, or null. */
  newFor: SettlementPartyType | null;
  /** An existing settlement to show (read only). */
  settlement: ApiSettlement | null;
  onOpenChange: (open: boolean) => void;
  onCreated: (settlement: ApiSettlement) => void;
};

/**
 * Bill-wise settlement in the common drawer: take money that already settled one invoice (bill) and put it on another of the
 * same party. Both sides must be equal. "Spread oldest first" puts what is taken off on the oldest open documents.
 */
export function SettlementDrawer({ newFor, settlement, onOpenChange, onCreated }: Props) {
  const open = newFor !== null || settlement !== null;
  const partyType: SettlementPartyType = settlement?.party_type ?? newFor ?? "customer";
  const docWord = partyType === "customer" ? "invoice" : "bill";
  const [query, setQuery] = React.useState("");
  const [parties, setParties] = React.useState<TradingParty[]>([]);
  const [party, setParty] = React.useState<TradingParty | null>(null);
  const [docs, setDocs] = React.useState<ApiSettlementDocument[]>([]);
  const [moves, setMoves] = React.useState<Record<string, Move>>({});
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    setParty(null);
    setDocs([]);
    setMoves({});
    setNote("");
    setDate(new Date().toISOString().slice(0, 10));
  }, [open, newFor, settlement]);

  React.useEffect(() => {
    if (!open || settlement || party) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchTradingParties(partyType, query)
        .then((rows) => !cancelled && setParties(rows))
        .catch(() => !cancelled && setParties([]));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, settlement, party, partyType, query]);

  const loadDocs = React.useCallback(async (picked: TradingParty) => {
    setLoading(true);
    try {
      setDocs((await fetchSettlementDocuments(partyType, picked.id)).data);
      setMoves({});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Could not load the ${docWord}s`);
    } finally {
      setLoading(false);
    }
  }, [partyType, docWord]);

  const taken = round2(Object.values(moves).reduce((sum, m) => sum + num(m.take), 0));
  const put = round2(Object.values(moves).reduce((sum, m) => sum + num(m.put), 0));
  const problems = docs.flatMap((doc) => {
    const m = moves[doc.id];
    if (!m) return [];
    const out: string[] = [];
    if (num(m.take) > num(doc.paid) + 0.004) out.push(`${doc.number}: only ${formatCurrency(num(doc.paid))} is settled`);
    if (num(m.put) > num(doc.balance) + 0.004) out.push(`${doc.number}: only ${formatCurrency(num(doc.balance))} is due`);
    if (num(m.take) > 0 && num(m.put) > 0) out.push(`${doc.number}: take off or put on, not both`);
    return out;
  });
  const problem =
    problems[0] ??
    (taken <= 0 ? `Enter what to take off one ${docWord}` : Math.abs(taken - put) > 0.004 ? `Taken off ${formatCurrency(taken)} but put on ${formatCurrency(put)}` : null);

  const setMove = (id: string, changes: Partial<Move>) =>
    setMoves((current) => ({ ...current, [id]: { ...(current[id] ?? { take: "", put: "" }), ...changes } }));

  function spreadOldestFirst() {
    let left = round2(taken);
    const next: Record<string, Move> = {};
    for (const [id, m] of Object.entries(moves)) next[id] = { take: m.take, put: "" };
    for (const doc of docs) {
      if (left <= 0) break;
      if (num(next[doc.id]?.take) > 0) continue;
      const due = num(doc.balance);
      if (due <= 0) continue;
      const amount = round2(Math.min(due, left));
      next[doc.id] = { take: "", put: String(amount) };
      left = round2(left - amount);
    }
    setMoves(next);
    if (left > 0) toast.info(`${formatCurrency(left)} has no open ${docWord} to go to`);
  }

  async function save() {
    if (!party || problem) return;
    setSaving(true);
    try {
      const lines = Object.entries(moves)
        .map(([document_id, m]) => ({ document_id, amount: num(m.take) > 0 ? String(-num(m.take)) : String(num(m.put)) }))
        .filter((line) => num(line.amount) !== 0);
      const res = await createSettlement({ party_type: partyType, party_id: party.id, settlement_date: date, note: note.trim() || null, lines });
      toast.success(`${res.data.settlement_number}: ${formatCurrency(num(res.data.total))} moved`);
      onCreated(res.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the settlement");
    } finally {
      setSaving(false);
    }
  }

  const title = settlement ? settlement.settlement_number : `New ${SETTLEMENT_TITLE[partyType].toLowerCase()}`;

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={(next) => !next && onOpenChange(false)}
      title={title}
      resizable
      defaultWidthRatio={0.6}
      minWidth={420}
      widthStorageKey="again-settlement-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar trailing={<AgainDrawerCloseButton onClick={() => onOpenChange(false)} />}>
          {!settlement ? (
            <>
              <AgainDrawerButton variant="primary" onClick={() => void save()} disabled={saving || !party || Boolean(problem)} title={problem ?? undefined}>
                {saving ? "Saving…" : "Save settlement"}
              </AgainDrawerButton>
              {party ? (
                <AgainDrawerButton onClick={spreadOldestFirst} disabled={saving || taken <= 0}>
                  Spread oldest first
                </AgainDrawerButton>
              ) : null}
              {party ? (
                <AgainDrawerButton onClick={() => setParty(null)} disabled={saving}>
                  Change {partyType}
                </AgainDrawerButton>
              ) : null}
              <AgainDrawerButton onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </AgainDrawerButton>
            </>
          ) : null}
        </AgainDrawerControlBar>

        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
          <div className="@container space-y-4">
            <div>
              <p className="text-[12px] font-medium text-[#00a09d]">{SETTLEMENT_TITLE[partyType]}</p>
              <h2 className={AGAIN_FORM_RECORD_TITLE_CLASS}>{title}</h2>
              <p className="text-xs text-muted-foreground">
                {settlement
                  ? `${settlement.party_name ?? settlement.party_id} · ${formatDate(settlement.settlement_date)} · ${formatCurrency(num(settlement.total))} moved by ${settlement.created_by ?? "—"}`
                  : party
                    ? `${party.name} · taken off ${formatCurrency(taken)} · put on ${formatCurrency(put)}`
                    : `Choose the ${partyType}. Money already on one ${docWord} can be moved to another; the ${partyType}'s total due does not change.`}
              </p>
            </div>

            {settlement ? (
              <section>
                <h3 className="mb-1 border-b border-border/80 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Moves</h3>
                <table className="w-full text-xs">
                  <tbody>
                    {settlement.lines.map((line) => (
                      <tr key={line.document_id} className="border-b border-border/40">
                        <td className="py-1.5">{line.number}</td>
                        <td className="py-1.5 text-muted-foreground">{num(line.amount) < 0 ? "taken off" : "put on"}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatCurrency(Math.abs(num(line.amount)))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {settlement.note ? <p className="mt-2 text-xs text-muted-foreground">{settlement.note}</p> : null}
              </section>
            ) : !party ? (
              <div className="space-y-2">
                <AgainUnderlineInput value={query} onChange={setQuery} placeholder={`Search ${partyType} by name, code or phone…`} autoComplete="off" />
                <div className="border border-border">
                  {parties.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-muted-foreground">No {partyType} matches.</p>
                  ) : (
                    parties.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setParty(p);
                          void loadDocs(p);
                        }}
                        className="flex w-full items-center justify-between gap-3 border-b border-border/60 px-3 py-2 text-left text-xs last:border-b-0 hover:bg-muted"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{p.name}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">{[p.code, p.phone].filter(Boolean).join(" · ")}</span>
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">Select</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-x-8 @xl:grid-cols-2">
                  <AgainFormRow label="Date">
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="h-7 w-full border-0 border-b border-border bg-transparent text-sm outline-none focus:border-primary"
                    />
                  </AgainFormRow>
                  <AgainFormRow label="Note">
                    <AgainUnderlineTextarea value={note} onChange={setNote} rows={1} />
                  </AgainFormRow>
                </div>
                <section>
                  <h3 className="mb-1 border-b border-border/80 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {partyType === "customer" ? "Invoices" : "Bills"}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-xs">
                      <thead>
                        <tr className="border-b border-border/70 text-left text-[11px] text-muted-foreground">
                          <th className="py-1.5 pr-2 font-semibold">{partyType === "customer" ? "Invoice" : "Bill"}</th>
                          <th className="py-1.5 pr-2 font-semibold">Date</th>
                          <th className="py-1.5 pr-2 text-right font-semibold">Amount</th>
                          <th className="py-1.5 pr-2 text-right font-semibold">Settled</th>
                          <th className="py-1.5 pr-2 text-right font-semibold">Due</th>
                          <th className="py-1.5 pr-2 font-semibold">Settled by</th>
                          <th className="w-[100px] py-1.5 pr-2 text-right font-semibold">Take off</th>
                          <th className="w-[100px] py-1.5 text-right font-semibold">Put on</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading ? (
                          <tr>
                            <td colSpan={8} className="py-4 text-muted-foreground">Loading…</td>
                          </tr>
                        ) : docs.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-4 text-muted-foreground">No {docWord}s for this {partyType}.</td>
                          </tr>
                        ) : (
                          docs.map((doc) => (
                            <tr key={doc.id} className="border-b border-border/40 align-middle">
                              <td className="py-1 pr-2 font-medium">{doc.number}</td>
                              <td className="py-1 pr-2">{formatDate(doc.doc_date)}</td>
                              <td className="py-1 pr-2 text-right tabular-nums">{formatCurrency(num(doc.amount))}</td>
                              <td className="py-1 pr-2 text-right tabular-nums">{formatCurrency(num(doc.paid))}</td>
                              <td className={cn("py-1 pr-2 text-right tabular-nums", num(doc.balance) > 0 && "font-medium")}>{formatCurrency(num(doc.balance))}</td>
                              <td className="max-w-[200px] truncate py-1 pr-2 text-muted-foreground" title={settledByLabel(doc.settled_by, true)}>
                                {settledByLabel(doc.settled_by) || "—"}
                              </td>
                              <td className="py-1 pr-2">
                                {num(doc.paid) > 0 ? (
                                  <AgainUnderlineInput
                                    value={moves[doc.id]?.take ?? ""}
                                    onChange={(v) => setMove(doc.id, { take: decimal(v), ...(decimal(v) ? { put: "" } : {}) })}
                                    inputClassName="text-right tabular-nums"
                                    placeholder="0.00"
                                  />
                                ) : null}
                              </td>
                              <td className="py-1">
                                {num(doc.balance) > 0 ? (
                                  <AgainUnderlineInput
                                    value={moves[doc.id]?.put ?? ""}
                                    onChange={(v) => setMove(doc.id, { put: decimal(v), ...(decimal(v) ? { take: "" } : {}) })}
                                    inputClassName="text-right tabular-nums"
                                    placeholder="0.00"
                                  />
                                ) : null}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="text-[11px] font-semibold">
                          <td colSpan={6} className="py-1.5">Total</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{formatCurrency(taken)}</td>
                          <td className="py-1.5 text-right tabular-nums">{formatCurrency(put)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <p className={cn("mt-1 text-[11px] text-muted-foreground", problem && taken > 0 && "text-amber-600 dark:text-amber-400")}>
                    {problem ?? "Balanced — ready to save."}
                  </p>
                </section>
              </>
            )}
          </div>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}
