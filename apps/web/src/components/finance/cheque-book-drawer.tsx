"use client";

import * as React from "react";
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
import {
  AGAIN_FORM_RECORD_TITLE_CLASS,
  AgainFormRow,
  AgainUnderlineInput,
  AgainUnderlineTextarea,
} from "@/components/again/again-form-sheet";
import { chequeRangeLabel } from "@/components/finance/cheque-book-status";
import {
  createChequeBook,
  fetchPaymentAccounts,
  type ApiChequeBookDetail,
  type ApiFinancePaymentAccount,
} from "@/lib/api/finance";
import { BD_BANKS } from "@/lib/finance/bd-banks";
import { useDrawerDraft } from "@/lib/hooks/use-drawer-draft";

type Form = {
  accountId: string;
  bankName: string;
  branch: string;
  routing: string;
  prefix: string;
  from: string;
  to: string;
  remarks: string;
};

const EMPTY: Form = { accountId: "", bankName: "", branch: "", routing: "", prefix: "", from: "", to: "", remarks: "" };
const digits = (value: string) => value.replace(/\D/g, "");

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (book: ApiChequeBookDetail) => void;
};

/**
 * New cheque book in the common drawer (docs/common/drawercommon.md): actions on top, drag the left edge to resize, and a half-typed
 * form is kept as a draft when the drawer is closed by accident (Cancel is the deliberate discard).
 */
export function ChequeBookDrawer({ open, onOpenChange, onCreated }: Props) {
  const [accounts, setAccounts] = React.useState<ApiFinancePaymentAccount[]>([]);
  const [form, setForm] = React.useState<Form>(EMPTY);
  const [saving, setSaving] = React.useState(false);
  const patch = (changes: Partial<Form>) => setForm((current) => ({ ...current, ...changes }));

  // a fresh form every time it opens - declared before the draft hook so a saved draft is put back after this reset
  React.useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    let cancelled = false;
    fetchPaymentAccounts()
      .then((res) => {
        if (cancelled) return;
        const active = res.data.filter((a) => a.is_active);
        // bank accounts first: a cheque book belongs to one
        setAccounts([...active.filter((a) => a.kind === "bank"), ...active.filter((a) => a.kind !== "bank")]);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load bank accounts"));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const dirty = (Object.keys(EMPTY) as (keyof Form)[]).some((key) => form[key] !== EMPTY[key]);
  const { saveDraftIfDirty, clear: clearDraft } = useDrawerDraft<Form>({
    key: "cheque-book:new",
    ready: open,
    dirty,
    getValues: () => form,
    restore: (values) => setForm({ ...EMPTY, ...values }),
    onDiscard: () => setForm(EMPTY),
    label: "cheque book",
  });

  const fromNum = Number(form.from);
  const toNum = Number(form.to);
  const rangeOk =
    form.from !== "" && form.to !== "" && Number.isInteger(fromNum) && Number.isInteger(toNum) && toNum >= fromNum && toNum - fromNum < 500;
  const isValid = Boolean(form.accountId) && form.bankName.trim() !== "" && rangeOk;

  function pickAccount(id: string) {
    const account = accounts.find((a) => a.id === id);
    // when the account is named after a known bank ("City Bank PLC"), take it as the bank
    const match = account ? BD_BANKS.find((bank) => account.name.toLowerCase().includes(bank.toLowerCase())) : undefined;
    patch({ accountId: id, ...(match && !form.bankName ? { bankName: match } : {}) });
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) saveDraftIfDirty();
    onOpenChange(next);
  };

  function cancel() {
    clearDraft();
    onOpenChange(false);
  }

  async function submit() {
    if (!isValid) return;
    setSaving(true);
    try {
      const res = await createChequeBook({
        payment_account_id: form.accountId,
        bank_name: form.bankName.trim(),
        branch_name: form.branch.trim() || null,
        routing_number: form.routing.trim() || null,
        cheque_prefix: form.prefix.trim(),
        number_from: fromNum,
        number_to: toNum,
        remarks: form.remarks.trim() || null,
      });
      clearDraft();
      toast.success(`Cheque book ${res.data.book_number} created`);
      onOpenChange(false);
      onCreated(res.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the cheque book");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={handleOpenChange}
      title="New cheque book"
      resizable
      defaultWidth={520}
      minWidth={360}
      widthStorageKey="again-cheque-book-new-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar
          trailing={<AgainDrawerCloseButton onClick={() => handleOpenChange(false)} />}
        >
          <AgainDrawerButton variant="primary" onClick={() => void submit()} disabled={!isValid || saving}>
            {saving ? "Saving…" : "Create"}
          </AgainDrawerButton>
          <AgainDrawerButton onClick={cancel} disabled={saving}>
            Cancel
          </AgainDrawerButton>
        </AgainDrawerControlBar>

        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
          <div className="@container space-y-4">
            <h2 className={AGAIN_FORM_RECORD_TITLE_CLASS}>New cheque book</h2>
            <section>
              <h3 className="mb-1 border-b border-border/80 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bank details</h3>
              <AgainFormRow label="Bank account">
                <FilterSelect
                  value={form.accountId}
                  onChange={pickAccount}
                  options={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.kind.replace("_", " ")})` }))}
                  searchThreshold={0}
                  placeholder={accounts.length ? "Select the account…" : "No payment accounts yet"}
                  searchPlaceholder="Search account…"
                  width="w-full"
                  avoidCollisions
                  ariaLabel="Bank account"
                  disabled={saving}
                />
              </AgainFormRow>
              <AgainFormRow label="Bank">
                <FilterSelect
                  value={form.bankName}
                  onChange={(value) => patch({ bankName: value })}
                  options={BD_BANKS.map((bank) => ({ value: bank, label: bank }))}
                  searchThreshold={0}
                  placeholder="Select bank…"
                  searchPlaceholder="Search bank…"
                  width="w-full"
                  avoidCollisions
                  ariaLabel="Bank"
                  disabled={saving}
                />
              </AgainFormRow>
              <AgainFormRow label="Branch">
                <AgainUnderlineInput value={form.branch} onChange={(v) => patch({ branch: v })} placeholder="Branch name" />
              </AgainFormRow>
              <AgainFormRow label="Routing no.">
                <AgainUnderlineInput value={form.routing} onChange={(v) => patch({ routing: v })} placeholder="Routing number" />
              </AgainFormRow>
            </section>

            <section>
              <h3 className="mb-1 border-b border-border/80 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cheque numbers</h3>
              <div className="grid gap-x-8 @md:grid-cols-3">
                <AgainFormRow label="Initial">
                  <AgainUnderlineInput value={form.prefix} onChange={(v) => patch({ prefix: v })} placeholder="e.g. 4545" />
                </AgainFormRow>
                <AgainFormRow label="From">
                  <AgainUnderlineInput value={form.from} onChange={(v) => patch({ from: digits(v) })} placeholder="40" />
                </AgainFormRow>
                <AgainFormRow label="To">
                  <AgainUnderlineInput value={form.to} onChange={(v) => patch({ to: digits(v) })} placeholder="50" />
                </AgainFormRow>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {rangeOk
                  ? `${toNum - fromNum + 1} cheques: ${chequeRangeLabel(form.prefix.trim(), fromNum, toNum)}`
                  : "Each cheque number is the initial followed by a number from…to, e.g. 4545 + 40…50 = 454540 … 454550. At most 500 cheques."}
              </p>
              <AgainFormRow label="Remarks" className="mt-1">
                <AgainUnderlineTextarea value={form.remarks} onChange={(v) => patch({ remarks: v })} rows={2} />
              </AgainFormRow>
            </section>
          </div>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}
