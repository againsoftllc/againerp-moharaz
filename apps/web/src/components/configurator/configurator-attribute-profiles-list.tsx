"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Cpu, GripVertical, Pencil, Plus } from "lucide-react";
import { countConfiguratorProfileFields } from "@/lib/mock-data/configurator-attributes";
import { useConfiguratorAttributeStore } from "@/lib/store/configurator-attribute-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ConfiguratorAttributeProfilesList() {
  const profiles = useConfiguratorAttributeStore((s) => s.profiles);
  const fields = useConfiguratorAttributeStore((s) => s.fields);
  const reorderProfiles = useConfiguratorAttributeStore((s) => s.reorderProfiles);
  const upsertProfile = useConfiguratorAttributeStore((s) => s.upsertProfile);

  const [query, setQuery] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...profiles]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.categoryName.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q),
      );
  }, [profiles, query]);

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = filtered.map((p) => p.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const copy = [...ids];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    reorderProfiles(copy);
    setDragId(null);
  };

  return (
    <>
      <div className="rounded-lg border border-input bg-muted/20 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Configurator Attribute Profiles</p>
        <p className="mt-1">
          One profile per component category (CPU, Motherboard, RAM). Reuses catalog attribute field types with
          normalized value storage and compatibility validation.
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search profiles or categories…"
          className="h-8 max-w-xs text-xs"
        />
        <Button
          size="sm"
          className="ml-auto h-8"
          onClick={() =>
            upsertProfile({
              name: "New Component",
              code: "new_component",
              categoryId: "cc_cpu",
              categoryName: "CPU",
              categorySlug: "cpu",
            })
          }
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New profile
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        {filtered.map((profile) => {
          const count = countConfiguratorProfileFields(profile.id, fields);
          return (
            <div
              key={profile.id}
              draggable
              onDragStart={() => setDragId(profile.id)}
              onDragEnd={() => setDragId(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(profile.id)}
              className="flex items-center gap-3 rounded-lg border border-input bg-card p-4 shadow-sm"
            >
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
              <Cpu className="h-8 w-8 shrink-0 text-indigo-600" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/configurator/attributes/${profile.id}`} className="font-semibold hover:text-primary">
                    {profile.name}
                  </Link>
                  <Badge variant="outline" className="text-[10px]">
                    {profile.categoryName}
                  </Badge>
                  <Badge variant={profile.active ? "success" : "muted"} className="text-[10px]">
                    {profile.active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {count} attributes · {profile.productCount} products · {profile.code}
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/configurator/attributes/${profile.id}`}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Builder
                </Link>
              </Button>
            </div>
          );
        })}
      </div>
    </>
  );
}
