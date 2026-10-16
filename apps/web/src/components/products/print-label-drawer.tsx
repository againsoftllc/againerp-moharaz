"use client";

import { useEffect, useMemo, useState } from "react";
import JsBarcode from "jsbarcode";
import { X } from "lucide-react";
import { toast } from "sonner";
import {
  AgainDrawerControlBar,
  AgainDrawerLayout,
  AgainDrawerPanel,
  AgainDrawerScrollBody,
  AGAIN_DRAWER_ACTION_BTN,
  AGAIN_DRAWER_FIELD_SHEET_CLASS,
  AGAIN_DRAWER_PRIMARY_BTN,
  AGAIN_DRAWER_PRIMARY_COLOR,
} from "@/components/again/again-drawer";
import { Button } from "@/components/ui/button";
import { ProductSearchAdd } from "@/components/products/product-search-add";
import { fetchWorkspaceCompany } from "@/lib/api/workspace-company";
import { type Product } from "@/lib/mock-data/products";
import { formatCurrency } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Product the drawer was opened from — seeds the first row. */
  initialProduct: Product | null;
  /** Full catalog, already loaded by the grid, reused for the "add more products" search. */
  products: Product[];
};

type LabelRow = {
  product: Product;
  labelCount: number;
  packingDate: string;
};

type SheetPreset = {
  id: string;
  label: string;
  cols: number;
  rows: number;
  labelWidthIn: number;
  labelHeightIn: number;
  pageWidthIn: number;
  pageHeightIn: number;
  marginTopIn: number;
  marginLeftIn: number;
  gapXIn: number;
  gapYIn: number;
};

const SHEET_PRESETS: SheetPreset[] = [
  {
    id: "avery5160",
    label: `30 labels/sheet — 2.625" × 1" (Letter)`,
    cols: 3,
    rows: 10,
    labelWidthIn: 2.625,
    labelHeightIn: 1,
    pageWidthIn: 8.5,
    pageHeightIn: 11,
    marginTopIn: 0.5,
    marginLeftIn: 0.1875,
    gapXIn: 0.125,
    gapYIn: 0,
  },
  {
    id: "avery5163",
    label: `20 labels/sheet — 4" × 2" (Letter)`,
    cols: 2,
    rows: 10,
    labelWidthIn: 4,
    labelHeightIn: 2,
    pageWidthIn: 8.5,
    pageHeightIn: 11,
    marginTopIn: 0.5,
    marginLeftIn: 0.15625,
    gapXIn: 0.1875,
    gapYIn: 0,
  },
  {
    id: "avery5167",
    label: `80 labels/sheet — 1.75" × 0.5" (Letter)`,
    cols: 4,
    rows: 20,
    labelWidthIn: 1.75,
    labelHeightIn: 0.5,
    pageWidthIn: 8.5,
    pageHeightIn: 11,
    marginTopIn: 0.5,
    marginLeftIn: 0.3,
    gapXIn: 0.3,
    gapYIn: 0,
  },
  {
    id: "roll2x1",
    label: `Thermal roll — 2" × 1" (one per label)`,
    cols: 1,
    rows: 1,
    labelWidthIn: 2,
    labelHeightIn: 1,
    pageWidthIn: 2.125,
    pageHeightIn: 1.125,
    marginTopIn: 0.0625,
    marginLeftIn: 0.0625,
    gapXIn: 0,
    gapYIn: 0.0625,
  },
];

const BARCODE_FORMAT: Record<string, string> = {
  C128: "CODE128",
  EAN13: "EAN13",
  EAN8: "EAN8",
  UPCA: "UPC",
  UPCE: "UPCE",
};

/** Bars only — no embedded jsbarcode text label. That text sizes itself to
 * the barcode's own (value-length-dependent) intrinsic width, so stretching
 * the whole SVG to fill the label with CSS `width:100%` blew the text up
 * out of proportion and let it collide with the line below on short values
 * (e.g. "wavet1"). The human-readable value is rendered as its own fixed-size
 * HTML text under the bars instead, and the bars keep a constant height. */
