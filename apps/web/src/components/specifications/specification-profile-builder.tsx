"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
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
import { GroupFormDialog } from "@/components/attributes/group-form-dialog";
import { AttributeSpecFormDialog } from "@/components/attributes/attribute-spec-form-dialog";

const PROFILES_HREF = "/website/specifications/profiles";

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

export function SpecificationProfileBuilder({ profileId }: Props) {
  const profile = useAttributeProfileStore((s) => s.getProfileById(profileId));
  const groups = useAttributeProfileStore((s) => s.getGroupsForProfile(profileId));
  const allAttributes = useAttributeProfileStore((s) => s.attributes);
  const upsertGroup = useAttributeProfileStore((s) => s.upsertGroup);
  const reorderGroups = useAttributeProfileStore((s) => s.reorderGroups);
  const upsertAttribute = useAttributeProfileStore((s) => s.upsertAttribute);
  const deleteAttributes = useAttributeProfileStore((s) => s.deleteAttributes);
  const reorderAttributes = useAttributeProfileStore((s) => s.reorderAttributes);

  const [groupFormOpen, setGroupFormOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<AttributeGroup | null>(null);
  const [attrFormOpen, setAttrFormOpen] = useState(false);
  const [editAttr, setEditAttr] = useState<AttributeSpec | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(true);

  const fieldsByGroup = useMemo(() => {
    const map = new Map<string, AttributeSpec[]>();
    for (const g of groups) {
      map.set(
        g.id,
        allAttributes
          .filter((a) => a.groupId === g.id)
          .sort((a, b) => a.sortOrder - b.sortOrder),
      );
    }
    return map;
  }, [groups, allAttributes]);

  if (!profile) {
    return (
      <div className="rounded-lg border border-dashed border-input p-8 text-center">
        <p className="text-sm font-medium">Profile not found</p>
        <Button variant="ghost" size="sm" asChild className="mt-2">
          <Link href={PROFILES_HREF}>Back to profiles</Link>
        </Button>
      </div>
    );
  }

  const totalFields = allAttributes.filter((a) =>
    groups.some((g) => g.id === a.groupId),
  ).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={PROFILES_HREF}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Profiles
          </Link>
        </Button>
        <div className="flex min-w-0 items-center gap-2">
          {profile.iconUrl && (
            <img src={profile.iconUrl} alt="" className="h-9 w-9 rounded object-cover" />
          )}
          <div>
            <h2 className="text-base font-semibold">{profile.name} Profile</h2>
            <p className="text-xs text-muted-foreground">
              /{profile.code} · {groups.length} groups · {totalFields} fields
            </p>
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

      <div
        className={cn(
          "grid min-h-0 flex-1 gap-4",
          previewOpen ? "lg:grid-cols-[1fr_280px]" : "grid-cols-1",
        )}
      >
        <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditGroup(null);
              setGroupFormOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add group
          </Button>

          {groups.length === 0 ? (
            <div className="rounded-lg border border-dashed border-input p-10 text-center text-sm text-muted-foreground">
              No groups yet. Add Processor, Display, Memory…
            </div>
          ) : (
            groups.map((g) => {
              const fields = fieldsByGroup.get(g.id) ?? [];
              return (
                <div
                  key={g.id}
                  className="overflow-hidden rounded-lg border border-input bg-card shadow-sm"
                >
                  <div className="flex items-center gap-2 border-b border-input bg-muted/40 px-3 py-2.5">
                    <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="flex-1 text-sm font-semibold">{g.name}</p>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => reorderGroups(profileId, moveItem(groups, g.id, -1))}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => reorderGroups(profileId, moveItem(groups, g.id, 1))}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          setEditGroup(g);
                          setGroupFormOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="divide-y divide-input">
                    {fields.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-muted-foreground">No fields in this group</p>
                    ) : (
                      fields.map((f) => (
                        <div
                          key={f.id}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-muted/30"
                        >
                          <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{f.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {FIELD_TYPE_LABELS[f.fieldType]}
                              {f.unit ? ` · ${f.unit}` : ""}
                            </p>
                          </div>
                          <div className="hidden flex-wrap gap-1 sm:flex">
                            {f.isFilterable && (
                              <Badge variant="outline" className="text-[9px]">
                                Filter
                              </Badge>
                            )}
                            {f.isComparable && (
                              <Badge variant="outline" className="text-[9px]">
                                Compare
                              </Badge>
                            )}
                            {f.isSearchable && (
                              <Badge variant="outline" className="text-[9px]">
                                Search
                              </Badge>
                            )}
                            {f.isRequired && (
                              <Badge variant="outline" className="text-[9px]">
                                Required
                              </Badge>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-0.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() =>
                                reorderAttributes(g.id, moveItem(fields, f.id, -1))
                              }
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() =>
                                reorderAttributes(g.id, moveItem(fields, f.id, 1))
                              }
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => {
                                setActiveGroupId(g.id);
                                setEditAttr(f);
                                setAttrFormOpen(true);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive"
                              onClick={() => {
                                deleteAttributes([f.id]);
                                toast.success("Field removed");
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="border-t border-input bg-muted/20 px-3 py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        setActiveGroupId(g.id);
                        setEditAttr(null);
                        setAttrFormOpen(true);
                      }}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add field
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {previewOpen && (
          <div className="hidden min-h-0 flex-col rounded-lg border border-input bg-card lg:flex">
            <div className="border-b border-input px-3 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Storefront preview
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                How specs appear on product page
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 text-sm">
              {groups.map((g) => {
                const fields = (fieldsByGroup.get(g.id) ?? []).filter((f) => f.isVisible);
                if (fields.length === 0) return null;
                return (
                  <div key={g.id} className="mb-4">
                    <p className="mb-1.5 border-b border-input pb-1 font-semibold">{g.name}</p>
                    <table className="w-full text-xs">
                      <tbody>
                        {fields.map((f) => (
                          <tr key={f.id} className="border-t border-input/60">
                            <td className="py-1.5 pr-3 text-muted-foreground">{f.name}</td>
                            <td className="py-1.5 text-right font-medium">—</td>
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
        onSave={(data) => upsertGroup(data)}
      />

      {activeGroupId && (
        <AttributeSpecFormDialog
          open={attrFormOpen}
          onOpenChange={setAttrFormOpen}
          groupId={activeGroupId}
          attribute={editAttr}
          onSave={(data) => upsertAttribute(data)}
        />
      )}
    </div>
  );
}
