"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FilterSelect } from "@/components/shared/filter-select";
import {
  AGAIN_DRAWER_FIELD_SHEET_CLASS,
  AgainDrawerButton,
  AgainDrawerCloseButton,
  AgainDrawerControlBar,
  AgainDrawerLayout,
  AgainDrawerPanel,
  AgainDrawerScrollBody,
  AgainDrawerSwitch,
} from "@/components/again/again-drawer";
import { AGAIN_FORM_RECORD_TITLE_CLASS, AgainFormRow, AgainUnderlineInput, AgainUnderlineTextarea } from "@/components/again/again-form-sheet";
import { fetchFinanceAccounts, type ApiFinanceAccount } from "@/lib/api/finance";
import {
  createOpeningBatch,
  deleteOpeningBatch,
  finalizeOpeningBatch,
  updateOpeningBatch,
  type ApiOpeningBatch,
} from "@/lib/api/finance-masters";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";

type Line = { key: string; accountId: string; debit: string; credit: string; description: string };

let seq = 0;
const newLine = (partial: Partial<Line> = {}): Line => {
  seq += 1;
  return { key: `o${Date.now()}-${seq}`, accountId: "", debit: "", credit: "", description: "", ...partial };
};
const num = (v: string) => Number.parseFloat(v) || 0;
const decimal = (v: string) => v.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
const zeroToBlank = (v: string) => (Number(v) ? String(Number(v)) : "");

/**
 * One batch of GL opening balances (common drawer). Draft: edit, save, delete. Finalize posts one journal on the date (the
 * difference to Opening Balance Equity) and locks the batch for good (OnerERP IsOpeningBalanceFinalized).
 */
