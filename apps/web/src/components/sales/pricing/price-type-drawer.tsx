"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
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
import { createPriceType, updatePriceType, type ApiPriceType } from "@/lib/api/sales-pricing";
import { formatCurrency } from "@/lib/utils";
import {
  PRICING_DATE_INPUT,
  PRICING_SECTION_TITLE,
  PricingProductAdd,
  decimalText,
  fromApiNumber,
  intText,
  runWithToast,
} from "./pricing-shared";

type Row = { key: string; itemId: string; sku: string; name: string; listPrice: number | null; minQty: string; price: string; from: string; to: string };

let seq = 0;
const key = () => `p${Date.now()}-${++seq}`;

/**
 * One price type (OnerERP Price Type) and its product prices (common drawer). A product can have quantity slabs (from 10
 * up: a lower price) and dated prices. Fixed: sales lines must use the price as listed; changeable: within the limits.
 */
export function PriceTypeDrawer({
  open,
  priceType,
  canWrite,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  priceType: ApiPriceType | null;
  canWrite: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (row: ApiPriceType) => void;
}) {
  const [current, setCurrent] = React.useState<ApiPriceType | null>(null);
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [allowChange, setAllowChange] = React.useState(true);
  const [lower, setLower] = React.useState("");
  const [upper, setUpper] = React.useState("");
  const [active, setActive] = React.useState(true);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [portalHost, setPortalHost] = React.useState<HTMLElement | null>(null);

  const load = React.useCallback((pt: ApiPriceType | null) => {
    setCurrent(pt);
    setName(pt?.name ?? "");
    setCode(pt?.code ?? "");
    setDescription(pt?.description ?? "");
    setAllowChange(pt?.allow_change ?? true);
    setLower(fromApiNumber(pt?.lower_limit_pct));
    setUpper(fromApiNumber(pt?.upper_limit_pct));
    setActive(pt?.is_active ?? true);
    setRows(
      (pt?.items ?? []).map((i) => ({
        key: key(),
        itemId: i.item_id,
        sku: i.sku ?? "",
        name: i.name ?? i.item_id,
        listPrice: i.list_price == null ? null : Number(i.list_price),
        minQty: String(i.min_qty),
        price: fromApiNumber(i.price),
        from: i.valid_from ?? "",
        to: i.valid_to ?? "",
      })),
    );
  }, []);

  React.useEffect(() => {
    if (open) load(priceType);
  }, [open, priceType, load]);

  const patch = (k: string, changes: Partial<Row>) => setRows((list) => list.map((r) => (r.key === k ? { ...r, ...changes } : r)));

  const save = () =>
    runWithToast(setBusy, async () => {
      const input = {
        name: name.trim(),
        code: code.trim() || undefined,
        description: description.trim() || null,
        allow_change: allowChange,
        lower_limit_pct: allowChange && lower ? lower : null,
        upper_limit_pct: allowChange && upper ? upper : null,
        is_active: active,
        items: rows.map((r) => ({
          item_id: r.itemId,
          min_qty: Math.max(1, Number(r.minQty) || 1),
          price: String(Number(r.price) || 0),
          valid_from: r.from || null,
          valid_to: r.to || null,
        })),
      };
      const res = current ? await updatePriceType(current.id, input) : await createPriceType(input);
      load(res.data);
      onSaved(res.data);
      toast.success(`${res.data.name} saved`);
    });

  const limitsText = !allowChange
    ? "Fixed: a sales line must use the listed price."
    : lower || upper
      ? `A sales line may go ${lower ? `${lower}% below` : "any amount below"} and ${upper ? `${upper}% above` : "any amount above"} the listed price.`
      : "The seller may change the price freely.";
  const title = current ? current.name : "New price type";
  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      resizable
      defaultWidthRatio={0.65}
      minWidth={440}
      widthStorageKey="again-price-type-drawer-width"
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
                Customers get this price list through their customer group or a pricing rule. {limitsText}
              </p>
            </div>
            <section>
              <h3 className={PRICING_SECTION_TITLE}>Price type</h3>
              <div className="grid gap-x-8 @xl:grid-cols-2">
                <AgainFormRow label="Name">
                  <AgainUnderlineInput value={name} onChange={setName} readOnly={!canWrite} placeholder="e.g. Dealer" />
                </AgainFormRow>
                <AgainFormRow label="Code">
                  <AgainUnderlineInput value={code} onChange={(v) => setCode(v.toUpperCase())} readOnly={!canWrite} placeholder="from the name" />
                </AgainFormRow>
                <AgainFormRow label="Description">
                  <AgainUnderlineInput value={description} onChange={setDescription} readOnly={!canWrite} />
                </AgainFormRow>
                <AgainFormRow label="Seller may change">
                  <AgainDrawerSwitch
                    label="Price"
                    value={allowChange ? "yes" : "no"}
                    onChange={canWrite ? (v) => setAllowChange(v === "yes") : undefined}
                    options={[
                      { value: "yes", label: "Within limits" },
                      { value: "no", label: "Fixed" },
                    ]}
                  />
                </AgainFormRow>
                {allowChange ? (
                  <>
                    <AgainFormRow label="Lower limit %">
                      <AgainUnderlineInput value={lower} onChange={(v) => setLower(decimalText(v))} readOnly={!canWrite} placeholder="no limit" />
                    </AgainFormRow>
                    <AgainFormRow label="Upper limit %">
                      <AgainUnderlineInput value={upper} onChange={(v) => setUpper(decimalText(v))} readOnly={!canWrite} placeholder="no limit" />
                    </AgainFormRow>
                  </>
                ) : null}
              </div>
            </section>
            <section>
              <h3 className={PRICING_SECTION_TITLE}>Prices</h3>
              {canWrite ? (
                <div className="mb-2">
                  <PricingProductAdd
                    portalHost={portalHost}
                    onPick={(p) =>
                      setRows((list) => [
                        ...list,
                        { key: key(), itemId: p.id, sku: p.sku, name: p.name, listPrice: p.price ?? null, minQty: "1", price: fromApiNumber(p.price), from: "", to: "" },
                      ])
                    }
                  />
                </div>
              ) : null}
              {rows.length === 0 ? (
                <p className="py-2 text-[13px] text-muted-foreground">No products yet. Search above to add one; add it again with a higher quantity for a slab.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-xs">
                    <thead>
                      <tr className="border-b border-border/70 text-left text-[11px] text-muted-foreground">
                        <th className="py-1.5 pr-2 font-semibold">Product</th>
                        <th className="w-[100px] py-1.5 pr-2 text-right font-semibold">List price</th>
                        <th className="w-[70px] py-1.5 pr-2 text-right font-semibold">From qty</th>
                        <th className="w-[110px] py-1.5 pr-2 text-right font-semibold">Price</th>
                        <th className="w-[120px] py-1.5 pr-2 font-semibold">Valid from</th>
                        <th className="w-[120px] py-1.5 pr-2 font-semibold">Valid to</th>
                        {canWrite ? <th className="w-8" /> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.key} className="border-b border-border/40">
                          <td className="py-1 pr-2">
                            <span className="font-medium">{r.sku}</span> <span className="text-muted-foreground">{r.name}</span>
                          </td>
                          <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">{r.listPrice == null ? "—" : formatCurrency(r.listPrice)}</td>
                          <td className="py-1 pr-2">
                            <AgainUnderlineInput value={r.minQty} onChange={(v) => patch(r.key, { minQty: intText(v) })} readOnly={!canWrite} inputClassName="text-right tabular-nums" />
                          </td>
                          <td className="py-1 pr-2">
                            <AgainUnderlineInput value={r.price} onChange={(v) => patch(r.key, { price: decimalText(v) })} readOnly={!canWrite} inputClassName="text-right tabular-nums" />
                          </td>
                          <td className="py-1 pr-2">
                            <input type="date" value={r.from} disabled={!canWrite} onChange={(e) => patch(r.key, { from: e.target.value })} className={PRICING_DATE_INPUT} />
                          </td>
                          <td className="py-1 pr-2">
                            <input type="date" value={r.to} disabled={!canWrite} onChange={(e) => patch(r.key, { to: e.target.value })} className={PRICING_DATE_INPUT} />
                          </td>
                          {canWrite ? (
                            <td className="py-1 text-right">
                              <button type="button" className="p-1 text-muted-foreground hover:text-destructive" aria-label="Remove price" onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}>
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
