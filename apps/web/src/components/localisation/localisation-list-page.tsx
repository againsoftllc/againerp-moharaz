"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  formatLocalisationCell,
  LOCALISATION_MOCK_DATA,
  type LocalisationRow,
} from "@/lib/mock-data/localisation";
import type { LocalisationResourceDef } from "@/lib/localisation/resources";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocalisationNav } from "@/components/localisation/localisation-nav";

type Props = {
  resource: LocalisationResourceDef;
  hideNav?: boolean;
};

function statusVariant(status: string) {
  const s = status.toLowerCase();
  if (s === "active" || s === "yes") return "default" as const;
  if (s === "inactive" || s === "no") return "secondary" as const;
  return "outline" as const;
}

function renderCell(key: string, value: string | number | boolean | undefined) {
  if (key === "status") {
    const text = formatLocalisationCell(value);
    return (
      <Badge variant={statusVariant(text)} className="capitalize">
        {text}
      </Badge>
    );
  }
  if (key === "isDefault" && value === true) {
    return <Badge variant="outline">Default</Badge>;
  }
  if (key === "isDefault" && !value) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (key === "color" && typeof value === "string") {
    const colorMap: Record<string, string> = {
      Green: "bg-emerald-500",
      Amber: "bg-amber-500",
      Red: "bg-red-500",
      Blue: "bg-blue-500",
      Indigo: "bg-indigo-500",
    };
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className={cn("h-2.5 w-2.5 rounded-none", colorMap[value] ?? "bg-muted-foreground")} />
        {value}
      </span>
    );
  }
  return formatLocalisationCell(value);
}

export function LocalisationListPage({ resource, hideNav = false }: Props) {
  const seed = LOCALISATION_MOCK_DATA[resource.id];
  const [rows, setRows] = useState<LocalisationRow[]>(seed);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter((row) =>
      Object.values(row).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, query]);

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? filtered.map((r) => String(r.id)) : []);
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  };

  const handleDelete = () => {
    if (selected.length === 0) return;
    setRows((prev) => prev.filter((r) => !selected.includes(String(r.id))));
    toast.success(`Deleted ${selected.length} record${selected.length > 1 ? "s" : ""}`);
    setSelected([]);
  };

  const handleAdd = () => {
    toast.info(`${resource.addLabel} — prototype form coming next`);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {hideNav ? null : <LocalisationNav />}

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{resource.description}</p>
        <div className="flex gap-2">
          {selected.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleDelete}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete ({selected.length})
            </Button>
          )}
          <Button size="sm" onClick={handleAdd}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {resource.addLabel}
          </Button>
        </div>
      </div>

      <div className="rounded-none border border-border bg-muted/30 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor={`loc-search-${resource.id}`} className="text-xs font-medium text-muted-foreground">
              Search
            </label>
            <Input
              id={`loc-search-${resource.id}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={resource.searchPlaceholder}
              className="mt-1"
            />
          </div>
          <Button variant="outline" size="sm" className="shrink-0">
            <Search className="mr-1.5 h-3.5 w-3.5" />
            Filter
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-none border border-border bg-card">
        <div className="h-full overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 border-b border-border bg-muted/40 text-xs">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selected.length === filtered.length}
                    onChange={(e) => toggleAll(e.target.checked)}
                    aria-label="Select all"
                  />
                </th>
                {resource.columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      "px-3 py-2 font-medium",
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                      !col.align && "text-left",
                    )}
                  >
                    {col.label}
                  </th>
                ))}
                <th className="w-16 px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={String(row.id)} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.includes(String(row.id))}
                      onChange={(e) => toggleOne(String(row.id), e.target.checked)}
                      aria-label={`Select ${row.name}`}
                    />
                  </td>
                  {resource.columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-3 py-2",
                        col.align === "right" && "text-right tabular-nums",
                        col.align === "center" && "text-center",
                        col.mono && "font-mono text-xs",
                      )}
                    >
                      {renderCell(col.key, row[col.key])}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 rounded-none p-0"
                      onClick={() => toast.info("Edit — prototype")}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          Showing {filtered.length} of {rows.length} records
        </div>
      </div>
    </div>
  );
}
