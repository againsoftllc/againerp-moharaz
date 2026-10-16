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
  createMarketingOffer,
  deleteMarketingOffer,
  updateMarketingOffer,
  type ApiMarketingOffer,
  type OfferStatus,
  type OfferWriteInput,
} from "@/lib/api/marketing-offers";
import { useMarketingOffers } from "@/lib/api/use-marketing-offers";
import { useCatalogCategories } from "@/lib/api/use-catalog-categories";
import { CategoryCombobox } from "@/components/categories/category-combobox";
import { useIsDark } from "@/lib/use-is-dark";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useViewerWriteUrlGuard } from "@/lib/hooks/use-viewer-write-url-guard";
import { useApiHealth } from "@/lib/api/use-api-health";
import { ApiRefreshButton } from "@/components/products/api-refresh-button";
import { cn } from "@/lib/utils";
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
import type { Category } from "@/lib/mock-data/categories";

const PAGE_SIZE = 50;
const STATUS_OPTIONS: OfferStatus[] = ["draft", "scheduled", "running", "ended", "disabled"];

type SectionDraft = { key: string; label: string; category_slug: string };

function buildUrl(params: URLSearchParams) {
  const q = params.toString();
  return q ? `/website/marketing/offers?${q}` : "/website/marketing/offers";
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

export function MarketingOffersPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDark = useIsDark();
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const { offers, loading, error, refetch } = useMarketingOffers();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const createOpen = searchParams.get("create") === "1";
  const editId = searchParams.get("edit");
  const editOffer = useMemo(
    () => (editId ? offers.find((o) => o.id === editId) ?? null : null),
    [editId, offers],
  );
  const formOpen = createOpen || !!editOffer;

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "marketing-offers-api" });
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

  const openEdit = (offer: ApiMarketingOffer) =>
    pushParams((p) => {
      p.delete("create");
      p.set("edit", offer.id);
    });

  const closeForm = () =>
    pushParams((p) => {
      p.delete("create");
      p.delete("edit");
    });

  useViewerWriteUrlGuard(formOpen, closeForm);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return offers.filter((offer) => {
      if (status !== "all" && offer.status !== status) return false;
      if (!q) return true;
      return (
        offer.title.toLowerCase().includes(q) ||
        offer.slug.toLowerCase().includes(q) ||
        offer.description.toLowerCase().includes(q)
      );
    });
  }, [offers, search, status]);

  const columnDefs = useMemo<ColDef<ApiMarketingOffer>[]>(
    () => [
      {
        field: "title",
        headerName: "Offer",
        flex: 1.6,
        minWidth: 180,
        cellRenderer: (p: ICellRendererParams<ApiMarketingOffer>) =>
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
      { field: "slug", headerName: "Slug", width: 180 },
      {
        field: "status",
        headerName: "Status",
        width: 110,
        cellRenderer: (p: ICellRendererParams<ApiMarketingOffer>) =>
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
        colId: "sections",
        headerName: "Tabs",
        width: 90,
        valueGetter: (p) => p.data?.sections?.length ?? 0,
      },
      {
        colId: "schedule",
        headerName: "Schedule",
        flex: 1.2,
        minWidth: 200,
        valueGetter: (p) =>
          p.data
            ? `${new Date(p.data.starts_at).toLocaleDateString("en-GB")} → ${new Date(p.data.ends_at).toLocaleDateString("en-GB")}`
            : "",
      },
      {
        colId: "actions",
        headerName: "",
        width: 56,
        pinned: "right",
        sortable: false,
        cellRenderer: (p: ICellRendererParams<ApiMarketingOffer>) =>
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
                        try {
                          await deleteMarketingOffer(p.data!.id);
                          toast.success("Offer deleted");
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
  const layout = useGridLayout("marketing-offers", columnDefs);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-stretch overflow-hidden rounded-none border border-border bg-card">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 px-2 py-1.5">
          <Input
            placeholder="Search offers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-[260px] rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-[150px] shrink-0 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          >
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </Select>
          <ApiRefreshButton
            status={apiHealth.status}
            loading={loading}
            onRefresh={() => {
              void refetch();
              apiHealth.recheck();
            }}
            disabled={loading}
          />
        </div>
        {canWrite ? (
          <div className="flex shrink-0 items-center gap-2 border-l border-border bg-background px-2 py-1.5">
            <Button size="sm" className="gap-1.5 rounded-none" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              New offer
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {loading && offers.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-none border border-border bg-card">
            <p className="text-sm text-muted-foreground">Loading offers…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-none border border-dashed border-border bg-card">
            <p className="text-sm text-muted-foreground">No offers match your filters.</p>
          </div>
        ) : (
          <div
            style={layout.containerStyle}
            className={cn(
              "ag-theme-quartz control-border relative min-h-0 flex-1 overflow-hidden rounded-none bg-card [&_.ag-root-wrapper]:h-full",
              isDark && "ag-theme-quartz-dark",
            )}
          >
            <AgGridReact<ApiMarketingOffer>
              rowData={filtered}
              columnDefs={layout.columnDefs}
              {...layout.gridProps}
              getRowId={(p) => p.data.id}
              pagination
              paginationPageSize={PAGE_SIZE}
              paginationPageSizeSelector={[50, 100, 500, 1000]}
              suppressCellFocus
              animateRows={false}
            />
          </div>
        )}
      </div>

      <OfferFormSheet
        open={formOpen}
        mode={createOpen ? "create" : "edit"}
        offer={editOffer}
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

function OfferFormSheet({
  open,
  mode,
  offer,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  offer: ApiMarketingOffer | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const { categories, loading: categoriesLoading } = useCatalogCategories({ channel: "catalog" });
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [outlet, setOutlet] = useState("All Outlet");
  const [status, setStatus] = useState<OfferStatus>("running");
  const [productsLimit, setProductsLimit] = useState("12");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [sections, setSections] = useState<SectionDraft[]>([]);
  const [saving, setSaving] = useState(false);

  const categoriesForPicker = useMemo(() => {
    const bySlug = new Map(categories.map((c) => [c.slug, c]));
    const extras: Category[] = [];
    for (const section of sections) {
      const slugVal = section.category_slug.trim();
      if (!slugVal || bySlug.has(slugVal)) continue;
      extras.push({
        id: `saved:${slugVal}`,
        name: section.label.trim() || slugVal,
        caption: slugVal,
        slug: slugVal,
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

  // Fill the form when the sheet opens or the record changes. Done while rendering (React's pattern for
  // resetting state on a prop change) so the sheet never shows the previous record first.
  const [loadedFor, setLoadedFor] = useState({ open: false, mode, offer });
  if (loadedFor.open !== open || loadedFor.mode !== mode || loadedFor.offer !== offer) {
    setLoadedFor({ open, mode, offer });
    if (open) fillForm();
  }

  function fillForm() {
    if (mode === "edit" && offer) {
      setTitle(offer.title);
      setSlug(offer.slug);
      setDescription(offer.description || "");
      setImageUrl(offer.image_url || "");
      setOutlet(offer.outlet_label || "All Outlet");
      setStatus(offer.status);
      setProductsLimit(String(offer.products_limit ?? 12));
      setStartsAt(toLocalInput(offer.starts_at));
      setEndsAt(toLocalInput(offer.ends_at));
      setSections(
        (offer.sections || []).map((s) => ({
          key: s.key,
          label: s.label,
          category_slug: s.category_slug,
        })),
      );
      return;
    }
    const now = new Date();
    const end = new Date(now.getTime() + 26 * 24 * 60 * 60 * 1000);
    setTitle("");
    setSlug("");
    setDescription("");
    setImageUrl("/images/offers/placeholder.svg");
    setOutlet("All Outlet");
    setStatus("running");
    setProductsLimit("12");
    setStartsAt(toLocalInput(now.toISOString()));
    setEndsAt(toLocalInput(end.toISOString()));
    setSections([{ key: "", label: "", category_slug: "" }]);
  }

  const addSection = () =>
    setSections((rows) => [...rows, { key: "", label: "", category_slug: "" }]);

  const updateSection = (index: number, patch: Partial<SectionDraft>) =>
    setSections((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const removeSection = (index: number) =>
    setSections((rows) => rows.filter((_, i) => i !== index));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        resizable
        closeButton="chevron"
        className="flex w-[480px] min-w-[160px] max-w-[720px] flex-col rounded-none p-0"
      >
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle className="text-sm font-semibold">
            {mode === "create" ? "New offer page" : "Edit offer page"}
          </SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
          <Field label="Title">
            <Input
              className="rounded-none"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (mode === "create") {
                  setSlug(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/(^-|-$)/g, ""),
                  );
                }
              }}
            />
          </Field>
          <Field label="Slug (URL)">
            <Input
              className="rounded-none"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="computer-gaming-deal"
            />
          </Field>
          <Field label="Description">
            <Textarea
              className="min-h-[72px] rounded-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field label="Image URL">
            <Input className="rounded-none" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
          </Field>
          <Field label="Outlet label">
            <Input className="rounded-none" value={outlet} onChange={(e) => setOutlet(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <Select
                className="rounded-none"
                value={status}
                onChange={(e) => setStatus(e.target.value as OfferStatus)}
              >
                {STATUS_OPTIONS.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Products per tab">
              <Input
                type="number"
                min={1}
                max={48}
                className="rounded-none"
                value={productsLimit}
                onChange={(e) => setProductsLimit(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts (countdown window)">
              <Input
                type="datetime-local"
                className="rounded-none"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </Field>
            <Field label="Ends">
              <Input
                type="datetime-local"
                className="rounded-none"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </Field>
          </div>

          <div className="space-y-2 border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground">Category tabs / sections</p>
              <Button type="button" size="sm" variant="outline" className="h-7 rounded-none" onClick={addSection}>
                Add tab
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Select a catalog category for each tab. Tab label defaults to the category name (editable).
            </p>
            {categoriesLoading ? (
              <p className="text-xs text-muted-foreground">Loading categories…</p>
            ) : null}
            {sections.map((section, index) => {
              const selectedId =
                categoriesForPicker.find((c) => c.slug === section.category_slug)?.id ?? "";
              return (
                <div key={index} className="grid grid-cols-[1fr_1.4fr_auto] items-start gap-2">
                  <Input
                    className="rounded-none"
                    placeholder="Tab label"
                    value={section.label}
                    onChange={(e) => updateSection(index, { label: e.target.value })}
                  />
                  <CategoryCombobox
                    categories={categoriesForPicker}
                    value={selectedId}
                    placeholder="Search category…"
                    className="w-full"
                    onChange={(id, name) => {
                      const cat = categoriesForPicker.find((c) => c.id === id);
                      const nextSlug = cat?.slug ?? "";
                      const prevCat = categoriesForPicker.find(
                        (c) => c.slug === section.category_slug,
                      );
                      const shouldFillLabel =
                        !section.label.trim() ||
                        (prevCat && section.label.trim() === prevCat.name.trim());
                      updateSection(index, {
                        category_slug: nextSlug,
                        key: nextSlug || section.key,
                        label: shouldFillLabel && name ? name : section.label,
                      });
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-none"
                    onClick={() => removeSection(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
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
                  .filter((s) => s.label.trim() && s.category_slug.trim())
                  .map((s, i) => ({
                    key: s.key || s.category_slug.trim(),
                    label: s.label.trim(),
                    category_slug: s.category_slug.trim(),
                    sort_order: i,
                  }));
                if (cleanSections.length === 0) {
                  toast.error("Select at least one category tab");
                  return;
                }
                const payload: OfferWriteInput = {
                  title: title.trim(),
                  slug: slug.trim(),
                  description: description.trim(),
                  image_url: imageUrl.trim() || null,
                  outlet_label: outlet.trim() || "All Outlet",
                  status,
                  products_limit: Math.min(48, Math.max(1, Number(productsLimit) || 12)),
                  starts_at: toIso(startsAt),
                  ends_at: toIso(endsAt),
                  sections: cleanSections,
                };
                setSaving(true);
                try {
                  if (mode === "create") {
                    await createMarketingOffer(payload);
                    toast.success("Offer created");
                  } else if (offer) {
                    await updateMarketingOffer(offer.id, payload);
                    toast.success("Offer updated");
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
