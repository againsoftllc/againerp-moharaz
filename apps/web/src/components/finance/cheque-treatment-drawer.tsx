"use client";

import * as React from "react";
import { CheckCircle2, XCircle } from "lucide-react";
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
} from "@/components/again/again-drawer";
import { AGAIN_FORM_RECORD_TITLE_CLASS, AgainFormRow, AgainUnderlineInput } from "@/components/again/again-form-sheet";
import { ChequeStatusBadge } from "@/components/finance/cheque-status-badge";
import { todayIso } from "@/components/finance/finance-report-shell";
import {
  bulkFinanceChequeAction,
  fetchPaymentAccounts,
  type ApiChequeBulkResult,
  type ApiFinanceCheque,
  type ApiFinancePaymentAccount,
  type ChequeAction,
} from "@/lib/api/finance";
import { useDrawerDraft } from "@/lib/hooks/use-drawer-draft";
import { formatCurrency } from "@/lib/utils";

/** Treatment status names as OnerERP's Cheque Treatment page shows them (N, S, H, D, B). */
const TREATMENT_LABEL: Record<ChequeAction, string> = {
  deposit: "Send to bank (deposit)",
  present: "Send (presented to supplier)",
  clear: "Honour",
  bounce: "Dishonour",
  cancel: "Balance adjust (cancel)",
  represent: "Send again",
  close: "Close dishonoured",
};

const ORDER: ChequeAction[] = ["deposit", "present", "clear", "bounce", "represent", "close", "cancel"];

type Form = { action: ChequeAction | ""; date: string; accountId: string; note: string };

function commonActions(cheques: ApiFinanceCheque[]): ChequeAction[] {
  if (cheques.length === 0) return [];
  return ORDER.filter((a) => cheques.every((c) => c.available_actions.includes(a)));
}

function freshForm(cheques: ApiFinanceCheque[]): Form {
  return { action: commonActions(cheques)[0] ?? "", date: todayIso(), accountId: "", note: "" };
}

/** A short, stable id for one batch of cheques, so its draft comes back only for the same batch. */
function batchKey(cheques: ApiFinanceCheque[]): string {
  const ids = cheques.map((c) => c.id).sort().join(",");
  let hash = 0;
  for (let i = 0; i < ids.length; i += 1) hash = (hash * 31 + ids.charCodeAt(i)) | 0;
  return `${cheques.length}-${(hash >>> 0).toString(36)}`;
}

type Props = {
  open: boolean;
  cheques: ApiFinanceCheque[];
  onOpenChange: (open: boolean) => void;
  /** Called after the treatment ran (even partly), so the list can reload. */
  onTreated: () => void;
};

/**
 * Cheque Treatment (OnerERP §11.4) in the common drawer (docs/common/drawercommon.md): one status move, date
 * and bank for every ticked cheque. Only the moves every ticked cheque allows are offered; each cheque reports
 * its own result.
 */
