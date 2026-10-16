"use client";

import { useMemo, useState } from "react";
import { FolderTree, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  STATUS_LABELS,
  type ConfiguratorCategory,
  type ConfiguratorProfile,
} from "@/lib/configurator/types";
import {
  bulkSetConfiguratorCategoryStatus,
  deleteConfiguratorCategories,
} from "@/lib/api/use-configurator-categories";
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

function statusVariant(status: string) {
  if (status === "active") return "success" as const;
  if (status === "draft") return "warning" as const;
  return "muted" as const;
}

type Props = {
  categories: ConfiguratorCategory[];
  profiles: ConfiguratorProfile[];
  profileFilter: string;
  onProfileFilterChange: (profileId: string) => void;
  loading?: boolean;
  onCategoriesChanged?: () => void;
  onEdit?: (category: ConfiguratorCategory) => void;
  onCreate?: () => void;
};

export function ConfiguratorCategoriesList({
  categories,
  profiles,
  profileFilter,
  onProfileFilterChange,
  loading: _loading = false,
  onCategoriesChanged,
  onEdit,
  onCreate,
}: Props) {
  const canWrite = useAdminCanWrite();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ status: "all", required: "all" });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categories
      .filter((c) => c.profileId === profileFilter)
      .filter((c) => {
        if (filters.status !== "all" && c.status !== filters.status) return false;
        if (filters.required === "yes" && !c.isRequired) return false;
        if (filters.required === "no" && c.isRequired) return false;
        if (!q) return true;
        return c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q);
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories, profileFilter, search, filters]);

  const profileName = profiles.find((p) => p.id === profileFilter)?.name ?? "Profile";

  const toggleSelect = (id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleBulkStatus = async (status: ConfiguratorCategory["status"], label: string) => {
    try {
      await bulkSetConfiguratorCategoryStatus([...selected], status);
      toast.success(label);
      setSelected(new Set());
      onCategoriesChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk update failed");
    }
  };

  const handleBulkDelete = async () => {
    try {
      await deleteConfiguratorCategories([...selected]);
      toast.success("Deleted");
      setSelected(new Set());
      onCategoriesChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteConfiguratorCategories([id]);
      toast.success("Deleted");
      onCategoriesChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <ConfiguratorAdminShell
      workflow={[
        "1. Select PC Builder profile",
        "2. Slot slug = Catalog category slug",
        "3. Add published products under that category",
        "4. Mark required / optional",
        "5. Sort order = storefront order",
      ]}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search categories…"
      filterFields={[
        { key: "status", label: "Status", type: "select", options: [
          { value: "all", label: "All" }, { value: "active", label: "Active" },
          { value: "draft", label: "Draft" }, { value: "archived", label: "Archived" },
        ]},
        { key: "required", label: "Required", type: "select", options: [
          { value: "all", label: "All" }, { value: "yes", label: "Required" }, { value: "no", label: "Optional" },
        ]},
      ]}
      filterValues={filters}
      onFilterChange={(key, value) => setFilters((f) => ({ ...f, [key]: value }))}
      selectedCount={selected.size}
      onBulkActivate={canWrite ? () => void handleBulkStatus("active", "Activated") : undefined}
      onBulkArchive={canWrite ? () => void handleBulkStatus("archived", "Archived") : undefined}
      onBulkDelete={canWrite ? () => void handleBulkDelete() : undefined}
      onClearSelection={() => setSelected(new Set())}
      createLabel={canWrite ? "Create category" : undefined}
      onCreate={canWrite ? onCreate : undefined}
      extraToolbar={
        <Select value={profileFilter} onChange={(e) => onProfileFilterChange(e.target.value)} className="h-8 w-[160px] text-xs">
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      }
    >
      <div className="overflow-hidden rounded-lg border border-input bg-card shadow-sm">
        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <FolderTree className="mx-auto h-8 w-8 text-indigo-500/70" />
            <p className="mt-2 text-sm font-medium">No categories for {profileName}</p>
          </div>
        ) : (
          filtered.map((cat) => (
            <div key={cat.id} className="flex items-center gap-3 border-b border-input px-3 py-3 last:border-0 hover:bg-muted/20">
              <ConfiguratorRowCheckbox checked={selected.has(cat.id)} onChange={(on) => toggleSelect(cat.id, on)} />
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onEdit?.(cat)}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{cat.name}</span>
                  <Badge variant="outline" className="text-[10px]">#{cat.sortOrder}</Badge>
                  <Badge variant={statusVariant(cat.status)} className="text-[10px]">{STATUS_LABELS[cat.status]}</Badge>
                  {cat.isRequired && <Badge variant="secondary" className="text-[10px]">Required</Badge>}
                </div>
                <p className="text-[11px] text-muted-foreground">{cat.slug} · {cat.selectionMode} · {cat.productCount} products</p>
              </button>
              <ActivityTriggerButton entity={{ type: "configurator_category", id: cat.id, label: cat.name }} />
              {canWrite && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit?.(cat)}><Pencil className="mr-2 h-3.5 w-3.5" />Edit</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => void handleDelete(cat.id)}><Trash2 className="mr-2 h-3.5 w-3.5" />Delete</DropdownMenuItem>
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
