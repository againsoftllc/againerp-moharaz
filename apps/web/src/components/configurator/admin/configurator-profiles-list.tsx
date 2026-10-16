"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Copy, Layers, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  PROFILE_TYPE_LABELS,
  STATUS_LABELS,
  type ConfiguratorProfile,
} from "@/lib/configurator/types";
import {
  bulkSetConfiguratorProfileStatus,
  deleteConfiguratorProfiles,
  duplicateConfiguratorProfile,
} from "@/lib/api/use-configurator-profiles";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import {
  ConfiguratorAdminShell,
  ConfiguratorRowCheckbox,
} from "@/components/configurator/admin/configurator-admin-shell";
import { ActivityTriggerButton } from "@/components/activity/activity-trigger-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCatalogModuleBasePath } from "@/lib/catalog/catalog-module-base-path";

function statusVariant(status: string) {
  if (status === "active") return "success" as const;
  if (status === "draft") return "warning" as const;
  return "muted" as const;
}

type Props = {
  profiles: ConfiguratorProfile[];
  loading?: boolean;
  onProfilesChanged?: () => void;
  onEdit?: (profile: ConfiguratorProfile) => void;
  onCreate?: () => void;
};

export function ConfiguratorProfilesList({
  profiles,
  loading: _loading = false,
  onProfilesChanged,
  onEdit,
  onCreate,
}: Props) {
  const moduleBase = useCatalogModuleBasePath();

  const canWrite = useAdminCanWrite();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ status: "all", type: "all" });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return profiles.filter((p) => {
      if (filters.status !== "all" && p.status !== filters.status) return false;
      if (filters.type !== "all" && p.profileType !== filters.type) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.description?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [profiles, search, filters]);

  const kpis = useMemo(
    () => [
      { label: "Total profiles", value: profiles.length, sub: `${profiles.filter((p) => p.status === "active").length} active` },
      { label: "Categories", value: profiles.reduce((s, p) => s + p.categoryCount, 0), sub: "Across all builders" },
      { label: "Saved builds", value: profiles.reduce((s, p) => s + p.buildCount, 0), sub: "Customer configurations" },
      { label: "Templates", value: profiles.reduce((s, p) => s + p.templateCount, 0), sub: "Starter configurations" },
    ],
    [profiles],
  );

  const toggleSelect = (id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAll = (on: boolean) => {
    setSelected(on ? new Set(filtered.map((p) => p.id)) : new Set());
  };

  const handleBulkStatus = async (status: ConfiguratorProfile["status"], label: string) => {
    try {
      await bulkSetConfiguratorProfileStatus([...selected], status);
      toast.success(`${label} ${selected.size} profile(s)`);
      setSelected(new Set());
      onProfilesChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk update failed");
    }
  };

  const handleDelete = async (ids: string[]) => {
    try {
      await deleteConfiguratorProfiles(ids);
      toast.success(`Deleted ${ids.length} profile(s)`);
      setSelected(new Set());
      onProfilesChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      await duplicateConfiguratorProfile(id);
      toast.success("Profile duplicated");
      onProfilesChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Duplicate failed");
    }
  };

  return (
    <ConfiguratorAdminShell
      workflow={[
        "1. Open PC Builder profile",
        "2. Confirm slots (cpu, memory…)",
        "3. Catalog category slug = slot",
        "4. Publish products",
        "5. Check /pc-builder",
      ]}
      kpis={kpis}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search profiles by name, slug…"
      filterFields={[
        {
          key: "status",
          label: "Status",
          type: "select",
          options: [
            { value: "all", label: "All statuses" },
            { value: "active", label: "Active" },
            { value: "draft", label: "Draft" },
            { value: "archived", label: "Archived" },
          ],
        },
        {
          key: "type",
          label: "Profile type",
          type: "select",
          options: [
            { value: "all", label: "All types" },
            ...Object.entries(PROFILE_TYPE_LABELS).map(([value, label]) => ({ value, label })),
          ],
        },
      ]}
      filterValues={filters}
      onFilterChange={(key, value) => setFilters((f) => ({ ...f, [key]: value }))}
      selectedCount={canWrite ? selected.size : 0}
      onBulkActivate={canWrite ? () => void handleBulkStatus("active", "Activated") : undefined}
      onBulkArchive={canWrite ? () => void handleBulkStatus("archived", "Archived") : undefined}
      onBulkDelete={canWrite ? () => void handleDelete([...selected]) : undefined}
      onClearSelection={() => setSelected(new Set())}
      createLabel={canWrite ? "Create profile" : undefined}
      onCreate={canWrite ? onCreate : undefined}
    >
      <div className="overflow-hidden rounded-lg border border-input bg-card shadow-sm">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-input bg-muted/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {canWrite && (
            <ConfiguratorRowCheckbox
              checked={selected.size === filtered.length && filtered.length > 0}
              onChange={toggleAll}
            />
          )}
          {!canWrite && <span />}
          <span>Profile</span>
          <span className="text-right">Actions</span>
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Layers className="mx-auto h-8 w-8 text-indigo-500/70" />
            <p className="mt-2 text-sm font-medium">No profiles match your filters</p>
            {canWrite && onCreate && (
              <Button size="sm" className="mt-4" onClick={onCreate}>
                Create profile
              </Button>
            )}
          </div>
        ) : (
          filtered.map((profile) => (
            <div
              key={profile.id}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-input px-3 py-3 last:border-0 hover:bg-muted/20"
            >
              {canWrite ? (
                <ConfiguratorRowCheckbox
                  checked={selected.has(profile.id)}
                  onChange={(on) => toggleSelect(profile.id, on)}
                />
              ) : (
                <span />
              )}
              <Link href={`${moduleBase}/product-configurator/profiles/${profile.id}`} className="min-w-0 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{profile.name}</span>
                  <Badge variant={statusVariant(profile.status)} className="text-[10px]">
                    {STATUS_LABELS[profile.status]}
                  </Badge>
                  {profile.isDefault && (
                    <Badge variant="outline" className="text-[10px]">
                      Default
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {PROFILE_TYPE_LABELS[profile.profileType]} · {profile.slug} · {profile.categoryCount} categories ·{" "}
                  {profile.buildCount} builds
                </p>
                {profile.description && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{profile.description}</p>
                )}
              </Link>
              <div className="flex items-center gap-1">
                <ActivityTriggerButton
                  entity={{ type: "configurator_profile", id: profile.id, label: profile.name }}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canWrite && onEdit && (
                      <DropdownMenuItem onClick={() => onEdit(profile)}>
                        <Pencil className="mr-2 h-3.5 w-3.5" />
                        Edit
                      </DropdownMenuItem>
                    )}
                    {canWrite && (
                      <DropdownMenuItem onClick={() => void handleDuplicate(profile.id)}>
                        <Copy className="mr-2 h-3.5 w-3.5" />
                        Duplicate
                      </DropdownMenuItem>
                    )}
                    {canWrite && (
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => void handleDelete([profile.id])}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Delete
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))
        )}
      </div>
    </ConfiguratorAdminShell>
  );
}
