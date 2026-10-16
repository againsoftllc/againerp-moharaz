"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, Image, ListTree, Plus, RefreshCw, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  buildVariantLabel,
  cartesianProduct,
  getPresetDimensions,
  groupMatrixRows,
  inheritedRowImage,
  mergeGeneratedRows,
  type VariantDimension,
  type VariantMatrixRow,
} from "@/lib/mock-data/variants";
import type { MediaLibraryItem } from "@/lib/mock-data/media-library";
import { marginFromSelling, sellingFromMargin } from "@/lib/pricing/margin";
import { cn, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  productType: "simple" | "variable" | "digital";
  onProductTypeChange: (type: "simple" | "variable" | "digital") => void;
  baseSku: string;
  basePrice: string;
  basePurchasePrice?: string;
  category?: string;
  rows?: VariantMatrixRow[];
  onRowsChange?: (rows: VariantMatrixRow[]) => void;
  dimensions?: VariantDimension[];
  onDimensionsChange?: (dimensions: VariantDimension[]) => void;
  galleryMedia?: MediaLibraryItem[];
};

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
      {hint ? <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function VariantImagePicker({
  value,
  inheritedId,
  onChange,
  gallery,
  size = "md",
}: {
  value?: string;
  /** Fallback preview shown (dashed ring) when no explicit value is set — e.g. the Color swatch image. */
  inheritedId?: string;
  onChange: (id: string | undefined, url: string | undefined) => void;
  gallery: MediaLibraryItem[];
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const isInherited = !value && !!inheritedId;
  const selected = gallery.find((m) => m.id === (value ?? inheritedId));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        popoverRef.current && !popoverRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (gallery.length === 0) return null;

  const handleOpen = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      if (r.width === 0) return; // button is hidden (e.g. inside md:hidden mobile card)
      setRect({ top: r.bottom + 6, left: r.left });
    }
    setOpen((v) => !v);
  };

  const boxSize = size === "sm" ? "h-6 w-6" : "h-8 w-8";

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className={cn(
          "flex items-center justify-center overflow-hidden rounded-none border bg-muted hover:border-primary/60",
          boxSize,
          isInherited ? "border-dashed border-muted-foreground/50" : "border-input",
        )}
        title={isInherited ? "Inherited image — click to override" : "Pick variant image"}
      >
        {selected ? (
          <img
            src={selected.url}
            alt={selected.name}
            className={cn("h-full w-full object-cover", isInherited && "opacity-70")}
          />
        ) : (
          <Image className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {value && (
        <button
          type="button"
          onClick={() => onChange(undefined, undefined)}
          className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-none bg-destructive text-white"
          title="Clear (use inherited image)"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
      {open && rect && (
        <div
          ref={popoverRef}
          style={{ position: "fixed", top: rect.top, left: rect.left, zIndex: 9999, maxWidth: 224, display: "flex", flexWrap: "wrap", gap: 6, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", padding: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.25)" }}
        >
          {gallery.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { onChange(item.id, item.url); setOpen(false); }}
              className={`h-12 w-12 shrink-0 overflow-hidden rounded-none border-2 transition ${value === item.id ? "border-primary" : "border-transparent hover:border-muted-foreground/40"}`}
              title={item.name}
            >
              <img src={item.url} alt={item.name} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Small chip-list editor used both for top-level values and for a value's nested sub-values. */
function ChipListInput({
  values,
  onAdd,
  onRemove,
  placeholder,
  renderChip,
}: {
  values: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  placeholder: string;
  renderChip?: (value: string) => React.ReactNode;
}) {
  const [draft, setDraft] = useState("");

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setDraft("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {values.map((v) => (
        <div
          key={v}
          className="inline-flex items-center gap-1 rounded-none border border-input bg-muted/30 px-1.5 py-1 text-xs"
        >
          {renderChip ? renderChip(v) : null}
          <span>{v}</span>
          <button
            type="button"
            onClick={() => onRemove(v)}
            className="text-muted-foreground hover:text-destructive"
            aria-label={`Remove ${v}`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        onBlur={submit}
        placeholder={placeholder}
        className="h-7 w-28 rounded-none border border-dashed border-input bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground focus:border-primary/60"
      />
    </div>
  );
}

/**
 * Chip-based value editor for one attribute (e.g. Color: Black, White, Red …).
 * Each chip carries an optional image, and can be expanded to define its own
 * nested sub-values (e.g. the sizes Red actually comes in) — a parent/child
 * tree rather than a second flat, globally-shared dimension.
 */
function AttributeValuesEditor({
  dimension,
  gallery,
  onAddValue,
  onRemoveValue,
  onSetValueImage,
  onAddSubValue,
  onRemoveSubValue,
  onSetSubName,
}: {
  dimension: VariantDimension;
  gallery: MediaLibraryItem[];
  onAddValue: (value: string) => void;
  onRemoveValue: (value: string) => void;
  onSetValueImage: (value: string, imageId: string | undefined, imageUrl: string | undefined) => void;
  onAddSubValue: (value: string, subValue: string) => void;
  onRemoveSubValue: (value: string, subValue: string) => void;
  onSetSubName: (name: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAddValue(trimmed);
    setDraft("");
  };

  const subLabel = dimension.subName?.trim() || "sub-values";

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {dimension.values.map((v) => {
          const subCount = v.subValues?.length ?? 0;
          const isExpanded = expanded === v.value;
          return (
            <div
              key={v.value}
              className={cn(
                "inline-flex items-center gap-1 rounded-none border bg-muted/30 px-1.5 py-1 text-xs",
                isExpanded ? "border-primary/60" : "border-input",
              )}
            >
              <VariantImagePicker
                value={v.imageId}
                gallery={gallery}
                size="sm"
                onChange={(id, url) => onSetValueImage(v.value, id, url)}
              />
              <span>{v.value}</span>
              {subCount > 0 && (
                <span className="rounded-none bg-primary/10 px-1 text-[10px] text-primary">{subCount}</span>
              )}
              <button
                type="button"
                onClick={() => {
                  setExpanded((cur) => (cur === v.value ? null : v.value));
                  if (!dimension.subName?.trim()) onSetSubName("Size");
                }}
                className={cn("text-muted-foreground hover:text-primary", isExpanded && "text-primary")}
                title={`Add ${subLabel} for ${v.value} (e.g. sizes only this value comes in)`}
                aria-label={`Add sub-values for ${v.value}`}
              >
                <ListTree className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => onRemoveValue(v.value)}
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${v.value}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          onBlur={submit}
          placeholder="+ Add value"
          className="h-7 w-28 rounded-none border border-dashed border-input bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground focus:border-primary/60"
        />
      </div>

      {expanded && (
        <div className="ml-3 flex flex-wrap items-center gap-2 border-l-2 border-primary/30 py-1 pl-3">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <input
              value={dimension.subName ?? ""}
              onChange={(e) => onSetSubName(e.target.value)}
              placeholder="Size"
              className="h-5 w-14 rounded-none border border-transparent bg-transparent px-1 text-[11px] font-medium text-foreground outline-none hover:border-input focus:border-primary/60"
            />
            for <strong className="text-foreground">{expanded}</strong>:
          </span>
          <ChipListInput
            values={dimension.values.find((v) => v.value === expanded)?.subValues ?? []}
            onAdd={(sv) => onAddSubValue(expanded, sv)}
            onRemove={(sv) => onRemoveSubValue(expanded, sv)}
            placeholder={`+ Add ${subLabel.toLowerCase()}`}
          />
        </div>
      )}
    </div>
  );
}

export function ProductVariantEditor({
  productType,
  onProductTypeChange,
  baseSku,
  basePrice,
  basePurchasePrice = "",
  category,
  rows: controlledRows,
  onRowsChange,
  dimensions: controlledDimensions,
  onDimensionsChange,
  galleryMedia = [],
}: Props) {
  const [internalDimensions, setInternalDimensions] = useState<VariantDimension[]>(() =>
    controlledDimensions ?? getPresetDimensions(category),
  );
  const [internalRows, setInternalRows] = useState<VariantMatrixRow[]>([]);
  const rows = controlledRows ?? internalRows;
  const dimensions = controlledDimensions ?? internalDimensions;
  const [bulkPrice, setBulkPrice] = useState(basePrice || "");
  const [bulkPurchasePrice, setBulkPurchasePrice] = useState(basePurchasePrice || "");
  const [bulkTouched, setBulkTouched] = useState(false);

  const setRows = useCallback(
    (updater: VariantMatrixRow[] | ((prev: VariantMatrixRow[]) => VariantMatrixRow[])) => {
      const next = typeof updater === "function" ? updater(rows) : updater;
      if (onRowsChange) onRowsChange(next);
      else setInternalRows(next);
    },
    [onRowsChange, rows],
  );

  const setDimensions = useCallback(
    (updater: VariantDimension[] | ((prev: VariantDimension[]) => VariantDimension[])) => {
      const next = typeof updater === "function" ? updater(dimensions) : updater;
      if (onDimensionsChange) onDimensionsChange(next);
      else setInternalDimensions(next);
    },
    [onDimensionsChange, dimensions],
  );

  const basePriceNum = Number(basePrice) || 0;
  const basePurchasePriceNum = Number(basePurchasePrice) || 0;

  useEffect(() => {
    if (bulkTouched) return;
    setBulkPrice(basePrice || "");
    setBulkPurchasePrice(basePurchasePrice || "");
  }, [basePrice, basePurchasePrice, bulkTouched]);

  useEffect(() => {
    if (productType === "variable" && dimensions.length === 0 && rows.length === 0) {
      setDimensions(getPresetDimensions(category));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once when both are empty
  }, [category, productType]);

  const dimensionSummary = useMemo(() => {
    const active = dimensions.filter((d) => d.name.trim() && d.values.length > 0);
    if (active.length === 0) return "Add at least one attribute with values.";
    return active
      .map((d) => {
        const parts = d.values.map((v) => {
          const subs = d.subName?.trim() ? (v.subValues ?? []).filter((s) => s.trim()) : [];
          return subs.length > 0 ? `${v.value} (${d.subName}: ${subs.join(", ")})` : v.value;
        });
        return `${d.name}: ${parts.join(", ")}`;
      })
      .join(" · ");
  }, [dimensions]);

  const pendingComboCount = useMemo(() => cartesianProduct(dimensions).length, [dimensions]);

  const updateDimensionName = (id: string, name: string) => {
    const oldName = dimensions.find((d) => d.id === id)?.name?.trim();
    const newName = name.trim();
    setDimensions((prev) => prev.map((d) => (d.id === id ? { ...d, name } : d)));
    // Renaming an attribute (e.g. "Color" -> "Colour") would otherwise orphan
    // already-generated rows on the next "Update variants" — their
    // dimensions are still keyed by the old name, so mergeGeneratedRows
    // treats them as removed and creates fresh (price/stock-reset) rows in
    // their place. Remap existing rows' dimension keys in lockstep instead.
    if (oldName && newName && oldName !== newName) {
      setRows((prev) =>
        prev.map((r) => {
          if (!(oldName in r.dimensions)) return r;
          const { [oldName]: value, ...rest } = r.dimensions;
          const nextDimensions = { ...rest, [newName]: value };
          return { ...r, dimensions: nextDimensions, label: buildVariantLabel(nextDimensions) };
        }),
      );
    }
  };

  const addDimension = () => {
    setDimensions((prev) => [
      ...prev,
      { id: `dim_${Date.now()}`, name: "", values: [] },
    ]);
  };

  const removeDimension = (id: string) => {
    setDimensions((prev) => prev.filter((d) => d.id !== id));
  };

  const addValue = (dimId: string, value: string) => {
    setDimensions((prev) =>
      prev.map((d) => {
        if (d.id !== dimId) return d;
        if (d.values.some((v) => v.value.toLowerCase() === value.toLowerCase())) return d;
        return { ...d, values: [...d.values, { value }] };
      }),
    );
  };

  const removeValue = (dimId: string, value: string) => {
    setDimensions((prev) =>
      prev.map((d) => (d.id === dimId ? { ...d, values: d.values.filter((v) => v.value !== value) } : d)),
    );
  };

  const setValueImage = (
    dimId: string,
    value: string,
    imageId: string | undefined,
    imageUrl: string | undefined,
  ) => {
    setDimensions((prev) =>
      prev.map((d) =>
        d.id === dimId
          ? { ...d, values: d.values.map((v) => (v.value === value ? { ...v, imageId, imageUrl } : v)) }
          : d,
      ),
    );
  };

  const setDimensionSubName = (dimId: string, subName: string) => {
    setDimensions((prev) => prev.map((d) => (d.id === dimId ? { ...d, subName } : d)));
  };

  const addSubValue = (dimId: string, value: string, subValue: string) => {
    setDimensions((prev) =>
      prev.map((d) => {
        if (d.id !== dimId) return d;
        return {
          ...d,
          values: d.values.map((v) => {
            if (v.value !== value) return v;
            const existing = v.subValues ?? [];
            if (existing.some((s) => s.toLowerCase() === subValue.toLowerCase())) return v;
            return { ...v, subValues: [...existing, subValue] };
          }),
        };
      }),
    );
  };

  const removeSubValue = (dimId: string, value: string, subValue: string) => {
    setDimensions((prev) =>
      prev.map((d) => {
        if (d.id !== dimId) return d;
        return {
          ...d,
          values: d.values.map((v) =>
            v.value === value ? { ...v, subValues: (v.subValues ?? []).filter((s) => s !== subValue) } : v,
          ),
        };
      }),
    );
  };

  const generateMatrix = () => {
    const active = dimensions.filter((d) => d.name.trim() && d.values.length > 0);
    if (active.length === 0) {
      toast.error("Add attribute names and values first.");
      return;
    }
    const { rows: next, added, removed, kept } = mergeGeneratedRows(
      rows,
      active,
      baseSku,
      basePriceNum,
      basePurchasePriceNum,
    );
    setRows(next);
    if (kept === 0 && removed === 0) {
      toast.success(`Generated ${next.length} variant${next.length === 1 ? "" : "s"}`);
    } else {
      const parts = [
        added > 0 ? `${added} new` : null,
        removed > 0 ? `${removed} removed` : null,
        `${kept} kept`,
      ].filter(Boolean);
      toast.success(`Updated variants — ${parts.join(", ")}`);
    }
  };

  const updateRow = (id: string, patch: Partial<VariantMatrixRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const setDefaultRow = (id: string) => {
    setRows((prev) => prev.map((r) => ({ ...r, isDefault: r.id === id })));
  };

  const toggleRowEnabled = (id: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: r.status === "draft" ? "published" : "draft" } : r)),
    );
  };

  const applyBulkPricing = () => {
    const priceValue = Number(bulkPrice);
    const purchasePriceValue = Number(bulkPurchasePrice);
    const hasPrice = bulkPrice.trim() && !Number.isNaN(priceValue);
    const hasPurchasePrice = bulkPurchasePrice.trim() && !Number.isNaN(purchasePriceValue);
    if (!hasPrice && !hasPurchasePrice) {
      toast.error("Enter a valid price first");
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.status === "draft"
          ? r
          : {
              ...r,
              ...(hasPurchasePrice ? { purchasePrice: purchasePriceValue } : null),
              ...(hasPrice ? { price: priceValue } : null),
            },
      ),
    );
    toast.success("Applied to all enabled variants");
  };

  const rowInheritedImage = (row: VariantMatrixRow) => inheritedRowImage(dimensions, row.dimensions);

  /** For a grouped (tree) row, show only the child-specific part of the label, e.g. "20" instead of "Red / 20". */
  const childLabel = (row: VariantMatrixRow) => {
    const parentNames = new Set(dimensions.map((d) => d.name));
    const extra = Object.entries(row.dimensions).filter(([k]) => !parentNames.has(k));
    return extra.length ? extra.map(([, v]) => v).join(" / ") : row.label;
  };

  const rowGroups = useMemo(() => groupMatrixRows(dimensions, rows), [dimensions, rows]);

  if (productType === "simple") return null;

  return (
    <div className="space-y-4">
      {productType === "digital" ? (
        <div className="rounded-none border border-dashed border-input bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
          Digital product — no physical inventory. Upload downloadable files in the <strong className="text-foreground">Digital Files</strong> tab. Price is set in Pricing section.
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Variant attributes</p>
              <Button type="button" variant="outline" size="sm" className="rounded-none" onClick={addDimension}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add attribute
              </Button>
            </div>

            {dimensions.map((dim, idx) => (
              <div key={dim.id} className="space-y-2 rounded-none border border-input p-3">
                <div className="flex items-end gap-2">
                  <Field label={idx === 0 ? "Attribute (drives image swatch)" : "Attribute"}>
                    <Input
                      value={dim.name}
                      onChange={(e) => updateDimensionName(dim.id, e.target.value)}
                      placeholder="e.g. Color"
                      className="h-8 w-40 rounded-none"
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 rounded-none text-muted-foreground hover:text-destructive"
                    onClick={() => removeDimension(dim.id)}
                    aria-label={`Remove ${dim.name || "attribute"}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <AttributeValuesEditor
                  dimension={dim}
                  gallery={galleryMedia}
                  onAddValue={(value) => addValue(dim.id, value)}
                  onRemoveValue={(value) => removeValue(dim.id, value)}
                  onSetValueImage={(value, imageId, imageUrl) => setValueImage(dim.id, value, imageId, imageUrl)}
                  onAddSubValue={(value, subValue) => addSubValue(dim.id, value, subValue)}
                  onRemoveSubValue={(value, subValue) => removeSubValue(dim.id, value, subValue)}
                  onSetSubName={(name) => setDimensionSubName(dim.id, name)}
                />
              </div>
            ))}

            <p className="text-xs text-muted-foreground">{dimensionSummary}</p>

            <Button type="button" size="sm" className="rounded-none" onClick={generateMatrix}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              {rows.length > 0 ? "Update variants" : "Generate variants"}
              {pendingComboCount > 0 ? ` (${pendingComboCount})` : ""}
            </Button>
          </div>

          {rows.length > 0 && (
            <>
              <div className="flex flex-wrap items-end gap-2 rounded-none border border-input bg-muted/20 p-2">
                <Field label="Purchase price for all">
                  <Input
                    type="number"
                    value={bulkPurchasePrice}
                    onChange={(e) => {
                      setBulkTouched(true);
                      setBulkPurchasePrice(e.target.value);
                    }}
                    placeholder={String(basePurchasePriceNum || 0)}
                    className="h-7 w-24 rounded-none"
                  />
                </Field>
                <Field label="Sales price for all">
                  <Input
                    type="number"
                    value={bulkPrice}
                    onChange={(e) => {
                      setBulkTouched(true);
                      setBulkPrice(e.target.value);
                    }}
                    placeholder={String(basePriceNum || 0)}
                    className="h-7 w-24 rounded-none"
                  />
                </Field>
                <Button type="button" size="sm" variant="outline" className="h-7 rounded-none px-2" onClick={applyBulkPricing}>
                  Apply
                </Button>
                <p className="pb-1.5 text-[10px] text-muted-foreground">Applies to enabled variants only</p>
              </div>

              <div className="space-y-3 md:hidden">
                {rowGroups.map((group) => {
                  const isTree = group.rows.length > 1;
                  return (
                    <div key={group.key} className="space-y-2">
                      {isTree && (
                        <div className="flex items-center gap-2 bg-muted/40 px-2 py-1.5">
                          {group.imageUrl ? (
                            <img src={group.imageUrl} alt={group.label} className="h-6 w-6 shrink-0 object-cover" />
                          ) : null}
                          <p className="text-sm font-medium">{group.label}</p>
                          <span className="text-[10px] text-muted-foreground">({group.rows.length})</span>
                        </div>
                      )}
                      {group.rows.map((row) => {
                        const inherited = rowInheritedImage(row);
                        const enabled = row.status !== "draft";
                        return (
                          <div
                            key={row.id}
                            className={cn(
                              "rounded-none border border-input p-3",
                              isTree && "ml-3 border-l-2 border-l-primary/30",
                              !enabled && "opacity-50",
                            )}
                          >
                            <div className="mb-2 flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <VariantImagePicker
                                  value={row.imageId}
                                  inheritedId={inherited?.imageId}
                                  gallery={galleryMedia}
                                  onChange={(id, url) => updateRow(row.id, { imageId: id, imageUrl: url })}
                                />
                                <p className="text-sm font-medium">{isTree ? childLabel(row) : row.label}</p>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2"
                                  onClick={() => toggleRowEnabled(row.id)}
                                  title={enabled ? "Disable this combination" : "Enable this combination"}
                                >
                                  {enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={row.isDefault ? "default" : "outline"}
                                  className="h-7 px-2"
                                  onClick={() => setDefaultRow(row.id)}
                                >
                                  <Star className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <div className="grid gap-2">
                              <Field label="SKU">
                                <Input
                                  className="h-8 font-mono text-xs"
                                  value={row.sku}
                                  onChange={(e) => updateRow(row.id, { sku: e.target.value })}
                                />
                              </Field>
                              <div className="grid grid-cols-3 gap-2">
                                <Field label="Purchase price">
                                  <Input
                                    className="h-8"
                                    type="number"
                                    value={row.purchasePrice}
                                    onChange={(e) =>
                                      updateRow(row.id, { purchasePrice: Number(e.target.value) || 0 })
                                    }
                                  />
                                </Field>
                                <Field label="Margin (%)">
                                  <Input
                                    className="h-8"
                                    type="number"
                                    value={row.purchasePrice ? marginFromSelling(row.purchasePrice, row.price) : ""}
                                    disabled={!row.purchasePrice}
                                    placeholder={row.purchasePrice ? "0" : "Set cost first"}
                                    onChange={(e) => {
                                      if (!row.purchasePrice) return;
                                      const marginPct = Number(e.target.value) || 0;
                                      updateRow(row.id, { price: sellingFromMargin(row.purchasePrice, marginPct) });
                                    }}
                                  />
                                </Field>
                                <Field label="Sales price">
                                  <Input
                                    className="h-8"
                                    type="number"
                                    value={row.price}
                                    onChange={(e) => updateRow(row.id, { price: Number(e.target.value) || 0 })}
                                  />
                                </Field>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              <div className="hidden overflow-x-auto rounded-none border border-input md:block">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      {galleryMedia.length > 0 && <th className="w-10 px-3 py-2">Img</th>}
                      <th className="px-3 py-2">Variant</th>
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2">Purchase price</th>
                      <th className="px-3 py-2">Margin (%)</th>
                      <th className="px-3 py-2">Sales Price</th>
                      <th className="w-16 px-3 py-2">Enabled</th>
                      <th className="w-16 px-3 py-2">Default</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowGroups.map((group) => {
                      const isTree = group.rows.length > 1;
                      return (
                        <Fragment key={group.key}>
                          {isTree && (
                            <tr className="border-t border-input bg-muted/40">
                              <td
                                colSpan={galleryMedia.length > 0 ? 8 : 7}
                                className="px-3 py-1.5 text-xs font-medium"
                              >
                                <div className="flex items-center gap-2">
                                  {group.imageUrl ? (
                                    <img src={group.imageUrl} alt={group.label} className="h-5 w-5 shrink-0 object-cover" />
                                  ) : (
                                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                  )}
                                  <span>{group.label}</span>
                                  <span className="text-[10px] font-normal text-muted-foreground">
                                    ({group.rows.length})
                                  </span>
                                </div>
                              </td>
                            </tr>
                          )}
                          {group.rows.map((row) => {
                            const inherited = rowInheritedImage(row);
                            const enabled = row.status !== "draft";
                            return (
                              <tr key={row.id} className={cn("border-t border-input", !enabled && "opacity-50")}>
                                {galleryMedia.length > 0 && (
                                  <td className="px-3 py-2">
                                    <VariantImagePicker
                                      value={row.imageId}
                                      inheritedId={inherited?.imageId}
                                      gallery={galleryMedia}
                                      onChange={(id, url) => updateRow(row.id, { imageId: id, imageUrl: url })}
                                    />
                                  </td>
                                )}
                                <td className="px-3 py-2">
                                  <div className={cn("flex items-center gap-1.5", isTree && "pl-4")}>
                                    {isTree ? (
                                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                    ) : null}
                                    <span>{isTree ? childLabel(row) : row.label}</span>
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    className="h-7 rounded-none font-mono text-xs"
                                    value={row.sku}
                                    onChange={(e) => updateRow(row.id, { sku: e.target.value })}
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    className="h-7 w-24 rounded-none"
                                    type="number"
                                    value={row.purchasePrice}
                                    onChange={(e) =>
                                      updateRow(row.id, { purchasePrice: Number(e.target.value) || 0 })
                                    }
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    className="h-7 w-20 rounded-none"
                                    type="number"
                                    value={row.purchasePrice ? marginFromSelling(row.purchasePrice, row.price) : ""}
                                    disabled={!row.purchasePrice}
                                    placeholder={row.purchasePrice ? "0" : "—"}
                                    onChange={(e) => {
                                      if (!row.purchasePrice) return;
                                      const marginPct = Number(e.target.value) || 0;
                                      updateRow(row.id, { price: sellingFromMargin(row.purchasePrice, marginPct) });
                                    }}
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    className="h-7 w-24 rounded-none"
                                    type="number"
                                    value={row.price}
                                    onChange={(e) => updateRow(row.id, { price: Number(e.target.value) || 0 })}
                                  />
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 rounded-none p-0"
                                    onClick={() => toggleRowEnabled(row.id)}
                                    aria-label={enabled ? `Disable ${row.label}` : `Enable ${row.label}`}
                                    title={enabled ? "Disable this combination" : "Enable this combination"}
                                  >
                                    {enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                                  </Button>
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={row.isDefault ? "default" : "outline"}
                                    className="h-7 w-7 rounded-none p-0"
                                    onClick={() => setDefaultRow(row.id)}
                                    aria-label={`Set ${row.label} as default`}
                                  >
                                    <Star className="h-3.5 w-3.5" />
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-muted-foreground">
                {rows.length} SKU{rows.length === 1 ? "" : "s"} ({rows.filter((r) => r.status !== "draft").length} enabled) · default variant shows first on storefront (
                {formatCurrency(rows.find((r) => r.isDefault)?.price ?? rows[0]?.price ?? 0)})
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
