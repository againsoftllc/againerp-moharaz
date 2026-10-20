"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  Menu,
  Percent,
  Trash2,
} from "lucide-react";
import {
  LINE_TABLE_ACTION_COL_CLASS,
  type LineDataCol,
} from "@/components/sales/sales-order-line-table-layout";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

export type SalesOrderLine = {
  id: string;
  itemId: string;
  name: string;
  sku: string;
  variant: string;
  description: string;
  leadTime: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  discountType: "percent" | "fixed";
  tax: number;
  taxRate: number;
};

type ProductDetail = { price: number; description: string; sku: string; id: string };

type ProductOption = {
  id: string;
  name: string;
  sku: string;
  imageUrl?: string;
  price: number;
  description: string;
};

type SearchItem = { id: string; primary: string; secondary?: string; imageUrl?: string };

/** Editable number that allows clearing "0" and typing freely (avoids stuck leading zero). */
export function LineNumericInput({
  value,
  onChange,
  className,
  min = 0,
  steppers = false,
  step = 1,
}: {
  value: number | null | undefined;
  onChange: (next: number) => void;
  className?: string;
  min?: number;
  /** Show +/- spinner controls (used for quantity). */
  steppers?: boolean;
  step?: number;
}) {
  const numeric = Number(value ?? 0);
  const safeValue = Number.isFinite(numeric) ? numeric : 0;
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => String(safeValue));

  useEffect(() => {
    if (!focused) setDraft(String(safeValue));
  }, [safeValue, focused]);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === "-" || trimmed === ".") {
      onChange(0);
      setDraft("0");
      return;
    }
    const n = Number(trimmed);
    if (Number.isNaN(n)) {
      setDraft(String(safeValue));
      return;
    }
    const next = Math.max(min, n);
    onChange(next);
    setDraft(String(next));
  };

  const bump = (delta: number) => {
    const next = Math.max(min, Math.round((safeValue + delta) * 1000) / 1000);
    onChange(next);
    setDraft(String(next));
    setFocused(false);
  };

  const input = (
    <input
      type="text"
      inputMode="decimal"
      value={focused ? draft : String(safeValue)}
      onFocus={(e) => {
        setFocused(true);
        setDraft(safeValue === 0 ? "" : String(safeValue));
        requestAnimationFrame(() => e.target.select());
      }}
      onBlur={() => {
        commit(draft);
        setFocused(false);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw !== "" && !/^-?\d*\.?\d*$/.test(raw)) return;
        setDraft(raw);
        if (raw === "" || raw === "-" || raw === "." || raw.endsWith(".")) return;
        const n = Number(raw);
        if (!Number.isNaN(n)) onChange(Math.max(min, n));
      }}
      onKeyDown={
        steppers
          ? (e) => {
              if (e.key === "ArrowUp") {
                e.preventDefault();
                bump(step);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                bump(-step);
              }
            }
          : undefined
      }
      className={cn(className, steppers && "pr-0.5")}
    />
  );

  if (!steppers) return input;

  return (
    <div className="inline-flex w-full min-w-0 items-stretch gap-0.5">
      <div className="min-w-0 flex-1">{input}</div>
      <div className="flex shrink-0 flex-col self-stretch border-b border-border/50">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Increase quantity"
          className="flex h-1/2 min-h-[12px] w-4 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => bump(step)}
        >
          <ChevronUp className="h-3 w-3" strokeWidth={2} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Decrease quantity"
          disabled={safeValue <= min}
          className="flex h-1/2 min-h-[12px] w-4 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => bump(-step)}
        >
          <ChevronDown className="h-3 w-3" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

export type RenderLineCellCtx = {
  readOnly?: boolean;
  line: SalesOrderLine;
  amount: number;
  taxIncl: number;
  isProductOpen: boolean;
  productQuery: string;
  cellInput: string;
  descOpenIds: Set<string>;
  productResults: SearchItem[];
  productById: Map<string, ProductOption>;
  mockProductDetails?: Record<string, ProductDetail>;
  portalHost: HTMLElement | null;
  productAnchorsRef: React.MutableRefObject<Map<string, HTMLElement>>;
  onPatchLine: (id: string, patch: Partial<SalesOrderLine>) => void;
  onProductQueryChange: (q: string) => void;
  onProductOpenIdChange: (id: string | null) => void;
  onApplyProduct: (lineId: string, product: ProductOption) => void;
  onToggleDescription: (lineId: string) => void;
  onOpenProductView: (name: string) => void;
  onAddNewProduct?: (lineId: string) => void;
  /** When set, product cell shows this label instead of the product name (grouped variant row). */
  productDisplayOverride?: string | null;
  /** Compact styling for variant option rows under a product group. */
  compact?: boolean;
  SearchDropdown: React.ComponentType<{
    open: boolean;
    getAnchor: () => HTMLElement | null;
    portalContainer: HTMLElement | null;
    items: SearchItem[];
    onSelect: (id: string) => void;
    onSearchMore?: () => void;
    searchMoreLabel?: string;
    onAddNew?: () => void;
    addNewLabel?: string;
    placement?: "bottom" | "auto";
    renderItem?: (item: SearchItem) => React.ReactNode;
  }>;
};

export function lineCellClassName(col: LineDataCol, compact?: boolean): string {
  return cn(
    compact ? "py-1 pr-2 text-[11px] leading-tight" : "py-1.5 pr-3",
    col === "product" && "relative align-top",
    (col === "leadTime" ||
      col === "quantity" ||
      col === "unitPrice" ||
      col === "discount" ||
      col === "taxes" ||
      col === "taxIncl" ||
      col === "amount") &&
      "text-right",
    col === "amount" && "pr-1 tabular-nums",
    col === "taxIncl" && "tabular-nums",
  );
}

export function renderSalesOrderLineCell(col: LineDataCol, ctx: RenderLineCellCtx) {
  const { line, readOnly, cellInput, amount, taxIncl } = ctx;

  switch (col) {
    case "variant":
      return readOnly ? (
        <span>{line.variant || "—"}</span>
      ) : (
        <input
          value={line.variant}
          onChange={(e) => ctx.onPatchLine(line.id, { variant: e.target.value })}
          placeholder="Variant"
          className={cellInput}
        />
      );

    case "product": {
      const override = ctx.productDisplayOverride;
      if (override != null) {
        return readOnly ? (
          <div className="pl-2">
            <p
              className={cn(
                "font-medium text-foreground",
                ctx.compact ? "text-[11px] leading-tight" : "text-[13px]",
              )}
            >
              {override || "—"}
            </p>
          </div>
        ) : (
          <div className="pl-2">
            <input
              value={line.variant}
              onChange={(e) => ctx.onPatchLine(line.id, { variant: e.target.value })}
              placeholder="Variant / option"
              className={cn(
                cellInput,
                ctx.compact && "h-6 text-[11px] leading-tight",
              )}
            />
          </div>
        );
      }
      return readOnly ? (
        <div>
          <p className="font-medium">{line.name || "—"}</p>
          {ctx.descOpenIds.has(line.id) && line.description ? (
            <p className="mt-0.5 whitespace-pre-line text-[13px] italic leading-snug text-muted-foreground">
              {line.description}
            </p>
          ) : null}
        </div>
      ) : (
        <div>
          <div className="flex min-w-0 items-center gap-0.5 border-b border-border/50">
            <p
              className="h-8 min-w-0 flex-1 overflow-hidden truncate text-[13px] leading-8"
              title={line.name || undefined}
            >
              {line.name || <span className="text-muted-foreground/50">&nbsp;</span>}
            </p>
            {line.name || line.sku ? (
              <button
                type="button"
                className="inline-flex h-7 w-6 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                aria-label="View product"
                title="View product"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => ctx.onOpenProductView(line.name)}
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <button
              type="button"
              className={cn(
                "inline-flex h-7 w-6 shrink-0 items-center justify-center rounded-none hover:bg-muted/50",
                ctx.descOpenIds.has(line.id)
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-label="Toggle description"
              aria-expanded={ctx.descOpenIds.has(line.id)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => ctx.onToggleDescription(line.id)}
            >
              <Menu className="h-3.5 w-3.5" />
            </button>
          </div>
          <ctx.SearchDropdown
            open={ctx.isProductOpen}
            placement="bottom"
            getAnchor={() => ctx.productAnchorsRef.current.get(line.id) ?? null}
            portalContainer={ctx.portalHost}
            items={ctx.productResults}
            onSelect={(id) => {
              const product = ctx.productById.get(id);
              if (product) {
                ctx.onApplyProduct(line.id, product);
                return;
              }
              const detail = ctx.mockProductDetails?.[id];
              if (detail) {
                ctx.onApplyProduct(line.id, {
                  id: detail.id,
                  name: id,
                  sku: detail.sku,
                  price: detail.price,
                  description: detail.description,
                });
              }
            }}
            onSearchMore={() => {
              ctx.onProductOpenIdChange(null);
              toast.info("No more products — create a new item if needed");
            }}
            onAddNew={
              ctx.onAddNewProduct
                ? () => {
                    ctx.onAddNewProduct?.(line.id);
                  }
                : undefined
            }
            addNewLabel="Add a new product"
            renderItem={(item) => (
              <div className="flex min-w-0 items-start gap-2.5">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="mt-0.5 h-9 w-9 shrink-0 rounded border border-border/60 bg-muted object-cover"
                  />
                ) : (
                  <div className="mt-0.5 h-9 w-9 shrink-0 rounded border border-border/60 bg-muted" />
                )}
                <div className="min-w-0">
                  <p className="line-clamp-2 whitespace-normal break-words leading-snug text-foreground">
                    {item.primary}
                  </p>
                  {item.secondary ? (
                    <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                      {item.secondary}
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          />
          {ctx.descOpenIds.has(line.id) ? (
            <textarea
              value={line.description}
              onChange={(e) => ctx.onPatchLine(line.id, { description: e.target.value })}
              rows={
                line.description ? Math.min(6, line.description.split("\n").length) : 1
              }
              placeholder="Enter a description"
              className="mt-0.5 w-full resize-none border-0 bg-transparent p-0 text-[13px] italic leading-snug text-muted-foreground outline-none placeholder:italic placeholder:text-muted-foreground/70 focus:text-foreground"
              autoFocus
            />
          ) : null}
        </div>
      );
    }

    case "leadTime":
      return readOnly ? (
        <span className="tabular-nums">{line.leadTime || "—"}</span>
      ) : (
        <input
          value={line.leadTime}
          onChange={(e) => ctx.onPatchLine(line.id, { leadTime: e.target.value })}
          placeholder="0"
          className={cn(cellInput, "text-right tabular-nums")}
        />
      );

    case "quantity":
      return readOnly ? (
        <span className="tabular-nums">{line.quantity.toFixed(2)}</span>
      ) : (
        <LineNumericInput
          value={line.quantity}
          min={0}
          steppers
          step={1}
          onChange={(quantity) => ctx.onPatchLine(line.id, { quantity })}
          className={cn(cellInput, "text-right tabular-nums")}
        />
      );

    case "unitPrice":
      return readOnly ? (
        <span className="tabular-nums">{formatNumber(line.unitPrice)}</span>
      ) : (
        <LineNumericInput
          value={line.unitPrice}
          min={0}
          onChange={(unitPrice) => ctx.onPatchLine(line.id, { unitPrice })}
          className={cn(cellInput, "text-right tabular-nums")}
        />
      );

    case "discount": {
      const discountType = line.discountType ?? "fixed";
      if (readOnly) {
        return (
          <span className="tabular-nums">
            {discountType === "percent"
              ? `${line.discount || 0}%`
              : formatCurrency(line.discount || 0)}
          </span>
        );
      }
      return (
        <div className="flex h-8 min-w-0 items-center border-b border-border/50 focus-within:border-[#00a09d]">
          <LineNumericInput
            value={line.discount || 0}
            min={0}
            onChange={(discount) =>
              ctx.onPatchLine(line.id, {
                discount:
                  discountType === "percent" ? Math.min(100, discount) : Math.max(0, discount),
              })
            }
            className="h-8 min-w-0 flex-1 border-0 bg-transparent text-right text-[13px] outline-none"
          />
          <span
            className="inline-flex h-5 shrink-0 border border-border"
            role="group"
            aria-label="Discount type"
          >
            <button
              type="button"
              className={cn(
                "inline-flex h-full w-5 items-center justify-center rounded-none text-[10px] font-medium",
                discountType === "fixed"
                  ? "bg-[#00a09d] text-white"
                  : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              title="Fixed amount (৳)"
              aria-label="Fixed amount"
              aria-pressed={discountType === "fixed"}
              onClick={() => ctx.onPatchLine(line.id, { discountType: "fixed" })}
            >
              <span className="leading-none">৳</span>
            </button>
            <button
              type="button"
              className={cn(
                "inline-flex h-full w-5 items-center justify-center rounded-none border-l border-border",
                discountType === "percent"
                  ? "bg-[#00a09d] text-white"
                  : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              title="Percent (%)"
              aria-label="Percent"
              aria-pressed={discountType === "percent"}
              onClick={() => ctx.onPatchLine(line.id, { discountType: "percent" })}
            >
              <Percent className="h-2.5 w-2.5" strokeWidth={2.25} />
            </button>
          </span>
        </div>
      );
    }

    case "taxes":
      return readOnly ? (
        <span className="tabular-nums">{formatNumber(line.tax)}</span>
      ) : (
        <LineNumericInput
          value={line.tax}
          min={0}
          onChange={(tax) => ctx.onPatchLine(line.id, { tax })}
          className={cn(cellInput, "text-right tabular-nums")}
        />
      );

    case "taxIncl":
      return formatCurrency(taxIncl);

    case "amount":
      return formatCurrency(amount);

    default:
      return null;
  }
}

/** The row's fixed right-hand cell: the delete button, always in the same place (see LINE_TABLE_ACTION_COL_CLASS). */
export function LineActionCell({
  readOnly,
  onRemove,
  compact,
}: {
  readOnly?: boolean;
  onRemove: () => void;
  compact?: boolean;
}) {
  return (
    <td className={LINE_TABLE_ACTION_COL_CLASS}>
      {readOnly ? null : (
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded-none text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
          onClick={onRemove}
          aria-label="Delete line"
          title="Delete line"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </td>
  );
}

export function LineDeleteOverlay({
  readOnly,
  onRemove,
  compact,
}: {
  readOnly?: boolean;
  onRemove: () => void;
  compact?: boolean;
}) {
  if (readOnly) return null;
  return (
    <button
      type="button"
      className={cn(
        "absolute right-0 top-1/2 z-10 inline-flex -translate-y-1/2 rounded-sm bg-white/95 px-0.5 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-destructive group-hover:opacity-100 dark:bg-muted/50",
      )}
      onClick={onRemove}
      aria-label="Delete line"
    >
      <Trash2 className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
    </button>
  );
}
