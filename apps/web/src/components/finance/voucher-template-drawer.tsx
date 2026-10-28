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
  AgainDrawerSwitch,
} from "@/components/again/again-drawer";
import { AGAIN_FORM_RECORD_TITLE_CLASS, AgainFormRow, AgainUnderlineInput } from "@/components/again/again-form-sheet";
import { applyTemplate, useVoucherLookups } from "@/components/finance/voucher-drawer";
import { VoucherFormBody, emptyVoucherForm, linesPayload, newLine, type VoucherForm } from "@/components/finance/voucher-form";
import {
  VOUCHER_TYPE_LABEL,
  createVoucherTemplate,
  deleteVoucherTemplate,
  updateVoucherTemplate,
  type ApiVoucherTemplate,
  type VoucherType,
} from "@/lib/api/finance-vouchers";
import { useDrawerDraft } from "@/lib/hooks/use-drawer-draft";

type TemplateForm = { name: string; active: boolean; voucher: VoucherForm };

const TYPES = Object.keys(VOUCHER_TYPE_LABEL) as VoucherType[];

function formFrom(template: ApiVoucherTemplate | null, type: VoucherType): TemplateForm {
  if (!template) return { name: "", active: true, voucher: emptyVoucherForm(type) };
  return { name: template.name, active: template.is_active, voucher: applyTemplate(emptyVoucherForm(template.voucher_type), template) };
}

const comparable = (form: TemplateForm) =>
  JSON.stringify({ ...form, voucher: { ...form.voucher, date: "", lines: form.voucher.lines.map(({ key: _key, ...rest }) => rest) } });

type Props = {
  open: boolean;
  template: ApiVoucherTemplate | null;
  canWrite: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
  onUse: (template: ApiVoucherTemplate) => void;
};

/** Voucher template in the common drawer: the same header and lines as a voucher, amounts optional. */
export function VoucherTemplateDrawer({ open, template, canWrite, onOpenChange, onChanged, onUse }: Props) {
  const lookups = useVoucherLookups(open);
  const [form, setForm] = React.useState<TemplateForm>(() => formFrom(null, "debit"));
  const [baseline, setBaseline] = React.useState("");
  const [saved, setSaved] = React.useState<ApiVoucherTemplate | null>(null);
  const [busy, setBusy] = React.useState(false);
  const current = saved ?? template;

  React.useEffect(() => {
    if (!open) return;
    setSaved(null);
    const start = formFrom(template, template?.voucher_type ?? "debit");
    setForm(start);
    setBaseline(comparable(start));
  }, [open, template]);

  const dirty = canWrite && baseline !== "" && comparable(form) !== baseline;
  const { saveDraftIfDirty, clear: clearDraft } = useDrawerDraft<TemplateForm>({
    key: open ? `voucher-template:${current?.id ?? "new"}` : "",
    ready: open,
    dirty,
    getValues: () => form,
    restore: (values) => setForm({ ...values, voucher: { ...values.voucher, lines: values.voucher.lines.map((line) => newLine(line)) } }),
    onDiscard: () => setForm(formFrom(current, form.voucher.voucherType)),
    label: "voucher template",
  });

  const close = () => {
    saveDraftIfDirty();
    onOpenChange(false);
  };

  async function save() {
    if (!form.name.trim()) {
      toast.error("Give the template a name");
      return;
    }
    setBusy(true);
    try {
      const v = form.voucher;
      const body = {
        name: form.name.trim(),
        description: v.description.trim(),
        payment_account_id: v.voucherType === "journal" ? null : v.paymentAccountId || null,
        to_payment_account_id: v.voucherType === "contra" ? v.toPaymentAccountId || null : null,
        amount: v.voucherType === "contra" ? v.amount || "0" : "0",
        is_active: form.active,
        lines: linesPayload(v, { keepBlankAmounts: true }),
      };
      const res = current
        ? await updateVoucherTemplate(current.id, body)
        : await createVoucherTemplate({ ...body, voucher_type: v.voucherType });
      clearDraft();
      setSaved(res.data);
      const next = formFrom(res.data, res.data.voucher_type);
      setForm(next);
      setBaseline(comparable(next));
      toast.success(`Template "${res.data.name}" saved`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the template");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!current) {
      clearDraft();
      onOpenChange(false);
      return;
    }
    setBusy(true);
    try {
      await deleteVoucherTemplate(current.id);
      clearDraft();
      toast.success(`Template "${current.name}" deleted`);
      onChanged();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the template");
    } finally {
      setBusy(false);
    }
  }

  const title = current ? current.name : "New voucher template";

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={(next) => (next ? undefined : close())}
      title={title}
      resizable
      defaultWidthRatio={0.6}
      minWidth={420}
      widthStorageKey="again-voucher-template-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar trailing={<AgainDrawerCloseButton onClick={close} />}>
          {canWrite ? (
            <AgainDrawerButton variant="primary" onClick={() => void save()} disabled={busy || (Boolean(current) && !dirty)}>
              {busy ? "Saving…" : current ? "Save" : "Create"}
            </AgainDrawerButton>
          ) : null}
          {current && !dirty ? (
            <AgainDrawerButton variant="success" onClick={() => onUse(current)} disabled={busy || !current.is_active}>
              New voucher from this
            </AgainDrawerButton>
          ) : null}
          {canWrite ? (
            <AgainDrawerButton variant={current ? "danger" : "action"} onClick={() => void remove()} disabled={busy}>
              {current ? "Delete" : "Cancel"}
            </AgainDrawerButton>
          ) : null}
          <AgainDrawerSwitch
            label="Voucher type"
            value={form.voucher.voucherType}
            options={TYPES.map((value) => ({ value, label: VOUCHER_TYPE_LABEL[value] }))}
            onChange={current || !canWrite ? undefined : (value) => setForm((f) => ({ ...f, voucher: { ...emptyVoucherForm(value), description: f.voucher.description } }))}
          />
        </AgainDrawerControlBar>
        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
          <div className="@container space-y-4">
            <div>
              <p className="text-[12px] font-medium text-[#00a09d]">Voucher template</p>
              <h2 className={AGAIN_FORM_RECORD_TITLE_CLASS}>{title}</h2>
              <p className="text-xs text-muted-foreground">
                {current ? "The voucher type is fixed once the template exists." : "Pick the voucher type in the bar above."} Amounts may be left blank
                and filled in on each voucher.{dirty ? " · Unsaved changes" : ""}
              </p>
            </div>
            <div className="grid gap-x-8 @xl:grid-cols-2">
              <AgainFormRow label="Template name">
                <AgainUnderlineInput value={form.name} onChange={(name) => setForm((f) => ({ ...f, name }))} readOnly={!canWrite} placeholder="e.g. Office rent" />
              </AgainFormRow>
              <AgainFormRow label="Active">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={form.active}
                    disabled={!canWrite}
                    onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                  />
                  Offered under New → From template
                </label>
              </AgainFormRow>
            </div>
            <VoucherFormBody
              form={form.voucher}
              onChange={(changes) => setForm((f) => ({ ...f, voucher: { ...f.voucher, ...changes } }))}
              lookups={lookups}
              readOnly={!canWrite}
              template
            />
          </div>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}
