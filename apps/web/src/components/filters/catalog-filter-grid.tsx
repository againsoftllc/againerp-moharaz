"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Filter,
  GripVertical,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  FILTER_DISPLAY_LABELS,
  FILTER_SOURCE_LABELS,
  type CatalogFacetFilter,
  type FilterDisplayType,
  type FilterSource,
} from "@/lib/mock-data/catalog-filters";
import type { AttributeSpec } from "@/lib/mock-data/attribute-profiles";
import {
  bulkPatchCatalogFilters,
  deleteCatalogFilters,
  patchCatalogFilter,
  reorderCatalogFilters,
} from "@/lib/api/use-catalog-filters";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type FilterState = { search: string; displayType: string };
const DEFAULT_FILTERS: FilterState = { search: "", displayType: "all" };

function applyFilters(rows: CatalogFacetFilter[], f: FilterState) {
  const q = f.search.toLowerCase().trim();
  return rows.filter((item) => {
    if (q && !item.name.toLowerCase().includes(q) && !item.paramKey.toLowerCase().includes(q) && !item.attributeName.toLowerCase().includes(q)) return false;
    if (f.displayType !== "all" && item.displayType !== f.displayType) return false;
    return true;
  });
}

const DISPLAY_TYPE_COLORS: Record<FilterDisplayType, string> = {
  multi_select: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  range: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  boolean: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  color: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  dynamic: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

type Props = {
  className?: string;
  filters: CatalogFacetFilter[];
  filterableAttributes: AttributeSpec[];
  loading?: boolean;
  onFiltersChanged?: () => void;
  onEdit?: (filter: CatalogFacetFilter) => void;
  onCreate?: () => void;
  footerLeftActions?: ReactNode;
  headerLeftActions?: ReactNode;
  onAdvancedFilterCountChange?: (count: number) => void;
};

export type CatalogFilterGridHandle = {
  openFilters: () => void;
};

function countAdvancedFilters(f: FilterState): number {
  let n = 0;
  if (f.search.trim()) n += 1;
  if (f.displayType !== "all") n += 1;
  return n;
}

export const CatalogFilterGrid = forwardRef<CatalogFilterGridHandle, Props>(function CatalogFilterGrid(
  {
    className,
    filters: catalogFilters,
    filterableAttributes,
    loading: _loading = false,
    onFiltersChanged,
    onEdit: onEditProp,
    onCreate,
    footerLeftActions,
    headerLeftActions,
    onAdvancedFilterCountChange,
  },
  ref,
) {
  const canWrite = useAdminCanWrite();


  const [toolbarFilters, setToolbarFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["builtin", "attribute"]));
  const [expandedFilters, setExpandedFilters] = useState<Set<string>>(new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<CatalogFacetFilter[]>([]);
  const [selected, setSelected] = useState<CatalogFacetFilter[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const ordered = useMemo(
    () => [...catalogFilters].sort((a, b) => a.sortOrder - b.sortOrder),
    [catalogFilters],
  );
  const filtered = useMemo(() => applyFilters(ordered, toolbarFilters), [ordered, toolbarFilters]);
  const advancedCount = countAdvancedFilters(toolbarFilters);

  useEffect(() => {
    onAdvancedFilterCountChange?.(advancedCount);
  }, [advancedCount, onAdvancedFilterCountChange]);

  useImperativeHandle(
    ref,
    () => ({
      openFilters: () => setFilterSheetOpen(true),
    }),
    [],
  );

  const builtIn = filtered.filter((f) => f.source === "built_in");
  const fromAttributes = filtered.filter((f) => f.source === "attribute");

  const toggleGroup = (key: string) =>
    setExpandedGroups((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const toggleFilter = (id: string) =>
    setExpandedFilters((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const openEdit = useCallback(
    (f: CatalogFacetFilter) => {
      onEditProp?.(f);
    },
    [onEditProp],
  );

  const toggleActive = async (f: CatalogFacetFilter) => {
    if (!canWrite) return;
    try {
      await patchCatalogFilter(f.id, { isActive: !f.isActive });
      onFiltersChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  const toggleStorefront = async (f: CatalogFacetFilter) => {
    if (!canWrite) return;
    try {
      await patchCatalogFilter(f.id, { storefrontVisible: !f.storefrontVisible });
      onFiltersChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  const openDeleteConfirm = (targets: CatalogFacetFilter[]) => {
    const deletable = targets.filter((t) => !t.isSystem);
    if (!deletable.length) { toast.error("System filters cannot be deleted"); return; }
    setDeleteTargets(deletable);
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    try {
      await deleteCatalogFilters(deleteTargets.map((t) => t.id));
      toast.success(`Deleted ${deleteTargets.length} filter${deleteTargets.length > 1 ? "s" : ""}`);
      setDeleteOpen(false);
      setDeleteTargets([]);
      setSelected([]);
      onFiltersChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleDrop = async (targetId: string) => {
    if (!canWrite || !dragId || dragId === targetId) return;
    const ids = ordered.map((f) => f.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    try {
      await reorderCatalogFilters(next);
      toast.success("Filter order updated");
      onFiltersChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reorder failed");
    }
    setDragId(null);
    setOverId(null);
  };

  const FilterRow = ({ f }: { f: CatalogFacetFilter }) => {
    const expanded = expandedFilters.has(f.id);
    // one attribute filter = every filterable spec attribute with this code, across profiles
    const chips = f.source === "attribute"
      ? Array.from(new Map(
          filterableAttributes
            .filter((a) => a.id === f.attributeId || a.code === f.paramKey)
            .flatMap((a) => a.predefinedValues ?? [])
            .map((v) => [v.toLowerCase(), v] as const),
        ).values())
      : [];
    return (
      <div
        key={f.id}
        onDragOver={(e) => { e.preventDefault(); setOverId(f.id); }}
        onDragLeave={() => setOverId((k) => k === f.id ? null : k)}
        onDrop={() => handleDrop(f.id)}
        className={cn(overId === f.id && dragId !== f.id && "rounded-md ring-2 ring-primary/30")}
      >
        <div
          draggable={canWrite}
          onDragStart={() => canWrite && setDragId(f.id)}
          onDragEnd={() => { setDragId(null); setOverId(null); }}
          className={cn(
            "flex cursor-grab items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-muted/40 active:cursor-grabbing",
            dragId === f.id && "opacity-50",
            !f.isActive && "opacity-50",
          )}
        >
          <input
            type="checkbox"
            disabled={!canWrite}
            checked={selected.some((s) => s.id === f.id)}
            onChange={(e) => setSelected((prev) => e.target.checked ? [...prev, f] : prev.filter((s) => s.id !== f.id))}
            className="shrink-0 rounded border-input"
            onClick={(e) => e.stopPropagation()}
          />
          <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground/50" />
          {chips.length > 0 && (
            <button type="button" onClick={() => toggleFilter(f.id)} className="shrink-0 text-muted-foreground hover:text-foreground">
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          )}
          {chips.length === 0 && <span className="w-3.5 shrink-0" />}
          <span className="min-w-0 flex-1 truncate text-xs font-medium">{f.name}</span>
          <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium", DISPLAY_TYPE_COLORS[f.displayType])}>
            {FILTER_DISPLAY_LABELS[f.displayType]}
          </span>
          {f.attributeName && f.source === "attribute" && (
            <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:block">{f.attributeName}</span>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleStorefront(f); }}
            className={cn("shrink-0", f.storefrontVisible ? "text-emerald-600" : "text-muted-foreground/40")}
            title={f.storefrontVisible ? "Visible on storefront" : "Hidden on storefront"}
          >
            {f.storefrontVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleActive(f); }}
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
              f.isActive ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground",
            )}
          >
            {f.isActive ? "On" : "Off"}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 shrink-0 p-0">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openEdit(f)}>
                <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
              </DropdownMenuItem>
              {canWrite && !f.isSystem && (
                <DropdownMenuItem onClick={() => openDeleteConfirm([f])} className="text-destructive">
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Predefined value chips when expanded */}
        {expanded && chips.length > 0 && (
          <div className="ml-10 border-l border-input pl-3 pb-1">
            <div className="flex flex-wrap gap-1 py-1">
              {chips.map((v) => (
                <span key={v} className="rounded border border-input bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">{v}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const GroupBlock = ({ label, icon, groupKey, rows, source }: {
    label: string; icon: ReactNode; groupKey: string; rows: CatalogFacetFilter[]; source: FilterSource;
  }) => {
    const open = expandedGroups.has(groupKey);
    return (
      <div>
        <button
          type="button"
          onClick={() => toggleGroup(groupKey)}
          className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-muted/40"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          {icon}
          <span className="flex-1 text-xs font-semibold">{label}</span>
          <span className="text-[10px] text-muted-foreground">{rows.length}</span>
        </button>
        {open && (
          <div className="ml-5 border-l border-input pl-3 space-y-0.5 py-0.5">
            {rows.length === 0 ? (
              <p className="py-1.5 text-[11px] text-muted-foreground">No {label.toLowerCase()} filters</p>
            ) : (
              rows.map((f) => <FilterRow key={f.id} f={f} />)
            )}
            {source === "attribute" ? (
              <p className="px-1.5 py-1 text-[11px] text-muted-foreground">
                Managed from Specifications: mark a spec attribute as filterable and its values become filter options.
              </p>
            ) : (
              <button
                type="button"
                onClick={onCreate}
                disabled={!canWrite || !onCreate}
                className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground disabled:opacity-50"
              >
                <Plus className="h-3 w-3" />
                Add built-in filter
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={cn("relative flex min-h-0 w-full min-w-0 flex-col overflow-hidden", className)}>
      <div
        data-component="catalog-filter-grid-filters"
        className="catalog-filter-grid-filters flex min-w-0 shrink-0 items-center gap-2 border-b border-border py-2 pl-2 pr-2"
      >
        {headerLeftActions && (
          <div className="flex shrink-0 items-center gap-2 border-r border-border bg-background pr-2">
            {headerLeftActions}
          </div>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Input
            placeholder="Search name, param, attribute…"
            value={toolbarFilters.search}
            onChange={(e) => setToolbarFilters((f) => ({ ...f, search: e.target.value }))}
            className="w-[220px] shrink-0 rounded-none"
          />
          <Select
            value={toolbarFilters.displayType}
            onChange={(e) => setToolbarFilters((f) => ({ ...f, displayType: e.target.value }))}
            className="w-[150px] shrink-0 rounded-none"
          >
            <option value="all">All types</option>
            {(Object.keys(FILTER_DISPLAY_LABELS) as FilterDisplayType[]).map((t) => (
              <option key={t} value={t}>{FILTER_DISPLAY_LABELS[t]}</option>
            ))}
          </Select>
        </div>
      </div>

      {selected.length > 0 && canWrite && (
        <div className="flex flex-wrap items-center gap-2 border-b border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-xs font-medium">{selected.length} selected</span>
          <Button
            size="sm"
            onClick={() => {
              void bulkPatchCatalogFilters(selected, { isActive: true }).then(() => {
                setSelected([]);
                toast.success("Activated");
                onFiltersChanged?.();
              });
            }}
          >
            Activate
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void bulkPatchCatalogFilters(selected, { isActive: false }).then(() => {
                setSelected([]);
                toast.success("Deactivated");
                onFiltersChanged?.();
              });
            }}
          >
            Deactivate
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
            variant="ghost"
            size="sm"
            className="ml-auto h-7 w-7 p-0"
            onClick={() => setSelected([])}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Tree list card — keep bordered content */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto rounded-none border border-input bg-card px-3 py-3">
        {/* Root node */}
        <div className="mb-1 flex items-center gap-1.5 px-1 py-1">
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="text-xs font-semibold">Filters</span>
          <span className="ml-auto text-[10px] text-muted-foreground">{filtered.length} total</span>
        </div>

        <div className="ml-[7px] border-l border-input pl-3 space-y-0.5">
          {/* Built-in group */}
          <GroupBlock
            label="Built-in"
            icon={<Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            groupKey="builtin"
            rows={builtIn}
            source="built_in"
          />

          {/* From Attributes group */}
          <GroupBlock
            label="From Attributes"
            icon={<Filter className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />}
            groupKey="attribute"
            rows={fromAttributes}
            source="attribute"
          />
        </div>

      </div>
      {footerLeftActions && (
        <div className="mt-2 flex h-[34px] shrink-0 items-center gap-2 border-t border-border pl-[10px]">
          {footerLeftActions}
        </div>
      )}
      </div>

      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="right" className="w-full max-w-sm">
          <h2 className="pr-8 text-base font-semibold">Filters</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Narrow the list by name/param or display type.
          </p>
          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="font-medium">Search</span>
              <Input
                className="mt-1.5"
                placeholder="Search name, param, attribute…"
                value={toolbarFilters.search}
                onChange={(e) => setToolbarFilters((f) => ({ ...f, search: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Display type</span>
              <Select
                className="mt-1.5 w-full"
                value={toolbarFilters.displayType}
                onChange={(e) => setToolbarFilters((f) => ({ ...f, displayType: e.target.value }))}
              >
                <option value="all">All types</option>
                {(Object.keys(FILTER_DISPLAY_LABELS) as FilterDisplayType[]).map((t) => (
                  <option key={t} value={t}>{FILTER_DISPLAY_LABELS[t]}</option>
                ))}
              </Select>
            </label>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setToolbarFilters(DEFAULT_FILTERS)}
          >
            Reset filters
          </Button>
        </SheetContent>
      </Sheet>

      <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(400px,95vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-input bg-background p-5 shadow-xl">
            <Dialog.Title className="text-base font-semibold">Delete filters?</Dialog.Title>
            <p className="mt-2 text-sm text-muted-foreground">
              {deleteTargets.length} filter{deleteTargets.length > 1 ? "s" : ""} will be removed. System filters are protected.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" className="absolute right-3 top-3 h-8 w-8 p-0">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
});
