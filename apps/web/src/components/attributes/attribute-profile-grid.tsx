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
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Eye,
  Filter,
  GripVertical,
  Layers,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import type { AttributeProfile, AttributeGroup, AttributeSpec } from "@/lib/mock-data/attribute-profiles";
import {
  deleteAttributeProfiles,
  patchAttributeProfile,
  reorderAttributeProfiles,
  saveAttributeProfileBulk,
} from "@/lib/api/use-catalog-attribute-profiles";
import { cn } from "@/lib/utils";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ActivityTriggerButton } from "@/components/activity/activity-trigger-button";
import { AttributeProfileFormDialog } from "@/components/attributes/attribute-profile-form-dialog";
import { GroupFormDialog } from "@/components/attributes/group-form-dialog";
import { AttributeSpecFormDialog } from "@/components/attributes/attribute-spec-form-dialog";

const PAGE_SIZE = 25;

const COLUMN_KEYS = ["code", "categories", "products", "status", "updated"] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  code: "Code",
  categories: "Categories",
  products: "Products",
  status: "Status",
  updated: "Updated",
};

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  code: true,
  categories: true,
  products: true,
  status: true,
  updated: true,
};

const LIVE_EDIT_TOGGLES = ["status"] as const;
type LiveEditKey = (typeof LIVE_EDIT_TOGGLES)[number];

const LIVE_EDIT_LABELS: Record<LiveEditKey, string> = {
  status: "Status",
};

const LIVE_EDIT_HINTS: Record<LiveEditKey, string> = {
  status: "Click On / Off in grid · Off = inactive",
};

const DEFAULT_LIVE_EDIT: Record<LiveEditKey, boolean> = {
  status: true,
};

const FORM_ONLY_FIELDS = [
  "Description",
  "Category mapping",
  "Groups & Attributes",
] as const;

const FILTER_KEYS = ["search", "status"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const FILTER_LABELS: Record<FilterKey, string> = {
  search: "Search",
  status: "Status",
};

const FILTER_HINTS: Record<FilterKey, string> = {
  search: "Name or code",
  status: "Active / Inactive filter",
};

const DEFAULT_VISIBLE_FILTERS: Record<FilterKey, boolean> = {
  search: true,
  status: false,
};

type FilterState = {
  search: string;
  status: string;
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  status: "all",
};

function applyFilters(rows: AttributeProfile[], f: FilterState) {
  const q = f.search.toLowerCase().trim();
  return rows.filter((p) => {
    if (q && !p.name.toLowerCase().includes(q) && !p.code.toLowerCase().includes(q)) {
      return false;
    }
    if (f.status === "on" && !p.active) return false;
    if (f.status === "off" && p.active) return false;
    return true;
  });
}

function reorderProfileIds(
  profiles: AttributeProfile[],
  draggedId: string,
  overId: string,
): string[] | null {
  if (draggedId === overId) return null;
  const sorted = [...profiles].sort((a, b) => a.sortOrder - b.sortOrder);
  const ids = sorted.map((p) => p.id);
  const from = ids.indexOf(draggedId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0) return null;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, draggedId);
  return next;
}

type Props = {
  className?: string;
  addTrigger?: number;
  profiles: AttributeProfile[];
  groups: AttributeGroup[];
  attributes: AttributeSpec[];
  loading?: boolean;
  onProfilesChanged?: () => void;
  onView?: (profile: AttributeProfile) => void;
  onEdit?: (profile: AttributeProfile) => void;
  footerLeftActions?: ReactNode;
  headerLeftActions?: ReactNode;
  onAdvancedFilterCountChange?: (count: number) => void;
};

export type AttributeProfileGridHandle = {
  openFilters: () => void;
  openLiveEdit: () => void;
  openColumns: () => void;
};

function countAdvancedFilters(f: FilterState): number {
  let n = 0;
  if (f.status !== "all") n += 1;
  if (f.search.trim()) n += 1;
  return n;
}

