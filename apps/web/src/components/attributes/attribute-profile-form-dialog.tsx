"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, GripVertical, ImageIcon, Layers, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  createEmptyBulkGroup,
  profileToBulkForm,
  type BulkAttributeFormState,
  type BulkAttributeGroupRow,
  type AttributeGroup,
  type AttributeProfile,
  type AttributeSpec,
} from "@/lib/mock-data/attribute-profiles";
import { saveAttributeProfileBulk } from "@/lib/api/use-catalog-attribute-profiles";
import {
  fetchAttributeProfileValueUsage,
  type LockedFilterValuesByAttrId,
} from "@/lib/api/catalog-attribute-profiles";
import {
  reorderGroupsByKey,
  SortableAttributeGrid,
} from "@/components/attributes/sortable-attribute-grid";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "create" | "edit";
  profile?: AttributeProfile | null;
  groups: AttributeGroup[];
  attributes: AttributeSpec[];
  onSave?: (data: Partial<AttributeProfile>) => void;
  onSaved?: (profileId?: string) => void;
};

export function AttributeProfileFormDialog({
  open,
  onOpenChange,
  mode = "create",
  profile,
  groups,
  attributes,
  onSave,
  onSaved,
}: Props) {

  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

  const [form, setForm] = useState<BulkAttributeFormState>({ profileName: "", groups: [] });
  const [imageUrl, setImageUrl] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dragGroupKey, setDragGroupKey] = useState<string | null>(null);
  const [overGroupKey, setOverGroupKey] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [profileCollapsed, setProfileCollapsed] = useState(false);
  const [lockedValuesByAttrId, setLockedValuesByAttrId] = useState<LockedFilterValuesByAttrId>({});

  const toggleCollapse = (key: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && profile) {
      setActiveProfileId(profile.id);
      setForm(profileToBulkForm(profile, groups, attributes));
      setImageUrl(profile.imageUrl ?? "");
      setErrors({});
      setLockedValuesByAttrId({});
      void fetchAttributeProfileValueUsage(profile.id)
        .then(setLockedValuesByAttrId)
        .catch(() => setLockedValuesByAttrId({}));
    } else {
      setActiveProfileId(null);
      setForm({ profileName: "", groups: [] });
      setErrors({});
      setLockedValuesByAttrId({});
    }
  }, [open, mode, profile, groups, attributes]);

  const validate = useCallback(() => {
    const next: Record<string, string> = {};
    if (!form.profileName.trim()) next.profileName = "Profile name is required.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [form.profileName]);

  const handleSave = () => {
    if (!validate()) {
      toast.error("Profile name is required.");
      return;
    }
    const payloadGroups = form.groups
      .filter((g) => g.name.trim())
      .map((g) => ({
        id: g.id,
        name: g.name.trim(),
        attributes: g.attributes
          .filter((a) => a.name.trim())
          .map((a) => ({
            id: a.id,
            name: a.name.trim(),
            filterable: a.filterable,
            filterDisplayType: a.filterDisplayType,
            storefrontFilterVisible: a.storefrontFilterVisible,
            predefinedValues: a.predefinedValues,
          })),
      }));

    void (async () => {
      try {
        const saved = await saveAttributeProfileBulk({
          profileId: activeProfileId ?? undefined,
          profileName: form.profileName.trim(),
          imageUrl: imageUrl.trim() || undefined,
          groups: payloadGroups,
        });
        toast.success("Attribute profile saved");
        onSave?.({ name: form.profileName.trim() });
        onSaved?.(saved.id);
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed");
      }
    })();
  };

  // ── Group helpers ─────────────────────────────────────────────────────────
  const addGroup = () =>
    setForm((f) => ({ ...f, groups: [...f.groups, createEmptyBulkGroup()] }));

  const removeGroup = (key: string) =>
    setForm((f) => ({ ...f, groups: f.groups.filter((g) => g.key !== key) }));

  const updateGroup = (key: string, patch: Partial<BulkAttributeGroupRow>) =>
    setForm((f) => ({
      ...f,
      groups: f.groups.map((g) => (g.key === key ? { ...g, ...patch } : g)),
    }));

  const handleGroupDrop = (targetKey: string) => {
    if (!dragGroupKey || dragGroupKey === targetKey) return;
    setForm((f) => ({
      ...f,
      groups: reorderGroupsByKey(f.groups, dragGroupKey, targetKey),
    }));
    setDragGroupKey(null);
    setOverGroupKey(null);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-xl gap-0 overflow-hidden p-0 sm:max-w-xl [&>button.absolute]:hidden"
        aria-describedby={undefined}
      >
        <div className="flex h-full min-h-0 flex-col">

          {/* ── Header ──────────────────────────────────────────────────────── */}
          <div className="flex shrink-0 items-center justify-between border-b border-input px-5 py-4">
            <p className="text-base font-semibold">
              {mode === "edit" ? (form.profileName || profile?.name || "Edit Profile") : "Add Attribute Profile"}
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleSave}>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                Save
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

          {/* ── Editor: Profile root → Groups → Attributes ───────────────────── */}
          <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="space-y-3 px-5 py-4">
                {/* Tree: Profile root → Groups → Attributes */}
                <div>
                  {/* Profile root row */}
                  <div className="flex items-center gap-1.5 rounded-md px-1 py-1 hover:bg-muted/40">
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => setProfileCollapsed((v) => !v)}
                      aria-label={profileCollapsed ? "Expand" : "Collapse"}
                    >
                      {profileCollapsed
                        ? <ChevronRight className="h-3.5 w-3.5" />
                        : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                    <Layers className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <Input
                      id="drawer-profile-name"
                      value={form.profileName}
                      onChange={(e) => setForm((f) => ({ ...f, profileName: e.target.value }))}
                      placeholder="Profile name"
                      className="h-6 min-w-0 flex-1 border-0 bg-transparent px-0 text-xs font-semibold shadow-none focus-visible:ring-0"
                    />
                    {errors.profileName && (
                      <p className="text-xs text-destructive">{errors.profileName}</p>
                    )}
                  </div>

                  {/* Groups indented under profile */}
                  {!profileCollapsed && <div className="ml-[7px] border-l border-input pl-3">
                    <div className="space-y-0.5">
                      {form.groups.map((group, groupIndex) => (
                        <div
                          key={group.key}
                          onDragOver={(e) => { e.preventDefault(); setOverGroupKey(group.key); }}
                          onDragLeave={() => setOverGroupKey((k) => (k === group.key ? null : k))}
                          onDrop={() => handleGroupDrop(group.key)}
                          className={cn(overGroupKey === group.key && dragGroupKey !== group.key && "rounded-md ring-2 ring-primary/30")}
                        >
                          {/* Group row — draggable */}
                          <div
                            draggable
                            onDragStart={() => setDragGroupKey(group.key)}
                            onDragEnd={() => { setDragGroupKey(null); setOverGroupKey(null); }}
                            className={cn(
                              "flex cursor-grab items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-muted/40 active:cursor-grabbing",
                              dragGroupKey === group.key && "opacity-50",
                            )}
                          >
                            <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                            <button
                              type="button"
                              className="shrink-0 text-muted-foreground hover:text-foreground"
                              onClick={(e) => { e.stopPropagation(); toggleCollapse(group.key); }}
                              aria-label={collapsedGroups.has(group.key) ? "Expand" : "Collapse"}
                            >
                              {collapsedGroups.has(group.key)
                                ? <ChevronRight className="h-3.5 w-3.5" />
                                : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                            <Input
                              value={group.name}
                              onChange={(e) => updateGroup(group.key, { name: e.target.value })}
                              placeholder={`Group ${groupIndex + 1} name`}
                              className="h-6 min-w-0 flex-1 border-0 bg-transparent px-0 text-xs font-medium shadow-none focus-visible:ring-0"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 shrink-0 p-0 text-muted-foreground/50 hover:text-destructive"
                              onClick={() => removeGroup(group.key)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>

                          {/* Attributes indented under group */}
                          {!collapsedGroups.has(group.key) && (
                            <div className="ml-5 border-l border-input pl-3">
                              <SortableAttributeGrid
                                attributes={group.attributes}
                                onChange={(next) => updateGroup(group.key, { attributes: next })}
                                lockedValuesByAttrId={lockedValuesByAttrId}
                              />
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Add group button — at bottom of groups list */}
                      <button
                        type="button"
                        onClick={addGroup}
                        className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      >
                        <Plus className="h-3 w-3" />
                        Add group
                      </button>
                    </div>
                  </div>}
                </div>

                {/* Bottom save bar */}
                <div className="flex justify-end gap-2 border-t border-input pt-3">
                  <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button type="button" size="sm" onClick={handleSave}>
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                    Save
                  </Button>
                </div>
              </div>
            </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
