"use client";

/* The specification profiles drawer: every profile as a tree (Profile → Group → Field), in the same drawer format
   as Add / Edit Attribute Profile; clicking a profile opens its edit drawer. Used by the product form's
   Specifications row (list icon) and opened from Website → Catalog → Filter (openSpecificationProfiles()). */

import Link from "next/link";
import { useMemo, useState } from "react";
import { create } from "zustand";
import { ChevronDown, ChevronRight, Filter, Layers, Pencil, Plus, X } from "lucide-react";
import { AttributeProfileFormDialog } from "@/components/attributes/attribute-profile-form-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useCatalogAttributeProfiles } from "@/lib/api/use-catalog-attribute-profiles";
import type { AttributeGroup, AttributeProfile, AttributeSpec } from "@/lib/mock-data/attribute-profiles";

/* ── Specification list: every profile as a tree (Profile → Group → Field), in the same drawer format as
   Add / Edit Attribute Profile; clicking a profile opens its edit drawer ── */
export function ProfileListSheet({
  open, onOpenChange, profiles, groups, attributes, loading, onOpenProfile, onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: AttributeProfile[];
  groups: AttributeGroup[];
  attributes: AttributeSpec[];
  loading: boolean;
  onOpenProfile: (id: string) => void;
  onAdd: () => void;
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const rows = useMemo(() => {
    const fieldsByGroup = new Map<string, AttributeSpec[]>();
    attributes.forEach((a) => fieldsByGroup.set(a.groupId, [...(fieldsByGroup.get(a.groupId) ?? []), a]));
    const q = search.trim().toLowerCase();
    return [...profiles]
      .sort((x, y) => x.sortOrder - y.sortOrder || x.name.localeCompare(y.name))
      .map((p) => {
        const gs = groups
          .filter((g) => g.profileId === p.id)
          .sort((x, y) => x.sortOrder - y.sortOrder)
          .map((g) => ({ ...g, fields: (fieldsByGroup.get(g.id) ?? []).sort((x, y) => x.sortOrder - y.sortOrder) }));
        return { ...p, groups: gs, fieldCount: gs.reduce((n, g) => n + g.fields.length, 0) };
      })
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q)
        || p.groups.some((g) => g.name.toLowerCase().includes(q) || g.fields.some((f) => f.name.toLowerCase().includes(q))));
  }, [profiles, groups, attributes, search]);

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
            <SheetTitle className="text-base font-semibold">
              Specification Profiles
              <span className="ml-1.5 font-normal text-muted-foreground">({loading ? "…" : profiles.length})</span>
            </SheetTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={onAdd}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add profile
              </Button>
              <button
                type="button"
                className="rounded-md p-1 hover:bg-accent"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* ── Tree: Profile → Groups → Fields ── */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-3 px-5 py-4">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search profiles, groups or fields…"
                className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
              />
              {rows.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">{loading ? "Loading…" : "No profiles found"}</p>
              ) : (
                <div className="space-y-0.5">
                  {rows.map((p) => {
                    const isOpen = expanded.has(p.id) || (!!search.trim() && rows.length <= 3);
                    return (
                      <div key={p.id}>
                        {/* Profile row */}
                        <div className="group flex items-center gap-1.5 rounded-md px-1 py-1 hover:bg-muted/40">
                          <button
                            type="button"
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                            onClick={() => toggle(p.id)}
                            aria-label={isOpen ? "Collapse" : "Expand"}
                          >
                            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                          <Layers className="h-3.5 w-3.5 shrink-0 text-primary" />
                          <button
                            type="button"
                            onClick={() => onOpenProfile(p.id)}
                            className="min-w-0 flex-1 truncate text-left text-xs font-semibold hover:text-primary"
                            title="Open profile"
                          >
                            {p.name}
                          </button>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {p.groups.length} groups · {p.fieldCount} fields
                          </span>
                          <button
                            type="button"
                            onClick={() => onOpenProfile(p.id)}
                            className="shrink-0 rounded-md p-0.5 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100"
                            aria-label={`Edit ${p.name}`}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        </div>

                        {/* Groups indented under the profile */}
                        {isOpen && (
                          <div className="ml-[7px] border-l border-input pl-3">
                            {p.groups.length === 0 ? (
                              <p className="px-1.5 py-1 text-[11px] text-muted-foreground">No groups yet</p>
                            ) : (
                              p.groups.map((g) => (
                                <div key={g.id}>
                                  <div className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium hover:bg-muted/40">
                                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    <span className="min-w-0 flex-1 truncate">{g.name}</span>
                                    <span className="text-[10px] font-normal text-muted-foreground">{g.fields.length}</span>
                                  </div>
                                  <div className="ml-5 border-l border-input pl-3">
                                    {g.fields.map((f) => (
                                      <p key={f.id} className="truncate px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                        {f.name}
                                        {f.isFilterable && <Filter className="ml-1 inline h-2.5 w-2.5 text-primary/70" />}
                                      </p>
                                    ))}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Bottom bar */}
              <div className="flex items-center justify-between gap-2 border-t border-input pt-3">
                <Link href="/website/specifications/profiles" className="text-xs text-primary hover:underline">
                  Open Specification Profiles page →
                </Link>
                <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const useDrawerStore = create<{ open: boolean; setOpen: (open: boolean) => void }>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

/** opens the drawer from anywhere (e.g. a menu item) — needs <SpecificationProfilesDrawer /> mounted */
export const openSpecificationProfiles = () => useDrawerStore.getState().setOpen(true);

/** the drawer with its own data, plus the Edit / Add Attribute Profile drawers it opens (the profiles are only
    loaded while it's open) */
export function SpecificationProfilesDrawer() {
  const open = useDrawerStore((s) => s.open);
  return open ? <LoadedDrawer /> : null;
}

function LoadedDrawer() {
  const open = useDrawerStore((s) => s.open);
  const setOpen = useDrawerStore((s) => s.setOpen);
  const [editId, setEditId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { profiles, groups, attributes, loading, refetch } = useCatalogAttributeProfiles();

  return (
    <>
      <ProfileListSheet
        open={open}
        onOpenChange={setOpen}
        profiles={profiles}
        groups={groups}
        attributes={attributes}
        loading={loading}
        onOpenProfile={setEditId}
        onAdd={() => setAdding(true)}
      />
      <AttributeProfileFormDialog
        open={!!editId}
        onOpenChange={(o) => { if (!o) setEditId(null); }}
        mode="edit"
        profile={profiles.find((p) => p.id === editId) ?? null}
        groups={groups}
        attributes={attributes}
        onSaved={() => { setEditId(null); void refetch(); }}
      />
      <AttributeProfileFormDialog
        open={adding}
        onOpenChange={setAdding}
        mode="create"
        profile={null}
        groups={groups}
        attributes={attributes}
        onSaved={() => { setAdding(false); void refetch(); }}
      />
    </>
  );
}
