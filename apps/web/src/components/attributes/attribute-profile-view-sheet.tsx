"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Edit2, Filter, Layers, X } from "lucide-react";
import type { AttributeGroup, AttributeProfile, AttributeSpec } from "@/lib/mock-data/attribute-profiles";
import { countProfileStats } from "@/lib/mock-data/attribute-profiles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";

function ProfileDetailContent({
  profile,
  groups,
  attributes,
  onEdit,
  onClose,
}: {
  profile: AttributeProfile;
  groups: AttributeGroup[];
  attributes: AttributeSpec[];
  onEdit?: (p: AttributeProfile) => void;
  onClose: () => void;
}) {
  const { groupCount, attributeCount } = countProfileStats(profile.id, groups, attributes);
  const profileGroups = groups
    .filter((g) => g.profileId === profile.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [profileCollapsed, setProfileCollapsed] = useState(false);
  const toggleGroup = (id: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-input px-5 py-4">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant={profile.active ? "default" : "secondary"} className="text-[10px]">
              {profile.active ? "Active" : "Inactive"}
            </Badge>
            <span className="font-mono text-[10px] text-muted-foreground">/{profile.code}</span>
          </div>
          <button
            type="button"
            className="text-left text-base font-semibold leading-snug hover:underline focus-visible:outline-none"
            onClick={() => {
              if (onEdit) {
                onClose();
                onEdit(profile);
              }
            }}
          >
            {profile.name}
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onEdit && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2.5 text-xs"
              onClick={() => {
                onClose();
                onEdit(profile);
              }}
            >
              <Edit2 className="h-3 w-3" />
              Edit
            </Button>
          )}
          <button
            type="button"
            className="rounded-md p-1 hover:bg-accent"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {/* Tree: Profile root → Groups → Attributes */}
        <div>
          {/* Profile root row */}
          <div className="flex items-center gap-1.5 rounded-md px-1 py-1 hover:bg-muted/40">
            <button
              type="button"
              onClick={() => setProfileCollapsed((v) => !v)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={profileCollapsed ? "Expand" : "Collapse"}
            >
              {profileCollapsed
                ? <ChevronRight className="h-3.5 w-3.5" />
                : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            <Layers className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="text-xs font-semibold">{profile.name}</span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {groupCount}g · {attributeCount}a
            </span>
          </div>

          {/* Groups indented under profile */}
          {!profileCollapsed && (
            <div className="ml-[7px] border-l border-input pl-3">
              {profileGroups.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">No groups yet.</p>
              ) : (
                <div className="space-y-0.5">
                  {profileGroups.map((group) => {
                    const groupAttrs = attributes
                      .filter((a) => a.groupId === group.id)
                      .sort((a, b) => a.sortOrder - b.sortOrder);
                    const collapsed = collapsedGroups.has(group.id);
                    return (
                      <div key={group.id}>
                        {/* Group row */}
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.id)}
                          className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-muted/40"
                        >
                          {collapsed
                            ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                          <span className="flex-1 text-xs font-medium">{group.name}</span>
                          <span className="text-[10px] text-muted-foreground">{groupAttrs.length}</span>
                        </button>

                        {/* Attributes indented under group */}
                        {!collapsed && (
                          <div className="ml-5 border-l border-input pl-3">
                            {groupAttrs.length === 0 ? (
                              <p className="py-1 text-[11px] text-muted-foreground/60">No attributes</p>
                            ) : (
                              <div className="space-y-0.5 py-0.5">
                                {groupAttrs.map((attr) => (
                                  <div key={attr.id}>
                                    <div className="flex flex-wrap items-center gap-1.5 rounded-md px-1 py-0.5 text-[11px] hover:bg-muted/30">
                                      <span className="font-medium">{attr.name}</span>
                                      {attr.isFilterable && (
                                        <span className="inline-flex items-center gap-0.5 rounded bg-sky-100 px-1 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                                          <Filter className="h-2.5 w-2.5" />
                                          Filter
                                        </span>
                                      )}
                                    </div>
                                    {/* Filter values indented under attribute */}
                                    {attr.isFilterable && (attr.predefinedValues ?? []).length > 0 && (
                                      <div className="ml-4 border-l border-input pl-2.5 pb-1">
                                        <div className="flex flex-wrap gap-1 pt-0.5">
                                          {(attr.predefinedValues ?? []).map((v) => (
                                            <span key={v} className="rounded border border-input bg-muted/50 px-1 py-0.5 text-[10px] text-muted-foreground">
                                              {v}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: AttributeProfile | null;
  groups?: AttributeGroup[];
  attributes?: AttributeSpec[];
  onEdit?: (profile: AttributeProfile) => void;
};

export function AttributeProfileViewSheet({
  open,
  onOpenChange,
  profile,
  groups = [],
  attributes = [],
  onEdit,
}: Props) {
  if (!profile) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-xl gap-0 overflow-hidden p-0 sm:max-w-xl [&>button.absolute]:hidden"
        aria-describedby={undefined}
      >
        <p className="sr-only">Attribute profile details · {profile.name}</p>
        <ProfileDetailContent
          profile={profile}
          groups={groups}
          attributes={attributes}
          onEdit={onEdit}
          onClose={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
