"use client";

import "@/components/providers/ag-grid-provider";
import { useMemo, useState, type ReactNode } from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { CheckCircle2, Eye, MoreHorizontal, XCircle } from "lucide-react";
import {
  BLOG_COMMENT_STATUS_LABELS,
  type BlogComment,
  type BlogCommentStatus,
} from "@/lib/blog/blog-comment";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { AgainListGrid } from "@/components/shared/again-list-grid";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const STATUS_TABS: { value: BlogCommentStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "spam", label: "Spam" },
];

type Props = {
  comments: BlogComment[];
  loading?: boolean;
  onStatusChange?: (id: string, status: BlogCommentStatus) => void | Promise<void>;
  footerLeftActions?: ReactNode;
  className?: string;
};

function statusVariant(status: BlogCommentStatus): "default" | "secondary" | "outline" | "warning" {
  if (status === "approved") return "default";
  if (status === "spam" || status === "rejected") return "warning";
  if (status === "pending") return "secondary";
  return "outline";
}

export function BlogCommentGrid({
  comments,
  loading = false,
  onStatusChange,
  footerLeftActions,
  className,
}: Props) {
  const canWrite = useAdminCanWrite();
  const [activeTab, setActiveTab] = useState<BlogCommentStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [viewComment, setViewComment] = useState<BlogComment | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return comments.filter((comment) => {
      if (activeTab !== "all" && comment.status !== activeTab) return false;
      if (!q) return true;
      return (
        comment.articleTitle.toLowerCase().includes(q) ||
        comment.authorName.toLowerCase().includes(q) ||
        (comment.authorEmail ?? "").toLowerCase().includes(q) ||
        comment.body.toLowerCase().includes(q)
      );
    });
  }, [comments, activeTab, search]);

  const columnDefs = useMemo<ColDef<BlogComment>[]>(
    () => [
      {
        field: "articleTitle",
        headerName: "Article",
        flex: 1.2,
        minWidth: 180,
      },
      {
        field: "authorName",
        headerName: "Author",
        width: 130,
      },
      {
        field: "body",
        headerName: "Comment",
        flex: 1.6,
        minWidth: 220,
        cellRenderer: (p: ICellRendererParams<BlogComment>) =>
          p.data ? <span className="line-clamp-2 text-sm">{p.data.body}</span> : null,
      },
      {
        field: "status",
        headerName: "Status",
        width: 110,
        cellRenderer: (p: ICellRendererParams<BlogComment>) =>
          p.data ? (
            <Badge variant={statusVariant(p.data.status)} className="capitalize">
              {BLOG_COMMENT_STATUS_LABELS[p.data.status]}
            </Badge>
          ) : null,
      },
      {
        field: "createdAt",
        headerName: "Submitted",
        width: 120,
        valueFormatter: (p) => formatDate(p.value),
      },
      {
        colId: "actions",
        headerName: "",
        width: 56,
        pinned: "right",
        sortable: false,
        headerComponent: GridFullscreenHeader,
        cellRenderer: (p: ICellRendererParams<BlogComment>) =>
          p.data ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setViewComment(p.data!)}>
                  <Eye className="mr-2 h-3.5 w-3.5" />
                  View
                </DropdownMenuItem>
                {canWrite && p.data.status !== "approved" ? (
                  <DropdownMenuItem onClick={() => void onStatusChange?.(p.data!.id, "approved")}>
                    <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                    Approve
                  </DropdownMenuItem>
                ) : null}
                {canWrite && p.data.status !== "rejected" ? (
                  <DropdownMenuItem onClick={() => void onStatusChange?.(p.data!.id, "rejected")}>
                    <XCircle className="mr-2 h-3.5 w-3.5" />
                    Reject
                  </DropdownMenuItem>
                ) : null}
                {canWrite && p.data.status !== "spam" ? (
                  <DropdownMenuItem onClick={() => void onStatusChange?.(p.data!.id, "spam")}>
                    <XCircle className="mr-2 h-3.5 w-3.5" />
                    Mark spam
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null,
      },
    ],
    [canWrite, onStatusChange],
  );

  return (
    <AgainListGrid<BlogComment>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      filterBar={
        <>
          {STATUS_TABS.map((tab) => (
            <Button
              key={tab.value}
              type="button"
              size="sm"
              variant={activeTab === tab.value ? "default" : "outline"}
              className="rounded-none"
              onClick={() => setActiveTab(tab.value)}
            >
              {tab.label}
            </Button>
          ))}
          <Input
            placeholder="Search article, author, comment…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-[320px] rounded-none"
          />
        </>
      }
      footerLeftActions={footerLeftActions}
      emptyTitle="No comments match your filters."
      defaultColDef={{ minWidth: 72 }}
    >
      <Sheet open={!!viewComment} onOpenChange={(open) => !open && setViewComment(null)}>
        <SheetContent className="w-full border-border bg-background text-foreground sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Comment detail</SheetTitle>
          </SheetHeader>
          {viewComment ? (
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Article</p>
                <p className="font-medium">{viewComment.articleTitle}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Author</p>
                <p>{viewComment.authorName}</p>
                {viewComment.authorEmail ? (
                  <p className="text-muted-foreground">{viewComment.authorEmail}</p>
                ) : null}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge variant={statusVariant(viewComment.status)} className="mt-1 capitalize">
                  {BLOG_COMMENT_STATUS_LABELS[viewComment.status]}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Comment</p>
                <p className="whitespace-pre-wrap">{viewComment.body}</p>
              </div>
              {canWrite ? (
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" onClick={() => void onStatusChange?.(viewComment.id, "approved")}>
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void onStatusChange?.(viewComment.id, "rejected")}
                  >
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => void onStatusChange?.(viewComment.id, "spam")}
                  >
                    Spam
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </AgainListGrid>
  );
}
