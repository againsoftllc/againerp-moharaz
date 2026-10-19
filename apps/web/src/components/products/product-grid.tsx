"use client";

import "@/components/providers/ag-grid-provider";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { CellValueChangedEvent, ColDef, ColumnState, GridApi, ICellRendererParams, ValueParserParams } from "ag-grid-community";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Copy,
  Eye,
  Globe,
  GripVertical,
  Pencil,
  Printer,
  Star,
  ClipboardList,
  Trash2,
  X,
  ChevronDown,
  Search,
  ImageOff,
  RefreshCw,
  Link2,
  BadgeCheck,
  ExternalLink,
  Sparkles,
  Loader2,
  Warehouse,
} from "lucide-react";
import { toast } from "sonner";
import { CategoryTreeFilter, categoryNamesWithDescendants } from "@/components/categories/category-tree-filter";
import {
  archiveCatalogProducts,
  deleteCatalogProduct,
  duplicateCatalogProduct,
  publishProductToApi, runBulk,
  unpublishProductFromApi,
  updateCatalogProduct,
} from "@/lib/api/use-catalog-products";
import { productListFields } from "@/lib/api/catalog-products";
import { type Product, type ProductStatus, type StockStatusLabel } from "@/lib/mock-data/products";
import type { Category } from "@/lib/mock-data/categories";
import { categoriesFlat as defaultCategoriesFlat } from "@/lib/mock-data/categories";
import { getProductCategoryDisplay } from "@/lib/category-utils";
import { cn, formatCurrency, formatDate, formatDateTime, formatQuantity, formatTimeAgo } from "@/lib/utils";
import { unitTypeLabel } from "@/lib/inventory/unit-types";
import { applyImageFallback } from "@/lib/media/image-fallback";
import { useIsDark } from "@/lib/use-is-dark";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { useCompanyFormatStore } from "@/lib/store/company-format-store";
import { Badge } from "@/components/ui/badge";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { AgainListGrid } from "@/components/shared/again-list-grid";
import { useGridSourceCompare } from "@/components/products/use-grid-source-compare";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/shared/filter-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SlugCellEditor } from "@/components/data-grid/slug-cell-editor";
import { slugCellClassRules } from "@/components/data-grid/slug-cell-rules";
import { slugHasError, validateSlug } from "@/lib/url-slug/validate-slug";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProductMobileCards } from "@/components/products/product-mobile-cards";
import { PrintLabelDrawer } from "@/components/products/print-label-drawer";
import { PriceRangeFilter, DEFAULT_PRICE_CEILING } from "@/components/products/price-range-filter";
import { WebsiteBadge } from "@/components/products/website-badge";
import { useActivityStore } from "@/lib/store/activity-store";
import type { ActivityActionType, ActivityEntry } from "@/lib/activity/types";
import { fetchCollabActivity, type CollabActivity } from "@/lib/api/collaboration";
import {
  isProductOnWebsite,
  publishProductToWebsite,
  removeProductFromWebsite,
} from "@/lib/catalog/website-visibility";
import type { PriceUpdateCompetitor, PriceUpdateMatch } from "@/lib/api/price-update-plugin";

/** The company a source page belongs to, for the Source column: the competitor's own label when its site is one of the compared sites,
 *  else the site's name from its host (startech.com.bd -> "Startech"). */
function sourceCompanyName(url: string | null | undefined, competitors?: { key: string; label: string }[]): string {
  if (!url) return "";
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
  const known = competitors?.find((c) => c.key !== "source" && host.includes(String(c.key).toLowerCase()));
  if (known) return known.label;
  const first = host.split(".")[0] ?? "";
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "";
}

/** Stock wording + dot colour for a competitor match: green in stock, red out of stock, amber
 * for anything in between ("Up Coming", "Coming Soon", "Discontinued", "Pre Order", "Call For
 * Price", …) — those aren't simply in or out, so they're flagged rather than guessed. */
function competitorStock(match: PriceUpdateMatch): { text: string; dotClass: string } | null {
  const label = (match.stock_label ?? "").trim();
  const warn = /coming|upcoming|announce|tba|discontinu|pre[\s-]*order|call\s*for|limited|back\s*order|on\s*request|not\s*available|unavailable/i;
  if (label && warn.test(label)) return { text: label, dotClass: "bg-amber-500" };
  if (match.in_stock === true) return { text: label || "In stock", dotClass: "bg-emerald-500" };
  if (match.in_stock === false) return { text: label || "Out of stock", dotClass: "bg-red-500" };
  if (label) return { text: label, dotClass: "bg-amber-500" };
  return null;
}

function StockDot({ stock, title }: { stock: { dotClass: string } | null; title?: string }) {
  if (!stock) return null;
  return (
    <span className="inline-flex shrink-0 items-center" title={title}>
      <span className={cn("h-1.5 w-1.5 rounded-full", stock.dotClass)} />
    </span>
  );
}

/** Saved widths must beat a column's flex sizing when a layout is restored. */
function withoutFlex(state: { colId: string; width?: number }[]) {
  return state.map((c) => (typeof c.width === "number" ? { ...c, flex: null } : c));
}

/** "Ryans 25 · Techland 3" for the bulk bar. */
function pickedCellsSummary(picked: Set<string>, competitors?: { key: string; label: string }[]): string {
  const counts = new Map<string, number>();
  for (const key of picked) {
    const site = key.split("::")[1];
    counts.set(site, (counts.get(site) ?? 0) + 1);
  }
  return [...counts]
    .map(([site, n]) => `${competitors?.find((c) => c.key === site)?.label ?? site} ${n}`)
    .join(" · ");
}

/** Tick box styled to line up with the grid's row tick boxes. */
function PickBox({
  checked,
  indeterminate,
  onToggle,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onToggle: () => void;
  label: string;
}) {
  // Same markup and classes as AG Grid's own row/header tick boxes, so the grid theme styles it
  // identically (ag-checked / ag-indeterminate drive the look).
  return (
    <div className="ag-labeled ag-label-align-right ag-checkbox ag-input-field" role="presentation">
      <div
        role="presentation"
        className={cn(
          "ag-wrapper ag-input-wrapper ag-checkbox-input-wrapper",
          checked && "ag-checked",
          !checked && indeterminate && "ag-indeterminate",
        )}
      >
        <input
          type="checkbox"
          className="ag-input-field-input ag-checkbox-input"
          checked={checked}
          ref={(el) => {
            if (el) el.indeterminate = Boolean(indeterminate) && !checked;
          }}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          title={label}
          aria-label={label}
        />
      </div>
    </div>
  );
}

/** Competitor column header: a select-all tick box for that column's cells, then the site name. */
function CompetitorHeader(props: {
  displayName: string;
  pickState?: () => "all" | "some" | "none";
  onTogglePickAll?: () => void;
}) {
  const state = props.pickState?.() ?? "none";
  return (
    <span className="flex w-full items-center gap-2">
      {props.onTogglePickAll ? (
        <PickBox
          checked={state === "all"}
          indeterminate={state === "some"}
          onToggle={() => props.onTogglePickAll?.()}
          label={`Select every ${props.displayName} price shown`}
        />
      ) : null}
      <span className="ag-header-cell-text flex-1 truncate text-left">{props.displayName}</span>
    </span>
  );
}