export function OpeningBatchDrawer({
  open,
  batch,
  restricted,
  canWrite,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  batch: ApiOpeningBatch | null;
  /** GL code → where that head's opening comes from instead */
  restricted: Record<string, string>;
  canWrite: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [current, setCurrent] = React.useState<ApiOpeningBatch | null>(null);
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([]);
  const [accounts, setAccounts] = React.useState<ApiFinanceAccount[]>([]);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setCurrent(batch);
    setDate(batch?.as_of_date ?? new Date().toISOString().slice(0, 10));
    setNote(batch?.note ?? "");
    setLines(
      batch?.lines.length
        ? batch.lines.map((l) => newLine({ accountId: l.account_id, debit: zeroToBlank(l.debit), credit: zeroToBlank(l.credit), description: l.description ?? "" }))
        : [newLine(), newLine()],
    );
    fetchFinanceAccounts()
      .then((res) => setAccounts(res.data))
      .catch(() => setAccounts([]));
  }, [open, batch]);

  const editable = canWrite && (current?.status ?? "draft") === "draft";
  const options = accounts
    .filter((a) => a.is_postable !== false && !restricted[a.code])
    .map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }));
  // the batch carries its own account names: an account made inactive later still reads right
  const label = new Map([
    ...(current?.lines ?? []).map((l) => [l.account_id, `${l.account_code ?? ""} ${l.account_name ?? ""}`.trim()] as const),
    ...accounts.map((a) => [a.id, `${a.code} ${a.name}`] as const),
  ]);
  const totalDr = lines.reduce((s, l) => s + num(l.debit), 0);
  const totalCr = lines.reduce((s, l) => s + num(l.credit), 0);
  const difference = Math.round((totalDr - totalCr) * 100) / 100;

  const patchLine = (key: string, changes: Partial<Line>) => setLines((rows) => rows.map((r) => (r.key === key ? { ...r, ...changes } : r)));

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function save(): Promise<ApiOpeningBatch> {
    const input = {
      as_of_date: date,
      note: note.trim() || null,
      lines: lines
        .filter((l) => l.accountId && (num(l.debit) > 0 || num(l.credit) > 0))
        .map((l) => ({ account_id: l.accountId, debit: String(num(l.debit)), credit: String(num(l.credit)), description: l.description.trim() || null })),
    };
    const res = current ? await updateOpeningBatch(current.id, input) : await createOpeningBatch(input);
    setCurrent(res.data);
    onChanged();
    return res.data;
  }

  const onSave = () =>
    run(async () => {
      await save();
      toast.success("Opening balances saved as a draft");
    });

  const onFinalize = () =>
    run(async () => {
      const saved = await save();
      const res = await finalizeOpeningBatch(saved.id);
      setCurrent(res.data);
      onChanged();
      toast.success(`Opening balances posted (${res.data.journal_entry_number ?? "journal"}) and locked`);
    });

  const onDelete = () =>
    run(async () => {
      if (current) await deleteOpeningBatch(current.id);
      onChanged();
      onOpenChange(false);
    });

  const status = current?.status ?? "draft";
  const title = `Opening balances · ${date}`;
  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      resizable
      defaultWidthRatio={0.6}
      minWidth={420}
      widthStorageKey="again-opening-batch-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar trailing={<AgainDrawerCloseButton onClick={() => onOpenChange(false)} />}>
          {editable ? (
            <>
              <AgainDrawerButton variant="primary" onClick={() => void onSave()} disabled={busy}>
                Save draft
              </AgainDrawerButton>
              <AgainDrawerButton variant="success" onClick={() => void onFinalize()} disabled={busy || totalDr + totalCr <= 0}>
                Finalize &amp; post
              </AgainDrawerButton>
              <AgainDrawerButton variant={current ? "danger" : "action"} onClick={() => void onDelete()} disabled={busy}>
                {current ? "Delete" : "Cancel"}
              </AgainDrawerButton>
            </>
          ) : null}
          <AgainDrawerSwitch
            label="Status"
            value={status}
            options={[
              { value: "draft", label: "Draft" },
              { value: "finalized", label: "Finalized" },
            ]}
          />
        </AgainDrawerControlBar>
        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
          <div className="@container space-y-4">
            <div>
              <h2 className={AGAIN_FORM_RECORD_TITLE_CLASS}>{title}</h2>
              <p className="text-xs text-muted-foreground">
                {status === "finalized"
                  ? `Posted as ${current?.journal_entry_number ?? "a journal"} by ${current?.finalized_by ?? "—"} on ${formatDateTime(current?.finalized_at ?? null)}. Locked: correct it with a journal voucher.`
                  : "Enter what each account held on the date. Finalizing posts it once and locks it; the difference goes to Opening Balance Equity."}
              </p>
            </div>
            <div className="grid gap-x-8 @xl:grid-cols-2">
              <AgainFormRow label="As of">
                {editable ? (
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-7 w-full border-0 border-b border-border bg-transparent text-sm outline-none focus:border-primary" />
                ) : (
                  <span className="text-sm">{date}</span>
                )}
              </AgainFormRow>
              <AgainFormRow label="Note">
                <AgainUnderlineTextarea value={note} onChange={setNote} rows={1} readOnly={!editable} />
              </AgainFormRow>
            </div>
            <section>
              <h3 className="mb-1 border-b border-border/80 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Accounts</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-xs">
                  <thead>
                    <tr className="border-b border-border/70 text-left text-[11px] text-muted-foreground">
                      <th className="py-1.5 pr-2 font-semibold">Account</th>
                      <th className="py-1.5 pr-2 font-semibold">Note</th>
                      <th className="w-[120px] py-1.5 pr-2 text-right font-semibold">Debit</th>
                      <th className="w-[120px] py-1.5 pr-2 text-right font-semibold">Credit</th>
                      {editable ? <th className="w-8" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.key} className="border-b border-border/40">
                        <td className="py-1 pr-2">
                          {editable ? (
                            <FilterSelect
                              value={line.accountId}
                              onChange={(v) => patchLine(line.key, { accountId: v })}
                              options={options}
                              searchThreshold={0}
                              placeholder="Choose account…"
                              searchPlaceholder="Search code or name…"
                              width="w-full"
                              avoidCollisions
                              ariaLabel="Account"
                            />
                          ) : (
                            label.get(line.accountId) ?? "—"
                          )}
                        </td>
                        <td className="py-1 pr-2">
                          <AgainUnderlineInput value={line.description} onChange={(v) => patchLine(line.key, { description: v })} readOnly={!editable} />
                        </td>
                        <td className="py-1 pr-2">
                          <AgainUnderlineInput
                            value={line.debit}
                            onChange={(v) => patchLine(line.key, { debit: decimal(v), ...(decimal(v) ? { credit: "" } : {}) })}
                            readOnly={!editable}
                            inputClassName="text-right tabular-nums"
                            placeholder="0.00"
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <AgainUnderlineInput
                            value={line.credit}
                            onChange={(v) => patchLine(line.key, { credit: decimal(v), ...(decimal(v) ? { debit: "" } : {}) })}
                            readOnly={!editable}
                            inputClassName="text-right tabular-nums"
                            placeholder="0.00"
                          />
                        </td>
                        {editable ? (
                          <td className="py-1 text-right">
                            <button type="button" className="p-1 text-muted-foreground hover:text-destructive" aria-label="Remove line" onClick={() => setLines((rows) => rows.filter((r) => r.key !== line.key))}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="text-[11px] font-semibold">
                      <td className="py-1.5" colSpan={2}>
                        {editable ? (
                          <button type="button" className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => setLines((rows) => [...rows, newLine()])}>
                            <Plus className="h-3 w-3" /> Add an account
                          </button>
                        ) : null}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{formatCurrency(totalDr)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{formatCurrency(totalCr)}</td>
                      {editable ? <td /> : null}
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className={cn("mt-1 text-[11px] text-muted-foreground", difference !== 0 && "text-amber-600 dark:text-amber-400")}>
                {difference === 0
                  ? "Debits equal credits."
                  : `Difference ${formatCurrency(Math.abs(difference))} goes to 3900 Opening Balance Equity (${difference > 0 ? "credit" : "debit"}).`}{" "}
                Not offered here: customer and supplier control accounts (their openings come from each customer and supplier), cash /
                bank heads (each cash or bank account has its own opening balance) and group accounts.
              </p>
            </section>
          </div>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}
