"use client";

import { useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency, formatQuantity } from "@/lib/utils";

export type PickerVariantOption = {
  name: string;
  value: string;
  imageUrl?: string | null;
};

export type PickerVariant = {
  id: string;
  sku: string;
  name: string;
  price: number;
  stock: number;
  imageUrl?: string | null;
  options: PickerVariantOption[];
};

/** One selected variant + quantity, ready to become a sales order line. */
export type VariantPickResult = {
  variantId: string;
  sku: string;
  name: string;
  variantLabel: string;
  imageUrl?: string | null;
  price: number;
  qty: number;
};

function isColorAxis(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("color") || n.includes("colour") || n.includes("颜色");
}

function isSizeAxis(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("size") ||
    n.includes("尺码") ||
    n.includes("规格") ||
    n === "尺碼"
  );
}

type Axis = { name: string; options: { value: string; imageUrl?: string | null }[] };

function buildAxes(variants: PickerVariant[]): Axis[] {
  const order: string[] = [];
  const values = new Map<string, { value: string; imageUrl?: string | null }[]>();
  for (const variant of variants) {
    for (const opt of variant.options) {
      if (!values.has(opt.name)) {
        order.push(opt.name);
        values.set(opt.name, []);
      }
      const list = values.get(opt.name)!;
      if (!list.some((x) => x.value === opt.value)) {
        list.push({ value: opt.value, imageUrl: opt.imageUrl });
      }
    }
  }
  return order.map((name) => ({ name, options: values.get(name) || [] }));
}

function optionImage(variants: PickerVariant[], axisName: string, value: string): string | null {
  for (const v of variants) {
    const opt = v.options.find((o) => o.name === axisName && o.value === value);
    if (opt?.imageUrl) return opt.imageUrl;
    if (v.options.some((o) => o.name === axisName && o.value === value) && v.imageUrl) {
      return v.imageUrl;
    }
  }
  return null;
}

function variantLabel(variant: PickerVariant): string {
  const combo = variant.options.map((o) => o.value).filter(Boolean).join(" / ");
  return combo || variant.name || variant.sku || "Option";
}