function CompetitorPriceCellBody({
  match,
  ourPrice,
  onSync,
  bulkSyncing,
  onEditUrl,
  pickable,
  picked,
  onTogglePick,
  sourceUrl,
}: {
  match: PriceUpdateMatch | undefined;
  ourPrice: number;
  /** The product's own source page, when it was imported from this competitor's site. */
  sourceUrl?: string;
  /** Source column: the company the source page belongs to, shown in front of the price ("Startech | ৳2,399"). */
  companyName?: string;
  /** Re-check just this one product/competitor pair, without a full bulk refresh. */
  onSync?: () => void;
  /** True while this exact product/competitor pair is being processed by an in-progress
   * bulk check elsewhere on the page — spins the same icon as a solo re-check. */
  bulkSyncing?: boolean;
  /** Opens the "set manual URL" dialog for this exact product/competitor pair — the
   * fallback for when search (and its AI assist) still can't find the right page. */
  onEditUrl?: () => void;
  /** This site's header tick box is on: show a tick box to pick this cell for a bulk check. */
  pickable?: boolean;
  picked?: boolean;
  onTogglePick?: () => void;
}) {
  const [clickSyncing, setClickSyncing] = useState(false);
  const syncing = clickSyncing || Boolean(bulkSyncing);
  const handleSyncClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (!onSync || syncing) return;
    setClickSyncing(true);
    Promise.resolve(onSync()).finally(() => setClickSyncing(false));
  };
  // Orange = the last check failed (blocked site, page didn't load…); the reason is the tooltip.
  const syncFailed = match?.status === "error";
  const syncButton = onSync ? (
    <button
      type="button"
      onClick={handleSyncClick}
      disabled={syncing}
      title={
        syncFailed
          ? `Last check failed: ${match?.status_message ?? "unknown error"} — click to try again`
          : "Re-check this product"
      }
      className={cn(
        "ml-1 inline-flex shrink-0 disabled:opacity-50",
        syncFailed
          ? "text-orange-500 hover:text-orange-600 dark:text-orange-400"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
    </button>
  ) : null;
  // The link icon's colour says what we have: grey = no link, green = link saved,
  // blue = link verified by an admin (never replaced automatically).
  const linkState = !match?.matched_url ? "none" : match.verified ? "verified" : "linked";
  const linkTitle =
    linkState === "none"
      ? "No link for this site yet — click to add the product page URL"
      : linkState === "verified"
        ? [
            "Verified link",
            match?.verified_by ? `checked by ${match.verified_by}` : null,
            match?.verified_at ? formatDateTime(match.verified_at) : null,
          ]
            .filter(Boolean)
            .join(" · ")
            .concat(" — kept until an admin changes it. Click to view or change")
        : "Link saved (not verified) — click to view, verify or change it";
  const editUrlButton = onEditUrl ? (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onEditUrl();
      }}
      title={linkTitle}
      className={cn(
        "inline-flex shrink-0",
        linkState === "none" && "text-muted-foreground hover:text-foreground",
        linkState === "linked" && "text-emerald-600 hover:text-emerald-700 dark:text-emerald-400",
        linkState === "verified" && "text-sky-600 hover:text-sky-700 dark:text-sky-400",
      )}
    >
      <Link2 className={cn("h-3 w-3", linkState !== "none" && "stroke-[2.5]")} />
    </button>
  ) : null;

  // Shown only as a hover tooltip (title attribute), never as visible inline text — the
  // relative form is on the tooltip too since a bare absolute timestamp isn't as scannable.
  const syncedTitle = match?.last_checked_at
    ? `Last checked ${formatTimeAgo(match.last_checked_at)} (${formatDateTime(match.last_checked_at)})`
    : undefined;
  const withSyncedTitle = (base?: string | null) =>
    [base, syncedTitle].filter(Boolean).join(" — ") || undefined;
  const stock = match ? competitorStock(match) : null;
  // Hovering the price shows the stock wording first, then the page title and last check.
  const priceTitle = (extra?: string | null) =>
    withSyncedTitle([stock?.text, extra].filter(Boolean).join(" · ") || null);
  if (match?.status === "error" && match.matched_url && match.price != null) {
    // Latest check failed (e.g. a Cloudflare block) but the link still has its last good price.
    return (
      <span className="flex w-full min-w-0 items-center justify-start gap-1">
        <a
          href={match.matched_url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={priceTitle(`Last known price — ${match.status_message ?? "latest check failed"}`)}
          className="shrink-0 text-muted-foreground hover:underline"
        >
          {formatCurrency(Number(match.price))}
        </a>
        <StockDot stock={stock} title={priceTitle()} />
        {syncButton}
        {editUrlButton}
      </span>
    );
  }
  if (!match || !match.matched_url || match.status !== "matched" || match.price == null) {
    if (match?.status === "error") {
      return (
        <span
          className="flex w-full min-w-0 items-center justify-start gap-1 text-muted-foreground"
          title={withSyncedTitle(match.status_message ?? "Competitor price check failed")}
        >
          <span className="shrink-0">Not synced</span>
          {syncButton}
          {editUrlButton}
        </span>
      );
    }
    return (
      <span
        className="flex w-full min-w-0 items-center justify-start gap-1 text-muted-foreground"
        title={withSyncedTitle(match?.status_message)}
      >
        {match?.status === "no_price" && match.matched_url ? (
          <span className="shrink-0">
            {/* The page is known; it just lists no price ("Call For Price", "Out of stock", …). */}
            <a
              href={match.matched_url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "hover:underline",
                /(fix|check) the link/i.test(match.status_message ?? "") && "text-amber-600 dark:text-amber-400",
              )}
            >
              {/(fix|check) the link/i.test(match.status_message ?? "") ? "Check link" : "No price"}
            </a>
          </span>
        ) : null}
        {match?.status === "no_price" && match.matched_url && !/(fix|check) the link/i.test(match.status_message ?? "") ? (
          <StockDot stock={stock} title={withSyncedTitle(match.status_message)} />
        ) : null}
        {match?.status === "no_price" && match.matched_url ? null : sourceUrl ? (
          // The product was imported from this site: not checked yet, but the page is known — link to it.
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={`Not synced yet — open the source page: ${sourceUrl}`}
            className="shrink-0 hover:underline"
          >
            Not synced
          </a>
        ) : (
          <span className="shrink-0">
            {match?.manual_url && !match.matched_url
              ? "No link"
              : match?.status === "no_price" || match?.status === "not_found"
                ? "Not found"
                : "—"}
          </span>
        )}
        {syncButton}
        {editUrlButton}
      </span>
    );
  }
  const price = Number(match.price);
  const cheaper = price < ourPrice;
  const pricier = price > ourPrice;
  return (
    <span className="flex w-full min-w-0 items-center justify-start gap-1">
      <a
        href={match.matched_url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        title={priceTitle(match.matched_title)}
        className={cn(
          "shrink-0 hover:underline",
          cheaper && "text-red-600 dark:text-red-400",
          pricier && "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {formatCurrency(price)}
      </a>
      <StockDot stock={stock} title={priceTitle()} />
      {syncButton}
      {editUrlButton}
    </span>
  );
}

/** Competitor cell: the row's tick box on the left (lined up down the column, like the grid's
 * own row tick boxes), the price/status centred in the rest. */
function CompetitorPriceCell(props: Parameters<typeof CompetitorPriceCellBody>[0]) {
  return (
    <span className="flex h-full w-full min-w-0 items-center gap-2 leading-none">
      {props.pickable ? (
        <PickBox
          checked={Boolean(props.picked)}
          onToggle={() => props.onTogglePick?.()}
          label="Select this price for a bulk check"
        />
      ) : null}
      {props.companyName ? (
        <span className="shrink-0 text-[11px] font-medium text-foreground/80" title={`Source: ${props.companyName}`}>
          {props.companyName}
          <span className="ml-1 text-muted-foreground/50">|</span>
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <CompetitorPriceCellBody {...props} />
      </span>
    </span>
  );
}

const STOCK_STATUSES: StockStatusLabel[] = ["In Stock", "Out of Stock", "Pre-order", "Coming Soon"];

function Shimmer({ className }: { className?: string }) {
  return <div className={cn("fb-shimmer rounded-none", className)} />;
}

function ProductGridSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-0 bg-background animate-[route-fade-in_160ms_ease-out]">
      <div className="flex shrink-0 items-center gap-4 border-b border-input bg-muted/30 px-3 py-2.5">
        <Shimmer className="h-4 w-4" />
        <Shimmer className="h-3 w-28" />
        <Shimmer className="h-3 w-20" />
        <Shimmer className="ml-auto h-3 w-16" />
        <Shimmer className="h-3 w-14" />
        <Shimmer className="h-3 w-16" />
        <Shimmer className="h-3 w-10" />
        <Shimmer className="h-3 w-6" />
      </div>
      <div className="min-h-0 flex-1 divide-y divide-input overflow-hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-3 py-3"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <Shimmer className="h-4 w-4 shrink-0" />
            <Shimmer className="h-8 w-8 shrink-0" />
            <Shimmer className={cn("h-3 shrink-0", i % 3 === 0 ? "w-40" : i % 3 === 1 ? "w-32" : "w-48")} />
            <Shimmer className="h-3 w-20 shrink-0" />
            <Shimmer className="ml-auto h-3 w-16 shrink-0" />
            <Shimmer className="h-3 w-10 shrink-0" />
            <Shimmer className="h-5 w-16 shrink-0" />
            <Shimmer className="h-3 w-6 shrink-0" />
            <Shimmer className="h-6 w-6 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

const ACTIVITY_ACTION_TYPE: Record<string, ActivityActionType> = {
  created: "create",
  updated: "update",
  price_change: "update",
  stock_change: "update",
  published: "status_change",
  archived: "status_change",
};

const ACTIVITY_TITLES: Record<string, string> = {
  created: "Product created",
  updated: "Product updated",
  price_change: "Price changed",
  stock_change: "Stock changed",
  published: "Published",
  archived: "Archived",
};

function initialsFromName(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "SY"
  );
}

function mapCollabActivityToEntry(row: CollabActivity, itemId: string): ActivityEntry {
  const actor = row.performed_by_name ?? (row.performed_by ? "Unknown user" : "System");
  let fieldChanges: ActivityEntry["fieldChanges"];
  if (row.action === "updated" && row.details?.changes && typeof row.details.changes === "object") {
    const changes = row.details.changes as Record<string, { old?: unknown; new?: unknown } | null>;
    fieldChanges = Object.entries(changes)
      .filter((entry): entry is [string, { old?: unknown; new?: unknown }] => Boolean(entry[1]))
      .map(([field, { old, new: next }]) => ({
        field,
        oldValue: old == null || old === "" ? "—" : String(old),
        newValue: next == null || next === "" ? "—" : String(next),
      }));
  } else if (row.action === "price_change" || row.action === "stock_change") {
    fieldChanges = [
      {
        field: row.action === "price_change" ? "price" : "stock",
        oldValue: row.old_value ?? "—",
        newValue: row.new_value ?? "—",
      },
    ];
  }
  return {
    id: row.id,
    entityType: "product",
    entityId: itemId,
    actionType: ACTIVITY_ACTION_TYPE[row.action] ?? "system",
    title: ACTIVITY_TITLES[row.action] ?? row.action,
    fieldChanges,
    actor,
    actorId: row.performed_by ?? undefined,
    actorInitials: initialsFromName(actor),
    at: row.created_at,
  };
}

async function loadRealProductActivity(itemId: string) {
  try {
    const res = await fetchCollabActivity("item", itemId, { limit: 100 });
    const entries = res.data.map((row) => mapCollabActivityToEntry(row, itemId));
    useActivityStore.getState().hydrateEntries("product", itemId, entries);
  } catch {
    // Leave whatever local entries already exist — the drawer still opens.
  }
}

function ProductMobileCardsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-input bg-card p-3"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <Shimmer className="h-12 w-12 shrink-0" />
          <div className="flex-1 space-y-2">
            <Shimmer className="h-3 w-3/5" />
            <Shimmer className="h-3 w-2/5" />
          </div>
          <Shimmer className="h-5 w-14 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

const COLUMN_KEYS = [
  "thumbnail",
  "productId",
  "sku",
  "model",
  "slug",
  "price",
  "purchasePrice",
  "lastSellingPrice",
  "offerPrice",
  "stock",
  "stockStatus",
  "status",
  "onWeb",
  "seoTitle",
  "brand",
  "category",
  "warranty",
  "alertQuantity",
  "unitType",
  "productType",
  "updatedAt",
] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  thumbnail: "Image",
  productId: "Product ID",
  sku: "SKU",
  model: "Model",
  slug: "Slug",
  price: "Price",
  purchasePrice: "Cost price",
  lastSellingPrice: "Last selling price",
  offerPrice: "Compare-at price",
  stock: "Stock",
  stockStatus: "Stock Status",
  status: "Status",
  onWeb: "Web",
  seoTitle: "SEO Title",
  brand: "Brand",
  category: "Category",
  warranty: "Warranty",
  alertQuantity: "Alert quantity",
  unitType: "Unit type",
  productType: "Product type",
  updatedAt: "Updated",
};

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  thumbnail: true,
  productId: false,
  sku: true,
  model: false,
  slug: false,
  price: true,
  purchasePrice: false,
  lastSellingPrice: false,
  offerPrice: false,
  stock: true,
  stockStatus: false,
  status: true,
  onWeb: true,
  seoTitle: false,
  brand: true,
  category: true,
  warranty: false,
  alertQuantity: false,
  unitType: false,
  productType: false,
  updatedAt: true,
};

const INVENTORY_COLUMN_KEYS: ColumnKey[] = [
  "thumbnail",
  "sku",
  "model",
  "category",
  "brand",
  "warranty",
  "alertQuantity",
  "unitType",
  "purchasePrice",
  "price",
  "lastSellingPrice",
  "stock",
  "productType",
];

const INVENTORY_DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  thumbnail: true,
  productId: false,
  sku: true,
  model: true,
  slug: false,
  price: true,
  purchasePrice: true,
  lastSellingPrice: true,
  offerPrice: false,
  stock: true,
  stockStatus: false,
  status: false,
  onWeb: false,
  seoTitle: false,
  brand: true,
  category: true,
  warranty: true,
  alertQuantity: true,
  unitType: true,
  productType: true,
  updatedAt: false,
};

const INVENTORY_DEFAULT_VISIBLE_FILTERS: Record<FilterVisibilityKey, boolean> = {
  search: true,
  website: false,
  status: false,
  category: true,
  brand: true,
  stockStatus: false,
  price: true,
};

const FILTER_VISIBILITY_KEYS = [
  "search",
  "website",
  "status",
  "category",
  "brand",
  "stockStatus",
  "price",
] as const;
type FilterVisibilityKey = (typeof FILTER_VISIBILITY_KEYS)[number];

const FILTER_LABELS: Record<FilterVisibilityKey, string> = {
  search: "Search",
  website: "Website",
  status: "Status",
  category: "Category",
  brand: "Brand",
  stockStatus: "Stock Status",
  price: "Price range",
};

const DEFAULT_VISIBLE_FILTERS: Record<FilterVisibilityKey, boolean> = {
  search: true,
  website: true,
  status: true,
  category: true,
  brand: true,
  stockStatus: true,
  price: false,
};

/* Live-edit parsers. AG Grid hands a typed cell back as a *string*, which used to reach the API client as a string
   (`price.toFixed is not a function`) so nothing was ever saved. These read what was typed ("৳ 1,250.50"), check it,
   and keep the old value (with a message) when it can't be used. */
/** one toast per message (AG Grid may call a parser more than once for a single edit) */
function liveEditError(message: string) {
  toast.error(message, { id: `live-edit:${message}` });
}

function typedNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const text = String(raw ?? "").replace(/[^\d.\-]/g, "");
  if (!text || text === "." || text === "-") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function numberParser(opts: {
  label: string;
  integer?: boolean;
  /** an empty cell clears the value (optional fields); otherwise it is refused */
  allowEmpty?: boolean;
  /** extra rule on the parsed number; return a message to refuse it */
  check?: (n: number, p: ValueParserParams<Product>) => string | null;
}) {
  return (p: ValueParserParams<Product>) => {
    const raw = typeof p.newValue === "string" ? p.newValue.trim() : p.newValue;
    if (raw === "" || raw == null) {
      if (opts.allowEmpty) return undefined;
      liveEditError(`${opts.label} can't be empty`);
      return p.oldValue;
    }
    const n = typedNumber(raw);
    if (n == null || n < 0) {
      liveEditError(`${opts.label} must be a number, zero or more`);
      return p.oldValue;
    }
    if (opts.integer && !Number.isInteger(n)) {
      liveEditError(`${opts.label} must be a whole number`);
      return p.oldValue;
    }
    const problem = opts.check?.(n, p);
    if (problem) {
      liveEditError(problem);
      return p.oldValue;
    }
    return opts.integer ? n : Math.round(n * 100) / 100;
  };
}