function renderBarcodeSvg(value: string, barcodeType: string | undefined): string {
  const format = BARCODE_FORMAT[barcodeType ?? "C128"] ?? "CODE128";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const opts = { format, displayValue: false, margin: 0, height: 40 };
  try {
    JsBarcode(svg, value, opts);
    return svg.outerHTML;
  } catch {
    try {
      JsBarcode(svg, value, { ...opts, format: "CODE128" });
      return svg.outerHTML;
    } catch {
      return "";
    }
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function rowKey(product: Product): string {
  return product.itemId ?? product.id;
}

function LabelToggleRow({
  label,
  checked,
  onCheckedChange,
  size,
  onSizeChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  size: number;
  onSizeChange: (size: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="flex items-center gap-2 text-[13px] text-foreground">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
        />
        {label}
      </label>
      {checked ? (
        <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          Size
          <input
            type="number"
            min={8}
            max={48}
            value={size}
            onChange={(e) => onSizeChange(Math.max(8, Number(e.target.value) || size))}
            className="h-7 w-14 rounded-none border border-input bg-background px-1.5 text-[12px] text-foreground"
          />
        </label>
      ) : null}
    </div>
  );
}

export function PrintLabelDrawer({ open, onOpenChange, initialProduct, products }: Props) {
  const [rows, setRows] = useState<LabelRow[]>([]);
  const [showName, setShowName] = useState(true);
  const [nameSize, setNameSize] = useState(15);
  const [showVariation, setShowVariation] = useState(false);
  const [variationSize, setVariationSize] = useState(13);
  const [showPrice, setShowPrice] = useState(true);
  const [priceSize, setPriceSize] = useState(17);
  const [showBusinessName, setShowBusinessName] = useState(true);
  const [businessNameSize, setBusinessNameSize] = useState(20);
  const [showPackingDate, setShowPackingDate] = useState(false);
  const [packingDateSize, setPackingDateSize] = useState(12);
  const [priceMode, setPriceMode] = useState<"inc" | "exc">("inc");
  const [presetId, setPresetId] = useState(SHEET_PRESETS[0].id);
  const [businessName, setBusinessName] = useState("");
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setRows(initialProduct ? [{ product: initialProduct, labelCount: 1, packingDate: "" }] : []);
    void fetchWorkspaceCompany()
      .then((c) => setBusinessName(c.legal_name || c.name || ""))
      .catch(() => setBusinessName(""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialProduct?.id]);

  const preset = useMemo(
    () => SHEET_PRESETS.find((p) => p.id === presetId) ?? SHEET_PRESETS[0],
    [presetId],
  );

  function addRow(product: Product) {
    setRows((prev) => {
      const key = rowKey(product);
      const existing = prev.find((r) => rowKey(r.product) === key);
      if (existing) {
        return prev.map((r) =>
          rowKey(r.product) === key ? { ...r, labelCount: r.labelCount + 1 } : r,
        );
      }
      return [...prev, { product, labelCount: 1, packingDate: "" }];
    });
  }

  function removeRow(product: Product) {
    const key = rowKey(product);
    setRows((prev) => prev.filter((r) => rowKey(r.product) !== key));
  }

  function updateRow(product: Product, patch: Partial<Pick<LabelRow, "labelCount" | "packingDate">>) {
    const key = rowKey(product);
    setRows((prev) => prev.map((r) => (rowKey(r.product) === key ? { ...r, ...patch } : r)));
  }

  function unitPriceFor(product: Product): number {
    const base = Number(product.price ?? 0);
    if (priceMode === "inc" && product.taxRate) {
      return base * (1 + Number(product.taxRate) / 100);
    }
    return base;
  }

  function buildLabelHtml(): string {
    if (rows.length === 0) return "";
    const perSheet = Math.max(1, preset.cols * preset.rows);

    const labelCells = rows.flatMap((row) => {
      const count = Math.max(1, Math.floor(row.labelCount) || 1);
      const barcodeValue = (row.product.barcode?.trim() || row.product.sku || row.product.id).toString();
      const barcodeSvg = renderBarcodeSvg(barcodeValue, row.product.barcodeType);
      const priceLabel = `${formatCurrency(unitPriceFor(row.product))}${priceMode === "inc" ? " (Inc. tax)" : " (Exc. tax)"}`;
      const cell = `
      <div class="label">
        ${showBusinessName && businessName ? `<div class="biz" style="font-size:${businessNameSize}px">${escapeHtml(businessName)}</div>` : ""}
        ${showName ? `<div class="name" style="font-size:${nameSize}px">${escapeHtml(row.product.name)}</div>` : ""}
        ${showVariation && row.product.model ? `<div class="variation" style="font-size:${variationSize}px">${escapeHtml(row.product.model)}</div>` : ""}
        <div class="barcode">${barcodeSvg}</div>
        <div class="barcode-value">${escapeHtml(barcodeValue)}</div>
        ${showPrice ? `<div class="price" style="font-size:${priceSize}px">${escapeHtml(priceLabel)}</div>` : ""}
        ${showPackingDate && row.packingDate ? `<div class="packing" style="font-size:${packingDateSize}px">Packed: ${escapeHtml(row.packingDate)}</div>` : ""}
      </div>`;
      return Array.from({ length: count }, () => cell);
    });

    const sharedStyle = `
      * { box-sizing: border-box; }
      body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; color: #111; }
      .toolbar {
        position: sticky; top: 0; z-index: 10; display: flex; justify-content: flex-end;
        gap: 8px; padding: 10px 16px; background: #f3f4f6; border-bottom: 1px solid #d1d5db;
      }
      .toolbar button {
        font: inherit; font-size: 13px; font-weight: 600; padding: 6px 14px; border-radius: 4px;
        border: 1px solid #111; background: #111; color: #fff; cursor: pointer;
      }
      .label {
        width: ${preset.labelWidthIn}in; height: ${preset.labelHeightIn}in;
        padding: 4px; display: flex; flex-direction: column; align-items: center; justify-content: center;
        text-align: center; overflow: hidden;
      }
      .label > div { line-height: 1.2; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .biz { font-weight: 700; }
      .name { font-weight: 600; }
      .barcode { width: 100%; display: flex; justify-content: center; }
      .barcode svg { display: block; height: ${Math.max(20, Math.min(40, Math.round(preset.labelHeightIn * 34)))}px; width: auto; max-width: 100%; }
      .barcode-value { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 9px; letter-spacing: 0.5px; }
      .price { font-weight: 700; }
      @media print {
        .toolbar { display: none !important; }
      }
    `;
    const toolbar = `<div class="toolbar"><button type="button" onclick="window.print()">Print</button></div>`;

    if (preset.id.startsWith("roll")) {
      return `<!doctype html><html><head><meta charset="utf-8"><title>Print Labels</title><style>
        @page { size: ${preset.pageWidthIn}in ${preset.pageHeightIn}in; margin: 0; }
        ${sharedStyle}
        .label { margin: ${preset.gapYIn}in ${preset.marginLeftIn}in; page-break-after: always; }
      </style></head><body>${toolbar}${labelCells.join("")}</body></html>`;
    }

    const sheets = chunk(labelCells, perSheet)
      .map((sheetLabels) => `<div class="sheet">${sheetLabels.join("")}</div>`)
      .join("");
    return `<!doctype html><html><head><meta charset="utf-8"><title>Print Labels</title><style>
      @page { size: ${preset.pageWidthIn}in ${preset.pageHeightIn}in; margin: 0; }
      ${sharedStyle}
      .sheet {
        width: ${preset.pageWidthIn}in; height: ${preset.pageHeightIn}in;
        padding: ${preset.marginTopIn}in ${preset.marginLeftIn}in;
        display: flex; flex-wrap: wrap; align-content: flex-start;
        page-break-after: always;
      }
      .label { margin: 0 ${preset.gapXIn}in ${preset.gapYIn}in 0; }
    </style></head><body>${toolbar}${sheets}</body></html>`;
  }

  function handlePreview() {
    if (rows.length === 0) {
      toast.error("Add at least one product first");
      return;
    }
    const html = buildLabelHtml();
    if (!html) {
      toast.error("Couldn't build the label preview — try again");
      return;
    }
    // A blob URL navigation (rather than window.open("") + document.write) is
    // treated as an ordinary same-gesture popup by every major browser, so it
    // isn't silently swallowed by popup blockers the way an empty-URL window
    // sometimes is.
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (!win) {
      toast.error("Preview window was blocked — allow pop-ups for this site and try again");
      URL.revokeObjectURL(url);
      return;
    }
    // Opens straight to the preview — printing is a deliberate second step via
    // the Print button inside that page, not triggered automatically here.
    win.focus();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title="Print Labels"
      resizable
      defaultWidth={480}
      minWidth={380}
      widthStorageKey="again-print-label-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar>
          <button
            type="button"
            className={AGAIN_DRAWER_PRIMARY_BTN}
            style={{ backgroundColor: AGAIN_DRAWER_PRIMARY_COLOR }}
            onClick={handlePreview}
          >
            Preview &amp; print
          </button>
          <button
            type="button"
            className={AGAIN_DRAWER_ACTION_BTN}
            onClick={() => onOpenChange(false)}
          >
            Close
          </button>
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-none"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </AgainDrawerControlBar>

        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
          <div className="space-y-4" ref={setPortalHost}>
            <div className="rounded-none border border-border/70 bg-background/70 p-3">
              <p className="mb-2 text-[12px] font-medium text-foreground">Add products to generate labels</p>
              <ProductSearchAdd
                items={products}
                portalHost={portalHost}
                onPick={(item) => addRow(item as Product)}
                onAddNew={() => {}}
              />
              <div className="mt-3 border border-border/60">
                <div className="grid grid-cols-[1fr_84px_128px_26px] gap-2 bg-muted/40 px-2 py-1 text-[11px] font-medium text-muted-foreground">
                  <span>Product</span>
                  <span>Labels</span>
                  <span>Packing date</span>
                  <span />
                </div>
                {rows.length === 0 ? (
                  <p className="px-2 py-3 text-[12px] text-muted-foreground">
                    Search above to add products to this batch.
                  </p>
                ) : (
                  rows.map((row) => (
                    <div
                      key={rowKey(row.product)}
                      className="grid grid-cols-[1fr_84px_128px_26px] items-center gap-2 border-t border-border/50 px-2 py-1.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[12px] text-foreground">{row.product.name}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          SKU {row.product.sku || "—"}
                        </p>
                      </div>
                      <input
                        type="number"
                        min={1}
                        value={row.labelCount}
                        onChange={(e) =>
                          updateRow(row.product, { labelCount: Math.max(1, Number(e.target.value) || 1) })
                        }
                        className="h-7 min-w-0 rounded-none border border-input bg-background px-1.5 text-[12px]"
                      />
                      <input
                        type="date"
                        value={row.packingDate}
                        onChange={(e) => updateRow(row.product, { packingDate: e.target.value })}
                        className="h-7 min-w-0 rounded-none border border-input bg-background px-1.5 text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={() => removeRow(row.product)}
                        aria-label={`Remove ${row.product.name}`}
                        className="inline-flex h-6 w-6 items-center justify-center text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-none border border-border/70 bg-background/70 p-3">
              <p className="mb-2 text-[12px] font-medium text-foreground">Information to show on labels</p>
              <div className="space-y-2">
                <LabelToggleRow
                  label="Product name"
                  checked={showName}
                  onCheckedChange={setShowName}
                  size={nameSize}
                  onSizeChange={setNameSize}
                />
                <LabelToggleRow
                  label="Product variation"
                  checked={showVariation}
                  onCheckedChange={setShowVariation}
                  size={variationSize}
                  onSizeChange={setVariationSize}
                />
                <LabelToggleRow
                  label="Product price"
                  checked={showPrice}
                  onCheckedChange={setShowPrice}
                  size={priceSize}
                  onSizeChange={setPriceSize}
                />
                <LabelToggleRow
                  label="Business name"
                  checked={showBusinessName}
                  onCheckedChange={setShowBusinessName}
                  size={businessNameSize}
                  onSizeChange={setBusinessNameSize}
                />
                <LabelToggleRow
                  label="Packing date"
                  checked={showPackingDate}
                  onCheckedChange={setShowPackingDate}
                  size={packingDateSize}
                  onSizeChange={setPackingDateSize}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-[12px] text-foreground">
                Show price
                <select
                  value={priceMode}
                  onChange={(e) => setPriceMode(e.target.value as "inc" | "exc")}
                  className="h-8 rounded-none border border-input bg-background px-2 text-[13px]"
                >
                  <option value="inc">Inc. tax</option>
                  <option value="exc">Exc. tax</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-foreground">
                Barcode setting
                <select
                  value={presetId}
                  onChange={(e) => setPresetId(e.target.value)}
                  className="h-8 rounded-none border border-input bg-background px-2 text-[13px]"
                >
                  {SHEET_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}
