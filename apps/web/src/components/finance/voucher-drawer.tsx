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
  AgainDrawerSwitch,
} from "@/components/again/again-drawer";
import { AGAIN_FORM_RECORD_TITLE_CLASS, AgainUnderlineInput } from "@/components/again/again-form-sheet";
import {
  VoucherFormBody,
  emptyVoucherForm,
  formLinesFrom,
  linesPayload,
  newLine,
  voucherProblem,
  voucherTotals,
  type VoucherForm,
  type VoucherLookups,
} from "@/components/finance/voucher-form";
import { fetchFinanceAccounts, fetchPaymentAccounts } from "@/lib/api/finance";
import { fetchCostCenters } from "@/lib/api/finance-allocation";
import {
  VOUCHER_STATUS_LABEL,
  VOUCHER_TYPE_LABEL,
  approveVoucher,
  cancelVoucher,
  createVoucher,
  createVoucherTemplate,
  deleteVoucher,
  fetchVoucher,
  fetchVoucherTemplates,
  updateVoucher,
  type ApiVoucher,
  type ApiVoucherTemplate,
  type VoucherStatus,
  type VoucherType,
} from "@/lib/api/finance-vouchers";
import { useDrawerDraft } from "@/lib/hooks/use-drawer-draft";
import { formatCurrency, formatDateTime } from "@/lib/utils";

const EMPTY_LOOKUPS: VoucherLookups = { accounts: [], paymentAccounts: [], costCenters: [] };

/** Accounts, cash / bank accounts and cost centers for the voucher and template drawers. */
export function useVoucherLookups(open: boolean) {
  const [lookups, setLookups] = React.useState<VoucherLookups>(EMPTY_LOOKUPS);
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([fetchFinanceAccounts(), fetchPaymentAccounts(), fetchCostCenters().catch(() => ({ data: [] }))])
      .then(([accounts, paymentAccounts, costCenters]) => {
        if (!cancelled) setLookups({ accounts: accounts.data, paymentAccounts: paymentAccounts.data, costCenters: costCenters.data });
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load accounts"));
    return () => {
      cancelled = true;
    };
  }, [open]);
  return lookups;
}

/** A template's fields copied into a voucher form (Voucher From Template). */
export function applyTemplate(form: VoucherForm, template: ApiVoucherTemplate): VoucherForm {
  return {
    ...form,
    description: template.description || form.description,
    paymentAccountId: template.payment_account_id ?? form.paymentAccountId,
    toPaymentAccountId: template.to_payment_account_id ?? form.toPaymentAccountId,
    amount: Number(template.amount) ? String(Number(template.amount)) : form.amount,
    lines: template.lines.length ? formLinesFrom(template.lines) : form.lines,
  };
}

function formFromVoucher(voucher: ApiVoucher): VoucherForm {
  return {
    voucherType: voucher.voucher_type,
    date: voucher.voucher_date,
    description: voucher.description,
    reference: voucher.reference ?? "",
    paymentAccountId: voucher.payment_account_id ?? "",
    toPaymentAccountId: voucher.to_payment_account_id ?? "",
    amount: voucher.voucher_type === "contra" ? String(Number(voucher.amount)) : "",
    lines: voucher.voucher_type === "contra" ? [] : formLinesFrom(voucher.lines),
  };
}

const comparable = (form: VoucherForm) => JSON.stringify({ ...form, lines: form.lines.map(({ key: _key, ...rest }) => rest) });

type Props = {
  /** An existing voucher to open, or null with `newType` for a new one. */
  voucherId: string | null;
  newType: VoucherType | null;
  /** Start the new voucher from this template. */
  startTemplate?: ApiVoucherTemplate | null;
  canWrite: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: (voucher?: ApiVoucher) => void;
};

/**
 * One voucher in the common drawer (docs/common/drawercommon.md). Draft: edit, Save, Approve (posts it), Delete. Approved: Cancel
 * posts the mirror entry with a reason. A new voucher can start from a template and any voucher can be kept as one.
 */