function textParser(label: string, opts: { required?: boolean } = {}) {
  return (p: ValueParserParams<Product>) => {
    const t = String(p.newValue ?? "").trim();
    if (!t && opts.required) {
      liveEditError(`${label} can't be empty`);
      return p.oldValue;
    }
    return t;
  };
}

const LIVE_EDIT_TOGGLES = [
  "sku",
  "model",
  "slug",
  "price",
  "offerPrice",
  "manageStock",
  "stock",
  "status",
  "category",
  "brand",
  "seoTitle",
  "purchasePrice",
  "warranty",
  "alertQuantity",
] as const;
type LiveEditKey = (typeof LIVE_EDIT_TOGGLES)[number];

const LIVE_EDIT_LABELS: Record<LiveEditKey, string> = {
  sku: "SKU",
  model: "Model",
  slug: "Slug",
  price: "Price",
  offerPrice: "Compare-at price",
  manageStock: "Manage stock",
  stock: "Stock",
  status: "Status",
  category: "Category",
  brand: "Brand",
  seoTitle: "SEO Title",
  purchasePrice: "Cost price",
  warranty: "Warranty",
  alertQuantity: "Alert quantity",
};

/** the table column each live-edit switch works on (switching one on shows that column) */
const LIVE_EDIT_COLUMN: Record<LiveEditKey, ColumnKey> = {
  sku: "sku",
  model: "model",
  slug: "slug",
  price: "price",
  offerPrice: "offerPrice",
  manageStock: "stock",
  stock: "stock",
  status: "status",
  category: "category",
  brand: "brand",
  seoTitle: "seoTitle",
  purchasePrice: "purchasePrice",
  warranty: "warranty",
  alertQuantity: "alertQuantity",
};

const DEFAULT_LIVE_EDIT: Record<LiveEditKey, boolean> = {
  sku: true,
  model: false,
  slug: false,
  price: true,
  offerPrice: false,
  manageStock: true,
  stock: true,
  status: true,
  category: false,
  brand: false,
  seoTitle: false,
  purchasePrice: false,
  warranty: false,
  alertQuantity: false,
};

function productCategoryNames(product: Product, categories: Category[]): string[] {
  const ids = product.categoryIds?.filter(Boolean) ?? [];
  if (ids.length > 0) {
    const names = ids
      .map((id) => categories.find((c) => c.id === id)?.name)
      .filter((n): n is string => Boolean(n));
    if (names.length) return names;
  }
  return product.category ? [product.category] : [];
}

function ProductCategoryCell({ product, categories }: { product: Product; categories: Category[] }) {
  const names = productCategoryNames(product, categories);
  if (names.length === 0) {
    return (
      <div className="flex h-full items-center text-muted-foreground">—</div>
    );
  }
  return (
    <div className="flex h-full flex-nowrap items-center gap-0.5 overflow-hidden">
      {names.map((name) => {
        const { label } = getProductCategoryDisplay(name, categories);
        return (
          <Badge
            key={name}
            variant="muted"
            className="max-w-[7rem] shrink-0 truncate"
            title={getCategoryBreadcrumbTitle(name, categories)}
          >
            {label}
          </Badge>
        );
      })}
    </div>
  );
}

function FilterDropdownSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div
      className="border-b border-input p-1"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-6 rounded-none pl-6 text-[11px]"
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}

function getCategoryBreadcrumbTitle(name: string, categories: Category[]) {
  const { label, parentPath } = getProductCategoryDisplay(name, categories);
  return parentPath ? `${parentPath} › ${label}` : label;
}

function CategoryFilterDropdown({
  value,
  onChange,
  categories,
}: {
  value: string;
  onChange: (value: string) => void;
  categories: Category[];
}) {
  return <CategoryTreeFilter categories={categories} value={value} onChange={onChange} />;
}

