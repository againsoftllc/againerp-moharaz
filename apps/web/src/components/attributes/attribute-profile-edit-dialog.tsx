"use client";

import { useCallback, useEffect, useState } from "react";
import { GripVertical, Layers, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  createEmptyBulkGroup,
  profileToBulkForm,
  type BulkAttributeFormState,
  type BulkAttributeGroupRow,
} from "@/lib/mock-data/attribute-profiles";
import { saveAttributeProfileBulk } from "@/lib/api/use-catalog-attribute-profiles";
import { useCatalogAttributeProfile } from "@/lib/api/use-catalog-attribute-profile";
import {
  fetchAttributeProfileValueUsage,
  type LockedFilterValuesByAttrId,
} from "@/lib/api/catalog-attribute-profiles";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  reorderGroupsByKey,
  SortableAttributeGrid,
} from "@/components/attributes/sortable-attribute-grid";

type Props = {
  profileId: string;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export function AttributeProfileEditDialog({ profileId, open, onClose, onSaved }: Props) {
  const { profile, groups, attributes, loading, error } = useCatalogAttributeProfile(profileId);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<BulkAttributeFormState>({ profileName: "", groups: [] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dragGroupKey, setDragGroupKey] = useState<string | null>(null);
  const [overGroupKey, setOverGroupKey] = useState<string | null>(null);
  const [lockedValuesByAttrId, setLockedValuesByAttrId] = useState<LockedFilterValuesByAttrId>({});

  useEffect(() => {
    if (profile) setForm(profileToBulkForm(profile, groups, attributes));
  }, [profile, groups, attributes]);

  useEffect(() => {
    if (!open || !profileId) {
      setLockedValuesByAttrId({});
      return;
    }
    void fetchAttributeProfileValueUsage(profileId)
      .then(setLockedValuesByAttrId)
      .catch(() => setLockedValuesByAttrId({}));
  }, [open, profileId]);

  const setProfileName = (profileName: string) => setForm((f) => ({ ...f, profileName }));

  const updateGroup = (key: string, patch: Partial<BulkAttributeGroupRow>) =>
    setForm((f) => ({ ...f, groups: f.groups.map((g) => (g.key === key ? { ...g, ...patch } : g)) }));

  const addGroup = () => setForm((f) => ({ ...f, groups: [...f.groups, createEmptyBulkGroup()] }));

  const removeGroup = (key: string) =>
    setForm((f) => ({ ...f, groups: f.groups.filter((g) => g.key !== key) }));

  const handleGroupDrop = (targetKey: string) => {
    if (!dragGroupKey || dragGroupKey === targetKey) return;
    setForm((f) => ({ ...f, groups: reorderGroupsByKey(f.groups, dragGroupKey, targetKey) }));
    setDragGroupKey(null);
    setOverGroupKey(null);
  };

  const validate = useCallback(() => {
    const next: Record<string, string> = {};
    if (!form.profileName.trim()) next.profileName = "Profile name is required.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [form.profileName]);

  const handleSave = async () => {
    if (!validate()) { toast.error("Profile name is required."); return; }
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
    setSaving(true);
    try {
      await saveAttributeProfileBulk({ profileId, profileName: form.profileName.trim(), groups: payloadGroups });
      toast.success("Attribute profile saved");
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full max-w-2xl flex-col gap-0 p-0 sm:max-w-2xl">
        {/* Header */}
        <div className="flex flex-row items-center justify-between border-b border-input px-4 py-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <SheetTitle className="text-sm font-semibold">
              Edit Profile: {form.profileName || profile?.name}
            </SheetTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : error || !profile ? (
            <p className="text-sm text-destructive">{error ?? "Profile not found"}</p>
          ) : (
            <>
              {/* Profile name */}
              <div className="rounded-xl border border-input bg-card p-4">
                <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Layers className="h-3.5 w-3.5" />
                  Attribute profile
                </div>
                <label htmlFor="ep-profile-name" className="text-sm font-medium">Profile name</label>
                <Input
                  id="ep-profile-name"
                  value={form.profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="mt-1.5"
                />
                {errors.profileName && <p className="mt-1 text-xs text-destructive">{errors.profileName}</p>}
              </div>

              {/* Groups */}
              <div className="rounded-xl border border-input bg-card p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    Attribute groups
                  </div>
                  <Button type="button" size="sm" onClick={addGroup}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Add group
                  </Button>
                </div>

                {form.groups.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-input py-8 text-center">
                    <Layers className="mx-auto h-7 w-7 text-muted-foreground/40" />
                    <p className="mt-2 text-sm text-muted-foreground">No groups yet</p>
                    <Button type="button" size="sm" className="mt-3" onClick={addGroup}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" /> Add group
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {form.groups.map((group, i) => (
                      <div
                        key={group.key}
                        onDragOver={(e) => { e.preventDefault(); setOverGroupKey(group.key); }}
                        onDragLeave={() => setOverGroupKey((k) => (k === group.key ? null : k))}
                        onDrop={() => handleGroupDrop(group.key)}
                        className={cn(
                          "overflow-hidden rounded-lg border border-sky-200/80 bg-sky-50/30 transition-shadow dark:border-sky-900/50 dark:bg-sky-950/20",
                          overGroupKey === group.key && dragGroupKey !== group.key && "ring-2 ring-primary/30",
                        )}
                      >
                        <div
                          draggable
                          onDragStart={() => setDragGroupKey(group.key)}
                          onDragEnd={() => { setDragGroupKey(null); setOverGroupKey(null); }}
                          className={cn(
                            "flex cursor-grab items-center justify-between border-b border-sky-200/60 bg-sky-100/50 px-3 py-2 active:cursor-grabbing dark:border-sky-900/40 dark:bg-sky-950/40",
                            dragGroupKey === group.key && "opacity-60",
                          )}
                        >
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                            Group {i + 1}
                          </div>
                          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => removeGroup(group.key)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="space-y-3 p-3">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">
                              Group name <span className="text-destructive">*</span>
                            </label>
                            <Input
                              value={group.name}
                              onChange={(e) => updateGroup(group.key, { name: e.target.value })}
                              placeholder="e.g. Display, Processor, Memory"
                              className="mt-1 max-w-md"
                            />
                          </div>
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground">Attributes</p>
                            <SortableAttributeGrid
                              attributes={group.attributes}
                              onChange={(next) => updateGroup(group.key, { attributes: next })}
                              lockedValuesByAttrId={lockedValuesByAttrId}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
