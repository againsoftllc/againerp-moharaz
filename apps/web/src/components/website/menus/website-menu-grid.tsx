"use client";

import "@/components/providers/ag-grid-provider";
import { useMemo, useState, type ReactNode } from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { WebsiteMenu } from "@/lib/website/website-menus";
import { autoTypeLabel } from "@/lib/website/website-menus";
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
  menus: WebsiteMenu[];
  loading?: boolean;
  canWrite?: boolean;
  onEdit: (menu: WebsiteMenu) => void;
  onDelete?: (menu: WebsiteMenu) => void;
  headerRightActions?: ReactNode;
  footerLeftActions?: ReactNode;
  className?: string;
};

export function WebsiteMenuGrid({
  menus,
  loading = false,
  canWrite = true,
  onEdit,
  onDelete,
  headerRightActions,
  footerLeftActions,
  className,
}: Props) {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");
  const [kind, setKind] = useState("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menus.filter((menu) => {
      if (source === "auto" && menu.source !== "auto") return false;
      if (source === "custom" && menu.source !== "custom") return false;
      if (kind === "system" && menu.kind !== "system") return false;
      if (kind === "custom" && menu.kind !== "custom") return false;
      if (!q) return true;
      return (
        menu.name.toLowerCase().includes(q) ||
        (menu.systemKey ?? "").toLowerCase().includes(q) ||
        (menu.source === "auto" ? autoTypeLabel(menu.autoType) : "custom")
          .toLowerCase()
          .includes(q)
      );
    });
  }, [menus, search, source, kind]);

  const columnDefs = useMemo<ColDef<WebsiteMenu>[]>(
    () => [
      {
        field: "name",
        headerName: "Name",
        flex: 1.6,
        minWidth: 180,
        cellRenderer: (p: ICellRendererParams<WebsiteMenu>) =>
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
        field: "kind",
        headerName: "Type",
        width: 140,
        cellRenderer: (p: ICellRendererParams<WebsiteMenu>) =>
          p.data ? (
            <span className="capitalize text-muted-foreground">
              {p.data.kind}
              {p.data.systemKey ? ` · ${p.data.systemKey}` : ""}
            </span>
          ) : null,
      },
      {
        colId: "sourceLabel",
        headerName: "Source",
        width: 160,
        valueGetter: (p) =>
          p.data?.source === "auto"
            ? `Auto · ${autoTypeLabel(p.data.autoType)}`
            : "Custom",
        cellRenderer: (p: ICellRendererParams<WebsiteMenu>) =>
          p.data ? (
            <Badge variant={p.data.source === "auto" ? "default" : "secondary"}>
              {p.data.source === "auto"
                ? `Auto · ${autoTypeLabel(p.data.autoType)}`
                : "Custom"}
            </Badge>
          ) : null,
      },
      {
        colId: "itemCount",
        headerName: "Items",
        width: 110,
        type: "numericColumn",
        valueGetter: (p) => p.data?.items.length ?? 0,
        cellRenderer: (p: ICellRendererParams<WebsiteMenu>) =>
          p.data ? (
            <span className="text-muted-foreground">
              {p.data.source === "auto"
                ? `${p.data.items.length} (synced)`
                : p.data.items.length}
            </span>
          ) : null,
      },
      {
        colId: "actions",
        headerName: "",
        width: 56,
        pinned: "right",
        sortable: false,
        headerComponent: GridFullscreenHeader,
        cellRenderer: (p: ICellRendererParams<WebsiteMenu>) =>
          p.data ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  aria-label={`Actions for ${p.data.name}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(p.data!)}>
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Edit
                </DropdownMenuItem>
                {canWrite && p.data.kind === "custom" && onDelete ? (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDelete(p.data!)}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null,
      },
    ],
    [onEdit, onDelete, canWrite],
  );

  return (
    <AgainListGrid<WebsiteMenu>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      headerLeftActions={headerRightActions}
      filterBar={
        <>
          <Input
            placeholder="Search name, type, source…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[260px] shrink-0 rounded-none"
          />
          <Select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-[140px] shrink-0 rounded-none"
          >
            <option value="all">All sources</option>
            <option value="auto">Auto</option>
            <option value="custom">Custom</option>
          </Select>
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="w-[140px] shrink-0 rounded-none"
          >
            <option value="all">All types</option>
            <option value="system">System</option>
            <option value="custom">Custom</option>
          </Select>
        </>
      }
      footerLeftActions={footerLeftActions}
      emptyTitle="No menus match your filters."
      onRowClicked={onEdit}
      defaultColDef={{ minWidth: 72 }}
      mobile={
        loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No menus match.</p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            {filtered.map((menu) => (
              <button
                key={menu.id}
                type="button"
                className="rounded-none border border-border bg-card px-3 py-3 text-left"
                onClick={() => onEdit(menu)}
              >
                <p className="font-medium text-foreground">{menu.name}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {menu.source === "auto"
                    ? `Auto · ${autoTypeLabel(menu.autoType)}`
                    : "Custom"}{" "}
                  · {menu.items.length} items
                </p>
              </button>
            ))}
          </div>
        )
      }
    />
  );
}
