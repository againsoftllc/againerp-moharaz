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
import { AGAIN_FORM_RECORD_TITLE_CLASS, AgainFormRow, AgainUnderlineInput } from "@/components/again/again-form-sheet";
import { createPaymentAccount, updatePaymentAccount, type ApiFinancePaymentAccount } from "@/lib/api/finance";
import { fetchBanks, type ApiBank } from "@/lib/api/finance-masters";
import { formatCurrency } from "@/lib/utils";

type Props = {
  open: boolean;
  /** An account to edit, or null for a new one. */
  account?: ApiFinancePaymentAccount | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
};

const KIND_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank" },
  { value: "mobile_wallet", label: "Mobile banking (bKash, Nagad…)" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
];

type Form = {
  name: string;
  kind: string;
  openingBalance: string;
  isDefault: boolean;
  checkBalance: boolean;
  bankId: string;
  branchId: string;
  accountNumber: string;
  accountTitle: string;
};

const EMPTY: Form = {
  name: "",
  kind: "cash",
  openingBalance: "0",
  isDefault: false,
  checkBalance: false,
  bankId: "",
  branchId: "",
  accountNumber: "",
  accountTitle: "",
};

/**
 * A cash box, bank account or mobile wallet (common drawer). A bank account names its bank, branch (routing number) and account
 * number from the bank master, and gets its own GL ledger under 1010 Bank. "Check balance" stops money going out beyond what it
 * holds.
 */
