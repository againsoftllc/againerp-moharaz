"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AGAIN_DRAWER_FIELD_SHEET_CLASS,
  AgainDrawerButton,
  AgainDrawerCloseButton,
  AgainDrawerControlBar,
  AgainDrawerLayout,
  AgainDrawerPanel,
  AgainDrawerSwitch,
} from "@/components/again/again-drawer";
import { AGAIN_FORM_RECORD_TITLE_CLASS, AgainFormRow, AgainUnderlineInput } from "@/components/again/again-form-sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import { createDiscountType, updateDiscountType, type ApiDiscountType } from "@/lib/api/sales-pricing";
import {
  PRICING_DATE_INPUT,
  PRICING_SECTION_TITLE,
  PricingProductAdd,
  decimalText,
  fromApiNumber,
  intText,
  runWithToast,
} from "./pricing-shared";

type Target = "item" | "brand" | "category";
type Row = { key: string; target: Target; id: string; label: string; minQty: string; pct: string; from: string; to: string };
type Option = { value: string; label: string };

let seq = 0;
const key = () => `d${Date.now()}-${++seq}`;

/**
 * One discount type (OnerERP Discount Type): a default % per product, brand or category (the product line wins, then the
 * brand, then the category), from a quantity up, and a cap on what a seller may give on a line under it.
 */
