"use client";

import { useGridLayout } from "@/components/shared/use-grid-layout";
import "@/components/providers/ag-grid-provider";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createMarketingHappyHour,
  deleteMarketingHappyHour,
  updateMarketingHappyHour,
  type ApiMarketingHappyHour,
  type HappyHourStatus,
  type HappyHourWriteInput,
} from "@/lib/api/marketing-happy-hours";
import { useMarketingHappyHours } from "@/lib/api/use-marketing-happy-hours";
import { useCatalogCategories } from "@/lib/api/use-catalog-categories";
import { useCatalogProducts } from "@/lib/api/use-catalog-products";
import { CategoryCombobox } from "@/components/categories/category-combobox";
import { ProductCombobox } from "@/components/products/product-combobox";
import { useIsDark } from "@/lib/use-is-dark";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useViewerWriteUrlGuard } from "@/lib/hooks/use-viewer-write-url-guard";
import { useApiHealth } from "@/lib/api/use-api-health";
import { ApiRefreshButton } from "@/components/products/api-refresh-button";
import type { Product } from "@/lib/mock-data/products";
import type { Category } from "@/lib/mock-data/categories";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const PAGE_SIZE = 50;
const CATEGORY_ADD_LIMIT = 24;
const STATUS_OPTIONS: HappyHourStatus[] = ["draft", "scheduled", "running", "ended", "disabled"];

type DiscountMode = "percent" | "amount";

type DealDraft = {
  product_slug: string;
  product_name: string;
  regular_price: string;
  offer_price: string;
  note: string;
};

type SectionDraft = {
  key: string;
  label: string;
  category_id: string;
  discount_mode: DiscountMode;
  discount_value: string;
  deals: DealDraft[];
};

