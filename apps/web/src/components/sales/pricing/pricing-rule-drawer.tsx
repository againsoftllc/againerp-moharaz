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
import { createPricingRule, updatePricingRule, type ApiPricingRule } from "@/lib/api/sales-pricing";
import { PRICING_DATE_INPUT, PRICING_SECTION_TITLE, intText, runWithToast } from "./pricing-shared";

type Option = { value: string; label: string };
export type PricingLookups = {
  priceTypes: Option[];
  discountTypes: Option[];
  groups: Option[];
  warehouses: Option[];
  users: Option[];
  brands: Option[];
  categories: Option[];
};

type Form = {
  name: string;
  price_type_id: string;
  discount_type_id: string;
  customer_group: string;
  warehouse_id: string;
  user_id: string;
  brand_id: string;
  category_id: string;
  valid_from: string;
  valid_to: string;
  priority: string;
  active: boolean;
};

const ANY: Option = { value: "", label: "Any" };
const NONE: Option = { value: "", label: "—" };

const toForm = (r: ApiPricingRule | null): Form => ({
  name: r?.name ?? "",
  price_type_id: r?.price_type_id ?? "",
  discount_type_id: r?.discount_type_id ?? "",
  customer_group: r?.customer_group ?? "",
  warehouse_id: r?.warehouse_id ?? "",
  user_id: r?.user_id ?? "",
  brand_id: r?.brand_id ?? "",
  category_id: r?.category_id ?? "",
  valid_from: r?.valid_from ?? "",
  valid_to: r?.valid_to ?? "",
  priority: String(r?.priority ?? 0),
  active: r?.is_active ?? true,
});

/**
 * Price / Discount Configuration (OnerERP): which price type and discount type apply where. Every condition filled in must
 * match the sale; empty means any. The rule with the most conditions wins, then the higher priority.
 */
export function PricingRuleDrawer({
  open,
  rule,
  lookups,
  canWrite,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  rule: ApiPricingRule | null;
  lookups: PricingLookups;
  canWrite: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (row: ApiPricingRule) => void;
}) {
  const [current, setCurrent] = React.useState<ApiPricingRule | null>(null);
  const [form, setForm] = React.useState<Form>(toForm(null));
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setCurrent(rule);
    setForm(toForm(rule));
  }, [open, rule]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = () =>
    runWithToast(setBusy, async () => {
      const input = {
        name: form.name.trim(),
        price_type_id: form.price_type_id || null,
        discount_type_id: form.discount_type_id || null,
        customer_group: form.customer_group || null,
        warehouse_id: form.warehouse_id || null,
        user_id: form.user_id || null,
        brand_id: form.brand_id || null,
        category_id: form.category_id || null,
        valid_from: form.valid_from || null,
        valid_to: form.valid_to || null,
        priority: Number(form.priority) || 0,
        is_active: form.active,
      };
      const res = current ? await updatePricingRule(current.id, input) : await createPricingRule(input);
      setCurrent(res.data);
      onSaved(res.data);
      toast.success(`${res.data.name} saved`);
    });

  const select = (k: keyof Form, options: Option[], first: Option, label: string) => (
    <FilterSelect
      value={String(form[k])}
      onChange={(v) => set(k, v as never)}
      options={[first, ...options]}
      searchThreshold={8}
      placeholder={first.label}
      width="w-full"
      avoidCollisions
      ariaLabel={label}
      disabled={!canWrite}
    />
  );

  const title = current ? current.name : "New pricing rule";
  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      resizable
      defaultWidthRatio={0.5}
      minWidth={420}
      widthStorageKey="again-pricing-rule-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar trailing={<AgainDrawerCloseButton onClick={() => onOpenChange(false)} />}>
          {canWrite ? (
            <AgainDrawerButton
              variant="primary"
              onClick={() => void save()}
              disabled={busy || !form.name.trim() || (!form.price_type_id && !form.discount_type_id)}
            >
              {current ? "Save" : "Create"}
            </AgainDrawerButton>
          ) : null}
          <AgainDrawerSwitch
            label="Status"
            value={form.active ? "active" : "inactive"}
            onChange={canWrite ? (v) => set("active", v === "active") : undefined}
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
                Every condition you fill in must match the sale; leave it empty for any. The rule with the most conditions wins,
                then the higher priority. Without a matching rule the customer group&apos;s own price and discount types apply.
              </p>
            </div>
            <section>
              <h3 className={PRICING_SECTION_TITLE}>Applies</h3>
              <div className="grid gap-x-8 @xl:grid-cols-2">
                <AgainFormRow label="Name">
                  <AgainUnderlineInput value={form.name} onChange={(v) => set("name", v)} readOnly={!canWrite} placeholder="e.g. Dealers at Chattogram" />
                </AgainFormRow>
                <AgainFormRow label="Priority">
                  <AgainUnderlineInput value={form.priority} onChange={(v) => set("priority", intText(v))} readOnly={!canWrite} />
                </AgainFormRow>
                <AgainFormRow label="Price type">{select("price_type_id", lookups.priceTypes, NONE, "Price type")}</AgainFormRow>
                <AgainFormRow label="Discount type">{select("discount_type_id", lookups.discountTypes, NONE, "Discount type")}</AgainFormRow>
              </div>
            </section>
            <section>
              <h3 className={PRICING_SECTION_TITLE}>When</h3>
              <div className="grid gap-x-8 @xl:grid-cols-2">
                <AgainFormRow label="Customer group">{select("customer_group", lookups.groups, ANY, "Customer group")}</AgainFormRow>
                <AgainFormRow label="Warehouse">{select("warehouse_id", lookups.warehouses, ANY, "Warehouse")}</AgainFormRow>
                <AgainFormRow label="Salesperson">{select("user_id", lookups.users, ANY, "Salesperson")}</AgainFormRow>
                <AgainFormRow label="Brand">{select("brand_id", lookups.brands, ANY, "Brand")}</AgainFormRow>
                <AgainFormRow label="Category">{select("category_id", lookups.categories, ANY, "Category")}</AgainFormRow>
                <AgainFormRow label="Valid from">
                  <input type="date" value={form.valid_from} disabled={!canWrite} onChange={(e) => set("valid_from", e.target.value)} className={PRICING_DATE_INPUT} />
                </AgainFormRow>
                <AgainFormRow label="Valid to">
                  <input type="date" value={form.valid_to} disabled={!canWrite} onChange={(e) => set("valid_to", e.target.value)} className={PRICING_DATE_INPUT} />
                </AgainFormRow>
              </div>
            </section>
          </div>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}