export function DiscountTypeDrawer({
  open,
  discountType,
  brands,
  categories,
  canWrite,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  discountType: ApiDiscountType | null;
  brands: Option[];
  categories: Option[];
  canWrite: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (row: ApiDiscountType) => void;
}) {
  const [current, setCurrent] = React.useState<ApiDiscountType | null>(null);
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [maxPct, setMaxPct] = React.useState("");
  const [active, setActive] = React.useState(true);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [portalHost, setPortalHost] = React.useState<HTMLElement | null>(null);

  const load = React.useCallback((dt: ApiDiscountType | null) => {
    setCurrent(dt);
    setName(dt?.name ?? "");
    setCode(dt?.code ?? "");
    setDescription(dt?.description ?? "");
    setMaxPct(fromApiNumber(dt?.max_pct));
    setActive(dt?.is_active ?? true);
    setRows(
      (dt?.items ?? []).map((i) => ({
        key: key(),
        target: i.item_id ? "item" : i.brand_id ? "brand" : "category",
        id: i.item_id ?? i.brand_id ?? i.category_id ?? "",
        label: i.target_label ?? "",
        minQty: String(i.min_qty),
        pct: fromApiNumber(i.discount_pct),
        from: i.valid_from ?? "",
        to: i.valid_to ?? "",
      })),
    );
  }, []);

  React.useEffect(() => {
    if (open) load(discountType);
  }, [open, discountType, load]);

  const patch = (k: string, changes: Partial<Row>) => setRows((list) => list.map((r) => (r.key === k ? { ...r, ...changes } : r)));
  const addRow = (target: Target, id = "", label = "") =>
    setRows((list) => [...list, { key: key(), target, id, label, minQty: "1", pct: "", from: "", to: "" }]);

  const save = () =>
    runWithToast(setBusy, async () => {
      const input = {
        name: name.trim(),
        code: code.trim() || undefined,
        description: description.trim() || null,
        max_pct: maxPct || null,
        is_active: active,
        items: rows
          .filter((r) => r.id)
          .map((r) => ({
            item_id: r.target === "item" ? r.id : null,
            brand_id: r.target === "brand" ? r.id : null,
            category_id: r.target === "category" ? r.id : null,
            min_qty: Math.max(1, Number(r.minQty) || 1),
            discount_pct: String(Number(r.pct) || 0),
            valid_from: r.from || null,
            valid_to: r.to || null,
          })),
      };
      const res = current ? await updateDiscountType(current.id, input) : await createDiscountType(input);
      load(res.data);
      onSaved(res.data);
      toast.success(`${res.data.name} saved`);
    });

  const title = current ? current.name : "New discount type";
  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      resizable
      defaultWidthRatio={0.65}
      minWidth={440}
      widthStorageKey="again-discount-type-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar trailing={<AgainDrawerCloseButton onClick={() => onOpenChange(false)} />}>
          {canWrite ? (
            <AgainDrawerButton variant="primary" onClick={() => void save()} disabled={busy || !name.trim()}>
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
        <div ref={setPortalHost} className={`min-h-0 flex-1 space-y-4 overflow-y-auto ${AGAIN_DRAWER_FIELD_SHEET_CLASS}`}>
          <div className="@container space-y-4">
            <div>
              <h2 className={AGAIN_FORM_RECORD_TITLE_CLASS}>{title}</h2>
              <p className="text-xs text-muted-foreground">
                The % fills in on a sales line when this type applies (through a customer group or a pricing rule).
                {maxPct ? ` A seller may give at most ${maxPct}% on a line.` : " No cap on what a seller may give."}
              </p>
            </div>
            <section>
              <h3 className={PRICING_SECTION_TITLE}>Discount type</h3>
              <div className="grid gap-x-8 @xl:grid-cols-2">
                <AgainFormRow label="Name">
                  <AgainUnderlineInput value={name} onChange={setName} readOnly={!canWrite} placeholder="e.g. Eid offer" />
                </AgainFormRow>
                <AgainFormRow label="Code">
                  <AgainUnderlineInput value={code} onChange={(v) => setCode(v.toUpperCase())} readOnly={!canWrite} placeholder="from the name" />
                </AgainFormRow>
                <AgainFormRow label="Description">
                  <AgainUnderlineInput value={description} onChange={setDescription} readOnly={!canWrite} />
                </AgainFormRow>
                <AgainFormRow label="Max discount %">
                  <AgainUnderlineInput value={maxPct} onChange={(v) => setMaxPct(decimalText(v))} readOnly={!canWrite} placeholder="no cap" />
                </AgainFormRow>
              </div>
            </section>
            <section>
              <h3 className={PRICING_SECTION_TITLE}>Discounts</h3>
              {canWrite ? (
                <div className="mb-2 space-y-1.5">
                  <PricingProductAdd portalHost={portalHost} onPick={(p) => addRow("item", p.id, `${p.sku} ${p.name}`)} />
                  <div className="flex gap-3 text-[12px]">
                    <button type="button" className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => addRow("brand")}>
                      <Plus className="h-3 w-3" /> A brand
                    </button>
                    <button type="button" className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => addRow("category")}>
                      <Plus className="h-3 w-3" /> A category
                    </button>
                  </div>
                </div>
              ) : null}
              {rows.length === 0 ? (
                <p className="py-2 text-[13px] text-muted-foreground">No discounts yet. Add a product, a brand or a category.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-xs">
                    <thead>
                      <tr className="border-b border-border/70 text-left text-[11px] text-muted-foreground">
                        <th className="w-[80px] py-1.5 pr-2 font-semibold">For</th>
                        <th className="py-1.5 pr-2 font-semibold">Product / brand / category</th>
                        <th className="w-[70px] py-1.5 pr-2 text-right font-semibold">From qty</th>
                        <th className="w-[80px] py-1.5 pr-2 text-right font-semibold">Discount %</th>
                        <th className="w-[120px] py-1.5 pr-2 font-semibold">Valid from</th>
                        <th className="w-[120px] py-1.5 pr-2 font-semibold">Valid to</th>
                        {canWrite ? <th className="w-8" /> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.key} className="border-b border-border/40">
                          <td className="py-1 pr-2 capitalize text-muted-foreground">{r.target === "item" ? "Product" : r.target}</td>
                          <td className="py-1 pr-2">
                            {r.target === "item" || !canWrite ? (
                              r.label || r.id
                            ) : (
                              <FilterSelect
                                value={r.id}
                                onChange={(v) => patch(r.key, { id: v })}
                                options={r.target === "brand" ? brands : categories}
                                searchThreshold={0}
                                placeholder={r.target === "brand" ? "Choose brand…" : "Choose category…"}
                                width="w-full"
                                avoidCollisions
                                ariaLabel={r.target === "brand" ? "Brand" : "Category"}
                              />
                            )}
                          </td>
                          <td className="py-1 pr-2">
                            <AgainUnderlineInput value={r.minQty} onChange={(v) => patch(r.key, { minQty: intText(v) })} readOnly={!canWrite} inputClassName="text-right tabular-nums" />
                          </td>
                          <td className="py-1 pr-2">
                            <AgainUnderlineInput value={r.pct} onChange={(v) => patch(r.key, { pct: decimalText(v) })} readOnly={!canWrite} inputClassName="text-right tabular-nums" />
                          </td>
                          <td className="py-1 pr-2">
                            <input type="date" value={r.from} disabled={!canWrite} onChange={(e) => patch(r.key, { from: e.target.value })} className={PRICING_DATE_INPUT} />
                          </td>
                          <td className="py-1 pr-2">
                            <input type="date" value={r.to} disabled={!canWrite} onChange={(e) => patch(r.key, { to: e.target.value })} className={PRICING_DATE_INPUT} />
                          </td>
                          {canWrite ? (
                            <td className="py-1 text-right">
                              <button type="button" className="p-1 text-muted-foreground hover:text-destructive" aria-label="Remove discount" onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}