function buildUrl(params: URLSearchParams) {
  const q = params.toString();
  return q ? `/website/marketing/happy-hour?${q}` : "/website/marketing/happy-hour";
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIso(local: string) {
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function emptySection(): SectionDraft {
  return {
    key: "",
    label: "",
    category_id: "",
    discount_mode: "percent",
    discount_value: "10",
    deals: [],
  };
}

function productRegularPrice(product: Product): number {
  const price = Number(product.price) || 0;
  const compare = Number(product.compareAtPrice) || 0;
  return compare > price ? compare : price;
}

function calcOfferPrice(
  regular: number,
  mode: DiscountMode,
  rawValue: string,
): number | null {
  const value = Number(rawValue);
  if (!Number.isFinite(regular) || regular <= 0) return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  if (mode === "percent") {
    if (value >= 100) return null;
    return Math.max(1, Math.round(regular * (1 - value / 100)));
  }
  if (value >= regular) return null;
  return Math.max(1, Math.round(regular - value));
}

function dealFromProduct(
  product: Product,
  mode: DiscountMode,
  discountValue: string,
  note = "",
): DealDraft | null {
  const regular = productRegularPrice(product);
  const offer = calcOfferPrice(regular, mode, discountValue);
  if (offer == null || offer >= regular) return null;
  return {
    product_slug: product.slug,
    product_name: product.name,
    regular_price: String(regular),
    offer_price: String(offer),
    note,
  };
}

function productsForCategory(products: Product[], categoryId: string): Product[] {
  if (!categoryId) return [];
  return products.filter((p) => (p.categoryIds || []).includes(categoryId));
}

function money(n: number | string) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `৳${v.toLocaleString("en-US")}`;
}

export function MarketingHappyHourPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDark = useIsDark();
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const { campaigns, loading, error, refetch } = useMarketingHappyHours();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const createOpen = searchParams.get("create") === "1";
  const editId = searchParams.get("edit");
  const editCampaign = useMemo(
    () => (editId ? campaigns.find((c) => c.id === editId) ?? null : null),
    [editId, campaigns],
  );
  const formOpen = createOpen || !!editCampaign;

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "marketing-happy-hour-api" });
  }, [error]);

  const pushParams = (mutate: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(searchParams.toString());
    mutate(p);
    router.push(buildUrl(p), { scroll: false });
  };

  const openCreate = () =>
    pushParams((p) => {
      p.delete("edit");
      p.set("create", "1");
    });

  const openEdit = (row: ApiMarketingHappyHour) =>
    pushParams((p) => {
      p.delete("create");
      p.set("edit", row.id);
    });

  const closeForm = () =>
    pushParams((p) => {
      p.delete("create");
      p.delete("edit");
    });

  useViewerWriteUrlGuard(formOpen, closeForm);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return campaigns.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!q) return true;
      return (
        row.title.toLowerCase().includes(q) ||
        row.slug.toLowerCase().includes(q) ||
        row.description.toLowerCase().includes(q)
      );
    });
  }, [campaigns, search, status]);

  const columnDefs = useMemo<ColDef<ApiMarketingHappyHour>[]>(
    () => [
      {
        field: "title",
        headerName: "Campaign",
        flex: 1.6,
        minWidth: 180,
        cellRenderer: (p: ICellRendererParams<ApiMarketingHappyHour>) =>
          p.data ? (
            <button
              type="button"
              className="truncate text-left font-medium text-foreground hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                openEdit(p.data!);
              }}
            >
              {p.data.title}
            </button>
          ) : null,
      },
      { field: "slug", headerName: "Slug", width: 140 },
      {
        field: "status",
        headerName: "Status",
        width: 110,
        cellRenderer: (p: ICellRendererParams<ApiMarketingHappyHour>) =>
          p.data ? (
            <Badge
              variant={p.data.status === "running" ? "default" : "secondary"}
              className="rounded-none capitalize"
            >
              {p.data.status}
            </Badge>
          ) : null,
      },
      {
        colId: "window",
        headerName: "Nightly",
        width: 120,
        valueGetter: (p) =>
          p.data ? `${p.data.daily_start_hour}:00–${p.data.daily_end_hour}:00` : "",
      },
      {
        colId: "deals",
        headerName: "Deals",
        width: 90,
        valueGetter: (p) =>
          (p.data?.sections || []).reduce((sum, s) => sum + (s.deals?.length ?? 0), 0),
      },
      {
        colId: "actions",
        headerName: "",
        width: 56,
        pinned: "right",
        sortable: false,
        cellRenderer: (p: ICellRendererParams<ApiMarketingHappyHour>) =>
          p.data ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-none p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-none">
                <DropdownMenuItem onClick={() => openEdit(p.data!)}>
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Edit
                </DropdownMenuItem>
                {canWrite ? (
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => {
                      void (async () => {
                        if (!confirm(`Delete “${p.data!.title}”?`)) return;
                        try {
                          await deleteMarketingHappyHour(p.data!.id);
                          toast.success("Deleted");
                          await refetch();
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Delete failed");
                        }
                      })();
                    }}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null,
      },
    ],
    [canWrite, refetch],
  );

  // Column order + widths saved per admin (same as the other data tables).
  const layout = useGridLayout("marketing-happy-hours", columnDefs);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-8 w-[220px] rounded-none"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          className="h-8 w-[140px] rounded-none"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All status</option>
          {STATUS_OPTIONS.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </Select>
        <ApiRefreshButton onClick={() => void refetch()} health={apiHealth} />
        {canWrite ? (
          <Button size="sm" className="ml-auto h-8 rounded-none" onClick={openCreate}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            New
          </Button>
        ) : null}
      </div>

      <div
            style={layout.containerStyle} className={`ag-theme-quartz${isDark ? "-dark" : ""} min-h-0 flex-1`}>
        {loading && campaigns.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Loading Happy Hour…</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No campaigns match your filters.</p>
        ) : (
          <AgGridReact<ApiMarketingHappyHour>
            rowData={filtered}
            columnDefs={layout.columnDefs}
              {...layout.gridProps}
            getRowId={(p) => p.data.id}
            pagination
            paginationPageSize={PAGE_SIZE}
              paginationPageSizeSelector={[50, 100, 500, 1000]}
            suppressCellFocus
            rowHeight={40}
            headerHeight={36}
            onRowDoubleClicked={(e) => e.data && openEdit(e.data)}
          />
        )}
      </div>

      <HappyHourFormSheet
        open={formOpen}
        mode={createOpen ? "create" : "edit"}
        campaign={editCampaign}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
        onSaved={async () => {
          await refetch();
          closeForm();
        }}
      />
    </div>
  );
}