export const AttributeProfileGrid = forwardRef<AttributeProfileGridHandle, Props>(function AttributeProfileGrid(
  {
    className,
    addTrigger = 0,
    profiles,
    groups,
    attributes,
    loading = false,
    onProfilesChanged,
    onView,
    onEdit: onEditProp,
    footerLeftActions,
    headerLeftActions,
    onAdvancedFilterCountChange,
  },
  ref,
) {
  const canWrite = useAdminCanWrite();

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editProfile, setEditProfile] = useState<AttributeProfile | null>(null);
  const [selected, setSelected] = useState<AttributeProfile[]>([]);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState(DEFAULT_VISIBLE);
  const [liveEditSheetOpen, setLiveEditSheetOpen] = useState(false);
  const [liveEdit, setLiveEdit] = useState(DEFAULT_LIVE_EDIT);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [visibleFilters, setVisibleFilters] = useState(DEFAULT_VISIBLE_FILTERS);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<AttributeProfile[]>([]);
  const [expandedProfiles, setExpandedProfiles] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [addGroupProfileId, setAddGroupProfileId] = useState<string | null>(null);
  const [addAttrGroupId, setAddAttrGroupId] = useState<string | null>(null);
  // local sort-order overrides (optimistic drag)
  const [profileOrder, setProfileOrder] = useState<string[]>([]);
  const [groupOrderMap, setGroupOrderMap] = useState<Record<string, string[]>>({});
  const [attrOrderMap, setAttrOrderMap] = useState<Record<string, string[]>>({});
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const toggleProfile = (id: string) =>
    setExpandedProfiles((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleGroup = (id: string) =>
    setExpandedGroups((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const ordered = useMemo(
    () => [...profiles].sort((a, b) => a.sortOrder - b.sortOrder),
    [profiles],
  );
  const filtered = useMemo(() => applyFilters(ordered, filters), [ordered, filters]);
  const advancedCount = countAdvancedFilters(filters);

  useEffect(() => {
    onAdvancedFilterCountChange?.(advancedCount);
  }, [advancedCount, onAdvancedFilterCountChange]);

  useImperativeHandle(
    ref,
    () => ({
      openFilters: () => setFilterSheetOpen(true),
      openLiveEdit: () => setLiveEditSheetOpen(true),
      openColumns: () => setColumnSheetOpen(true),
    }),
    [],
  );

  const openCreate = useCallback(() => {
    setFormMode("create");
    setEditProfile(null);
    setFormOpen(true);
  }, []);

  useEffect(() => {
    if (addTrigger > 0 && canWrite) openCreate();
  }, [addTrigger, openCreate, canWrite]);

  const openEdit = useCallback(
    (profile: AttributeProfile) => {
      if (onEditProp) {
        onEditProp(profile);
      } else {
        setFormMode("edit");
        setEditProfile(profile);
        setFormOpen(true);
      }
    },
    [onEditProp],
  );

  const turnOff = useCallback(
    async (profile: AttributeProfile) => {
      try {
        await patchAttributeProfile(profile.id, { active: false });
        toast.success(`Turned off ${profile.name}`);
        onProfilesChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Update failed");
      }
    },
    [onProfilesChanged],
  );

  const toggleActive = useCallback(
    async (profile: AttributeProfile) => {
      try {
        await patchAttributeProfile(profile.id, { active: !profile.active });
        onProfilesChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Update failed");
      }
    },
    [onProfilesChanged],
  );

  const openDeleteConfirm = useCallback((targets: AttributeProfile[]) => {
    setDeleteTargets(targets);
    setDeleteOpen(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    try {
      await deleteAttributeProfiles(deleteTargets.map((t) => t.id));
      toast.success(
        `Deleted ${deleteTargets.length} profile${deleteTargets.length > 1 ? "s" : ""}`,
      );
      setDeleteOpen(false);
      setDeleteTargets([]);
      setSelected([]);
      onProfilesChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }, [deleteTargets, onProfilesChanged]);

  const handleSave = (data: Partial<AttributeProfile>) => {
    onProfilesChanged?.();
    void data;
  };

  // ── DND handlers ──────────────────────────────────────────────────────────
  const handleProfileDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const activeId = String(active.id);
      const overId = String(over.id);
      const orderedIds = reorderProfileIds(profiles, activeId, overId);
      if (!orderedIds) return;
      // optimistic
      setProfileOrder(orderedIds);
      try {
        await reorderAttributeProfiles(orderedIds);
        onProfilesChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Reorder failed");
        setProfileOrder([]);
      }
    },
    [profiles, onProfilesChanged],
  );

  const makeGroupDragEnd = useCallback(
    (profile: AttributeProfile, profileGroups: AttributeGroup[]) =>
      async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const activeId = String(active.id);
        const overId = String(over.id);
        const ids = profileGroups.map((g) => g.id);
        const from = ids.indexOf(activeId);
        const to = ids.indexOf(overId);
        if (from < 0 || to < 0) return;
        const newIds = arrayMove(ids, from, to);
        setGroupOrderMap((m) => ({ ...m, [profile.id]: newIds }));
        try {
          const reorderedGroups = newIds.map((gid) => profileGroups.find((g) => g.id === gid)!);
          await saveAttributeProfileBulk({
            profileId: profile.id,
            profileName: profile.name,
            groups: reorderedGroups.map((g) => ({
              id: g.id,
              name: g.name,
              attributes: attributes
                .filter((a) => a.groupId === g.id)
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((a) => ({
                  id: a.id,
                  name: a.name,
                  filterable: a.isFilterable,
                  filterDisplayType: a.filterDisplayType ?? "multi_select",
                  storefrontFilterVisible: a.storefrontFilterVisible ?? true,
                  predefinedValues: a.predefinedValues,
                })),
            })),
          });
          onProfilesChanged?.();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Reorder failed");
          setGroupOrderMap((m) => { const n = { ...m }; delete n[profile.id]; return n; });
        }
      },
    [attributes, onProfilesChanged],
  );

  const makeAttrDragEnd = useCallback(
    (profile: AttributeProfile, group: AttributeGroup, groupAttrs: AttributeSpec[]) =>
      async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const activeId = String(active.id);
        const overId = String(over.id);
        const ids = groupAttrs.map((a) => a.id);
        const from = ids.indexOf(activeId);
        const to = ids.indexOf(overId);
        if (from < 0 || to < 0) return;
        const newIds = arrayMove(ids, from, to);
        setAttrOrderMap((m) => ({ ...m, [group.id]: newIds }));
        try {
          const profileGroups = groups.filter((g) => g.profileId === profile.id).sort((a, b) => a.sortOrder - b.sortOrder);
          await saveAttributeProfileBulk({
            profileId: profile.id,
            profileName: profile.name,
            groups: profileGroups.map((g) => ({
              id: g.id,
              name: g.name,
              attributes: (g.id === group.id
                ? newIds.map((id) => groupAttrs.find((a) => a.id === id)!)
                : attributes.filter((a) => a.groupId === g.id).sort((a, b) => a.sortOrder - b.sortOrder)
              ).map((a) => ({
                id: a.id,
                name: a.name,
                filterable: a.isFilterable,
                filterDisplayType: a.filterDisplayType ?? "multi_select",
                storefrontFilterVisible: a.storefrontFilterVisible ?? true,
                predefinedValues: a.predefinedValues,
              })),
            })),
          });
          onProfilesChanged?.();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Reorder failed");
          setAttrOrderMap((m) => { const n = { ...m }; delete n[group.id]; return n; });
        }
      },
    [groups, attributes, onProfilesChanged],
  );

  // effective ordering helpers
  const effectiveProfileIds = useMemo(() => {
    const ordered2 = [...profiles].sort((a, b) => a.sortOrder - b.sortOrder);
    if (profileOrder.length) return profileOrder;
    return ordered2.map((p) => p.id);
  }, [profiles, profileOrder]);

  const toggleVisibleFilter = (key: FilterKey, enabled: boolean) => {
    setVisibleFilters((v) => ({ ...v, [key]: enabled }));
    if (!enabled) {
      setFilters((f) => ({
        ...f,
        ...(key === "search" ? { search: "" } : {}),
        ...(key === "status" ? { status: "all" } : {}),
      }));
    }
  };

  return (
    <div className={cn("relative flex min-h-0 w-full min-w-0 flex-col overflow-hidden", className)}>
      <div
        data-component="attribute-profile-grid-filters"
        className="attribute-profile-grid-filters flex min-w-0 shrink-0 items-center gap-2 border-b border-border py-2 pl-2 pr-0"
      >
        {headerLeftActions && (
          <div className="flex shrink-0 items-center gap-2 border-r border-border bg-background pr-2">
            {headerLeftActions}
          </div>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visibleFilters.search && (
            <Input
              placeholder="Search name, code…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[220px] shrink-0 rounded-none"
            />
          )}
          {visibleFilters.status && (
            <Select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              className="w-[128px] shrink-0 rounded-none"
            >
              <option value="all">All status</option>
              <option value="on">Active</option>
              <option value="off">Inactive</option>
            </Select>
          )}
        </div>
        <button
          type="button"
          aria-label="Columns"
          title="Columns"
          onClick={() => setColumnSheetOpen(true)}
          className="inline-flex h-8 w-9 shrink-0 items-center justify-center text-foreground hover:bg-muted/40"
        >
          <SlidersHorizontal className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </button>
      </div>

      {/* Bulk actions bar */}
      {selected.length > 0 && canWrite && (
        <div className="flex flex-wrap items-center gap-2 border-b border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-xs font-medium">{selected.length} selected</span>
          <Button
            size="sm"
            onClick={() => {
              void (async () => {
                try {
                  await Promise.all(selected.map((p) => patchAttributeProfile(p.id, { active: true })));
                  toast.success(
                    `Activated ${selected.length} profile${selected.length > 1 ? "s" : ""}`,
                  );
                  setSelected([]);
                  onProfilesChanged?.();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Bulk update failed");
                }
              })();
            }}
          >
            Turn on (Active)
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void (async () => {
                try {
                  await Promise.all(selected.map((p) => patchAttributeProfile(p.id, { active: false })));
                  toast.success(
                    `Deactivated ${selected.length} profile${selected.length > 1 ? "s" : ""}`,
                  );
                  setSelected([]);
                  onProfilesChanged?.();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Bulk update failed");
                }
              })();
            }}
          >
            Turn off (Inactive)
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

      {/* Tree list — keep bordered content card */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto rounded-none border border-input bg-card">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-sm font-medium">No profiles match your filters</p>
            <Button size="sm" className="mt-4" onClick={() => setFilters(DEFAULT_FILTERS)}>
              Clear filters
            </Button>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleProfileDragEnd}>
            <SortableContext items={effectiveProfileIds} strategy={verticalListSortingStrategy}>
              <div className="divide-y divide-input">
                {effectiveProfileIds
                  .map((pid) => filtered.find((p) => p.id === pid))
                  .filter(Boolean)
                  .map((profile) => {
                    const p = profile!;
                    const profileExpanded = expandedProfiles.has(p.id);
                    const rawGroups = groups
                      .filter((g) => g.profileId === p.id)
                      .sort((a, b) => a.sortOrder - b.sortOrder);
                    const orderedGroupIds = groupOrderMap[p.id] ?? rawGroups.map((g) => g.id);
                    const profileGroups = orderedGroupIds
                      .map((id) => rawGroups.find((g) => g.id === id))
                      .filter(Boolean) as AttributeGroup[];

                    return (
                      <SortableProfileRow
                        key={p.id}
                        profile={p}
                        profileExpanded={profileExpanded}
                        onToggleProfile={() => toggleProfile(p.id)}
                        onEdit={() => openEdit(p)}
                        onToggleActive={() => toggleActive(p)}
                        onTurnOff={() => turnOff(p)}
                        onDelete={() => openDeleteConfirm([p])}
                        onView={onView ? () => onView!(p) : undefined}
                        selected={selected.some((s) => s.id === p.id)}
                        onSelect={(checked) =>
                          setSelected((prev) => checked ? [...prev, p] : prev.filter((s) => s.id !== p.id))
                        }
                        canWrite={canWrite}
                      >
                        {profileExpanded && (
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={makeGroupDragEnd(p, profileGroups)}
                          >
                            <SortableContext items={orderedGroupIds} strategy={verticalListSortingStrategy}>
                              <div className="ml-8 border-l border-input pb-1 pl-3">
                                {profileGroups.map((group) => {
                                  const groupExpanded = expandedGroups.has(group.id);
                                  const rawAttrs = attributes
                                    .filter((a) => a.groupId === group.id)
                                    .sort((a, b) => a.sortOrder - b.sortOrder);
                                  const orderedAttrIds = attrOrderMap[group.id] ?? rawAttrs.map((a) => a.id);
                                  const groupAttrs = orderedAttrIds
                                    .map((id) => rawAttrs.find((a) => a.id === id))
                                    .filter(Boolean) as AttributeSpec[];

                                  return (
                                    <SortableGroupRow
                                      key={group.id}
                                      group={group}
                                      groupExpanded={groupExpanded}
                                      onToggle={() => toggleGroup(group.id)}
                                      groupAttrs={groupAttrs}
                                      orderedAttrIds={orderedAttrIds}
                                      onDragEndAttrs={makeAttrDragEnd(p, group, groupAttrs)}
                                      sensors={sensors}
                                      onAddAttribute={canWrite ? () => setAddAttrGroupId(group.id) : undefined}
                                    />
                                  );
                                })}
                                {canWrite && (
                                  <button
                                    type="button"
                                    onClick={() => setAddGroupProfileId(p.id)}
                                    className="mt-1 flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                                  >
                                    <Plus className="h-3 w-3" /> Add group
                                  </button>
                                )}
                              </div>
                            </SortableContext>
                          </DndContext>
                        )}
                      </SortableProfileRow>
                    );
                  })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
      {footerLeftActions && (
        <div className="mt-2 flex h-[34px] shrink-0 items-center gap-2 border-t border-border pl-[10px]">
          {footerLeftActions}
        </div>
      )}
      </div>

      {/* Group dialog */}
      <GroupFormDialog
        open={addGroupProfileId !== null}
        onOpenChange={(open) => { if (!open) setAddGroupProfileId(null); }}
        profileId={addGroupProfileId ?? ""}
        onSave={async (data) => {
          const prof = profiles.find((p) => p.id === data.profileId);
          if (!prof) return;
          const profileGroups = groups
            .filter((g) => g.profileId === data.profileId)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          try {
            await saveAttributeProfileBulk({
              profileId: data.profileId,
              profileName: prof.name,
              groups: [
                ...profileGroups.map((g) => ({
                  id: g.id,
                  name: g.name,
                  attributes: attributes
                    .filter((a) => a.groupId === g.id)
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((a) => ({
                  id: a.id,
                  name: a.name,
                  filterable: a.isFilterable,
                  filterDisplayType: a.filterDisplayType ?? "multi_select",
                  storefrontFilterVisible: a.storefrontFilterVisible ?? true,
                  predefinedValues: a.predefinedValues,
                })),
                })),
                { name: data.name ?? "", attributes: [] },
              ],
            });
            toast.success("Group created");
            onProfilesChanged?.();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed");
          }
        }}
      />

      {/* Attribute dialog */}
      {addAttrGroupId && (() => {
        const group = groups.find((g) => g.id === addAttrGroupId);
        const prof = group ? profiles.find((p) => p.id === group.profileId) : null;
        return (
          <AttributeSpecFormDialog
            open
            onOpenChange={(open) => { if (!open) setAddAttrGroupId(null); }}
            groupId={addAttrGroupId}
            onSave={async (data) => {
              if (!group || !prof) return;
              const profileGroups = groups
                .filter((g) => g.profileId === group.profileId)
                .sort((a, b) => a.sortOrder - b.sortOrder);
              try {
                await saveAttributeProfileBulk({
                  profileId: prof.id,
                  profileName: prof.name,
                  groups: profileGroups.map((g) => ({
                    id: g.id,
                    name: g.name,
                    attributes: [
                      ...attributes
                        .filter((a) => a.groupId === g.id)
                        .sort((a, b) => a.sortOrder - b.sortOrder)
                        .map((a) => ({
                  id: a.id,
                  name: a.name,
                  filterable: a.isFilterable,
                  filterDisplayType: a.filterDisplayType ?? "multi_select",
                  storefrontFilterVisible: a.storefrontFilterVisible ?? true,
                  predefinedValues: a.predefinedValues,
                })),
                      ...(g.id === addAttrGroupId
                        ? [{
                            name: data.name ?? "",
                            filterable: data.isFilterable ?? false,
                            filterDisplayType: "multi_select" as const,
                            storefrontFilterVisible: true,
                          }]
                        : []),
                    ],
                  })),
                });
                toast.success("Attribute created");
                onProfilesChanged?.();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed");
              }
            }}
          />
        );
      })()}

      {/* Internal form dialog (fallback when onEdit prop not provided) */}
      <AttributeProfileFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        profile={
          editProfile
            ? profiles.find((p) => p.id === editProfile.id) ?? editProfile
            : null
        }
        groups={groups}
        attributes={attributes}
        onSave={handleSave}
        onSaved={() => onProfilesChanged?.()}
      />

      {/* Columns sheet */}
      <Sheet open={columnSheetOpen} onOpenChange={setColumnSheetOpen}>
        <SheetContent side="right" className="w-[180px] max-w-[180px] gap-2 p-3">
          <h2 className="pr-6 text-sm font-semibold">Columns</h2>
          <div className="mt-3 space-y-1.5">
            {COLUMN_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={visibleCols[key]}
                  onChange={(e) =>
                    setVisibleCols((v) => ({ ...v, [key]: e.target.checked }))
                  }
                  className="rounded border-input"
                />
                {COLUMN_LABELS[key]}
              </label>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-7 text-xs"
            onClick={() => setVisibleCols(DEFAULT_VISIBLE)}
          >
            Reset columns
          </Button>
        </SheetContent>
      </Sheet>

      {/* Filters sheet */}
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="right" className="w-full max-w-sm">
          <h2 className="pr-8 text-base font-semibold">Filters</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose which filters show in the toolbar above the list.
          </p>
          <div className="mt-4 space-y-3">
            {FILTER_KEYS.map((key) => (
              <label key={key} className="flex cursor-pointer gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={visibleFilters[key]}
                  onChange={(e) => toggleVisibleFilter(key, e.target.checked)}
                  className="mt-0.5 rounded border-input"
                />
                <span>
                  <span className="font-medium">{FILTER_LABELS[key]}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {FILTER_HINTS[key]}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              setVisibleFilters(DEFAULT_VISIBLE_FILTERS);
              setFilters(DEFAULT_FILTERS);
            }}
          >
            Reset filters
          </Button>
        </SheetContent>
      </Sheet>

      {/* Live edit sheet */}
      <Sheet open={liveEditSheetOpen} onOpenChange={setLiveEditSheetOpen}>
        <SheetContent side="right" className="w-full max-w-sm">
          <h2 className="pr-8 text-base font-semibold">Live edit</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose which fields you can edit directly in the list without opening the form.
          </p>
          <div className="mt-4 space-y-3">
            {LIVE_EDIT_TOGGLES.map((key) => (
              <label key={key} className="flex cursor-pointer gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={liveEdit[key]}
                  onChange={(e) =>
                    setLiveEdit((v) => ({ ...v, [key]: e.target.checked }))
                  }
                  className="mt-0.5 rounded border-input"
                />
                <span>
                  <span className="font-medium">{LIVE_EDIT_LABELS[key]}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {LIVE_EDIT_HINTS[key]}
                  </span>
                </span>
              </label>
            ))}
            <div className="rounded-md border border-input bg-muted/30 px-3 py-2">
              <p className="text-xs font-medium">Order</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Drag row handle to reorder</p>
              <p className="mt-1 text-[10px] text-muted-foreground">Always enabled</p>
            </div>
          </div>
          <div className="mt-5 border-t border-input pt-4">
            <p className="text-xs font-medium text-muted-foreground">Edit form only</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {FORM_ONLY_FIELDS.map((f) => (
                <li key={f}>· {f}</li>
              ))}
            </ul>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setLiveEdit(DEFAULT_LIVE_EDIT)}
          >
            Reset live edit
          </Button>
        </SheetContent>
      </Sheet>

      {/* Delete confirm dialog */}
      <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(420px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-input bg-background p-6 shadow-xl">
            <Dialog.Title className="text-base font-semibold">Delete profiles?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              {deleteTargets.length === 1
                ? `"${deleteTargets[0]?.name}" and all its groups/attributes will be permanently deleted.`
                : `${deleteTargets.length} profiles will be permanently deleted.`}
            </Dialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="destructive" onClick={confirmDelete}>
                Delete
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
});

/* ── Sortable profile row ─────────────────────────────────────────────────── */
function SortableProfileRow({
  profile, profileExpanded, onToggleProfile, onEdit, onToggleActive, onTurnOff, onDelete, onView,
  selected, onSelect, canWrite, children,
}: {
  profile: AttributeProfile;
  profileExpanded: boolean;
  onToggleProfile: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onTurnOff: () => void;
  onDelete: () => void;
  onView?: () => void;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  canWrite: boolean;
  children?: React.ReactNode;
}) {
  const { attributes: dndAttrs, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: profile.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={cn(!profile.active && "opacity-60")}
    >
      <div className="flex items-center gap-1 px-2 py-1 hover:bg-muted/30">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <RowActionsTrigger className="h-[26px] w-[26px]" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {onView && (
              <DropdownMenuItem onClick={onView}>
                <Eye className="mr-2 h-3.5 w-3.5" /> View
              </DropdownMenuItem>
            )}
            {canWrite && (
              <>
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="mr-2 h-3.5 w-3.5" /> Edit profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onTurnOff} className="text-destructive">
                  <Archive className="mr-2 h-3.5 w-3.5" /> Turn off
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {canWrite && (
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
            className="h-3.5 w-3.5 shrink-0 rounded-none border-input"
          />
        )}
        <button
          type="button"
          className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          {...dndAttrs}
          {...listeners}
        >
          <GripVertical className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onToggleProfile}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          {profileExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        <Layers className="h-3 w-3 shrink-0 text-primary" />
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-xs font-semibold hover:underline focus-visible:outline-none"
          onClick={onEdit}
        >
          {profile.name}
        </button>
        <span className="hidden shrink-0 font-mono text-[10px] text-muted-foreground sm:block">{profile.code}</span>
        <span className="hidden shrink-0 text-[10px] text-muted-foreground lg:block">
          {profile.categoryLabels.join(", ") || "—"}
        </span>
        <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:block">
          {profile.productCount} products
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleActive(); }}
          className={cn(
            "shrink-0 rounded-none px-1 py-0 text-[9px] font-medium leading-4 transition-colors",
            profile.active ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground",
          )}
        >
          {profile.active ? "On" : "Off"}
        </button>
      </div>
      {children}
    </div>
  );
}

/* ── Sortable group row ───────────────────────────────────────────────────── */
function SortableGroupRow({
  group, groupExpanded, onToggle, groupAttrs, orderedAttrIds,
  onDragEndAttrs, sensors, onAddAttribute,
}: {
  group: AttributeGroup;
  groupExpanded: boolean;
  onToggle: () => void;
  groupAttrs: AttributeSpec[];
  orderedAttrIds: string[];
  onDragEndAttrs: (event: DragEndEvent) => void;
  sensors: ReturnType<typeof useSensors>;
  onAddAttribute?: () => void;
}) {
  const { attributes: dndAttrs, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: group.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
    >
      <div className="flex items-center gap-1.5 rounded-md px-1 py-1 hover:bg-muted/40">
        <button
          type="button"
          className="shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
          {...dndAttrs}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 items-center gap-1.5 text-left"
        >
          {groupExpanded
            ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <span className="flex-1 text-xs font-medium">{group.name}</span>
          <span className="mr-1 text-[10px] text-muted-foreground">{groupAttrs.length}</span>
        </button>
        {onAddAttribute && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAddAttribute(); }}
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Add attribute"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>

      {groupExpanded && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEndAttrs}>
          <SortableContext items={orderedAttrIds} strategy={verticalListSortingStrategy}>
            <div className="ml-5 border-l border-input pl-3 py-0.5">
              {groupAttrs.map((attr) => (
                <SortableAttrRow key={attr.id} attr={attr} />
              ))}
              {groupAttrs.length === 0 && onAddAttribute && (
                <button
                  type="button"
                  onClick={onAddAttribute}
                  className="flex w-full items-center gap-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Plus className="h-3 w-3" /> Add first attribute
                </button>
              )}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

/* ── Sortable attribute row ───────────────────────────────────────────────── */
function SortableAttrRow({ attr }: { attr: AttributeSpec }) {
  const { attributes: dndAttrs, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: attr.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[11px] hover:bg-muted/30"
    >
      <button
        type="button"
        className="shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        {...dndAttrs}
        {...listeners}
      >
        <GripVertical className="h-3 w-3" />
      </button>
      <span className="font-medium">{attr.name}</span>
      {attr.isFilterable && (
        <span className="inline-flex items-center gap-0.5 rounded bg-sky-100 px-1 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
          <Filter className="h-2.5 w-2.5" /> Filter
        </span>
      )}
      <span className="ml-auto text-muted-foreground">{attr.fieldType}</span>
    </div>
  );
}
