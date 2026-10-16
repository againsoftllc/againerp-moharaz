"use client";

/* Add / Edit Bundle — a right-hand drawer in the same format as the other admin drawers (title, Save, ✕).
   A bundle is what the website shows on /bundles and the home page (GET /storefront/bundles): a name, a type
   (Gaming / Office / Peripherals / Upgrade …), a tagline, its products and a price — the products' total less a
   discount, or a fixed price. The preview at the top is the website's bundle card. Only published bundles show,
   and only while all their products are on the website. */

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Package, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  BUNDLE_PRICING_LABELS,
  recalcBundle,
  type BundleItem,
  type BundlePricingMode,
  type BundleStatus,
  type ProductBundle,
} from "@/lib/mock-data/bundles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SlugInput } from "@/components/ui/slug-input";
import { ProductCombobox } from "@/components/products/product-combobox";
import { useCatalogProducts } from "@/lib/api/use-catalog-products";
import { validateSlug } from "@/lib/url-slug/validate-slug";
import { cn, formatCurrency } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "create" | "edit";
  bundle?: ProductBundle | null;
  onSave: (data: Partial<ProductBundle>) => void;
};

const STATUSES: BundleStatus[] = ["draft", "published", "archived"];
const PRICING_MODES: BundlePricingMode[] = ["sum_discount", "fixed"];
/** the website's bundle filters */
const TYPES = ["Gaming", "Office", "Peripherals", "Upgrade"];

const slugify = (v: string) =>
  v.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

