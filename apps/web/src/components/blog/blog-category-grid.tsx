"use client";

import "@/components/providers/ag-grid-provider";
import { useMemo, useState, type ReactNode } from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { MoreHorizontal, Pencil } from "lucide-react";
import type { BlogCategory } from "@/lib/blog/blog-category";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { AgainListGrid } from "@/components/shared/again-list-grid";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  categories: BlogCategory[];
  loading?: boolean;
  onEdit: (category: BlogCategory) => void;
  headerRightActions?: ReactNode;
  footerLeftActions?: ReactNode;
  className?: string;
};

export function BlogCategoryGrid({
  categories,
  loading = false,
  onEdit,
  headerRightActions,
  footerLeftActions,
  className,
}: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categories.filter((category) => {
      if (status !== "all" && category.status !== status) return false;
      if (!q) return true;
      const parentName = category.parentId ? byId.get(category.parentId)?.name ?? "" : "";
      return (
        category.name.toLowerCase().includes(q) ||
        category.slug.toLowerCase().includes(q) ||
        category.description.toLowerCase().includes(q) ||
        parentName.toLowerCase().includes(q)
      );
    });
  }, [categories, search, status, byId]);

  const columnDefs = useMemo<ColDef<BlogCategory>[]>(
    () => [
      {
        field: "name",
        headerName: "Name",
        flex: 1.6,
        minWidth: 180,
        cellRenderer: (p: ICellRendererParams<BlogCategory>) =>
          p.data ? (
            <button
              type="button"
              className="truncate text-left font-medium text-foreground hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(p.data!);
              }}
            >
              {p.data.name}
            </button>
          ) : null,
      },
      {
        colId: "parentName",
        headerName: "Parent",
        width: 150,
        valueGetter: (p) => {
          const parentId = p.data?.parentId;
          if (!parentId) return "—";
          return byId.get(parentId)?.name ?? "—";
        },
      },
      { field: "slug", headerName: "Slug", width: 160 },
      {
        field: "status",
        headerName: "Status",
        width: 110,
        cellRenderer: (p: ICellRendererParams<BlogCategory>) =>
          p.data ? (
            <Badge variant={p.data.status === "active" ? "default" : "secondary"} className="capitalize">
              {p.data.status}
            </Badge>
          ) : null,
      },
      {
        field: "articleCount",
        headerName: "Articles",
        width: 100,
        type: "numericColumn",
      },
      { field: "sortOrder", headerName: "Order", width: 90, type: "numericColumn" },
      {
        colId: "actions",
        headerName: "",
        width: 56,
        pinned: "right",
        sortable: false,
        headerComponent: GridFullscreenHeader,
        cellRenderer: (p: ICellRendererParams<BlogCategory>) =>
          p.data ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(p.data!)}>
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Edit
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null,
      },
    ],
    [onEdit, byId],
  );

  return (
    <AgainListGrid<BlogCategory>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      headerLeftActions={headerRightActions}
      filterBar={
        <>
          <Input
            placeholder="Search name, slug, parent…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[260px] shrink-0 rounded-none"
          />
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-[140px] shrink-0 rounded-none"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </>
      }
      footerLeftActions={footerLeftActions}
      emptyTitle="No categories match your filters."
      onRowClicked={onEdit}
      defaultColDef={{ minWidth: 72 }}
    />
  );
}