function BrandFilterDropdown({
  value,
  onChange,
  brands,
}: {
  value: string;
  onChange: (value: string) => void;
  brands: string[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredBrands = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return brands;
    return brands.filter((brand) => brand.toLowerCase().includes(q));
  }, [search, brands]);

  const selectValue = (next: string) => {
    onChange(next);
    setOpen(false);
    setSearch("");
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-[148px] justify-between gap-1 rounded-none px-2 text-left font-normal shadow-sm"
        >
          <span className="min-w-0 flex-1 truncate">
            {value === "all" ? "All brands" : value}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        avoidCollisions={false}
        className="w-[180px] overflow-hidden p-0"
      >
        <FilterDropdownSearch
          value={search}
          onChange={setSearch}
          placeholder="Search brand…"
        />
        <div className="max-h-60 overflow-y-auto p-1">
          <DropdownMenuItem
            className={cn("rounded-none", value === "all" && "bg-accent")}
            onClick={() => selectValue("all")}
          >
            <span>All brands</span>
          </DropdownMenuItem>
          {filteredBrands.length === 0 ? (
            <p className="px-2 py-2.5 text-[11px] text-muted-foreground">No brands found</p>
          ) : (
            filteredBrands.map((brand) => (
              <DropdownMenuItem
                key={brand}
                className={cn("rounded-none", value === brand && "bg-accent")}
                onClick={() => selectValue(brand)}
              >
                <span>{brand}</span>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatusBadge({ status }: { status: ProductStatus }) {
  const variant =
    status === "published" ? "success" : status === "draft" ? "warning" : "muted";
  return (
    <div className="flex h-full items-center overflow-hidden">
      <Badge variant={variant} className="max-w-[7rem] shrink-0 truncate capitalize leading-4">
        {status}
      </Badge>
    </div>
  );
}

function StockStatusBadge({ status }: { status: StockStatusLabel }) {
  const variant =
    status === "In Stock"
      ? "success"
      : status === "Coming Soon"
        ? "warning"
        : status === "Pre-order"
          ? "default"
          : "muted";
  return (
    <div className="flex h-full items-center overflow-hidden">
      <Badge variant={variant} className="max-w-[7rem] shrink-0 truncate leading-4">
        {status}
      </Badge>
    </div>
  );
}

function ProductStockCell({
  product,
  canEditManage,
  onToggleManage,
}: {
  product: Product;
  canEditManage: boolean;
  onToggleManage: (product: Product, trackQuantity: boolean) => void;
}) {
  const tracking = product.trackQuantity !== false;
  return (
    <div className="flex h-full items-center gap-1.5">
      <input
        type="checkbox"
        checked={tracking}
        disabled={!canEditManage}
        aria-label="Manage stock"
        title={tracking ? "Manage stock on" : "Manage stock off"}
        className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary disabled:cursor-not-allowed disabled:opacity-40"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation();
          onToggleManage(product, e.target.checked);
        }}
      />
      <span className={cn("tabular-nums", !tracking && "text-muted-foreground")}>
        {formatQuantity(product.stock)}
      </span>
    </div>
  );
}

type FilterState = {
  search: string;
  website: string;
  status: string;
  category: string;
  brand: string;
  stockStatus: string;
  priceMin: string;
  priceMax: string;
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  website: "all",
  status: "all",
  category: "all",
  brand: "all",
  stockStatus: "all",
  priceMin: "",
  priceMax: "",
};

function countAdvancedFilters(f: FilterState) {
  let n = 0;
  if (f.category !== "all") n++;
  if (f.brand !== "all") n++;
  if (f.stockStatus !== "all") n++;
  if (f.priceMin) n++;
  if (f.priceMax) n++;
  return n;
}

function applyFilters(rows: Product[], f: FilterState, categories: Category[]) {
  const q = f.search.toLowerCase();
  const min = f.priceMin ? Number(f.priceMin) : null;
  const max = f.priceMax ? Number(f.priceMax) : null;

  return rows.filter((p) => {
    if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false;
    if (f.website === "on" && !isProductOnWebsite(p, categories)) return false;
    if (f.website === "off" && isProductOnWebsite(p, categories)) return false;
    if (f.status !== "all" && p.status !== f.status) return false;
    if (f.category !== "all") {
      // a parent category also lists the products filed under its sub-categories
      const wanted = categoryNamesWithDescendants(f.category, categories);
      const names = productCategoryNames(p, categories);
      if (!names.some((n) => wanted.has(n)) && !wanted.has(p.category)) return false;
    }
    if (f.brand !== "all" && p.brand !== f.brand) return false;
    if (f.stockStatus !== "all" && p.stockStatus !== f.stockStatus) return false;
    if (min !== null && p.price < min) return false;
    if (max !== null && p.price > max) return false;
    return true;
  });
}

type ProductGridPreset = "catalog" | "inventory";

type Props = {
  onEdit: (product: Product) => void;
  onView: (product: Product) => void;
  /** Where the name cell click goes — defaults to edit (view for read-only users). */
  nameClickAction?: "edit" | "view";
  /** Clicking anywhere else on a row opens the view drawer (default). Off where rows hold
   *  their own controls (Price Compare: links, sync buttons) — then only the name opens it. */
  rowClickOpensView?: boolean;
  products: Product[];
  categories?: Category[];
  loading?: boolean;
  onProductsChanged?: () => void;
  onAdvancedFilterCountChange?: (count: number) => void;
  footerLeftActions?: ReactNode;
  /** Fixed left toolbar actions (e.g. New). */
  headerLeftActions?: ReactNode;
  className?: string;
  /** Inventory catalog shows Add-product fields only. */
  preset?: ProductGridPreset;
  /** Price Compare plugin: the enabled competitor websites to show a column per — user-managed, fetched from the plugin's settings. */
  competitors?: { key: PriceUpdateCompetitor; label: string }[];
  /** Separate saved column layout for this screen (Price Compare keeps its own). */
  columnStateKey?: string;
  /** Hide the catalogue bulk actions (publish / remove from website, archive, delete, export)
   * — Price Compare's bulk bar is only about competitor prices. */
  hideCatalogBulkActions?: boolean;
  /** Website product list: bulk "Add to Inventory" (inventory has its own catalog, so this is explicit). */
  onAddToInventory?: (selected: Product[]) => void | Promise<void>;
  /** false while columns are still being added (Price Compare's sites) — the grid stays
   * invisible until then so the saved layout applies without columns jumping. */
  layoutReady?: boolean;
  /** Price Compare plugin: when set, appends one price column per entry in `competitors`, keyed by product id. */
  competitorMatches?: Record<string, PriceUpdateMatch[]>;
  /** Price Compare plugin: re-check one product/competitor pair from its cell's retry button. */
  onSyncCompetitor?: (productId: string, competitor: PriceUpdateCompetitor) => void | Promise<void>;
  /** Price Compare plugin: bulk-check only the selected rows — wired into the same
   * selection bar as Publish/Archive/Delete, so it works with filter + "select all" too. */
  onBulkCheckCompetitorPrices?: (selected: Product[]) => void;
  /** Sites the bulk check covers when not all of them ("Ryans, Techland"), shown on the button. */
  bulkCheckSitesLabel?: string;
  /** Tick or untick many cells at once (a column header's select-all). */
  onSetCellPicks?: (keys: string[], picked: boolean) => void;
  /** Cells ticked for a bulk check, as `${productId}::${competitor}`. */
  pickedCells?: Set<string>;
  onToggleCellPick?: (productId: string, competitor: PriceUpdateCompetitor) => void;
  onCheckPickedCells?: () => void;
  /** Copy the picked cells' competitor price / stock into our catalog (opens a confirm). */
  onApplyPicked?: (field: "price" | "stock") => void;
  onClearCellPicks?: () => void;
  /** A bulk price check is running (shows Stop in the bulk bar). */
  bulkRunning?: boolean;
  onStopBulk?: () => void;
  /** Price Compare plugin: `${productId}::${competitor}` keys currently being fetched by
   * an in-progress bulk check — spins that cell's sync icon live as the batch works through it. */
  competitorSyncingKeys?: Set<string>;
  /** Product Draft: when set, adds an AI column — its icon fills that draft product from its source URL (the AI chat's
   * import logic). Disabled for a row without a source URL. */
  onAiImport?: (product: Product) => void | Promise<void>;
  /** ids whose AI import is running right now (spins the icon) */
  aiImportingIds?: Set<string>;
  /** Price Compare plugin: save a manually-pasted product-page URL for one product/competitor
   * pair, then re-check the price from it — the fallback for when search (Google + AI) still
   * can't find the right page on that site. */
  onSetManualUrl?: (
    productId: string,
    competitor: PriceUpdateCompetitor,
    url: string,
    verified: boolean,
  ) => void | Promise<void>;
};

export type ProductGridHandle = {
  openFilters: () => void;
  openLiveEdit: () => void;
  openColumns: () => void;
  /** Same row-menu actions (incl. the archive confirm) for the product drawer's More menu. */
  duplicate: (product: Product) => void;
  archive: (product: Product) => void;
  /** Ids of the rows currently shown — after the search box and filters — in display order. */
  getShownProductIds: () => string[];
};

export const ProductGrid = forwardRef<ProductGridHandle, Props>(function ProductGrid({
  onEdit,
  onView,
  nameClickAction = "edit",
  rowClickOpensView = true,
  products,
  categories = defaultCategoriesFlat,
  loading = false,
  onProductsChanged,
  onAdvancedFilterCountChange,
  footerLeftActions,
  headerLeftActions,
  className,
  preset = "catalog",
  competitors: competitorsProp,
  onAiImport,
  aiImportingIds,
  columnStateKey,
  hideCatalogBulkActions,
  layoutReady,
  competitorMatches: competitorMatchesProp,
  onSyncCompetitor: onSyncCompetitorProp,
  onBulkCheckCompetitorPrices,
  onAddToInventory,
  bulkCheckSitesLabel,
  onSetCellPicks,
  pickedCells,
  onToggleCellPick,
  onCheckPickedCells,
  onApplyPicked,
  onClearCellPicks,
  bulkRunning,
  onStopBulk,
  competitorSyncingKeys: competitorSyncingKeysProp,
  onSetManualUrl: onSetManualUrlProp,
}, ref) {
  const canWrite = useAdminCanWrite();
  const companyFormat = useCompanyFormatStore((s) => s.format);
  const filterCategories = useMemo(
    () => categories.filter((c) => c.active).sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );
  const categoryNames = useMemo(() => filterCategories.map((c) => c.name), [filterCategories]);
  const priceCeiling = useMemo(() => {
    if (products.length === 0) return DEFAULT_PRICE_CEILING;
    return Math.ceil(Math.max(...products.map((p) => p.price)) / 1000) * 1000;
  }, [products]);
  const brands = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) if (p.brand) set.add(p.brand);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [products]);
  const [rowData, setRowData] = useState(products);

  useEffect(() => {
    setRowData(products);
  }, [products]);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [liveEditSheetOpen, setLiveEditSheetOpen] = useState(false);
  const [printLabelProduct, setPrintLabelProduct] = useState<Product | null>(null);
  const isInventory = preset === "inventory";
  // The plain Products list shows the same Source column as Price Compare (company | price, stock dot, re-check, link) for the page on
  // screen; the Price Compare screens pass their own competitor columns and keep them.
  const srcCompare = useGridSourceCompare(!isInventory && !competitorsProp);
  const competitors = competitorsProp ?? srcCompare.competitors;
  const competitorMatches = competitorMatchesProp ?? (competitorsProp ? undefined : srcCompare.matches);
  const onSyncCompetitor = onSyncCompetitorProp ?? (competitorsProp ? undefined : srcCompare.onSync);
  const competitorSyncingKeys = competitorSyncingKeysProp ?? (competitorsProp ? undefined : srcCompare.syncingKeys);
  const onSetManualUrl = onSetManualUrlProp ?? (competitorsProp ? undefined : srcCompare.onSetManualUrl);
  const [visibleCols, setVisibleCols] = useUserScopedState(
    isInventory ? "inventory-catalog-grid:columns" : "product-grid:columns",
    isInventory ? INVENTORY_DEFAULT_VISIBLE : DEFAULT_VISIBLE,
  );
  const [visibleFilters, setVisibleFilters] = useUserScopedState(
    isInventory ? "inventory-catalog-grid:filters" : "product-grid:filters",
    isInventory ? INVENTORY_DEFAULT_VISIBLE_FILTERS : DEFAULT_VISIBLE_FILTERS,
  );
  const resolvedVisibleFilters = useMemo(
    () => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFilters }),
    [visibleFilters],
  );
  const [liveEdit, setLiveEdit] = useUserScopedState(
    "product-grid:live-edit",
    DEFAULT_LIVE_EDIT,
  );
  const resolvedLiveEdit = useMemo(
    () => ({ ...DEFAULT_LIVE_EDIT, ...liveEdit }),
    [liveEdit],
  );
  // Column drag-reorder and resize — persisted per admin user (like visibleCols/liveEdit
  // above) so a layout someone drags into place survives a reload instead of resetting to
  // the colDef defaults every time. Only colId + width are saved/restored, never hide —
  // that stays owned by the visibleCols toggle system above so the two don't fight.
  const [savedColumnState, setSavedColumnState, savedColumnStateLoaded] = useUserScopedState<
    { colId: string; width?: number }[]
  >(
    columnStateKey ?? (isInventory ? "inventory-catalog-grid:columnState" : "product-grid:columnState"),
    [],
    // Saved on the server per admin, so the layout follows them to any browser/device.
    { sync: true },
  );
  const gridApiRef = useRef<GridApi<Product> | null>(null);
  // Ids of the rows on screen (search + filters), read lazily by the competitor headers.
  const shownIdsRef = useRef<() => string[]>(() => []);
  const savedColumnNameWidth = useMemo(
    () => savedColumnState.find((c) => c.colId === "name")?.width ?? null,
    [savedColumnState],
  );
  const persistColumnState = useCallback(() => {
    const api = gridApiRef.current;
    if (!api) return;
    const current: { colId: string; width?: number }[] = api
      .getColumnState()
      .map((c: ColumnState) => ({ colId: c.colId, width: c.width ?? undefined }));
    // Columns saved earlier but not in the grid right now (e.g. Price Compare's site columns while
    // they're still loading) keep their place instead of being dropped from the saved layout.
    setSavedColumnState((prev) => {
      const present = new Set(current.map((c) => c.colId));
      const merged = [...current];
      prev.forEach((entry, i) => {
        if (present.has(entry.colId)) return;
        let at = 0;
        for (let j = i - 1; j >= 0; j--) {
          const k = merged.findIndex((c) => c.colId === prev[j].colId);
          if (k >= 0) {
            at = k + 1;
            break;
          }
        }
        merged.splice(at, 0, entry);
      });
      return merged;
    });
  }, [setSavedColumnState]);
  // Re-applies whenever the persisted value changes — covers both "grid was already ready
  // when localStorage finished hydrating" and (harmlessly, idempotently) our own saves above.
  useEffect(() => {
    const api = gridApiRef.current;
    if (!api || savedColumnState.length === 0) return;
    api.setGridOption("suppressColumnMoveAnimation", true);
    api.applyColumnState({ state: withoutFlex(savedColumnState), applyOrder: true });
    requestAnimationFrame(() => api.setGridOption("suppressColumnMoveAnimation", false));
  }, [savedColumnState]);
  // Price Compare's competitor columns arrive after the grid is ready (the site list loads
  // separately), so the saved order was applied before they existed and they landed at the
  // end. Re-apply once they're in the grid so a dragged position (e.g. Startech next to
  // Price) survives a reload.
  const competitorColKeys = (competitors ?? []).map((c) => c.key).join(",");
  useEffect(() => {
    if (!competitorColKeys || savedColumnState.length === 0) return;
    const handle = window.setTimeout(() => {
      const api = gridApiRef.current;
      if (!api) return;
      api.setGridOption("suppressColumnMoveAnimation", true);
      api.applyColumnState({ state: withoutFlex(savedColumnState), applyOrder: true });
      requestAnimationFrame(() => api.setGridOption("suppressColumnMoveAnimation", false));
    }, 0);
    return () => window.clearTimeout(handle);
    // savedColumnState changes are handled by the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitorColKeys]);

  // Drag-reorder inside the Columns panel: the panel's row order tracks the
  // grid's actual (persisted) column order for just the toggleable columns,
  // and dragging a row there reorders the real grid columns the same way
  // dragging a header would — both go through the same savedColumnState.
  const toggleKeys = useMemo<readonly ColumnKey[]>(
    () => (isInventory ? INVENTORY_COLUMN_KEYS : COLUMN_KEYS),
    [isInventory],
  );
  const computeToggleOrder = useCallback((): ColumnKey[] => {
    const api = gridApiRef.current;
    const keySet = new Set<string>(toggleKeys);
    if (!api) return [...toggleKeys];
    const seen = new Set<string>();
    const ordered: ColumnKey[] = [];
    for (const c of api.getColumnState()) {
      if (keySet.has(c.colId) && !seen.has(c.colId)) {
        ordered.push(c.colId as ColumnKey);
        seen.add(c.colId);
      }
    }
    for (const k of toggleKeys) if (!seen.has(k)) ordered.push(k);
    return ordered;
  }, [toggleKeys]);
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(() => [...toggleKeys]);
  useEffect(() => {
    if (!columnSheetOpen) return;
    setColumnOrder(computeToggleOrder());
  }, [columnSheetOpen, computeToggleOrder]);
  const applyPanelColumnOrder = useCallback(
    (next: ColumnKey[]) => {
      const api = gridApiRef.current;
      if (!api) return;
      const current = api.getColumnState();
      const nextSet = new Set<string>(next);
      const queue = [...next];
      const reordered = current.map((c) => {
        if (!nextSet.has(c.colId)) return c;
        const wantedId = queue.shift();
        return current.find((x) => x.colId === wantedId) ?? c;
      });
      api.applyColumnState({ state: reordered, applyOrder: true });
      persistColumnState();
    },
    [persistColumnState],
  );
  const dragColumnKeyRef = useRef<ColumnKey | null>(null);
  const reorderColumnPanel = useCallback(
    (from: ColumnKey, to: ColumnKey) => {
      if (from === to) return;
      setColumnOrder((order) => {
        const next = order.filter((k) => k !== from);
        const idx = next.indexOf(to);
        next.splice(idx === -1 ? next.length : idx, 0, from);
        applyPanelColumnOrder(next);
        return next;
      });
    },
    [applyPanelColumnOrder],
  );
  const [selected, setSelected] = useState<Product[]>([]);
  const [starred, setStarred] = useState<Record<string, boolean>>({});
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveTargets, setArchiveTargets] = useState<Product[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<Product[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [manualUrlTarget, setManualUrlTarget] = useState<{
    productId: string;
    productName: string;
    competitor: PriceUpdateCompetitor;
    competitorLabel: string;
    currentUrl: string;
    verified: boolean;
    verifiedBy: string | null;
    verifiedAt: string | null;
  } | null>(null);
  const [manualUrlValue, setManualUrlValue] = useState("");
  const [manualUrlVerified, setManualUrlVerified] = useState(false);
  const [manualUrlSaving, setManualUrlSaving] = useState(false);

  const filtered = useMemo(() => applyFilters(rowData, filters, categories), [rowData, filters, categories]);
  shownIdsRef.current = () => {
    const api = gridApiRef.current;
    if (!api) return filtered.map((p) => p.id);
    const ids: string[] = [];
    // the header tick box of a competitor column (Source, Startech ...) works page by page: only the rows on the page being looked at
    if (api.getGridOption("pagination")) {
      const size = api.paginationGetPageSize();
      const start = api.paginationGetCurrentPage() * size;
      const end = Math.min(start + size, api.getDisplayedRowCount());
      for (let i = start; i < end; i += 1) {
        const node = api.getDisplayedRowAtIndex(i);
        if (node?.data) ids.push(node.data.id);
      }
      return ids;
    }
    api.forEachNodeAfterFilterAndSort((node) => {
      if (node.data) ids.push(node.data.id);
    });
    return ids;
  };
  const advancedCount = countAdvancedFilters(filters);

  useEffect(() => {
    onAdvancedFilterCountChange?.(advancedCount);
  }, [advancedCount, onAdvancedFilterCountChange]);

  const archiveProducts = useCallback(
    async (targets: Product[]) => {
      try {
        await archiveCatalogProducts(targets.map((t) => t.id));
        setRowData((rows) =>
          rows.map((r) =>
            targets.some((t) => t.id === r.id) ? { ...r, status: "archived" as ProductStatus } : r,
          ),
        );
        toast.success(`Archived ${targets.length} product${targets.length > 1 ? "s" : ""}`);
        onProductsChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to archive products");
      } finally {
        setArchiveOpen(false);
        setArchiveTargets([]);
        setSelected([]);
      }
    },
    [onProductsChanged],
  );

  const openArchiveConfirm = useCallback((targets: Product[]) => {
    setArchiveTargets(targets);
    setArchiveOpen(true);
  }, []);

  const openDeleteConfirm = useCallback((targets: Product[]) => {
    setDeleteTargets(targets);
    setDeleteOpen(true);
  }, []);

  const deleteProducts = useCallback(
    async (targets: Product[]) => {
      if (!targets.length) return;
      setDeleting(true);
      try {
        const results = await Promise.allSettled(
          targets.map((t) => deleteCatalogProduct(t.id)),
        );
        const failed = results.filter((r) => r.status === "rejected").length;
        const removedIds = new Set(
          targets
            .filter((_, i) => results[i]?.status === "fulfilled")
            .map((t) => t.id),
        );
        setRowData((rows) => rows.filter((r) => !removedIds.has(r.id)));
        const ok = removedIds.size;
        if (ok) {
          toast.success(`Deleted ${ok} product${ok > 1 ? "s" : ""}`);
        }
        if (failed) {
          toast.error(`${failed} product${failed > 1 ? "s" : ""} could not be deleted`);
        }
        onProductsChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete products");
      } finally {
        setDeleting(false);
        setDeleteOpen(false);
        setDeleteTargets([]);
        setSelected([]);
      }
    },
    [onProductsChanged],
  );

  const duplicateProduct = useCallback(
    async (target: Product) => {
      try {
        await duplicateCatalogProduct(target.id);
        toast.success(`Duplicated "${target.name}"`);
        onProductsChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to duplicate product");
      }
    },
    [onProductsChanged],
  );

  useImperativeHandle(
    ref,
    () => ({
      openFilters: () => setFilterSheetOpen(true),
      openLiveEdit: () => setLiveEditSheetOpen(true),
      openColumns: () => setColumnSheetOpen(true),
      duplicate: (product: Product) => void duplicateProduct(product),
      archive: (product: Product) => openArchiveConfirm([product]),
      getShownProductIds: () => {
        const api = gridApiRef.current;
        if (!api) return filtered.map((p) => p.id);
        const ids: string[] = [];
        api.forEachNodeAfterFilterAndSort((node) => {
          if (node.data) ids.push(node.data.id);
        });
        return ids;
      },
    }),
    [duplicateProduct, openArchiveConfirm, filtered],
  );

  const ProductRowMenu = useCallback(
    ({ data }: { data: Product }) => {
      const openDrawer = useActivityStore.getState().openDrawer;
      return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowActionsTrigger />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => onView(data)}>
            <Eye className="mr-1.5 h-3 w-3" /> View
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              const itemId = data.itemId ?? data.id;
              openDrawer({
                type: "product",
                id: itemId,
                label: data.name,
                subtitle: `SKU ${data.sku}`,
              });
              void loadRealProductActivity(itemId);
            }}
          >
            <ClipboardList className="mr-1.5 h-3 w-3" /> Activity
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPrintLabelProduct(data)}>
            <Printer className="mr-1.5 h-3 w-3" /> Print Label
          </DropdownMenuItem>
          {canWrite && (
            <>
              <DropdownMenuItem onClick={() => onEdit(data)}>
                <Pencil className="mr-1.5 h-3 w-3" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void duplicateProduct(data)}>
                <Copy className="mr-1.5 h-3 w-3" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => openDeleteConfirm([data])}
                className="text-destructive"
              >
                <Trash2 className="mr-1.5 h-3 w-3" /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      );
    },
    [onView, onEdit, openDeleteConfirm, duplicateProduct, canWrite],
  );

  const ProductControlsCell = useCallback(
    (p: ICellRendererParams<Product>) => {
      if (!p.data) return null;
      const on = Boolean(starred[p.data.id]);
      return (
        <div className="flex h-full items-center">
          <button
            type="button"
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={on ? "Unfavorite" : "Favorite"}
            onClick={(e) => {
              e.stopPropagation();
              setStarred((prev) => ({ ...prev, [p.data!.id]: !prev[p.data!.id] }));
            }}
          >
            <Star
              className={cn("h-3 w-3", on && "fill-amber-400 text-amber-400")}
              aria-hidden
            />
          </button>
        </div>
      );
    },
    [starred],
  );

  // ProductStockCell reads `trackQuantity`, a field the "stock" column's own
  // value (the numeric quantity) doesn't watch — ag-Grid's row-update diffing
  // only refreshes a cell when its own field's value changes, so it silently
  // skips this cell on toggle. Force a refresh via an effect (not inline in
  // the click handler) so it runs after the new row data has actually landed
  // in the grid's row model, not before.
  const [stockRefreshTick, setStockRefreshTick] = useState<{ id: string; n: number } | null>(null);
  useEffect(() => {
    if (!stockRefreshTick) return;
    const api = gridApiRef.current;
    const node = api?.getRowNode(stockRefreshTick.id);
    if (!api || !node) return;
    api.refreshCells({ rowNodes: [node], columns: ["stock"], force: true });
  }, [stockRefreshTick]);
  const refreshStockCell = useCallback((productId: string) => {
    setStockRefreshTick((t) => ({ id: productId, n: (t?.n ?? 0) + 1 }));
  }, []);

  const toggleManageStock = useCallback(
    (product: Product, trackQuantity: boolean) => {
      setRowData((rows) =>
        rows.map((r) => (r.id === product.id ? { ...r, trackQuantity } : r)),
      );
      refreshStockCell(product.id);
      if (!canWrite) return;
      void (async () => {
        try {
          await updateCatalogProduct(product.id, { track_quantity: trackQuantity });
          toast.success(
            trackQuantity
              ? `Manage stock on for ${product.sku}`
              : `Manage stock off for ${product.sku}`,
          );
        } catch (err) {
          setRowData((rows) =>
            rows.map((r) =>
              r.id === product.id
                ? { ...r, trackQuantity: product.trackQuantity !== false }
                : r,
            ),
          );
          refreshStockCell(product.id);
          toast.error(err instanceof Error ? err.message : "Update failed");
        }
      })();
    },
    [canWrite, refreshStockCell],
  );

  const columnDefs = useMemo<ColDef<Product>[]>(
    () => [
      {
        colId: "actions",
        headerName: "",
        width: 26,
        maxWidth: 26,
        minWidth: 26,
        pinned: "left",
        resizable: false,
        suppressMovable: true,
        suppressHeaderMenuButton: true,
        suppressSizeToFit: true,
        sortable: false,
        headerClass: "product-grid-actions-col",
        cellClass: "product-grid-actions-col",
        headerComponent: GridFullscreenHeader,
        cellRenderer: (p: ICellRendererParams<Product>) =>
          p.data ? <ProductRowMenu data={p.data} /> : null,
      },
      {
        colId: "controls",
        headerName: "",
        headerCheckboxSelection: canWrite,
        checkboxSelection: canWrite,
        width: canWrite ? 40 : 24,
        maxWidth: canWrite ? 40 : 24,
        minWidth: canWrite ? 40 : 24,
        pinned: "left",
        resizable: false,
        suppressMovable: true,
        suppressHeaderMenuButton: true,
        suppressSizeToFit: true,
        sortable: false,
        headerClass: "product-grid-controls-col",
        cellClass: "product-grid-controls-col",
        cellRenderer: ProductControlsCell,
      },
      {
        colId: "productId",
        field: "id",
        headerName: "Product ID",
        hide: !visibleCols.productId,
        pinned: "left",
        width: 100,
        minWidth: 88,
        resizable: true,
        suppressMovable: true,
        suppressSizeToFit: true,
        sortable: false,
        suppressHeaderMenuButton: true,
      },
      {
        colId: "thumbnail",
        field: "thumbnail",
        headerName: "",
        width: 28,
        maxWidth: 28,
        hide: !visibleCols.thumbnail,
        resizable: false,
        suppressMovable: true,
        suppressSizeToFit: true,
        sortable: false,
        suppressHeaderMenuButton: true,
        cellClass: "product-grid-icon-col",
        cellRenderer: (p: ICellRendererParams<Product>) =>
          p.data ? (
            p.data.thumbnail ? (
              <img
                src={p.data.thumbnail}
                alt=""
                className="h-5 w-5 rounded-none object-cover"
                onError={applyImageFallback}
              />
            ) : (
              <span
                className="flex h-5 w-5 items-center justify-center bg-muted text-muted-foreground"
                title="No image"
                aria-label="No image"
              >
                <ImageOff className="h-3 w-3" />
              </span>
            )
          ) : null,
      },
      {
        field: "name",
        headerName: isInventory ? "Product" : "Name",
        // Flex (fill remaining space) is the nicer default for a fresh grid, but AG Grid
        // doesn't reliably honor a restored fixed width from column state on a flex column —
        // it keeps recomputing from the flex ratio instead. Once the user has actually
        // customized column widths (a saved state exists), switch this column to a plain
        // fixed width too so the persisted layout — this column included — sticks after reload.
        ...(savedColumnNameWidth != null
          ? { width: savedColumnNameWidth }
          : { flex: 2 }),
        minWidth: 160,
        resizable: true,
        suppressMovable: false,
        editable: false,
        tooltipField: "name",
        cellRenderer: (p: ICellRendererParams<Product>) =>
          p.data ? (
            <button
              type="button"
              className="block w-full cursor-pointer truncate text-left font-semibold text-foreground no-underline hover:text-primary hover:no-underline focus-visible:outline-none"
              title={p.data.name}
              onClick={(e) => {
                e.stopPropagation();
                if (canWrite && nameClickAction === "edit") onEdit(p.data!);
                else onView(p.data!);
              }}
            >
              {p.data.name}
            </button>
          ) : null,
      },
      {
        field: "sku",
        headerName: "SKU",
        hide: isInventory ? false : !visibleCols.sku,
        editable: canWrite && resolvedLiveEdit.sku,
        cellClass: canWrite && resolvedLiveEdit.sku ? "live-edit-cell" : undefined,
        valueParser: textParser("SKU", { required: true }),
        width: 130,
        minWidth: 110,
      },
      {
        field: "model",
        headerName: "Model",
        hide: !visibleCols.model,
        editable: canWrite && resolvedLiveEdit.model,
        cellClass: canWrite && resolvedLiveEdit.model ? "live-edit-cell" : undefined,
        width: 120,
        minWidth: 80,
        valueGetter: (p) => p.data?.model ?? "",
        valueSetter: (p) => {
          if (!p.data) return false;
          p.data.model = String(p.newValue ?? "").trim();
          return true;
        },
      },
      {
        field: "slug",
        headerName: "Slug",
        hide: !visibleCols.slug,
        editable: canWrite && resolvedLiveEdit.slug,
        width: 180,
        minWidth: 120,
        cellEditor: resolvedLiveEdit.slug ? SlugCellEditor : undefined,
        cellClassRules: slugCellClassRules,
      },
      {
        field: "price",
        headerName: isInventory ? "Sales price" : "Price",
        hide: !visibleCols.price,
        editable: canWrite && resolvedLiveEdit.price,
        cellClass: canWrite && resolvedLiveEdit.price ? "live-edit-cell" : undefined,
        valueParser: numberParser({ label: "Price" }),
        width: 120,
        minWidth: 110,
        valueFormatter: (p) => formatCurrency(p.value ?? 0),
      },
      {
        field: "offerPrice",
        headerName: "Compare-at price",
        hide: !visibleCols.offerPrice,
        editable: canWrite && resolvedLiveEdit.offerPrice,
        cellClass: canWrite && resolvedLiveEdit.offerPrice ? "live-edit-cell" : undefined,
        // the struck-through "was" price: blank removes it; otherwise it must be above the selling price
        valueParser: numberParser({
          label: "Compare-at price",
          allowEmpty: true,
          check: (n, p) =>
            n > (p.data?.price ?? 0)
              ? null
              : "Compare-at price is the old, struck-through price: it must be higher than the selling price",
        }),
        width: 130,
        minWidth: 110,
        valueGetter: (p) =>
          p.data?.offerPrice ?? p.data?.compareAtPrice ?? null,
        valueSetter: (p) => {
          if (!p.data) return false;
          const raw = p.newValue;
          const num =
            raw === "" || raw == null || Number.isNaN(Number(raw))
              ? undefined
              : Number(raw);
          p.data.offerPrice = num;
          p.data.compareAtPrice = num;
          return true;
        },
        valueFormatter: (p) =>
          p.value != null && p.value !== "" ? formatCurrency(Number(p.value)) : "—",
      },
      {
        field: "stock",
        headerName: "Stock",
        hide: !visibleCols.stock,
        editable: (p) =>
          Boolean(canWrite && resolvedLiveEdit.stock && p.data?.trackQuantity !== false),
        valueParser: numberParser({ label: "Stock", integer: true }),
        width: 100,
        minWidth: 88,
        cellRenderer: (p: ICellRendererParams<Product>) =>
          p.data ? (
            <ProductStockCell
              product={p.data}
              canEditManage={canWrite && resolvedLiveEdit.manageStock}
              onToggleManage={toggleManageStock}
            />
          ) : null,
        cellClass: (p) =>
          canWrite && resolvedLiveEdit.stock && p.data?.trackQuantity !== false
            ? ["product-grid-stock-col", "live-edit-cell"]
            : "product-grid-stock-col",
      },
      {
        field: "stockStatus",
        headerName: "Stock Status",
        hide: !visibleCols.stockStatus,
        editable: false,
        cellRenderer: (p: ICellRendererParams<Product>) =>
          p.data ? <StockStatusBadge status={p.data.stockStatus} /> : null,
        width: 120,
      },
      {
        field: "status",
        headerName: "Status",
        hide: !visibleCols.status,
        editable: canWrite && resolvedLiveEdit.status,
        cellClass: canWrite && resolvedLiveEdit.status ? "live-edit-cell" : undefined,
        cellEditor: resolvedLiveEdit.status ? "agSelectCellEditor" : undefined,
        cellEditorParams: resolvedLiveEdit.status
          ? { values: ["draft", "published", "archived"] }
          : undefined,
        cellRenderer: (p: ICellRendererParams<Product>) =>
          p.data ? <StatusBadge status={p.data.status} /> : null,
        width: 110,
      },
      {
        colId: "onWeb",
        headerName: "Web",
        hide: !visibleCols.onWeb,
        width: 64,
        maxWidth: 72,
        sortable: true,
        valueGetter: (p) => (p.data && isProductOnWebsite(p.data, categories) ? 1 : 0),
        cellRenderer: (p: ICellRendererParams<Product>) =>
          p.data ? <WebsiteBadge product={p.data} /> : null,
        cellClass: "product-grid-icon-col",
      },
      {
        field: "seoTitle",
        headerName: "SEO Title",
        hide: !visibleCols.seoTitle,
        editable: canWrite && resolvedLiveEdit.seoTitle,
        cellClass: canWrite && resolvedLiveEdit.seoTitle ? "live-edit-cell" : undefined,
        width: 220,
        minWidth: 140,
        tooltipField: "seoTitle",
      },
      {
        field: "category",
        headerName: "Category",
        width: 140,
        hide: !visibleCols.category,
        editable: canWrite && resolvedLiveEdit.category,
        cellEditor: resolvedLiveEdit.category ? "agSelectCellEditor" : undefined,
        cellEditorParams: resolvedLiveEdit.category ? { values: categoryNames } : undefined,
        cellRenderer: (p: ICellRendererParams<Product>) =>
          p.data ? <ProductCategoryCell product={p.data} categories={categories} /> : null,
        valueGetter: (p) =>
          p.data ? productCategoryNames(p.data, categories).join(", ") : "",
        cellClass:
          canWrite && resolvedLiveEdit.category
            ? ["product-grid-category-col", "live-edit-cell"]
            : "product-grid-category-col",
      },
      {
        field: "brand",
        headerName: "Brand",
        width: 100,
        hide: !visibleCols.brand,
        editable: canWrite && resolvedLiveEdit.brand,
        cellClass: canWrite && resolvedLiveEdit.brand ? "live-edit-cell" : undefined,
        cellEditor: resolvedLiveEdit.brand ? "agSelectCellEditor" : undefined,
        cellEditorParams: resolvedLiveEdit.brand ? { values: brands } : undefined,
      },
      {
        field: "warranty",
        headerName: "Warranty",
        hide: !visibleCols.warranty,
        editable: canWrite && resolvedLiveEdit.warranty,
        cellClass: canWrite && resolvedLiveEdit.warranty ? "live-edit-cell" : undefined,
        valueParser: textParser("Warranty"),
        width: 110,
        minWidth: 80,
        valueGetter: (p) => p.data?.warranty?.trim() || "",
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
      {
        field: "alertQuantity",
        headerName: "Alert quantity",
        hide: !visibleCols.alertQuantity,
        editable: canWrite && resolvedLiveEdit.alertQuantity,
        cellClass: canWrite && resolvedLiveEdit.alertQuantity ? "live-edit-cell" : undefined,
        valueParser: numberParser({ label: "Alert quantity", integer: true }),
        width: 110,
        minWidth: 80,
        valueGetter: (p) => p.data?.alertQuantity ?? 0,
        valueFormatter: (p) => formatQuantity(p.value, "0"),
      },
      {
        field: "unitType",
        headerName: "Unit type",
        hide: !visibleCols.unitType,
        width: 100,
        minWidth: 80,
        valueGetter: (p) => p.data?.unitType ?? "",
        valueFormatter: (p) => (p.value ? unitTypeLabel(String(p.value)) : "—"),
      },
      {
        field: "purchasePrice",
        headerName: "Cost price",
        hide: !visibleCols.purchasePrice,
        editable: canWrite && resolvedLiveEdit.purchasePrice,
        cellClass: canWrite && resolvedLiveEdit.purchasePrice ? "live-edit-cell" : undefined,
        valueParser: numberParser({ label: "Cost price", allowEmpty: true }),
        width: 110,
        minWidth: 88,
        valueGetter: (p) => p.data?.purchasePrice ?? null,
        valueFormatter: (p) =>
          p.value != null && p.value !== "" ? formatCurrency(Number(p.value)) : "—",
      },
      {
        field: "lastSellingPrice",
        headerName: "Last selling price",
        hide: !visibleCols.lastSellingPrice,
        width: 130,
        minWidth: 100,
        valueGetter: (p) => p.data?.lastSellingPrice ?? null,
        valueFormatter: (p) =>
          p.value != null && p.value !== "" ? formatCurrency(Number(p.value)) : "—",
      },
      {
        field: "productType",
        headerName: "Product type",
        hide: !visibleCols.productType,
        width: 110,
        minWidth: 88,
        valueGetter: (p) => p.data?.productType ?? "simple",
        valueFormatter: (p) => {
          const v = String(p.value ?? "simple");
          return v.charAt(0).toUpperCase() + v.slice(1);
        },
      },
      {
        field: "updatedAt",
        headerName: "Updated",
        width: 100,
        hide: !visibleCols.updatedAt,
        valueFormatter: (p) => formatDate(p.value),
      },
      {
        colId: "updatedBy",
        headerName: "Updated By",
        hide: isInventory,
        flex: 1,
        minWidth: 120,
        valueGetter: (p) => p.data?.updatedBy || "—",
      },
      ...(competitorMatches && competitors
        ? competitors.map(({ key, label }) => ({
            colId: `competitor-${key}`,
            headerName: label,
            // Centre the tick box and price vertically in the row.
            cellStyle: { display: "flex", alignItems: "center" },
            headerComponent: CompetitorHeader,
            headerComponentParams: {
              pickState: () => {
                const ids = shownIdsRef.current();
                const n = ids.filter((id) => pickedCells?.has(`${id}::${key}`)).length;
                return n === 0 ? "none" : n === ids.length ? "all" : "some";
              },
              onTogglePickAll:
                onSetCellPicks && canWrite
                  ? () => {
                      const ids = shownIdsRef.current();
                      const all = ids.length > 0 && ids.every((id) => pickedCells?.has(`${id}::${key}`));
                      onSetCellPicks(ids.map((id) => `${id}::${key}`), !all);
                    }
                  : undefined,
            },
            width: key === "source" ? 230 : 170,
            minWidth: key === "source" ? 190 : 140,
            sortable: false,
            editable: false,
            cellRenderer: (p: ICellRendererParams<Product>) => {
              if (!p.data) return null;
              const match = competitorMatches[p.data.id]?.find((m) => m.competitor === key);
              const productId = p.data.id;
              return (
                <CompetitorPriceCell
                  match={match}
                  ourPrice={p.data.price}
                  companyName={key === "source" ? sourceCompanyName(p.data.sourceUrl || match?.matched_url, competitors) : undefined}
                  sourceUrl={
                    p.data.sourceUrl && p.data.sourceUrl.toLowerCase().includes(String(key).toLowerCase())
                      ? p.data.sourceUrl
                      : undefined
                  }
                  onSync={onSyncCompetitor ? () => onSyncCompetitor(productId, key) : undefined}
                  bulkSyncing={competitorSyncingKeys?.has(`${productId}::${key}`)}
                  pickable={Boolean(onToggleCellPick && canWrite)}
                  picked={pickedCells?.has(`${productId}::${key}`)}
                  onTogglePick={onToggleCellPick ? () => onToggleCellPick(productId, key) : undefined}
                  onEditUrl={
                    onSetManualUrl
                      ? () => {
                          setManualUrlTarget({
                            productId,
                            productName: p.data!.name,
                            competitor: key,
                            competitorLabel: label,
                            currentUrl: match?.matched_url ?? "",
                            verified: Boolean(match?.verified && match.matched_url),
                            verifiedBy: match?.verified_by ?? null,
                            verifiedAt: match?.verified_at ?? null,
                          });
                          setManualUrlValue(match?.matched_url ?? "");
                          setManualUrlVerified(Boolean(match?.verified && match.matched_url));
                        }
                      : undefined
                  }
                />
              );
            },
          }))
        : []),
      ...(onAiImport
        ? [
            {
              colId: "ai-import",
              headerName: "AI",
              headerClass: "product-grid-center-col",
              headerTooltip: "Fill this product from its source URL with AI",
              width: 64,
              minWidth: 56,
              maxWidth: 80,
              sortable: false,
              editable: false,
              cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
              cellRenderer: (p: ICellRendererParams<Product>) => {
                if (!p.data) return null;
                const product = p.data;
                const busy = aiImportingIds?.has(product.id) ?? false;
                const url = product.sourceUrl;
                return (
                  <button
                    type="button"
                    disabled={busy || !canWrite || !url}
                    onClick={(e) => {
                      e.stopPropagation();
                      void onAiImport(product);
                    }}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-none border border-violet-500/40 text-violet-600 hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:opacity-40 dark:text-violet-400"
                    title={url ? "Fill this product from its source URL with AI" : "Add a source URL first"}
                    aria-label="Import this product's details from its source URL with AI"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  </button>
                );
              },
            },
          ]
        : []),
    ],
    [onView, onEdit, nameClickAction, visibleCols, resolvedLiveEdit, ProductControlsCell, ProductRowMenu, brands, canWrite, categories, categoryNames, toggleManageStock, isInventory, companyFormat, competitors, competitorMatches, onSyncCompetitor, competitorSyncingKeys, onSetManualUrl, savedColumnNameWidth, pickedCells, onToggleCellPick, onSetCellPicks, onAiImport, aiImportingIds],
  );

  const onCellValueChanged = useCallback(
    (e: CellValueChangedEvent<Product>) => {
      const field = e.colDef.field;
      if (!e.data || !field || !canWrite) return;
      if (e.oldValue === e.newValue) return;
      const id = e.data.id;
      const label =
        (field === "offerPrice" ? "Compare-at price" : (COLUMN_LABELS as Record<string, string>)[field]) ?? field;

      // the row as it was, to put back when the save is refused
      const revert = () =>
        setRowData((rows) =>
          rows.map((r) =>
            r.id !== id
              ? r
              : field === "offerPrice"
                ? { ...r, offerPrice: e.oldValue, compareAtPrice: e.oldValue }
                : { ...r, [field]: e.oldValue },
          ),
        );

      if (field === "slug" && slugHasError(e.data.slug, { id })) {
        toast.error(validateSlug(e.data.slug, { id }).message ?? "Slug already in use");
        revert();
        return;
      }

      // show the new value at once; the server's answer replaces it below
      setRowData((rows) => rows.map((r) => (r.id === id ? { ...e.data } : r)));

      const patch: Record<string, unknown> = {};
      if (field === "slug") patch.slug = e.data.slug;
      if (field === "sku") patch.sku = e.data.sku;
      if (field === "model") patch.model = e.data.model?.trim() || null;
      if (field === "price") patch.price = Number(e.data.price);
      if (field === "offerPrice") {
        const offer = e.data.offerPrice ?? e.data.compareAtPrice;
        patch.compare_at_price = offer == null || Number.isNaN(Number(offer)) ? null : Number(offer);
      }
      if (field === "stock") patch.stock = Number(e.data.stock);
      if (field === "status") patch.status = e.data.status;
      if (field === "category") patch.category = e.data.category;
      if (field === "brand") patch.brand = e.data.brand;
      if (field === "seoTitle") patch.seo_title = e.data.seoTitle;
      if (field === "purchasePrice") {
        const cost = e.data.purchasePrice;
        patch.purchase_price = cost == null || Number.isNaN(Number(cost)) ? null : Number(cost);
      }
      if (field === "warranty") patch.warranty = e.data.warranty?.trim() || null;
      if (field === "alertQuantity") patch.alert_quantity = Number(e.data.alertQuantity ?? 0);
      if (Object.keys(patch).length === 0) return;

      void (async () => {
        try {
          const saved = await updateCatalogProduct(id, patch);
          // the server's copy is the truth (it may adjust a slug, normalise a status …)
          const fresh = productListFields(saved);
          setRowData((rows) => rows.map((r) => (r.id === id ? { ...r, ...fresh } : r)));
          gridApiRef.current?.flashCells({ rowNodes: e.node ? [e.node] : [], columns: [e.column.getColId()] });
          toast.success(`${label} updated · ${e.data.sku}`);
          // a price at or below the struck-through price shows no discount
          if (
            field === "price" &&
            fresh.compareAtPrice != null &&
            (fresh.price ?? 0) >= fresh.compareAtPrice
          ) {
            toast.info(
              `The compare-at price (${formatCurrency(fresh.compareAtPrice)}) is not above the new price, so the shop shows no discount.`,
            );
          }
        } catch (err) {
          revert();
          toast.error(err instanceof Error ? `${label} not saved: ${err.message}` : `${label} not saved`);
        }
      })();
    },
    [canWrite],
  );

  const toggleVisibleFilter = (key: FilterVisibilityKey, enabled: boolean) => {
    setVisibleFilters((v) => {
      const merged = { ...DEFAULT_VISIBLE_FILTERS, ...v, [key]: enabled };
      return Object.fromEntries(
        FILTER_VISIBILITY_KEYS.map((k) => [k, merged[k]]),
      ) as Record<FilterVisibilityKey, boolean>;
    });
    if (!enabled) {
      setFilters((f) => ({
        ...f,
        ...(key === "search" ? { search: "" } : {}),
        ...(key === "website" ? { website: "all" } : {}),
        ...(key === "status" ? { status: "all" } : {}),
        ...(key === "category" ? { category: "all" } : {}),
        ...(key === "brand" ? { brand: "all" } : {}),
        ...(key === "stockStatus" ? { stockStatus: "all" } : {}),
        ...(key === "price" ? { priceMin: "", priceMax: "" } : {}),
      }));
    }
  };

  const resetAllFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setVisibleFilters(DEFAULT_VISIBLE_FILTERS);
  };

  return (
    <AgainListGrid<Product>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      loadingFallback={<ProductGridSkeleton />}
      headerLeftActions={headerLeftActions}
      apiRef={gridApiRef}
      layoutKey={false}
      layoutHasWidths={savedColumnState.some((c) => typeof c.width === "number")}
      layoutWidths={savedColumnState}
      layoutReady={savedColumnStateLoaded && (layoutReady ?? true)}
      onGridReady={(e) => {
        if (savedColumnState.length > 0) {
          e.api.setGridOption("suppressColumnMoveAnimation", true);
          e.api.applyColumnState({ state: withoutFlex(savedColumnState), applyOrder: true });
          requestAnimationFrame(() => e.api.setGridOption("suppressColumnMoveAnimation", false));
        }
        setColumnOrder(computeToggleOrder());
      }}
      filterBar={
        <>
          {resolvedVisibleFilters.search && (
            <Input
              placeholder="Search SKU, name…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[220px] shrink-0 rounded-none"
            />
          )}
          {resolvedVisibleFilters.website && (
            <FilterSelect
              value={filters.website}
              onChange={(website) => setFilters((f) => ({ ...f, website }))}
              width="w-[152px]"
              className="shrink-0"
              ariaLabel="Website visibility"
              options={[
                { value: "all", label: "All products" },
                { value: "on", label: "On website" },
                { value: "off", label: "Not on website" },
              ]}
            />
          )}
          {resolvedVisibleFilters.status && (
            <FilterSelect
              value={filters.status}
              onChange={(status) => setFilters((f) => ({ ...f, status }))}
              width="w-[128px]"
              className="shrink-0"
              ariaLabel="Status"
              options={[
                { value: "all", label: "All statuses" },
                { value: "published", label: "Published" },
                { value: "draft", label: "Draft" },
                { value: "archived", label: "Archived" },
              ]}
            />
          )}
          {resolvedVisibleFilters.category && (
            <div className="shrink-0">
              <CategoryFilterDropdown
                value={filters.category}
                onChange={(category) => setFilters((f) => ({ ...f, category }))}
                categories={filterCategories}
              />
            </div>
          )}
          {resolvedVisibleFilters.brand && (
            <div className="shrink-0">
              <BrandFilterDropdown
                value={filters.brand}
                onChange={(brand) => setFilters((f) => ({ ...f, brand }))}
                brands={brands}
              />
            </div>
          )}
          {resolvedVisibleFilters.stockStatus && (
            <FilterSelect
              value={filters.stockStatus}
              onChange={(stockStatus) => setFilters((f) => ({ ...f, stockStatus }))}
              width="w-[148px]"
              className="shrink-0"
              ariaLabel="Stock status"
              options={[
                { value: "all", label: "All stock statuses" },
                ...STOCK_STATUSES.map((status) => ({ value: status, label: status })),
              ]}
            />
          )}
          {resolvedVisibleFilters.price && (
            <div className="shrink-0">
              <PriceRangeFilter
                valueMin={filters.priceMin}
                valueMax={filters.priceMax}
                priceCeiling={priceCeiling}
                onChange={(priceMin, priceMax) =>
                  setFilters((f) => ({ ...f, priceMin, priceMax }))
                }
                className="rounded-none"
              />
            </div>
          )}
        </>
      }
      banner={
        (selected.length > 0 || (pickedCells?.size ?? 0) > 0) && canWrite ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-primary/30 bg-primary/5 px-3 py-2">
          {selected.length > 0 ? <span className="text-xs font-medium">{selected.length} selected</span> : null}
          {pickedCells && pickedCells.size > 0 && onCheckPickedCells ? (
            <>
              <span className="text-xs font-medium">{pickedCellsSummary(pickedCells, competitors)}</span>
              <Button size="sm" onClick={() => onCheckPickedCells()} disabled={bulkRunning}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Check {pickedCells.size} selected price{pickedCells.size === 1 ? "" : "s"}
              </Button>
              {onApplyPicked ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onApplyPicked("price")}
                    disabled={bulkRunning}
                    title="Set our catalog price to the selected competitor price"
                  >
                    Update price
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onApplyPicked("stock")}
                    disabled={bulkRunning}
                    title="Set our stock status to match the selected competitor"
                  >
                    Update stock
                  </Button>
                </>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => onClearCellPicks?.()} disabled={bulkRunning}>
                Clear
              </Button>
            </>
          ) : null}
          {bulkRunning && onStopBulk ? (
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 hover:text-red-700 dark:text-red-400"
              onClick={() => onStopBulk()}
            >
              Stop
            </Button>
          ) : null}
          {onBulkCheckCompetitorPrices && selected.length > 0 && !(pickedCells && pickedCells.size > 0) ? (
            <Button
              size="sm"
              disabled={bulkRunning}
              onClick={() => onBulkCheckCompetitorPrices(selected)}
              title={bulkCheckSitesLabel ? `Checks ${bulkCheckSitesLabel} only` : "Checks every site"}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              {bulkCheckSitesLabel ? `Check ${bulkCheckSitesLabel} prices` : "Check competitor prices"}
              {` (${selected.length} selected)`}
            </Button>
          ) : null}
          {selected.length > 0 ? (
          <>
          {!hideCatalogBulkActions ? (
          <>
          <Button
            size="sm"
            onClick={() => {
              void (async () => {
                try {
                  const { ok, failed } = await runBulk(
                    selected,
                    (p) => publishProductToApi(p.id),
                    4,
                    (d, n) => toast.loading("Publishing " + d + " of " + n + "…", { id: "bulk-status" }),
                  );
                  toast.dismiss("bulk-status");
                  const okIds = new Set(ok.map((p) => p.id));
                  setRowData((rows) => rows.map((r) => (okIds.has(r.id) ? publishProductToWebsite(r) : r)));
                  if (ok.length) toast.success(`Published ${ok.length} product${ok.length > 1 ? "s" : ""} to website`);
                  if (failed.length) toast.error(`${failed.length} failed: ${failed[0].error}`);
                  setSelected(failed.map((x) => x.item));
                  onProductsChanged?.();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Bulk publish failed");
                }
              })();
            }}
          >
            <Globe className="mr-1.5 h-3.5 w-3.5" />
            Publish to website
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void (async () => {
                try {
                  const { ok, failed } = await runBulk(
                    selected,
                    (p) => unpublishProductFromApi(p.id),
                    4,
                    (d, n) => toast.loading("Removing " + d + " of " + n + "…", { id: "bulk-status" }),
                  );
                  toast.dismiss("bulk-status");
                  const okIds = new Set(ok.map((p) => p.id));
                  setRowData((rows) => rows.map((r) => (okIds.has(r.id) ? removeProductFromWebsite(r) : r)));
                  if (ok.length) toast.success(`Removed ${ok.length} product${ok.length > 1 ? "s" : ""} from website`);
                  if (failed.length) toast.error(`${failed.length} failed: ${failed[0].error}`);
                  setSelected(failed.map((x) => x.item));
                  onProductsChanged?.();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Bulk unpublish failed");
                }
              })();
            }}
          >
            Remove from website
          </Button>
          {onAddToInventory ? (
            <Button size="sm" variant="secondary" onClick={() => void onAddToInventory(selected)}>
              <Warehouse className="mr-1.5 h-3.5 w-3.5" />
              Add to Inventory
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => openArchiveConfirm(selected)}
          >
            Bulk archive
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => openDeleteConfirm(selected)}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.success("Export started (mock CSV)")}
          >
            Export selected
          </Button>
          </>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 w-7 p-0"
            onClick={() => setSelected([])}
          >
            <X className="h-4 w-4" />
          </Button>
          </>
          ) : null}
        </div>
        ) : null
      }
      footerLeftActions={footerLeftActions}
      emptyTitle="No products match your filters"
      emptyHint="Create your first product or clear filters"
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      onOpenColumns={() => setColumnSheetOpen(true)}
      gridProps={{
        rowSelection: "multiple",
        suppressRowClickSelection: true,
        rowClass: rowClickOpensView ? "cursor-pointer" : undefined,
        // Row click opens the product drawer; skip the checkbox/star column, the
        // name button (has its own handler), live-edit cells and any inline control.
        onCellClicked: (e) => {
          if (!e.data || !rowClickOpensView) return;
          const colId = e.column.getColId();
          if (colId === "controls" || colId === "actions" || colId === "name") return;
          if (e.colDef.editable) return;
          const target = e.event?.target;
          if (
            target instanceof HTMLElement &&
            target.closest("button, a, input, [role='menuitem'], [data-row-actions]")
          ) {
            return;
          }
          onView(e.data);
        },
        onCellValueChanged,
        onSelectionChanged: (e) => setSelected(e.api.getSelectedRows()),
        // the competitor headers' tick boxes follow the page being shown
        onPaginationChanged: (e) => {
          e.api.refreshHeader();
          void srcCompare.loadIds(shownIdsRef.current()); // the Source column's saved status for the page now on screen
        },
        onFirstDataRendered: () => void srcCompare.loadIds(shownIdsRef.current()),
        onColumnMoved: (e) => {
          // Only the admin's own drags — not the saved order being applied on load.
          if (e.finished && (e.source === "uiColumnMoved" || e.source === "uiColumnDragged")) {
            persistColumnState();
            setColumnOrder(computeToggleOrder());
          }
        },
        onColumnResized: (e) => {
          // Only a manual resize — not auto-fit on load, which would overwrite the saved layout.
          if (e.finished && e.source === "uiColumnResized") persistColumnState();
        },
      }}
      mobile={
        loading ? (
          <ProductMobileCardsSkeleton />
        ) : (
          <>
            <ProductMobileCards
              products={filtered.slice(0, 50)}
              onView={onView}
              onEdit={onEdit}
              onArchive={(p) => openArchiveConfirm([p])}
            />
            {filtered.length > 50 && (
              <p className="text-center text-xs text-muted-foreground">
                Showing 50 of {filtered.length} — use desktop for full list
              </p>
            )}
          </>
        )
      }
    >
      {/* Filters sheet — show/hide toolbar filters */}
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent
          side="right"
          title="Filters"
          resizable
          closeButton="inside"
          className="w-[180px] min-w-[160px] max-w-[720px] gap-2 rounded-none p-3"
        >
          <h2 className="border-b border-border pb-2 pr-8 text-sm font-semibold">Filters</h2>
          <div className="mt-1 flex-1 space-y-1.5 overflow-y-auto">
            {FILTER_VISIBILITY_KEYS.map((key) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 text-xs text-foreground"
              >
                <input
                  type="checkbox"
                  checked={resolvedVisibleFilters[key]}
                  onChange={(e) => toggleVisibleFilter(key, e.target.checked)}
                  className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                />
                {FILTER_LABELS[key]}
              </label>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-7 rounded-none text-xs"
            onClick={resetAllFilters}
          >
            Reset filters
          </Button>
        </SheetContent>
      </Sheet>

      {/* Live edit sheet */}
      <Sheet open={liveEditSheetOpen} onOpenChange={setLiveEditSheetOpen}>
        <SheetContent
          side="right"
          title="Live edit"
          resizable
          closeButton="inside"
          className="w-[180px] min-w-[160px] max-w-[720px] gap-2 rounded-none p-3"
        >
          <h2 className="border-b border-border pb-2 pr-8 text-sm font-semibold">Live edit</h2>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Tick a field to edit it in the table: double-click its cell, Enter saves, Esc cancels.
          </p>
          <div className="mt-1 flex-1 space-y-1.5 overflow-y-auto">
            {LIVE_EDIT_TOGGLES.map((key) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 text-xs text-foreground"
              >
                <input
                  type="checkbox"
                  checked={resolvedLiveEdit[key]}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setLiveEdit((v) => {
                      const merged = { ...DEFAULT_LIVE_EDIT, ...v, [key]: on };
                      return Object.fromEntries(
                        LIVE_EDIT_TOGGLES.map((k) => [k, merged[k]]),
                      ) as Record<LiveEditKey, boolean>;
                    });
                    // a field can only be edited where it is shown
                    if (on) setVisibleCols((cols) => ({ ...cols, [LIVE_EDIT_COLUMN[key]]: true }));
                  }}
                  className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                />
                {LIVE_EDIT_LABELS[key]}
              </label>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-7 rounded-none text-xs"
            onClick={() => setLiveEdit(DEFAULT_LIVE_EDIT)}
          >
            Reset live edit
          </Button>
        </SheetContent>
      </Sheet>

      {/* Column visibility sheet */}
      <Sheet open={columnSheetOpen} onOpenChange={setColumnSheetOpen}>
        <SheetContent
          side="right"
          title="Columns"
          resizable
          closeButton="inside"
          className="w-[180px] min-w-[160px] max-w-[720px] gap-2 rounded-none p-3"
        >
          <h2 className="border-b border-border pb-2 pr-8 text-sm font-semibold">Columns</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">Drag to reorder</p>
          <div className="mt-1 flex-1 space-y-1.5 overflow-y-auto">
            {columnOrder.map((key) => (
              <label
                key={key}
                draggable
                onDragStart={() => {
                  dragColumnKeyRef.current = key;
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = dragColumnKeyRef.current;
                  dragColumnKeyRef.current = null;
                  if (from) reorderColumnPanel(from, key);
                }}
                onDragEnd={() => {
                  dragColumnKeyRef.current = null;
                }}
                className="flex cursor-grab items-center gap-2 text-xs text-foreground active:cursor-grabbing"
              >
                <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                <input
                  type="checkbox"
                  checked={visibleCols[key]}
                  onChange={(e) =>
                    setVisibleCols((v) => ({ ...v, [key]: e.target.checked }))
                  }
                  className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                />
                {isInventory && key === "price" ? "Sales price" : COLUMN_LABELS[key]}
              </label>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-7 rounded-none text-xs"
            onClick={() => {
              setVisibleCols(isInventory ? INVENTORY_DEFAULT_VISIBLE : DEFAULT_VISIBLE);
              setSavedColumnState([]);
              const api = gridApiRef.current;
              if (api) api.resetColumnState();
              setColumnOrder([...toggleKeys]);
            }}
          >
            Reset columns
          </Button>
        </SheetContent>
      </Sheet>

      <PrintLabelDrawer
        open={printLabelProduct != null}
        onOpenChange={(o) => {
          if (!o) setPrintLabelProduct(null);
        }}
        initialProduct={printLabelProduct}
        products={products}
      />

      {/* Archive confirm */}
      <Dialog.Root open={archiveOpen} onOpenChange={setArchiveOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(400px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-input bg-background p-6 shadow-xl">
            <Dialog.Title className="text-base font-semibold">Archive products?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              {archiveTargets.length === 1
                ? `"${archiveTargets[0]?.name}" will be archived.`
                : `${archiveTargets.length} products will be archived.`}
            </Dialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setArchiveOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => void archiveProducts(archiveTargets)}
              >
                Archive
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete confirm — permanent */}
      <Dialog.Root
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!deleting) setDeleteOpen(open);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(400px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-input bg-background p-6 shadow-xl">
            <Dialog.Title className="text-base font-semibold">Delete products?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              {deleteTargets.length === 1
                ? `"${deleteTargets[0]?.name}" will be permanently deleted. This cannot be undone.`
                : `${deleteTargets.length} products will be permanently deleted. This cannot be undone.`}
            </Dialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={deleting}
                onClick={() => setDeleteOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={deleting}
                onClick={() => void deleteProducts(deleteTargets)}
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Price Compare: set a manual product-page URL for one product/competitor pair */}
      <Dialog.Root
        open={!!manualUrlTarget}
        onOpenChange={(open) => {
          if (!open && !manualUrlSaving) setManualUrlTarget(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(480px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-input bg-background p-6 shadow-xl">
            <Dialog.Title className="text-base font-semibold">
              Set {manualUrlTarget?.competitorLabel} URL
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              Paste this product&apos;s page on {manualUrlTarget?.competitorLabel} for{" "}
              <span className="font-medium text-foreground">{manualUrlTarget?.productName}</span> — used
              instead of search for this product going forward.
            </Dialog.Description>
            {manualUrlTarget?.verified ? (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-sky-700 dark:text-sky-400">
                <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
                Current link is verified
                {manualUrlTarget.verifiedBy ? ` by ${manualUrlTarget.verifiedBy}` : ""}
                {manualUrlTarget.verifiedAt ? ` on ${formatDateTime(manualUrlTarget.verifiedAt)}` : ""} — it is
                never replaced automatically.
              </p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <Input
                autoFocus
                value={manualUrlValue}
                onChange={(e) => {
                  const next = e.target.value;
                  setManualUrlValue(next);
                  // A different link hasn't been checked yet.
                  if (next.trim() !== (manualUrlTarget?.currentUrl ?? "")) setManualUrlVerified(false);
                  else setManualUrlVerified(Boolean(manualUrlTarget?.verified));
                }}
                placeholder="https://…"
                disabled={manualUrlSaving}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 shrink-0"
                disabled={!/^https?:\/\//i.test(manualUrlValue.trim())}
                onClick={() => window.open(manualUrlValue.trim(), "_blank", "noopener,noreferrer")}
                title="Open the link in a new tab to check it"
              >
                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                Open
              </Button>
            </div>
            <div
              className={cn(
                "mt-3 flex items-center justify-between gap-3 rounded-md border px-3 py-2",
                manualUrlVerified
                  ? "border-sky-500/40 bg-sky-500/10"
                  : "border-input bg-muted/30",
              )}
            >
              <p className="text-xs text-muted-foreground">
                {manualUrlVerified
                  ? "Verified — this link stays saved until an admin changes it here. Search, AI and auto-sync never replace it."
                  : "Open the link, check it's exactly this product (model, size, colour), then verify it."}
              </p>
              <Button
                type="button"
                size="sm"
                variant={manualUrlVerified ? "default" : "outline"}
                className={cn("h-8 shrink-0", manualUrlVerified && "bg-sky-600 text-white hover:bg-sky-700")}
                disabled={manualUrlSaving || !/^https?:\/\//i.test(manualUrlValue.trim())}
                onClick={() => setManualUrlVerified((v) => !v)}
              >
                <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                {manualUrlVerified ? "Verified" : "Verify"}
              </Button>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={manualUrlSaving}
                onClick={() => setManualUrlTarget(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant={!manualUrlValue.trim() && manualUrlTarget?.currentUrl ? "destructive" : "default"}
                // Empty box with a saved link = remove that link.
                disabled={manualUrlSaving || (!manualUrlValue.trim() && !manualUrlTarget?.currentUrl)}
                onClick={() => {
                  if (!manualUrlTarget || !onSetManualUrl) return;
                  const target = manualUrlTarget;
                  setManualUrlSaving(true);
                  Promise.resolve(
                    onSetManualUrl(target.productId, target.competitor, manualUrlValue.trim(), manualUrlVerified),
                  )
                    .then(() => setManualUrlTarget(null))
                    .finally(() => setManualUrlSaving(false));
                }}
              >
                {manualUrlSaving
                  ? "Saving…"
                  : !manualUrlValue.trim() && manualUrlTarget?.currentUrl
                    ? "Remove link"
                    : "Save & check price"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </AgainListGrid>
  );
});