export function BundleFormDialog({ open, onOpenChange, mode = "create", bundle, onSave }: Props) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [sku, setSku] = useState("");
  const [status, setStatus] = useState<BundleStatus>("draft");
  const [category, setCategory] = useState("Gaming");
  const [description, setDescription] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const [pricingMode, setPricingMode] = useState<BundlePricingMode>("sum_discount");
  const [discountPercent, setDiscountPercent] = useState(10);
  const [bundlePrice, setBundlePrice] = useState(0);
  const [items, setItems] = useState<BundleItem[]>([]);
  const [more, setMore] = useState(false);
  const { products } = useCatalogProducts({ channel: "catalog" });

  // the drawer opens fresh each time (a new bundle, or the one being edited)
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setName(bundle?.name ?? "");
    setSlug(bundle?.slug ?? "");
    setSlugTouched(!!bundle?.slug);
    setSku(bundle?.sku ?? "");
    setStatus(bundle?.status ?? "draft");
    setCategory(bundle?.category && bundle.category !== "General" ? bundle.category : "Gaming");
    setDescription(bundle?.description ?? "");
    setThumbnail(bundle?.thumbnail ?? "");
    setPricingMode(bundle?.pricingMode ?? "sum_discount");
    setDiscountPercent(bundle?.discountPercent ?? 10);
    setBundlePrice(bundle?.bundlePrice ?? 0);
    setItems(bundle?.components ?? []);
    setMore(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, bundle]);

  const totals = useMemo(
    () => recalcBundle({ components: items, pricingMode, discountPercent, bundlePrice }),
    [items, pricingMode, discountPercent, bundlePrice],
  );
  const save = Math.max(0, totals.retailTotal - totals.bundlePrice);
  const pct = totals.retailTotal > 0 ? Math.round((save / totals.retailTotal) * 100) : 0;

  const addProduct = (p: { id: string; name: string; sku: string; price: number; thumbnail?: string }) => {
    if (items.some((i) => i.productId === p.id)) {
      toast.message(`${p.name} is already in the bundle`);
      return;
    }
    setItems((prev) => [
      ...prev,
      { id: p.id, productId: p.id, productName: p.name, sku: p.sku, quantity: 1, unitPrice: p.price, isOptional: false, thumbnail: p.thumbnail || undefined },
    ]);
  };
  const updateItem = (id: string, patch: Partial<BundleItem>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const submit = () => {
    if (name.trim().length < 2) return toast.error("Give the bundle a name");
    if (items.length < 2) return toast.error("Add at least 2 products");
    const finalSlug = slug.trim() || slugify(name);
    const check = validateSlug(finalSlug, bundle?.id ? { id: bundle.id } : undefined);
    if (!check.isValid) return toast.error(check.message ?? "Invalid slug");
    onSave({
      name: name.trim(),
      slug: finalSlug,
      sku: sku.trim() || `BND-${finalSlug.slice(0, 20).toUpperCase()}`,
      status,
      pricingMode,
      bundlePrice: pricingMode === "fixed" ? bundlePrice : totals.bundlePrice,
      discountPercent,
      category: category.trim() || "General",
      description: description.trim() || undefined,
      thumbnail: thumbnail.trim() || undefined,
      components: items,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-xl gap-0 overflow-hidden p-0 sm:max-w-xl [&>button.absolute]:hidden"
        aria-describedby={undefined}
      >
        <div className="flex h-full min-h-0 flex-col">
          {/* ── Header ── */}
          <div className="flex shrink-0 items-center justify-between border-b border-input px-5 py-4">
            <SheetTitle className="truncate text-base font-semibold">
              {mode === "create" ? "Add Bundle" : name || bundle?.name || "Edit Bundle"}
            </SheetTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={submit}>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                Save
              </Button>
              <button type="button" className="rounded-md p-1 hover:bg-accent" onClick={() => onOpenChange(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-5 px-5 py-4">
              {/* ── what the website shows ── */}
              <BundleCardPreview
                name={name}
                items={items}
                total={totals.retailTotal}
                price={totals.bundlePrice}
                save={save}
                pct={pct}
                status={status}
              />

              {/* ── details ── */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="bnd-name">Name</Label>
                  <Input
                    id="bnd-name"
                    value={name}
                    placeholder="e.g. AMD Ryzen 5 Gaming Combo"
                    onChange={(e) => {
                      setName(e.target.value);
                      if (!slugTouched) setSlug(slugify(e.target.value));
                    }}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="bnd-type">Type</Label>
                    <Input id="bnd-type" list="bnd-types" value={category} onChange={(e) => setCategory(e.target.value)} />
                    <datalist id="bnd-types">
                      {TYPES.map((t) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select value={status} onChange={(e) => setStatus(e.target.value as BundleStatus)}>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s === "published" ? "Published (on the website)" : s.charAt(0).toUpperCase() + s.slice(1)}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bnd-desc">Tagline</Label>
                  <Textarea
                    id="bnd-desc"
                    rows={2}
                    value={description}
                    placeholder="One line on what the bundle is for — shown on the bundle page"
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>

              {/* ── products ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Products</Label>
                  <span className="text-[11px] text-muted-foreground">{items.length} added · at least 2</span>
                </div>
                <ProductCombobox
                  products={products}
                  value=""
                  onChange={() => undefined}
                  onPick={(p) => addProduct(p)}
                  placeholder="Search a product to add…"
                />
                {items.length === 0 ? (
                  <p className="border border-dashed border-input px-3 py-4 text-center text-xs text-muted-foreground">
                    No products yet — search above and pick one to add it.
                  </p>
                ) : (
                  <ul className="divide-y divide-input border border-input">
                    {items.map((i) => (
                      <li key={i.id} className="flex items-center gap-2 px-2 py-1.5">
                        {i.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={i.thumbnail} alt="" className="h-9 w-9 shrink-0 border border-input bg-white object-contain" />
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-input bg-muted">
                            <Package className="h-4 w-4 text-muted-foreground" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium" title={i.productName}>{i.productName}</p>
                          <p className="truncate text-[10px] text-muted-foreground">{i.sku}</p>
                        </div>
                        <Input
                          type="number"
                          min={1}
                          max={20}
                          aria-label="Quantity"
                          value={i.quantity}
                          onChange={(e) => updateItem(i.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                          className="h-7 w-14 px-1.5 text-xs"
                        />
                        <span className="w-24 shrink-0 text-right text-xs tabular-nums">{formatCurrency(i.unitPrice * i.quantity)}</span>
                        <button
                          type="button"
                          className="shrink-0 p-1 text-muted-foreground hover:text-destructive"
                          onClick={() => setItems((prev) => prev.filter((x) => x.id !== i.id))}
                          aria-label={`Remove ${i.productName}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] text-muted-foreground">
                  The website prices the bundle from the products&apos; prices on the day, so it follows price changes.
                </p>
              </div>

              {/* ── price ── */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Pricing</Label>
                  <Select value={pricingMode} onChange={(e) => setPricingMode(e.target.value as BundlePricingMode)}>
                    {PRICING_MODES.map((m) => (
                      <option key={m} value={m}>
                        {m === "sum_discount" ? "Products' total − discount %" : BUNDLE_PRICING_LABELS[m]}
                      </option>
                    ))}
                  </Select>
                </div>
                {pricingMode === "fixed" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="bnd-price">Bundle price (৳)</Label>
                    <Input id="bnd-price" type="number" min={0} value={bundlePrice} onChange={(e) => setBundlePrice(Number(e.target.value) || 0)} />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="bnd-pct">Discount (%)</Label>
                    <Input id="bnd-pct" type="number" min={0} max={90} value={discountPercent} onChange={(e) => setDiscountPercent(Number(e.target.value) || 0)} />
                  </div>
                )}
              </div>

              {/* ── more ── */}
              <div>
                <button type="button" onClick={() => setMore((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  {more ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  URL, SKU and image
                </button>
                {more && (
                  <div className="mt-3 space-y-3">
                    <div className="space-y-1.5">
                      <Label>Slug (/bundles/…)</Label>
                      <SlugInput
                        value={slug}
                        onChange={(v) => {
                          setSlug(v);
                          setSlugTouched(true);
                        }}
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="bnd-sku">SKU</Label>
                        <Input id="bnd-sku" value={sku} placeholder="BND-… (automatic)" onChange={(e) => setSku(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="bnd-thumb">Image URL</Label>
                        <Input id="bnd-thumb" value={thumbnail} placeholder="optional" onChange={(e) => setThumbnail(e.target.value)} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── bottom bar ── */}
              <div className="flex justify-end gap-2 border-t border-input pt-3">
                <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={submit}>
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  {mode === "create" ? "Create bundle" : "Save"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** The website's bundle card (home page, /bundles), filled in as the form changes. */
function BundleCardPreview({
  name,
  items,
  total,
  price,
  save,
  pct,
  status,
}: {
  name: string;
  items: BundleItem[];
  total: number;
  price: number;
  save: number;
  pct: number;
  status: BundleStatus;
}) {
  const round = (n: number) => formatCurrency(Math.round(n)).replace(/\.00$/, "");
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Website preview</span>
        <span className={cn(status === "published" ? "text-emerald-600 dark:text-emerald-400" : "")}>
          {status === "published" ? "Shown on the website" : "Not shown until published"}
        </span>
      </div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-zinc-100">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Bundle · {items.length} items</span>
          {save > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400">Save {round(save)}</span>
          )}
        </div>
        <p className="mt-2 truncate text-lg font-bold">{name || "Bundle name"}</p>
        <div className="mt-3 flex items-center gap-1.5">
          {(items.length ? items : [null, null, null]).slice(0, 4).map((i, idx) => (
            <div key={i?.id ?? idx} className="flex items-center gap-1.5">
              {idx > 0 && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">+</span>}
              <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-md bg-white">
                {i?.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.thumbnail} alt="" className="h-full w-full object-contain" />
                ) : (
                  <Package className="h-5 w-5 text-zinc-400" />
                )}
                {idx === items.length - 1 && pct > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 rounded bg-red-600 px-1 text-[9px] font-bold text-white">−{pct}%</span>
                )}
              </div>
            </div>
          ))}
        </div>
        <ul className="mt-3 space-y-1">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-2 text-xs">
              <i className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" />
              <span className="min-w-0 flex-1 truncate text-zinc-300">
                {i.quantity > 1 ? `${i.quantity} × ` : ""}
                {i.productName}
              </span>
              <span className="tabular-nums text-zinc-500">{round(i.unitPrice * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-end gap-2 border-t border-dashed border-zinc-800 pt-3">
          <span className="text-xl font-bold tabular-nums">{round(price)}</span>
          {save > 0 && <span className="pb-0.5 text-xs tabular-nums text-zinc-500 line-through">{round(total)}</span>}
        </div>
      </div>
    </div>
  );
}
