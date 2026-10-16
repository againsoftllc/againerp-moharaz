"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  Eye,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  FIELD_TYPE_LABELS,
  type AttributeGroup,
  type AttributeSpec,
} from "@/lib/mock-data/attribute-profiles";
import { useAttributeProfileStore } from "@/lib/store/attribute-profile-store";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GroupFormDialog } from "@/components/attributes/group-form-dialog";
import { AttributeSpecFormDialog } from "@/components/attributes/attribute-spec-form-dialog";
import { useCatalogModuleBasePath } from "@/lib/catalog/catalog-module-base-path";

type Props = {
  profileId: string;
};

function moveItem<T extends { id: string }>(items: T[], id: string, dir: -1 | 1): string[] {
  const ids = items.map((i) => i.id);
  const idx = ids.indexOf(id);
  const next = idx + dir;
  if (idx < 0 || next < 0 || next >= ids.length) return ids;
  const copy = [...ids];
  [copy[idx], copy[next]] = [copy[next], copy[idx]];
  return copy;
}

export function AttributeProfileBuilder({ profileId }: Props) {
  const moduleBase = useCatalogModuleBasePath();

  const profile = useAttributeProfileStore((s) => s.getProfileById(profileId));
  const groups = useAttributeProfileStore((s) => s.getGroupsForProfile(profileId));
  const allAttributes = useAttributeProfileStore((s) => s.attributes);
  const upsertGroup = useAttributeProfileStore((s) => s.upsertGroup);
  const reorderGroups = useAttributeProfileStore((s) => s.reorderGroups);
  const upsertAttribute = useAttributeProfileStore((s) => s.upsertAttribute);
  const deleteAttributes = useAttributeProfileStore((s) => s.deleteAttributes);
  const reorderAttributes = useAttributeProfileStore((s) => s.reorderAttributes);

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(groups[0]?.id ?? null);
  const [groupSearch, setGroupSearch] = useState("");
  const [attrSearch, setAttrSearch] = useState("");
  const [groupFormOpen, setGroupFormOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<AttributeGroup | null>(null);
  const [attrFormOpen, setAttrFormOpen] = useState(false);
  const [editAttr, setEditAttr] = useState<AttributeSpec | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const filteredGroups = useMemo(() => {
    const q = groupSearch.toLowerCase().trim();
    if (!q) return groups;
    return groups.filter((g) => g.name.toLowerCase().includes(q) || g.code.toLowerCase().includes(q));
  }, [groups, groupSearch]);

  const groupAttributes = useMemo(() => {
    if (!selectedGroupId) return [];
    const q = attrSearch.toLowerCase().trim();
    return allAttributes
      .filter((a) => a.groupId === selectedGroupId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .filter((a) => !q || a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q));
  }, [allAttributes, selectedGroupId, attrSearch]);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  if (!profile) {
    return (
      <div className="rounded-lg border border-dashed border-input p-8 text-center">
        <p className="text-sm font-medium">Profile not found</p>
        <Button variant="ghost" size="sm" asChild className="mt-2">
          <Link href={`${moduleBase}/attributes`}>Back to profiles</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`${moduleBase}/attributes`}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Profiles
          </Link>
        </Button>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
        <div className="flex min-w-0 items-center gap-2">
          {profile.iconUrl && <img src={profile.iconUrl} alt="" className="h-8 w-8 rounded object-cover" />}
          <div>
            <h2 className="text-base font-semibold">{profile.name}</h2>
            <p className="text-xs text-muted-foreground">/{profile.code} · {groups.length} groups</p>
          </div>
          <Badge variant={profile.active ? "success" : "muted"} className="ml-1">
            {profile.active ? "Active" : "Inactive"}
          </Badge>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen((v) => !v)}>
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            {previewOpen ? "Hide preview" : "Live preview"}
          </Button>
        </div>
      </div>

      <div className={cn("grid min-h-0 flex-1 gap-3", previewOpen ? "lg:grid-cols-[240px_1fr_280px]" : "lg:grid-cols-[240px_1fr]")}>
        {/* Groups panel */}
        <div className="flex min-h-0 flex-col rounded-lg border border-input bg-card">
          <div className="border-b border-input p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Groups</p>
            <Input
              placeholder="Search groups…"
              value={groupSearch}
              onChange={(e) => setGroupSearch(e.target.value)}
              className="mt-2 h-8 text-xs"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {filteredGroups.map((g) => {
              const count = allAttributes.filter((a) => a.groupId === g.id).length;
              return (
                <div
                  key={g.id}
                  className={cn(
                    "mb-1 flex items-center gap-1 rounded-md border px-2 py-1.5 text-sm transition-colors",
                    selectedGroupId === g.id
                      ? "border-primary/40 bg-primary/5"
                      : "border-transparent hover:bg-muted/50",
                  )}
                >
                  <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left"
                    onClick={() => setSelectedGroupId(g.id)}
                  >
                    {g.name}
                    <span className="ml-1 text-[10px] text-muted-foreground">({count})</span>
                  </button>
                  <div className="flex shrink-0">
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => reorderGroups(profileId, moveItem(groups, g.id, -1))}>
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => reorderGroups(profileId, moveItem(groups, g.id, 1))}>
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => { setEditGroup(g); setGroupFormOpen(true); }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-input p-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => { setEditGroup(null); setGroupFormOpen(true); }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add group
            </Button>
          </div>
        </div>

        {/* Attributes panel */}
        <div className="flex min-h-0 flex-col rounded-lg border border-input bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-input p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {selectedGroup ? selectedGroup.name : "Attributes"}
            </p>
            <Input
              placeholder="Search attributes…"
              value={attrSearch}
              onChange={(e) => setAttrSearch(e.target.value)}
              className="ml-auto h-8 max-w-[200px] text-xs"
            />
            <Button
              size="sm"
              disabled={!selectedGroupId}
              onClick={() => { setEditAttr(null); setAttrFormOpen(true); }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add attribute
            </Button>
          </div>

          {!selectedGroupId ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Select a group</p>
          ) : groupAttributes.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No attributes in this group</p>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 text-left text-[11px] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 w-8" />
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Flags</th>
                    <th className="px-3 py-2 w-24" />
                  </tr>
                </thead>
                <tbody>
                  {groupAttributes.map((a) => (
                    <tr key={a.id} className="border-t border-input hover:bg-muted/30">
                      <td className="px-2 py-2">
                        <GripVertical className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium">{a.name}</p>
                        <p className="text-[10px] text-muted-foreground">{a.code}{a.unit ? ` · ${a.unit}` : ""}</p>
                      </td>
                      <td className="px-3 py-2 text-xs">{FIELD_TYPE_LABELS[a.fieldType]}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {a.isFilterable && <Badge variant="outline" className="text-[9px]">Filter</Badge>}
                          {a.isComparable && <Badge variant="outline" className="text-[9px]">Compare</Badge>}
                          {a.isSearchable && <Badge variant="outline" className="text-[9px]">Search</Badge>}
                          {a.isRequired && <Badge variant="outline" className="text-[9px]">Required</Badge>}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex justify-end gap-0.5">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => reorderAttributes(selectedGroupId, moveItem(groupAttributes, a.id, -1))}>
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => reorderAttributes(selectedGroupId, moveItem(groupAttributes, a.id, 1))}>
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setEditAttr(a); setAttrFormOpen(true); }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive"
                            onClick={() => { deleteAttributes([a.id]); toast.success("Attribute deleted"); }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Storefront preview */}
        {previewOpen && (
          <div className="hidden min-h-0 flex-col rounded-lg border border-input bg-card lg:flex">
            <div className="border-b border-input p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Storefront preview</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 text-sm">
              {groups.map((g) => {
                const attrs = allAttributes
                  .filter((a) => a.groupId === g.id && a.isVisible)
                  .sort((a, b) => a.sortOrder - b.sortOrder);
                if (attrs.length === 0) return null;
                return (
                  <div key={g.id} className="mb-4">
                    <p className="mb-1.5 font-semibold">{g.name}</p>
                    <table className="w-full text-xs">
                      <tbody>
                        {attrs.map((a) => (
                          <tr key={a.id} className="border-t border-input">
                            <td className="py-1.5 pr-2 text-muted-foreground">{a.name}</td>
                            <td className="py-1.5 text-right">—</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <GroupFormDialog
        open={groupFormOpen}
        onOpenChange={setGroupFormOpen}
        profileId={profileId}
        group={editGroup}
        onSave={(data) => {
          upsertGroup(data);
          if (!selectedGroupId && !data.id) {
            setTimeout(() => {
              const latest = useAttributeProfileStore.getState().getGroupsForProfile(profileId);
              setSelectedGroupId(latest[latest.length - 1]?.id ?? null);
            }, 0);
          }
        }}
      />

      {selectedGroupId && (
        <AttributeSpecFormDialog
          open={attrFormOpen}
          onOpenChange={setAttrFormOpen}
          groupId={selectedGroupId}
          attribute={editAttr}
          onSave={(data) => upsertAttribute(data)}
        />
      )}
    </div>
  );
}