export function VoucherDrawer({ voucherId, newType, startTemplate, canWrite, onOpenChange, onChanged }: Props) {
  const open = voucherId !== null || newType !== null;
  const lookups = useVoucherLookups(open);
  const [voucher, setVoucher] = React.useState<ApiVoucher | null>(null);
  const [form, setForm] = React.useState<VoucherForm>(() => emptyVoucherForm(newType ?? "debit"));
  const [baseline, setBaseline] = React.useState("");
  const [templates, setTemplates] = React.useState<ApiVoucherTemplate[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [templateName, setTemplateName] = React.useState<string | null>(null);
  const [cancelReason, setCancelReason] = React.useState<string | null>(null);
  const isNew = voucherId === null && voucher === null;
  const status: VoucherStatus = voucher?.status ?? "draft";
  const editable = canWrite && status === "draft";
  const patch = (changes: Partial<VoucherForm>) => setForm((current) => ({ ...current, ...changes }));

  // reset on every open, before the draft hook so a kept draft is put back over it
  React.useEffect(() => {
    if (!open) return;
    setVoucher(null);
    setTemplateName(null);
    setCancelReason(null);
    if (voucherId) {
      setLoading(true);
      fetchVoucher(voucherId)
        .then((res) => {
          setVoucher(res.data);
          const loaded = formFromVoucher(res.data);
          setForm(loaded);
          setBaseline(comparable(loaded));
        })
        .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load the voucher"))
        .finally(() => setLoading(false));
      return;
    }
    const type = newType ?? "debit";
    const start = startTemplate ? applyTemplate(emptyVoucherForm(type), startTemplate) : emptyVoucherForm(type);
    setForm(start);
    setBaseline(comparable(start));
    fetchVoucherTemplates({ voucher_type: type, activeOnly: true })
      .then((res) => setTemplates(res.data))
      .catch(() => setTemplates([]));
  }, [open, voucherId, newType, startTemplate]);

  // a new money voucher starts on the default cash account
  React.useEffect(() => {
    if (!open || !isNew || form.voucherType === "journal" || form.paymentAccountId || lookups.paymentAccounts.length === 0) return;
    const fallback = lookups.paymentAccounts.find((a) => a.is_default && a.is_active) ?? lookups.paymentAccounts.find((a) => a.is_active);
    if (fallback) {
      setForm((current) => ({ ...current, paymentAccountId: fallback.id }));
      setBaseline((current) => {
        const parsed = JSON.parse(current || "{}");
        return JSON.stringify({ ...parsed, paymentAccountId: fallback.id });
      });
    }
  }, [open, isNew, form.voucherType, form.paymentAccountId, lookups.paymentAccounts]);

  const dirty = editable && baseline !== "" && comparable(form) !== baseline;
  const draftKey = !open || loading ? null : isNew ? `voucher:new:${form.voucherType}` : status === "draft" && voucher ? `voucher:${voucher.id}` : null;
  const { saveDraftIfDirty, clear: clearDraft } = useDrawerDraft<VoucherForm>({
    key: draftKey ?? "",
    ready: open && Boolean(draftKey),
    dirty,
    getValues: () => form,
    restore: (values) => setForm({ ...values, lines: values.lines.map((line) => newLine(line)) }),
    onDiscard: () => setForm(voucher ? formFromVoucher(voucher) : emptyVoucherForm(form.voucherType)),
    label: "voucher",
  });

  const problem = voucherProblem(form);
  const totals = voucherTotals(form);

  const close = () => {
    saveDraftIfDirty();
    onOpenChange(false);
  };

  function payload() {
    return {
      voucher_date: form.date,
      description: form.description.trim(),
      reference: form.reference.trim() || null,
      payment_account_id: form.voucherType === "journal" ? null : form.paymentAccountId || null,
      to_payment_account_id: form.voucherType === "contra" ? form.toPaymentAccountId || null : null,
      amount: form.voucherType === "contra" ? form.amount || "0" : "0",
      lines: linesPayload(form),
    };
  }

  async function save(): Promise<ApiVoucher | null> {
    if (problem) {
      toast.error(problem);
      return null;
    }
    const res = isNew
      ? await createVoucher({ voucher_type: form.voucherType, template_id: startTemplate?.id ?? null, ...payload() })
      : await updateVoucher(voucher!.id, payload());
    clearDraft();
    setVoucher(res.data);
    const saved = formFromVoucher(res.data);
    setForm(saved);
    setBaseline(comparable(saved));
    return res.data;
  }

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

  const onSave = () =>
    run(async () => {
      const saved = await save();
      if (saved) {
        toast.success(`${saved.voucher_number} saved as draft`);
        onChanged(saved);
      }
    });

  const onApprove = () =>
    run(async () => {
      const saved = isNew || dirty ? await save() : voucher;
      if (!saved) return;
      const res = await approveVoucher(saved.id);
      setVoucher(res.data);
      toast.success(`${res.data.voucher_number} approved and posted (${res.data.journal_entry_number ?? "journal"})`);
      onChanged(res.data);
    });

  const onDelete = () =>
    run(async () => {
      if (isNew) {
        clearDraft();
        onOpenChange(false);
        return;
      }
      await deleteVoucher(voucher!.id);
      clearDraft();
      toast.success(`${voucher!.voucher_number} deleted`);
      onChanged();
      onOpenChange(false);
    });

  const onCancelVoucher = () =>
    run(async () => {
      if (!cancelReason?.trim()) {
        toast.error("Say why the voucher is cancelled");
        return;
      }
      const res = await cancelVoucher(voucher!.id, cancelReason.trim());
      setVoucher(res.data);
      setCancelReason(null);
      toast.success(`${res.data.voucher_number} cancelled — reversal ${res.data.reversal_entry_number ?? "posted"}`);
      onChanged(res.data);
    });

  const onSaveTemplate = () =>
    run(async () => {
      if (!templateName?.trim()) {
        toast.error("Give the template a name");
        return;
      }
      const res = await createVoucherTemplate({
        name: templateName.trim(),
        voucher_type: form.voucherType,
        description: form.description.trim(),
        payment_account_id: form.voucherType === "journal" ? null : form.paymentAccountId || null,
        to_payment_account_id: form.voucherType === "contra" ? form.toPaymentAccountId || null : null,
        amount: form.voucherType === "contra" ? form.amount || "0" : "0",
        lines: linesPayload(form, { keepBlankAmounts: true }),
      });
      setTemplateName(null);
      toast.success(`Template "${res.data.name}" saved`);
    });

  const title = voucher ? voucher.voucher_number : `New ${VOUCHER_TYPE_LABEL[form.voucherType].toLowerCase()} voucher`;

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={(next) => (next ? undefined : close())}
      title={title}
      resizable
      defaultWidthRatio={0.6}
      minWidth={420}
      widthStorageKey="again-voucher-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar trailing={<AgainDrawerCloseButton onClick={close} />}>
          {editable ? (
            <>
              <AgainDrawerButton variant="primary" onClick={onSave} disabled={busy || loading || (!isNew && !dirty)}>
                {busy ? "Saving…" : isNew ? "Save draft" : "Save"}
              </AgainDrawerButton>
              <AgainDrawerButton variant="success" onClick={onApprove} disabled={busy || loading || Boolean(problem)} title={problem ?? undefined}>
                {isNew || dirty ? "Save & approve" : "Approve"}
              </AgainDrawerButton>
              {dirty && !isNew ? (
                <AgainDrawerButton
                  onClick={() => {
                    clearDraft();
                    if (voucher) setForm(formFromVoucher(voucher));
                  }}
                  disabled={busy}
                >
                  Discard
                </AgainDrawerButton>
              ) : null}
              <AgainDrawerButton variant={isNew ? "action" : "danger"} onClick={onDelete} disabled={busy}>
                {isNew ? "Cancel" : "Delete"}
              </AgainDrawerButton>
            </>
          ) : null}
          {canWrite && status === "approved" ? (
            <AgainDrawerButton variant="danger" onClick={() => setCancelReason((r) => (r === null ? "" : null))} disabled={busy}>
              Cancel voucher
            </AgainDrawerButton>
          ) : null}
          {canWrite && !loading ? (
            <AgainDrawerButton onClick={() => setTemplateName((n) => (n === null ? form.description.slice(0, 120) : null))} disabled={busy}>
              Save as template
            </AgainDrawerButton>
          ) : null}
          <AgainDrawerSwitch
            label="Status"
            value={status}
            options={(["draft", "approved", "cancelled"] as VoucherStatus[]).map((value) => ({ value, label: VOUCHER_STATUS_LABEL[value] }))}
          />
        </AgainDrawerControlBar>

        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
          <div className="@container space-y-4">
            <div>
              <p className="text-[12px] font-medium text-[#00a09d]">{VOUCHER_TYPE_LABEL[form.voucherType]} voucher</p>
              <h2 className={AGAIN_FORM_RECORD_TITLE_CLASS}>{title}</h2>
              <p className="text-xs text-muted-foreground">
                {loading
                  ? "Loading…"
                  : `${formatCurrency(totals.amount)}${voucher?.journal_entry_number ? ` · posted as ${voucher.journal_entry_number}` : ""}${
                      voucher?.reversal_entry_number ? ` · reversed by ${voucher.reversal_entry_number}` : ""
                    }${dirty ? " · unsaved changes" : ""}`}
              </p>
            </div>

            {templateName !== null ? (
              <div className="flex flex-wrap items-end gap-2 border border-dashed border-border p-2">
                <div className="min-w-[220px] flex-1">
                  <p className="text-[11px] text-muted-foreground">Template name</p>
                  <AgainUnderlineInput value={templateName} onChange={setTemplateName} placeholder="e.g. Office rent" />
                </div>
                <AgainDrawerButton variant="primary" onClick={onSaveTemplate} disabled={busy}>
                  Save template
                </AgainDrawerButton>
              </div>
            ) : null}

            {cancelReason !== null ? (
              <div className="flex flex-wrap items-end gap-2 border border-dashed border-red-500/50 p-2">
                <div className="min-w-[220px] flex-1">
                  <p className="text-[11px] text-muted-foreground">Why is it cancelled? A reversal entry is posted; the voucher stays on record.</p>
                  <AgainUnderlineInput value={cancelReason} onChange={setCancelReason} placeholder="Reason" />
                </div>
                <AgainDrawerButton variant="danger" onClick={onCancelVoucher} disabled={busy}>
                  Confirm cancel
                </AgainDrawerButton>
              </div>
            ) : null}

            {isNew && templates.length > 0 ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">From template</span>
                <FilterSelect
                  value=""
                  onChange={(id) => {
                    const template = templates.find((t) => t.id === id);
                    if (template) setForm((current) => applyTemplate(current, template));
                  }}
                  options={templates.map((t) => ({ value: t.id, label: t.name }))}
                  placeholder="Choose a template…"
                  width="w-[240px]"
                  avoidCollisions
                  ariaLabel="From template"
                />
              </div>
            ) : null}

            <VoucherFormBody form={form} onChange={patch} lookups={lookups} readOnly={!editable || loading} />

            {voucher ? (
              <section className="text-[11px] text-muted-foreground">
                <p>
                  Entered by {voucher.created_by ?? "—"} on {formatDateTime(voucher.created_at)}
                  {voucher.approved_at ? ` · approved by ${voucher.approved_by ?? "—"} on ${formatDateTime(voucher.approved_at)}` : ""}
                  {voucher.cancelled_at ? ` · cancelled by ${voucher.cancelled_by ?? "—"} on ${formatDateTime(voucher.cancelled_at)}: ${voucher.cancel_reason ?? ""}` : ""}
                </p>
              </section>
            ) : null}
            {editable && problem ? <p className="text-[11px] text-amber-600 dark:text-amber-400">{problem}</p> : null}
          </div>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}
