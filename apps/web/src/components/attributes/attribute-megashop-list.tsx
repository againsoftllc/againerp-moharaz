"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { countProfileStats } from "@/lib/mock-data/attribute-profiles";
import { useAttributeProfileStore } from "@/lib/store/attribute-profile-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCatalogModuleBasePath } from "@/lib/catalog/catalog-module-base-path";

export function AttributeMegashopList() {
  const moduleBase = useCatalogModuleBasePath();

  const profiles = useAttributeProfileStore((s) => s.profiles);
  const groups = useAttributeProfileStore((s) => s.groups);
  const attributes = useAttributeProfileStore((s) => s.attributes);
  const deleteProfiles = useAttributeProfileStore((s) => s.deleteProfiles);

  const [filterName, setFilterName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const rows = useMemo(() => {
    const q = filterName.toLowerCase().trim();
    return [...profiles]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => ({ ...p, ...countProfileStats(p.id, groups, attributes) }))
      .filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [profiles, groups, attributes, filterName]);

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? rows.map((r) => r.id) : []);
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  };

  const handleDelete = () => {
    if (selected.length === 0) return;
    deleteProfiles(selected);
    toast.success(`Deleted ${selected.length} profile${selected.length > 1 ? "s" : ""}`);
    setSelected([]);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-input bg-muted/30 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="filter-profile" className="text-xs font-medium text-muted-foreground">
              Profile name
            </label>
            <Input
              id="filter-profile"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              placeholder="Filter by profile name…"
              className="mt-1"
            />
          </div>
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => setFilterName(filterName)}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            Filter
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-input bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-input bg-muted/40 text-xs">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selected.length === rows.length}
                    onChange={(e) => toggleAll(e.target.checked)}
                    aria-label="Select all"
                  />
                </th>
                <th className="px-3 py-2 text-left font-medium">Attribute profile</th>
                <th className="w-28 px-3 py-2 text-center font-medium">Groups</th>
                <th className="w-24 px-3 py-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    No attribute profiles found
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-input/60 last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={selected.includes(row.id)}
                        onChange={(e) => toggleOne(row.id, e.target.checked)}
                        aria-label={`Select ${row.name}`}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium">{row.name}</td>
                    <td className="px-3 py-2 text-center">
                      <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
                        {row.groupCount}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0" asChild>
                        <Link href={`${moduleBase}/attributes/${row.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {rows.length} profile{rows.length === 1 ? "" : "s"}
          {selected.length > 0 ? ` · ${selected.length} selected` : ""}
        </p>
        {selected.length > 0 && (
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete selected
          </Button>
        )}
      </div>
    </div>
  );
}

export function AttributeMegashopListHeaderActions() {
  const moduleBase = useCatalogModuleBasePath();

  return (
    <Button size="sm" asChild>
      <Link href={`${moduleBase}/attributes/add`}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Add attribute profile
      </Link>
    </Button>
  );
}