export function SalesVariantPicker({
  productName,
  productImageUrl,
  variants,
  onCancel,
  onConfirm,
}: {
  productName: string;
  productImageUrl?: string | null;
  variants: PickerVariant[];
  onCancel: () => void;
  onConfirm: (lines: VariantPickResult[]) => void;
}) {
  const axes = useMemo(() => buildAxes(variants), [variants]);
  const primary = useMemo(() => {
    const color = axes.find((a) => isColorAxis(a.name));
    return color || axes[0] || null;
  }, [axes]);
  const secondary = useMemo(() => {
    if (!primary) return null;
    const rest = axes.filter((a) => a.name !== primary.name);
    if (!rest.length) return null;
    return rest.find((a) => isSizeAxis(a.name)) || rest[0];
  }, [axes, primary]);

  const stockTracked = useMemo(() => variants.some((v) => v.stock > 0), [variants]);

  const [primaryValue, setPrimaryValue] = useState<string>(() => {
    if (!primary) return "";
    return primary.options[0]?.value ?? "";
  });
  const [lineQtys, setLineQtys] = useState<Record<string, number>>({});

  // Rows shown in the qty table. With two axes we scope to the selected
  // primary value; with a single axis every variant is its own row.
  const rows = useMemo(() => {
    if (!primary) return variants;
    if (secondary) {
      return variants.filter((v) =>
        v.options.some((o) => o.name === primary.name && o.value === primaryValue),
      );
    }
    return variants;
  }, [variants, primary, secondary, primaryValue]);

  const totalQty = useMemo(
    () => Object.values(lineQtys).reduce((s, q) => s + (q > 0 ? q : 0), 0),
    [lineQtys],
  );
  const totalAmount = useMemo(
    () =>
      variants.reduce((s, v) => {
        const q = lineQtys[v.id] || 0;
        return s + (q > 0 ? q * v.price : 0);
      }, 0),
    [variants, lineQtys],
  );

  const setQty = (variantId: string, next: number, maxStock: number) => {
    const cap = stockTracked && maxStock > 0 ? maxStock : 999999;
    const capped = Math.max(0, Math.min(cap, Math.floor(next) || 0));
    setLineQtys((prev) => {
      const copy = { ...prev };
      if (capped <= 0) delete copy[variantId];
      else copy[variantId] = capped;
      return copy;
    });
  };

  const rowLabel = (variant: PickerVariant): string => {
    if (secondary) {
      const opt = variant.options.find((o) => o.name === secondary.name);
      if (opt) return opt.value;
    }
    return variantLabel(variant);
  };

  const confirm = () => {
    const lines: VariantPickResult[] = [];
    for (const v of variants) {
      const qty = lineQtys[v.id] || 0;
      if (qty <= 0) continue;
      lines.push({
        variantId: v.id,
        sku: v.sku,
        name: productName,
        variantLabel: variantLabel(v),
        imageUrl: v.imageUrl ?? optionImage(variants, primary?.name ?? "", "") ?? productImageUrl ?? null,
        price: v.price,
        qty,
      });
    }
    onConfirm(lines);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border/80 bg-background px-4 py-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#00a09d] hover:underline"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to order
        </button>
        <span className="text-[12px] font-medium text-muted-foreground">
          Select quantities
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {/* Product header */}
        <div className="mb-4 flex items-start gap-3">
          {productImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={productImageUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="h-16 w-16 shrink-0 rounded-md border border-border/60 bg-muted object-cover"
            />
          ) : (
            <div className="h-16 w-16 shrink-0 rounded-md border border-border/60 bg-muted" />
          )}
          <div className="min-w-0">
            <p className="line-clamp-2 text-[14px] font-semibold leading-snug text-foreground">
              {productName}
            </p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {variants.length} variant{variants.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        {/* Primary axis (color) cards — only when a secondary axis exists */}
        {primary && secondary ? (
          <div className="mb-4">
            <div className="mb-1.5 flex items-baseline gap-1.5 text-[12px]">
              <span className="font-semibold text-foreground">{primary.name}:</span>
              <span className="font-semibold text-[#00a09d]">{primaryValue || "Select"}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {primary.options.map((opt) => {
                const active = primaryValue === opt.value;
                const img = optionImage(variants, primary.name, opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    title={opt.value}
                    onClick={() => setPrimaryValue(opt.value)}
                    className={cn(
                      "relative h-12 w-12 shrink-0 overflow-hidden rounded-md border bg-muted transition-colors",
                      active
                        ? "border-[#00a09d] ring-1 ring-[#00a09d]/40"
                        : "border-border/70 hover:border-border",
                    )}
                  >
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={img}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center px-0.5 text-center text-[8px] font-semibold leading-tight text-muted-foreground">
                        {opt.value.slice(0, 6)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Variant / size qty rows */}
        <div>
          <div className="mb-1 text-[12px] font-semibold text-foreground">
            {secondary?.name || primary?.name || "Options"}
          </div>
          <div className="overflow-hidden rounded-lg border border-border/70">
            {rows.map((variant, idx) => {
              const stock = Math.max(0, variant.stock);
              const qty = lineQtys[variant.id] || 0;
              const oos = stockTracked && stock <= 0;
              const label = rowLabel(variant);
              const thumb = !secondary ? variant.imageUrl : null;
              return (
                <div
                  key={variant.id}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5",
                    idx > 0 && "border-t border-border/50",
                    oos && "opacity-55",
                    qty > 0 && "bg-[#00a09d]/5",
                  )}
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="h-8 w-8 shrink-0 rounded border border-border/60 bg-muted object-cover"
                    />
                  ) : null}
                  <span
                    className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground"
                    title={label}
                  >
                    {label}
                  </span>
                  <span className="shrink-0 text-right text-[12px] font-semibold tabular-nums text-foreground">
                    {formatCurrency(variant.price)}
                    {stockTracked ? (
                      <span className="ml-1 font-normal text-muted-foreground">
                        {oos ? "OOS" : formatQuantity(stock)}
                      </span>
                    ) : null}
                  </span>
                  <div className="inline-flex h-7 shrink-0 items-center rounded-full bg-muted px-0.5">
                    <button
                      type="button"
                      disabled={oos || qty <= 0}
                      aria-label={`Decrease ${label}`}
                      onClick={() => setQty(variant.id, qty - 1, stock)}
                      className="w-6 cursor-pointer text-[14px] font-semibold text-foreground hover:text-[#00a09d] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={stockTracked && stock > 0 ? stock : undefined}
                      inputMode="numeric"
                      disabled={oos}
                      value={qty}
                      onChange={(e) => {
                        const next = parseInt(e.target.value, 10);
                        setQty(variant.id, Number.isNaN(next) ? 0 : next, stock);
                      }}
                      className="w-8 border-0 bg-transparent text-center text-[12px] font-semibold tabular-nums text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <button
                      type="button"
                      disabled={oos || (stockTracked && stock > 0 && qty >= stock)}
                      aria-label={`Increase ${label}`}
                      onClick={() => setQty(variant.id, qty + 1, stock)}
                      className="w-6 cursor-pointer text-[14px] font-semibold text-foreground hover:text-[#00a09d] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-border/80 bg-background px-4 py-3">
        <div className="mb-2 flex items-center justify-between text-[13px]">
          <span className="text-muted-foreground">
            Selected: <span className="font-semibold text-foreground">{totalQty}</span> pcs
          </span>
          <span className="font-semibold tabular-nums text-foreground">
            {formatCurrency(totalAmount)}
          </span>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={totalQty <= 0} onClick={confirm}>
            Add to order
          </Button>
        </div>
      </div>
    </div>
  );
}