function HappyHourFormSheet({
  open,
  mode,
  campaign,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  campaign: ApiMarketingHappyHour | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const { categories, loading: categoriesLoading } = useCatalogCategories({ channel: "catalog" });
  const { products, loading: productsLoading } = useCatalogProducts({ channel: "catalog" });
  const productsBySlug = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products) map.set(p.slug, p);
    return map;
  }, [products]);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("happy-hour");
  const [subtitle, setSubtitle] = useState("");
  const [description, setDescription] = useState("");
  const [outlet, setOutlet] = useState("Online Only");
  const [status, setStatus] = useState<HappyHourStatus>("running");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [dailyStart, setDailyStart] = useState("22");
  const [dailyEnd, setDailyEnd] = useState("24");
  const [termsText, setTermsText] = useState("");
  const [sections, setSections] = useState<SectionDraft[]>([emptySection()]);
  const [pickProductId, setPickProductId] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  // Fill the form when the sheet opens or the record changes. Done while rendering (React's pattern for
  // resetting state on a prop change) so the sheet never shows the previous record first.
  const [loadedFor, setLoadedFor] = useState({ open: false, mode, campaign });
  if (loadedFor.open !== open || loadedFor.mode !== mode || loadedFor.campaign !== campaign) {
    setLoadedFor({ open, mode, campaign });
    if (open) fillForm();
  }

  function fillForm() {
    if (mode === "edit" && campaign) {
      setTitle(campaign.title);
      setSlug(campaign.slug);
      setSubtitle(campaign.subtitle || "");
      setDescription(campaign.description || "");
      setOutlet(campaign.outlet_label || "Online Only");
      setStatus(campaign.status);
      setStartsAt(toLocalInput(campaign.starts_at));
      setEndsAt(toLocalInput(campaign.ends_at));
      setDailyStart(String(campaign.daily_start_hour ?? 22));
      setDailyEnd(String(campaign.daily_end_hour ?? 24));
      setTermsText((campaign.terms || []).join("\n"));
      setSections(
        (campaign.sections || []).length
          ? campaign.sections.map((s) => ({
              key: s.key,
              label: s.label,
              category_id: "",
              discount_mode: "percent" as DiscountMode,
              discount_value: "10",
              deals: (s.deals || []).map((d) => ({
                product_slug: d.product_slug,
                product_name: d.product_slug,
                regular_price: "",
                offer_price: String(d.offer_price),
                note: d.note || "",
              })),
            }))
          : [emptySection()],
      );
      setPickProductId({});
      return;
    }
    const now = new Date();
    const end = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    setTitle("Againcart Happy Hour");
    setSlug("happy-hour");
    setSubtitle("");
    setDescription("");
    setOutlet("Online Only");
    setStatus("running");
    setStartsAt(toLocalInput(now.toISOString()));
    setEndsAt(toLocalInput(end.toISOString()));
    setDailyStart("22");
    setDailyEnd("24");
    setTermsText("");
    setSections([emptySection()]);
    setPickProductId({});
  }

  // Enrich section category ids + deal names/prices once catalog loads (no form reset) — while rendering,
  // like the form fill above, each time the sheet opens or the catalog arrives.
  const [enrichedFor, setEnrichedFor] = useState({ open: false, categories, productsBySlug });
  if (enrichedFor.open !== open || enrichedFor.categories !== categories || enrichedFor.productsBySlug !== productsBySlug) {
    setEnrichedFor({ open, categories, productsBySlug });
    if (open && categories.length) enrichCategories();
    if (open && productsBySlug.size) enrichDeals();
  }

  function enrichCategories() {
    setSections((rows) =>
      rows.map((section) => {
        if (section.category_id) return section;
        const matched =
          categories.find((c) => c.slug === section.key) ||
          categories.find(
            (c) => c.name.trim().toLowerCase() === section.label.trim().toLowerCase(),
          );
        return matched ? { ...section, category_id: matched.id } : section;
      }),
    );
  }

  function enrichDeals() {
    setSections((rows) =>
      rows.map((section) => ({
        ...section,
        deals: section.deals.map((deal) => {
          const product = productsBySlug.get(deal.product_slug);
          if (!product) return deal;
          return {
            ...deal,
            product_name: product.name,
            regular_price: String(productRegularPrice(product)),
          };
        }),
      })),
    );
  }

  const updateSection = (index: number, patch: Partial<SectionDraft>) =>
    setSections((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const updateDeal = (sectionIndex: number, dealIndex: number, patch: Partial<DealDraft>) =>
    setSections((rows) =>
      rows.map((row, i) =>
        i === sectionIndex
          ? {
              ...row,
              deals: row.deals.map((deal, j) => (j === dealIndex ? { ...deal, ...patch } : deal)),
            }
          : row,
      ),
    );

  const mergeDeals = (sectionIndex: number, incoming: DealDraft[], replace = false) => {
    setSections((rows) =>
      rows.map((row, i) => {
        if (i !== sectionIndex) return row;
        if (replace) return { ...row, deals: incoming };
        const seen = new Set(row.deals.map((d) => d.product_slug));
        const next = [...row.deals];
        for (const deal of incoming) {
          if (seen.has(deal.product_slug)) continue;
          seen.add(deal.product_slug);
          next.push(deal);
        }
        return { ...row, deals: next };
      }),
    );
  };

  const addCategoryProducts = (sectionIndex: number) => {
    const section = sections[sectionIndex];
    if (!section?.category_id) {
      toast.error("Select a category first");
      return;
    }
    const value = Number(section.discount_value);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Set a valid discount percent or ৳ amount");
      return;
    }
    const pool = productsForCategory(products, section.category_id);
    if (pool.length === 0) {
      toast.error("No catalog products in this category");
      return;
    }
    const deals: DealDraft[] = [];
    let skipped = 0;
    for (const product of pool.slice(0, CATEGORY_ADD_LIMIT)) {
      const deal = dealFromProduct(product, section.discount_mode, section.discount_value);
      if (!deal) {
        skipped += 1;
        continue;
      }
      deals.push(deal);
    }
    if (deals.length === 0) {
      toast.error("Discount too high — no valid offer prices");
      return;
    }
    mergeDeals(sectionIndex, deals);
    const extra = pool.length > CATEGORY_ADD_LIMIT ? ` (first ${CATEGORY_ADD_LIMIT})` : "";
    toast.success(`Added ${deals.length} product${deals.length === 1 ? "" : "s"}${extra}`);
    if (skipped) toast.message(`${skipped} skipped (discount ≥ regular price)`);
  };

  const applyDiscountToSection = (sectionIndex: number) => {
    const section = sections[sectionIndex];
    if (!section) return;
    const next = section.deals
      .map((deal) => {
        const product = productsBySlug.get(deal.product_slug);
        if (product) {
          return (
            dealFromProduct(product, section.discount_mode, section.discount_value, deal.note) ||
            deal
          );
        }
        const regular = Number(deal.regular_price);
        const offer = calcOfferPrice(regular, section.discount_mode, section.discount_value);
        if (offer == null) return deal;
        return { ...deal, offer_price: String(offer) };
      })
      .filter(Boolean) as DealDraft[];
    mergeDeals(sectionIndex, next, true);
    toast.success("Discount re-applied to section deals");
  };

  const addPickedProduct = (sectionIndex: number, productId: string) => {
    if (!productId) return;
    const section = sections[sectionIndex];
    const product = products.find((p) => p.id === productId);
    if (!section || !product) return;
    if (section.deals.some((d) => d.product_slug === product.slug)) {
      toast.message("Product already in this section");
      setPickProductId((prev) => ({ ...prev, [sectionIndex]: "" }));
      return;
    }
    const deal = dealFromProduct(product, section.discount_mode, section.discount_value);
    if (!deal) {
      toast.error("Discount must leave offer price below regular price");
      return;
    }
    mergeDeals(sectionIndex, [deal]);
    setPickProductId((prev) => ({ ...prev, [sectionIndex]: "" }));
  };

  const categoriesForPicker = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const extras: Category[] = [];
    for (const section of sections) {
      if (!section.category_id || byId.has(section.category_id)) continue;
      extras.push({
        id: section.category_id,
        name: section.label || section.key || "Category",
        caption: section.key,
        slug: section.key || section.category_id,
        parentId: null,
        sortOrder: 9999,
        productCount: 0,
        active: true,
        showInTopMenu: false,
        updatedAt: "",
      });
    }
    return extras.length ? [...categories, ...extras] : categories;
  }, [categories, sections]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        resizable
        closeButton="chevron"
        className="flex w-[560px] min-w-[160px] max-w-[800px] flex-col rounded-none p-0"
      >
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle className="text-sm font-semibold">
            {mode === "create" ? "New Happy Hour" : "Edit Happy Hour"}
          </SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
          <Field label="Title">
            <Input className="rounded-none" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Slug (storefront uses happy-hour)">
            <Input className="rounded-none" value={slug} onChange={(e) => setSlug(e.target.value)} />
          </Field>
          <Field label="Subtitle (optional)">
            <Input className="rounded-none" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
          </Field>
          <Field label="Description">
            <Textarea
              className="min-h-[80px] rounded-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field label="Outlet label">
            <Input className="rounded-none" value={outlet} onChange={(e) => setOutlet(e.target.value)} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Status">
              <Select
                className="rounded-none"
                value={status}
                onChange={(e) => setStatus(e.target.value as HappyHourStatus)}
              >
                {STATUS_OPTIONS.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Daily start (0–24)">
              <Input
                type="number"
                min={0}
                max={24}
                className="rounded-none"
                value={dailyStart}
                onChange={(e) => setDailyStart(e.target.value)}
              />
            </Field>
            <Field label="Daily end (0–24)">
              <Input
                type="number"
                min={0}
                max={24}
                className="rounded-none"
                value={dailyEnd}
                onChange={(e) => setDailyEnd(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Campaign starts">
              <Input
                type="datetime-local"
                className="rounded-none"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </Field>
            <Field label="Campaign ends">
              <Input
                type="datetime-local"
                className="rounded-none"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </Field>
          </div>

          <div className="space-y-3 border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground">Sections & deals</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 rounded-none"
                onClick={() => setSections((rows) => [...rows, emptySection()])}
              >
                Add section
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Pick a category or product, set % or ৳ off, then add — offer prices calculate automatically.
            </p>
            {(categoriesLoading || productsLoading) && (
              <p className="text-xs text-muted-foreground">Loading catalog…</p>
            )}

            {sections.map((section, sIndex) => {
              const categoryProducts = productsForCategory(products, section.category_id);
              const pickerProducts = section.category_id
                ? categoryProducts.length
                  ? categoryProducts
                  : products
                : products;
              return (
                <div key={sIndex} className="space-y-2 border border-border bg-muted/20 p-2">
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Input
                      className="rounded-none"
                      placeholder="Section label"
                      value={section.label}
                      onChange={(e) =>
                        updateSection(sIndex, {
                          label: e.target.value,
                          key:
                            section.key ||
                            e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9]+/g, "-")
                              .replace(/(^-|-$)/g, ""),
                        })
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-none"
                      onClick={() => setSections((rows) => rows.filter((_, i) => i !== sIndex))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <Field label="Category">
                    <CategoryCombobox
                      categories={categoriesForPicker}
                      value={section.category_id}
                      placeholder="Search category…"
                      className="w-full"
                      onChange={(id, name) => {
                        const cat = categoriesForPicker.find((c) => c.id === id);
                        const prev = categoriesForPicker.find((c) => c.id === section.category_id);
                        const shouldFillLabel =
                          !section.label.trim() ||
                          (prev && section.label.trim() === prev.name.trim());
                        updateSection(sIndex, {
                          category_id: id,
                          key: cat?.slug || section.key,
                          label: shouldFillLabel && name ? name : section.label,
                        });
                      }}
                    />
                  </Field>

                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <Field label="Discount type">
                      <Select
                        className="rounded-none"
                        value={section.discount_mode}
                        onChange={(e) =>
                          updateSection(sIndex, {
                            discount_mode: e.target.value as DiscountMode,
                          })
                        }
                      >
                        <option value="percent">Percent %</option>
                        <option value="amount">Fixed ৳ off</option>
                      </Select>
                    </Field>
                    <Field label={section.discount_mode === "percent" ? "Percent off" : "৳ amount off"}>
                      <Input
                        type="number"
                        min={1}
                        className="rounded-none"
                        value={section.discount_value}
                        onChange={(e) => updateSection(sIndex, { discount_value: e.target.value })}
                        placeholder={section.discount_mode === "percent" ? "10" : "500"}
                      />
                    </Field>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-none"
                      onClick={() => addCategoryProducts(sIndex)}
                    >
                      Add category products
                      {section.category_id ? ` (${categoryProducts.length})` : ""}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-none"
                      disabled={section.deals.length === 0}
                      onClick={() => applyDiscountToSection(sIndex)}
                    >
                      Re-apply discount
                    </Button>
                  </div>

                  <Field label="Add single product">
                    <ProductCombobox
                      products={pickerProducts}
                      value={pickProductId[sIndex] || ""}
                      placeholder="Search product…"
                      onChange={(id) => {
                        setPickProductId((prev) => ({ ...prev, [sIndex]: id }));
                        if (id) addPickedProduct(sIndex, id);
                      }}
                    />
                  </Field>

                  {section.deals.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">No deals yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {section.deals.map((deal, dIndex) => (
                        <div
                          key={`${deal.product_slug}-${dIndex}`}
                          className="grid grid-cols-[1.5fr_0.8fr_auto] items-start gap-2 border border-border/60 bg-background p-1.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-foreground">
                              {deal.product_name || deal.product_slug}
                            </p>
                            <p className="truncate text-[10px] text-muted-foreground">
                              {deal.product_slug}
                              {deal.regular_price ? ` · was ${money(deal.regular_price)}` : ""}
                            </p>
                            <Input
                              className="mt-1 h-7 rounded-none text-[11px]"
                              placeholder="Note (optional)"
                              value={deal.note}
                              onChange={(e) => updateDeal(sIndex, dIndex, { note: e.target.value })}
                            />
                          </div>
                          <Field label="Offer ৳">
                            <Input
                              className="rounded-none"
                              type="number"
                              value={deal.offer_price}
                              onChange={(e) =>
                                updateDeal(sIndex, dIndex, { offer_price: e.target.value })
                              }
                            />
                          </Field>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="mt-5 h-8 w-8 rounded-none"
                            onClick={() =>
                              updateSection(sIndex, {
                                deals: section.deals.filter((_, i) => i !== dIndex),
                              })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Field label="Terms (one per line)">
            <Textarea
              className="min-h-[120px] rounded-none font-mono text-xs"
              value={termsText}
              onChange={(e) => setTermsText(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="outline" className="rounded-none" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="rounded-none"
            disabled={saving}
            onClick={() => {
              void (async () => {
                if (!title.trim() || !slug.trim()) {
                  toast.error("Title and slug are required");
                  return;
                }
                const cleanSections = sections
                  .filter((s) => s.label.trim())
                  .map((s, i) => ({
                    key:
                      s.key ||
                      s.label
                        .trim()
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/(^-|-$)/g, ""),
                    label: s.label.trim(),
                    sort_order: i,
                    deals: s.deals
                      .filter((d) => d.product_slug.trim() && Number(d.offer_price) > 0)
                      .map((d, j) => ({
                        product_slug: d.product_slug.trim(),
                        offer_price: Number(d.offer_price),
                        note: d.note.trim() || null,
                        sort_order: j,
                      })),
                  }))
                  .filter((s) => s.deals.length > 0);
                if (cleanSections.length === 0) {
                  toast.error("Add at least one section with a valid deal");
                  return;
                }
                const payload: HappyHourWriteInput = {
                  title: title.trim(),
                  slug: slug.trim(),
                  subtitle: subtitle.trim() || null,
                  description: description.trim(),
                  outlet_label: outlet.trim() || "Online Only",
                  status,
                  starts_at: toIso(startsAt),
                  ends_at: toIso(endsAt),
                  daily_start_hour: Math.min(24, Math.max(0, Number(dailyStart) || 22)),
                  daily_end_hour: Math.min(24, Math.max(0, Number(dailyEnd) || 24)),
                  terms: termsText
                    .split("\n")
                    .map((t) => t.trim())
                    .filter(Boolean),
                  sections: cleanSections,
                };
                setSaving(true);
                try {
                  if (mode === "create") {
                    await createMarketingHappyHour(payload);
                    toast.success("Happy Hour created");
                  } else if (campaign) {
                    await updateMarketingHappyHour(campaign.id, payload);
                    toast.success("Happy Hour updated");
                  }
                  await onSaved();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Save failed");
                } finally {
                  setSaving(false);
                }
              })();
            }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