export function ChequeTreatmentDrawer({ open, cheques, onOpenChange, onTreated }: Props) {
  const [accounts, setAccounts] = React.useState<ApiFinancePaymentAccount[]>([]);
  // the batch is fixed when the drawer opens: the list reloads (and the ticks clear) once it has run
  const [batch, setBatch] = React.useState<ApiFinanceCheque[]>([]);
  const [form, setForm] = React.useState<Form>(() => freshForm([]));
  const [saving, setSaving] = React.useState(false);
  const [results, setResults] = React.useState<ApiChequeBulkResult[] | null>(null);
  const patch = (changes: Partial<Form>) => setForm((current) => ({ ...current, ...changes }));

  // a fresh form every time it opens - declared before the draft hook so a saved draft is put back after this reset
  React.useEffect(() => {
    if (!open) return;
    setBatch(cheques);
    setForm(freshForm(cheques));
    setResults(null);
    let cancelled = false;
    fetchPaymentAccounts()
      .then((res) => !cancelled && setAccounts(res.data.filter((a) => a.kind === "bank" && a.is_active)))
      .catch(() => !cancelled && setAccounts([]));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const common = React.useMemo(() => commonActions(batch), [batch]);
  const anyReceived = batch.some((c) => c.direction === "received");
  // the bank the cheque goes to: required when it first leaves our hands, otherwise each cheque keeps its own
  const accountRequired = form.action === "deposit" || (form.action === "represent" && anyReceived);
  const accountOffered = accountRequired || form.action === "clear";
  const total = batch.reduce((sum, c) => sum + Number(c.amount || 0), 0);

  React.useEffect(() => {
    if (accountRequired && !form.accountId && accounts[0]) patch({ accountId: accounts[0].id });
    if (!accountOffered && form.accountId) patch({ accountId: "" });
  }, [accountRequired, accountOffered, form.accountId, accounts]);

  const blank = freshForm(batch);
  const dirty = !results && (form.action !== blank.action || form.note.trim() !== "" || form.date !== blank.date);
  const { saveDraftIfDirty, clear: clearDraft } = useDrawerDraft<Form>({
    key: `cheque-treatment:${batchKey(batch)}`,
    ready: open && batch.length > 0,
    dirty,
    getValues: () => form,
    restore: (values) => setForm({ ...freshForm(batch), ...values }),
    onDiscard: () => setForm(freshForm(batch)),
    label: "cheque treatment",
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) saveDraftIfDirty();
    onOpenChange(next);
  };

  function cancel() {
    clearDraft();
    onOpenChange(false);
  }

  async function apply() {
    if (!form.action) return;
    if (accountRequired && !form.accountId) {
      toast.error("Choose the bank account");
      return;
    }
    setSaving(true);
    try {
      const res = await bulkFinanceChequeAction({
        cheque_ids: batch.map((c) => c.id),
        action: form.action,
        action_date: form.action === "present" ? undefined : form.date,
        payment_account_id: form.accountId || undefined,
        note: form.note.trim() || undefined,
      });
      clearDraft();
      setResults(res.data);
      if (res.failed === 0) toast.success(`${res.succeeded} cheque${res.succeeded === 1 ? "" : "s"} treated`);
      else toast.warning(`${res.succeeded} treated, ${res.failed} could not move`);
      onTreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Treatment failed");
    } finally {
      setSaving(false);
    }
  }

  const byId = new Map(batch.map((c) => [c.id, c]));
  const sectionHead = "mb-1 border-b border-border/80 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={handleOpenChange}
      title="Cheque treatment"
      resizable
      defaultWidth={520}
      minWidth={360}
      widthStorageKey="again-cheque-treatment-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar trailing={<AgainDrawerCloseButton onClick={() => handleOpenChange(false)} />}>
          {results ? (
            <AgainDrawerButton variant="primary" onClick={() => onOpenChange(false)}>
              Done
            </AgainDrawerButton>
          ) : (
            <>
              <AgainDrawerButton
                variant="primary"
                onClick={() => void apply()}
                disabled={saving || !form.action || (accountRequired && !form.accountId)}
              >
                {saving ? "Saving…" : `Apply to ${batch.length}`}
              </AgainDrawerButton>
              <AgainDrawerButton onClick={cancel} disabled={saving}>
                Cancel
              </AgainDrawerButton>
            </>
          )}
        </AgainDrawerControlBar>

        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
          <div className="@container space-y-4">
            <div>
              <h2 className={AGAIN_FORM_RECORD_TITLE_CLASS}>Cheque treatment</h2>
              <p className="text-xs text-muted-foreground">
                {batch.length} cheque{batch.length === 1 ? "" : "s"} selected · {formatCurrency(total)}
              </p>
            </div>

            {results ? (
              <section>
                <h3 className={sectionHead}>Result</h3>
                <div className="overflow-x-auto">
                  <ul className="min-w-[320px] divide-y divide-border border border-border text-xs">
                    {results.map((r) => {
                      const cheque = byId.get(r.id);
                      return (
                        <li key={r.id} className="flex items-start gap-2 px-3 py-2">
                          {r.ok ? (
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">
                              {r.cheque_number ?? cheque?.cheque_number ?? r.id}
                              <span className="ml-1 font-normal text-muted-foreground">{cheque?.party_name ?? ""}</span>
                            </p>
                            {r.ok ? null : <p className="text-[11px] text-red-600 dark:text-red-400">{r.error}</p>}
                          </div>
                          {r.ok && r.status ? <ChequeStatusBadge status={r.status} /> : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </section>
            ) : common.length === 0 ? (
              <p className="border border-border p-3 text-xs text-muted-foreground">
                These cheques have no next step in common. Tick cheques of the same type and status — for example all
                received cheques in hand, or all deposited ones.
              </p>
            ) : (
              <section>
                <h3 className={sectionHead}>Treatment</h3>
                <AgainFormRow label="Treatment status">
                  <FilterSelect
                    value={form.action}
                    onChange={(value) => patch({ action: value as ChequeAction })}
                    options={common.map((a) => ({ value: a, label: TREATMENT_LABEL[a] }))}
                    width="w-full"
                    avoidCollisions
                    ariaLabel="Treatment status"
                    disabled={saving}
                  />
                </AgainFormRow>
                {form.action !== "present" ? (
                  <AgainFormRow label="Treatment date">
                    <input
                      type="date"
                      value={form.date}
                      disabled={saving}
                      onChange={(e) => patch({ date: e.target.value })}
                      className="h-8 w-full bg-transparent px-1 text-[13px] outline-none disabled:opacity-70"
                    />
                  </AgainFormRow>
                ) : null}
                {accountOffered ? (
                  <AgainFormRow
                    label={accountRequired ? "Cheque sending bank" : "Bank account"}
                    help={
                      accountRequired
                        ? undefined
                        : "Leave it on each cheque's own bank: a deposited cheque clears into the bank it went to, an issued one into its cheque book's bank."
                    }
                  >
                    <FilterSelect
                      value={form.accountId}
                      onChange={(value) => patch({ accountId: value })}
                      options={[
                        ...(accountRequired ? [] : [{ value: "", label: "Each cheque's own bank" }]),
                        ...accounts.map((a) => ({ value: a.id, label: a.name })),
                      ]}
                      placeholder={accounts.length ? "Select the bank…" : "No bank accounts yet"}
                      width="w-full"
                      avoidCollisions
                      ariaLabel="Bank account"
                      disabled={saving}
                    />
                  </AgainFormRow>
                ) : null}
                <AgainFormRow label={form.action === "bounce" ? "Reason" : "Note"}>
                  <AgainUnderlineInput
                    value={form.note}
                    onChange={(v) => patch({ note: v })}
                    placeholder={form.action === "bounce" ? "Reason the bank gave, e.g. Insufficient funds" : "Optional"}
                  />
                </AgainFormRow>
              </section>
            )}
          </div>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}
