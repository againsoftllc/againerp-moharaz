"use client";

import { useMemo, useState } from "react";
import { Copy, FileStack, MoreHorizontal, Pencil, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  STATUS_LABELS,
  type ConfiguratorProfile,
  type ConfiguratorTemplate,
} from "@/lib/configurator/types";
import {
  bulkSetConfiguratorTemplateStatus,
  deleteConfiguratorTemplates,
  duplicateConfiguratorTemplate,
} from "@/lib/api/use-configurator-templates";
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

type Props = {
  templates: ConfiguratorTemplate[];
  profiles: ConfiguratorProfile[];
  profileFilter: string;
  onProfileFilterChange: (profileId: string) => void;
  loading?: boolean;
  onTemplatesChanged?: () => void;
  onEdit?: (template: ConfiguratorTemplate) => void;
  onCreate?: () => void;
};

export function ConfiguratorTemplatesList({
  templates,
  profiles,
  profileFilter,
  onProfileFilterChange,
  loading: _loading = false,
  onTemplatesChanged,
  onEdit,
  onCreate,
}: Props) {
  const canWrite = useAdminCanWrite();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ status: "all", featured: "all" });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (t.profileId !== profileFilter) return false;
      if (filters.status !== "all" && t.status !== filters.status) return false;
      if (filters.featured === "yes" && !t.isFeatured) return false;
      if (filters.featured === "no" && t.isFeatured) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q);
    });
  }, [templates, profileFilter, search, filters]);

  const kpis = useMemo(
    () => [
      { label: "Templates", value: filtered.length, sub: "In selected profile" },
      { label: "Featured", value: filtered.filter((t) => t.isFeatured).length, sub: "Shown on storefront" },
      { label: "Total uses", value: filtered.reduce((s, t) => s + t.useCount, 0), sub: "Customer starts" },
      { label: "Active", value: filtered.filter((t) => t.status === "active").length, sub: "Published templates" },
    ],
    [filtered],
  );

  const handleBulkStatus = async (status: ConfiguratorTemplate["status"], label: string) => {
    try {
      await bulkSetConfiguratorTemplateStatus([...selected], status);
      toast.success(label);
      setSelected(new Set());
      onTemplatesChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk update failed");
    }
  };

  const handleBulkDelete = async () => {
    try {
      await deleteConfiguratorTemplates([...selected]);
      toast.success("Deleted");
      setSelected(new Set());
      onTemplatesChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteConfiguratorTemplates([id]);
      toast.success("Deleted");
      onTemplatesChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      await duplicateConfiguratorTemplate(id);
      toast.success("Duplicated");
      onTemplatesChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Duplicate failed");
    }
  };

  return (
    <ConfiguratorAdminShell
      workflow={["1. Pick profile", "2. Pre-select components", "3. Set featured flag", "4. Publish", "5. Track usage"]}
      kpis={kpis}
      search={search}
      onSearchChange={setSearch}
      filterFields={[
        { key: "status", label: "Status", type: "select", options: [{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "draft", label: "Draft" }] },
        { key: "featured", label: "Featured", type: "select", options: [{ value: "all", label: "All" }, { value: "yes", label: "Featured" }, { value: "no", label: "Not featured" }] },
      ]}
      filterValues={filters}
      onFilterChange={(key, value) => setFilters((f) => ({ ...f, [key]: value }))}
      selectedCount={selected.size}
      onBulkActivate={canWrite ? () => void handleBulkStatus("active", "Activated") : undefined}
      onBulkArchive={canWrite ? () => void handleBulkStatus("archived", "Archived") : undefined}
      onBulkDelete={canWrite ? () => void handleBulkDelete() : undefined}
      onClearSelection={() => setSelected(new Set())}
      createLabel={canWrite ? "Create template" : undefined}
      onCreate={canWrite ? onCreate : undefined}
      extraToolbar={
        <Select value={profileFilter} onChange={(e) => onProfileFilterChange(e.target.value)} className="h-8 w-[160px] text-xs">
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      }
    >
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed py-12 text-center">
            <FileStack className="mx-auto h-8 w-8 text-indigo-500/70" />
            <p className="mt-2 text-sm font-medium">No templates</p>
          </div>
        ) : (
          filtered.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-lg border border-input bg-card p-3 shadow-sm">
              <ConfiguratorRowCheckbox checked={selected.has(t.id)} onChange={(on) => setSelected((prev) => { const n = new Set(prev); on ? n.add(t.id) : n.delete(t.id); return n; })} />
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onEdit?.(t)}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{t.name}</span>
                  <Badge variant={t.status === "active" ? "success" : "warning"} className="text-[10px]">{STATUS_LABELS[t.status]}</Badge>
                  {t.isFeatured && <Badge variant="outline" className="text-[10px]"><Star className="mr-0.5 h-2.5 w-2.5" />Featured</Badge>}
                </div>
                <p className="text-[11px] text-muted-foreground">{t.components.length} components · {t.useCount} uses · {t.slug}</p>
              </button>
              <ActivityTriggerButton entity={{ type: "configurator_template", id: t.id, label: t.name }} />
              {canWrite && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit?.(t)}><Pencil className="mr-2 h-3.5 w-3.5" />Edit</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void handleDuplicate(t.id)}><Copy className="mr-2 h-3.5 w-3.5" />Duplicate</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => void handleDelete(t.id)}><Trash2 className="mr-2 h-3.5 w-3.5" />Delete</DropdownMenuItem>
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