export function PaymentAccountDrawer({ open, account = null, onOpenChange, onSaved }: Props) {
  const [form, setForm] = React.useState<Form>(EMPTY);
  const [banks, setBanks] = React.useState<ApiBank[]>([]);
  const [saving, setSaving] = React.useState(false);
  const patch = (changes: Partial<Form>) => setForm((f) => ({ ...f, ...changes }));

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchBanks()
      .then((res) => {
        if (cancelled) return;
        setBanks(res.data);
        if (account?.bank_branch_id) {
          const bank = res.data.find((b) => b.branches.some((br) => br.id === account.bank_branch_id));
          setForm((f) => ({ ...f, bankId: bank?.id ?? "" }));
        }
      })
      .catch(() => setBanks([]));
    setForm(
      account
        ? {
            ...EMPTY,
            name: account.name,
            kind: account.kind,
            openingBalance: account.opening_balance,
            isDefault: account.is_default,
            checkBalance: Boolean(account.check_balance),
            branchId: account.bank_branch_id ?? "",
            accountNumber: account.account_number ?? "",
            accountTitle: account.account_title ?? "",
          }
        : EMPTY,
    );
    return () => {
      cancelled = true;
    };
  }, [open, account]);

  const bank = banks.find((b) => b.id === form.bankId);
  const isBank = form.kind === "bank";

  async function save() {
    const name = form.name.trim();
    if (!name) return;
    setSaving(true);
    try {
      const bankFields = isBank
        ? { bank_branch_id: form.branchId || null, account_number: form.accountNumber.trim() || null, account_title: form.accountTitle.trim() || null }
        : {};
      if (account) {
        await updatePaymentAccount(account.id, { name, check_balance: form.checkBalance, ...bankFields });
        toast.success(`${name} saved`);
      } else {
        await createPaymentAccount({
          name,
          kind: form.kind,
          opening_balance: form.openingBalance || "0",
          is_default: form.isDefault,
          check_balance: form.checkBalance,
          ...bankFields,
        });
        toast.success(`${name} added`);
      }
      await onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the account");
    } finally {
      setSaving(false);
    }
  }

  const title = account ? account.name : "New payment account";
  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      resizable
      defaultWidth={520}
      minWidth={360}
      widthStorageKey="again-payment-account-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar trailing={<AgainDrawerCloseButton onClick={() => onOpenChange(false)} />}>
          <AgainDrawerButton variant="primary" onClick={() => void save()} disabled={saving || !form.name.trim()}>
            {saving ? "Saving…" : account ? "Save" : "Create"}
          </AgainDrawerButton>
          <AgainDrawerButton onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </AgainDrawerButton>
        </AgainDrawerControlBar>
        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
          <div className="@container space-y-4">
            <div>
              <h2 className={AGAIN_FORM_RECORD_TITLE_CLASS}>{title}</h2>
              <p className="text-xs text-muted-foreground">
                {account
                  ? `GL ${account.gl_account_code ?? ""} ${account.gl_account_name ?? ""} · balance ${formatCurrency(Number(account.balance))}`
                  : "A cash box, bank account or mobile wallet where the company's money actually sits."}
              </p>
            </div>
            <section>
              <h3 className="mb-1 border-b border-border/80 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Account</h3>
              <AgainFormRow label="Name">
                <AgainUnderlineInput value={form.name} onChange={(v) => patch({ name: v })} placeholder="e.g. City Bank — 1234, bKash Merchant" />
              </AgainFormRow>
              <AgainFormRow label="Type">
                {account ? (
                  <span className="text-sm">{KIND_OPTIONS.find((k) => k.value === form.kind)?.label ?? form.kind}</span>
                ) : (
                  <FilterSelect value={form.kind} onChange={(v) => patch({ kind: v })} width="w-full" ariaLabel="Account type" options={KIND_OPTIONS} avoidCollisions />
                )}
              </AgainFormRow>
              {!account ? (
                <AgainFormRow label="Opening balance">
                  <AgainUnderlineInput value={form.openingBalance} onChange={(v) => patch({ openingBalance: v.replace(/[^\d.-]/g, "") })} placeholder="0" />
                </AgainFormRow>
              ) : null}
            </section>
            {isBank ? (
              <section>
                <h3 className="mb-1 border-b border-border/80 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bank</h3>
                <AgainFormRow label="Bank">
                  <FilterSelect
                    value={form.bankId}
                    onChange={(v) => patch({ bankId: v, branchId: "" })}
                    options={banks.filter((b) => b.is_active || b.id === form.bankId).map((b) => ({ value: b.id, label: b.name }))}
                    searchThreshold={0}
                    placeholder="Select bank…"
                    searchPlaceholder="Search bank…"
                    width="w-full"
                    avoidCollisions
                    ariaLabel="Bank"
                  />
                </AgainFormRow>
                <AgainFormRow label="Branch">
                  <FilterSelect
                    value={form.branchId}
                    onChange={(v) => patch({ branchId: v })}
                    options={(bank?.branches ?? []).map((br) => ({
                      value: br.id,
                      label: br.routing_number ? `${br.name} · ${br.routing_number}` : br.name,
                    }))}
                    searchThreshold={0}
                    placeholder={bank ? (bank.branches.length ? "Select branch…" : "No branches yet: add one in Banks") : "Select the bank first"}
                    width="w-full"
                    avoidCollisions
                    ariaLabel="Branch"
                    disabled={!bank}
                  />
                </AgainFormRow>
                <AgainFormRow label="Account number">
                  <AgainUnderlineInput value={form.accountNumber} onChange={(v) => patch({ accountNumber: v })} placeholder="As printed on the cheque book" />
                </AgainFormRow>
                <AgainFormRow label="Account title">
                  <AgainUnderlineInput value={form.accountTitle} onChange={(v) => patch({ accountTitle: v })} placeholder="Name on the account" />
                </AgainFormRow>
                {!account ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">A new bank account gets its own GL ledger under 1010 Bank.</p>
                ) : null}
              </section>
            ) : null}
            <section className="space-y-2">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 h-3.5 w-3.5 accent-[#00a09d]" checked={form.checkBalance} onChange={(e) => patch({ checkBalance: e.target.checked })} />
                <span>
                  <span className="block font-medium">Check balance</span>
                  <span className="block text-[11px] text-muted-foreground">
                    Payments, vouchers and expenses cannot take more out of this account than it holds.
                  </span>
                </span>
              </label>
              {!account ? (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-3.5 w-3.5 accent-[#00a09d]" checked={form.isDefault} onChange={(e) => patch({ isDefault: e.target.checked })} />
                  Make this the default account for new payments
                </label>
              ) : null}
            </section>
          </div>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}
