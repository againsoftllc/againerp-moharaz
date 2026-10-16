"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/shared/filter-select";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { ServiceItemDrawer } from "@/components/service/service-item-drawer";
import { useServiceItems } from "@/lib/api/use-service-items";
import { useServiceCategories, buildServiceCategoryTree, flattenServiceCategoryTree } from "@/lib/api/service-categories";
import { patchItem, type ItemRecord } from "@/lib/api/items";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { formatCurrency } from "@/lib/utils";

function ServiceItemsInner() {
  const canWrite = useAdminCanWrite();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const { items, loading, refetch } = useServiceItems(search);
  const { categories } = useServiceCategories();
  const [drawerOpen, setDrawerOpen] = useState(searchParams.get("create") === "1");
  const [editItem, setEditItem] = useState<ItemRecord | null>(null);

  const tree = useMemo(
    () => flattenServiceCategoryTree(buildServiceCategoryTree(categories)),
    [categories],
  );

  const rows = useMemo(() => {
    return items.filter((item) => {
      if (category !== "all" && (item.category || "") !== category) return false;
      if (status !== "all" && item.status !== status) return false;
      return true;
    });
  }, [items, category, status]);

  const archive = async (item: ItemRecord) => {
    try {
      await patchItem(item.id, { status: item.status === "archived" ? "active" : "archived" });
      toast.success(item.status === "archived" ? "Item restored" : "Item archived");
      void refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the item");
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div
        data-component="product-grid-filters"
        className="product-grid-filters flex min-w-0 shrink-0 items-center gap-1.5 border-b border-border py-1 pl-2 pr-2"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ListGridHeaderStart title="Service items">
            {canWrite ? (
              <Button
                size="sm"
                className="rounded-none"
                onClick={() => {
                  setEditItem(null);
                  setDrawerOpen(true);
                }}
              >
                New
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-[26px] w-[26px] shrink-0 rounded-none"
                  aria-label="Settings"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[11rem]">
                <DropdownMenuItem onClick={() => void refetch()} disabled={loading}>
                  <RefreshCw className="mr-1.5 h-3 w-3" />
                  Refresh
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ListGridHeaderStart>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="h-[26px] w-[200px] rounded-none"
          />
          <FilterSelect
            value={category}
            onChange={setCategory}
            ariaLabel="Category"
            options={[
              { value: "all", label: "All categories" },
              ...tree.map((c) => ({
                value: c.name,
                label: `${"— ".repeat(c.depth)}${c.name}`,
              })),
            ]}
          />
          <FilterSelect
            value={status}
            onChange={setStatus}
            ariaLabel="Status"
            options={[
              { value: "all", label: "All statuses" },
              { value: "active", label: "Active" },
              { value: "archived", label: "Archived" },
              { value: "draft", label: "Draft" },
            ]}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 border-b border-border bg-muted/30 text-left text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">Code</th>
              <th className="px-3 py-1.5 font-medium">Name</th>
              <th className="px-3 py-1.5 font-medium">Category</th>
              <th className="px-3 py-1.5 font-medium">Unit</th>
              <th className="px-3 py-1.5 text-right font-medium">Rate</th>
              <th className="px-3 py-1.5 font-medium">Status</th>
              {canWrite ? <th className="px-3 py-1.5 font-medium">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={canWrite ? 7 : 6} className="px-3 py-10 text-center text-muted-foreground">
                  No service items yet. Create labour, diagnosis, and installation charges here — not inventory parts.
                </td>
              </tr>
            ) : (
              rows.map((item) => (
                <tr key={item.id} className="border-b border-border">
                  <td className="px-3 py-1.5 font-mono">{item.sku}</td>
                  <td className="px-3 py-1.5">
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => {
                        setEditItem(item);
                        setDrawerOpen(true);
                      }}
                    >
                      {item.name}
                    </button>
                  </td>
                  <td className="px-3 py-1.5">{item.category || "—"}</td>
                  <td className="px-3 py-1.5">{item.unit_type || "Job"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatCurrency(Number(item.rate ?? 0))}
                  </td>
                  <td className="px-3 py-1.5">
                    <Badge variant="outline" className="rounded-none text-[10px]">
                      {item.status}
                    </Badge>
                  </td>
                  {canWrite ? (
                    <td className="px-3 py-1.5">
                      <button
                        type="button"
                        className="text-[11px] text-primary hover:underline"
                        onClick={() => void archive(item)}
                      >
                        {item.status === "archived" ? "Restore" : "Archive"}
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <ServiceItemDrawer
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) setEditItem(null);
        }}
        item={editItem}
        onSaved={() => void refetch()}
      />
    </div>
  );
}

export default function ServiceItemsPage() {
  return (
    <Suspense fallback={null}>
      <ServiceItemsInner />
    </Suspense>
  );
}
