"use client";

import {
  Archive,
  Copy,
  ExternalLink,
  Eye,
  Globe,
  MoreHorizontal,
  MousePointerClick,
  Pencil,
  Trash2,
} from "lucide-react";
import type { WebsiteManagedPage } from "@/lib/website/pages/types";
import {
  WEBSITE_PAGE_STATUS_LABELS,
  WEBSITE_PAGE_TYPE_LABELS,
} from "@/lib/website/pages/types";
import {
  canDeletePage,
  supportsLiveEdit,
} from "@/lib/website/pages/page-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";

function StatusBadge({ status }: { status: WebsiteManagedPage["status"] }) {
  const variant =
    status === "published"
      ? "success"
      : status === "draft" || status === "review" || status === "scheduled"
        ? "warning"
        : "muted";
  return (
    <Badge variant={variant} className="capitalize">
      {WEBSITE_PAGE_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

type Props = {
  pages: WebsiteManagedPage[];
  onView: (page: WebsiteManagedPage) => void;
  onEdit: (page: WebsiteManagedPage) => void;
  onLiveEdit: (page: WebsiteManagedPage) => void;
  onOpenStorefront: (page: WebsiteManagedPage) => void;
  onPublish: (page: WebsiteManagedPage) => void;
  onDraft: (page: WebsiteManagedPage) => void;
  onArchive: (page: WebsiteManagedPage) => void;
  onDuplicate: (page: WebsiteManagedPage) => void;
  onDelete: (page: WebsiteManagedPage) => void;
};

export function WebsitePagesMobileCards({
  pages,
  onView,
  onEdit,
  onLiveEdit,
  onOpenStorefront,
  onPublish,
  onDraft,
  onArchive,
  onDuplicate,
  onDelete,
}: Props) {
  const canWrite = useAdminCanWrite();

  if (pages.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-input bg-card p-8 text-center">
        <p className="text-sm font-medium">No pages found</p>
        <p className="mt-1 text-xs text-muted-foreground">Try adjusting your filters</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pb-20">
      {pages.map((page) => (
        <div
          key={page.id}
          className="flex gap-3 rounded-lg border border-input bg-card p-3"
        >
          <button
            type="button"
            className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => onView(page)}
          >
            <p className="line-clamp-2 text-sm font-semibold text-foreground">{page.name}</p>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{page.url}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {WEBSITE_PAGE_TYPE_LABELS[page.pageType] ?? page.pageType}
              </Badge>
              <StatusBadge status={page.status} />
              {page.flags.isHome ? (
                <Badge variant="default" className="text-[10px]">
                  Home
                </Badge>
              ) : null}
            </div>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onView(page)}>
                <Eye className="mr-2 h-3.5 w-3.5" /> View
              </DropdownMenuItem>
              {supportsLiveEdit(page) ? (
                <DropdownMenuItem onClick={() => onLiveEdit(page)}>
                  <MousePointerClick className="mr-2 h-3.5 w-3.5" /> Live Edit
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => onOpenStorefront(page)}>
                <ExternalLink className="mr-2 h-3.5 w-3.5" /> Open storefront
              </DropdownMenuItem>
              {canWrite ? (
                <>
                  <DropdownMenuItem onClick={() => onEdit(page)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {page.status !== "published" ? (
                    <DropdownMenuItem onClick={() => onPublish(page)}>
                      <Globe className="mr-2 h-3.5 w-3.5" /> Publish
                    </DropdownMenuItem>
                  ) : null}
                  {page.status !== "draft" ? (
                    <DropdownMenuItem onClick={() => onDraft(page)}>Set draft</DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onClick={() => onDuplicate(page)}>
                    <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onArchive(page)}>
                    <Archive className="mr-2 h-3.5 w-3.5" /> Archive
                  </DropdownMenuItem>
                  {canDeletePage(page) ? (
                    <DropdownMenuItem
                      onClick={() => onDelete(page)}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                    </DropdownMenuItem>
                  ) : null}
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
    </div>
  );
}
