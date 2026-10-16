"use client";

import { useMemo, useState } from "react";
import { Boxes, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatBdt } from "@/lib/mock-data/configurator-admin";
import type { SavedBuild } from "@/lib/configurator/types";
import {
  bulkSetConfiguratorBuildStatus,
  deleteConfiguratorBuilds,
} from "@/lib/api/use-configurator-builds";
import { useConfiguratorProfiles } from "@/lib/api/use-configurator-profiles";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import {
  ConfiguratorAdminShell,
  ConfiguratorRowCheckbox,
} from "@/components/configurator/admin/configurator-admin-shell";
import { ActivityTriggerButton } from "@/components/activity/activity-trigger-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/native-select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function compatVariant(s: string) {
  if (s === "compatible") return "success" as const;
  if (s === "warning") return "warning" as const;
  return "outline" as const;
}

function statusVariant(s: string) {
  if (s === "ordered") return "success" as const;
  if (s === "saved") return "secondary" as const;
  if (s === "abandoned") return "muted" as const;
  return "outline" as const;
}

type Props = {
  builds: SavedBuild[];
  loading?: boolean;
  onBuildsChanged?: () => void;
  onView?: (build: SavedBuild) => void;
};

export function ConfiguratorBuildsList({
  builds,
  loading: _loading = false,
  onBuildsChanged,
  onView,
}: Props) {
  const canWrite = useAdminCanWrite();
  const { profiles } = useConfiguratorProfiles();

  const [profileFilter, setProfileFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ status: "all", compatibility: "all" });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return builds.filter((b) => {
      if (profileFilter !== "all" && b.profileId !== profileFilter) return false;
      if (filters.status !== "all" && b.status !== filters.status) return false;
      if (filters.compatibility !== "all" && b.compatibilityStatus !== filters.compatibility) return false;
      if (!q) return true;
      return (
        b.name.toLowerCase().includes(q) ||
        b.buildCode.toLowerCase().includes(q) ||
        (b.customerName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [builds, profileFilter, search, filters]);

  const kpis = useMemo(
    () => [
      { label: "Total builds", value: builds.length, sub: `${builds.filter((b) => b.status === "ordered").length} ordered` },
      { label: "Compatible", value: builds.filter((b) => b.compatibilityStatus === "compatible").length, sub: "Passed all rules" },
      { label: "Warnings", value: builds.filter((b) => b.compatibilityStatus === "warning").length, sub: "Proceed with caution" },
      { label: "Blocked", value: builds.filter((b) => b.compatibilityStatus === "incompatible").length, sub: "Rule violations" },
    ],
    [builds],
  );

  const handleBulkDelete = async () => {
    try {
      await deleteConfiguratorBuilds([...selected]);
      toast.success("Deleted");
      setSelected(new Set());
      onBuildsChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteConfiguratorBuilds([id]);
      toast.success("Deleted");
      onBuildsChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleMarkOrdered = async (id: string) => {
    try {
      await bulkSetConfiguratorBuildStatus([id], "ordered");
      toast.success("Marked as ordered");
      onBuildsChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  return (
    <ConfiguratorAdminShell
      workflow={["1. Customer configures", "2. Rules evaluated", "3. Build saved", "4. Convert to order", "5. Audit trail"]}
      kpis={kpis}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search by name, code, customer…"
      filterFields={[
        { key: "status", label: "Build status", type: "select", options: [
          { value: "all", label: "All" }, { value: "draft", label: "Draft" },
          { value: "saved", label: "Saved" }, { value: "ordered", label: "Ordered" }, { value: "abandoned", label: "Abandoned" },
        ]},
        { key: "compatibility", label: "Compatibility", type: "select", options: [
          { value: "all", label: "All" }, { value: "compatible", label: "Compatible" },
          { value: "warning", label: "Warning" }, { value: "incompatible", label: "Incompatible" },
        ]},
      ]}
      filterValues={filters}
      onFilterChange={(key, value) => setFilters((f) => ({ ...f, [key]: value }))}
      selectedCount={selected.size}
      onBulkDelete={canWrite ? () => void handleBulkDelete() : undefined}
      onClearSelection={() => setSelected(new Set())}
      extraToolbar={
        <Select value={profileFilter} onChange={(e) => setProfileFilter(e.target.value)} className="h-8 w-[160px] text-xs">
          <option value="all">All profiles</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      }
    >
      <div className="overflow-hidden rounded-lg border border-input bg-card shadow-sm">
        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Boxes className="mx-auto h-8 w-8 text-indigo-500/70" />
            <p className="mt-2 text-sm font-medium">No saved builds</p>
          </div>
        ) : (
          filtered.map((b) => (
            <div key={b.id} className="flex items-center gap-3 border-b border-input px-3 py-3 last:border-0 hover:bg-muted/20">
              <ConfiguratorRowCheckbox checked={selected.has(b.id)} onChange={(on) => setSelected((prev) => { const n = new Set(prev); on ? n.add(b.id) : n.delete(b.id); return n; })} />
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onView?.(b)}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{b.name}</span>
                  <Badge variant="outline" className="font-mono text-[10px]">{b.buildCode}</Badge>
                  <Badge variant={compatVariant(b.compatibilityStatus)} className="text-[10px] capitalize">{b.compatibilityStatus}</Badge>
                  <Badge variant={statusVariant(b.status)} className="text-[10px] capitalize">{b.status}</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {b.profileName} · {b.customerName ?? b.userName ?? "Guest"} · {formatBdt(b.totalPrice)} · {b.components.length} parts
                </p>
              </button>
              <ActivityTriggerButton entity={{ type: "configurator_build", id: b.id, label: b.name }} />
              {canWrite && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onView?.(b)}>View details</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void handleMarkOrdered(b.id)}>Mark ordered</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => void handleDelete(b.id)}><Trash2 className="mr-2 h-3.5 w-3.5" />Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))
        )}
      </div>
    </ConfiguratorAdminShell>
  );
}
