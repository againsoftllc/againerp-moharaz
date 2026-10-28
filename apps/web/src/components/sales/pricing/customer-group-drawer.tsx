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
import { FilterSelect } from "@/components/shared/filter-select";
import { createCustomerGroup, updateCustomerGroup, type ApiCustomerGroup } from "@/lib/api/sales-pricing";
import { PRICING_SECTION_TITLE, runWithToast } from "./pricing-shared";

type Option = { value: string; label: string };
const NONE: Option = { value: "", label: "—" };

/** A customer group (OnerERP CustomerGroup) and the price / discount type its customers get when no pricing rule matches. */
export function CustomerGroupDrawer({
  open,
  group,
  priceTypes,
  discountTypes,
  canWrite,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  group: ApiCustomerGroup | null;
  priceTypes: Option[];
  discountTypes: Option[];
  canWrite: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (row: ApiCustomerGroup) => void;
}) {
  const [current, setCurrent] = React.useState<ApiCustomerGroup | null>(null);
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [priceType, setPriceType] = React.useState("");
  const [discountType, setDiscountType] = React.useState("");
  const [active, setActive] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setCurrent(group);
    setCode(group?.code ?? "");
    setName(group?.name ?? "");
    setPriceType(group?.price_type_id ?? "");
    setDiscountType(group?.discount_type_id ?? "");
    setActive(group?.is_active ?? true);
  }, [open, group]);

  const save = () =>
    runWithToast(setBusy, async () => {
      const input = {
        name: name.trim() || code.trim(),
        price_type_id: priceType || null,
        discount_type_id: discountType || null,
        is_active: active,
      };
      const res = current ? await updateCustomerGroup(current.id, input) : await createCustomerGroup({ ...input, code: code.trim() });
      setCurrent(res.data);
      setCode(res.data.code);
      onSaved(res.data);
      toast.success(`${res.data.name} saved`);
    });

  const title = current ? current.name : "New customer group";
  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      resizable
      defaultWidthRatio={0.45}
      minWidth={400}
      widthStorageKey="again-customer-group-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar trailing={<AgainDrawerCloseButton onClick={() => onOpenChange(false)} />}>
          {canWrite ? (
            <AgainDrawerButton variant="primary" onClick={() => void save()} disabled={busy || !(current || code.trim())}>
              {current ? "Save" : "Create"}
            </AgainDrawerButton>
          ) : null}
          <AgainDrawerSwitch
            label="Status"
            value={active ? "active" : "inactive"}
            onChange={canWrite ? (v) => setActive(v === "active") : undefined}
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
        </AgainDrawerControlBar>
        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
          <div className="@container space-y-4">
            <div>
              <h2 className={AGAIN_FORM_RECORD_TITLE_CLASS}>{title}</h2>
              <p className="text-xs text-muted-foreground">
                {current ? `${current.customer_count} customer(s) in this group. ` : ""}
                The code is what each customer holds; it cannot change once the group exists.
              </p>
            </div>
            <section>
              <h3 className={PRICING_SECTION_TITLE}>Group</h3>
              <div className="grid gap-x-8 @xl:grid-cols-2">
                <AgainFormRow label="Code">
                  <AgainUnderlineInput value={code} onChange={setCode} readOnly={!canWrite || Boolean(current)} placeholder="e.g. distributor" />
                </AgainFormRow>
                <AgainFormRow label="Name">
                  <AgainUnderlineInput value={name} onChange={setName} readOnly={!canWrite} placeholder="e.g. Distributor" />
                </AgainFormRow>
                <AgainFormRow label="Price type">
                  <FilterSelect value={priceType} onChange={setPriceType} options={[NONE, ...priceTypes]} width="w-full" avoidCollisions ariaLabel="Price type" disabled={!canWrite} placeholder="—" />
                </AgainFormRow>
                <AgainFormRow label="Discount type">
                  <FilterSelect value={discountType} onChange={setDiscountType} options={[NONE, ...discountTypes]} width="w-full" avoidCollisions ariaLabel="Discount type" disabled={!canWrite} placeholder="—" />
                </AgainFormRow>
              </div>
            </section>
          </div>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}
