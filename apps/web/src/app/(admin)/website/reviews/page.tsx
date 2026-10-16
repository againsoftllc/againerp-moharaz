"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Download,
  Filter,
  MousePointerClick,
  Plus,
  RefreshCw,
  Settings2,
  Upload,
} from "lucide-react";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ReviewGridHandle } from "@/components/reviews/review-grid";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import {
  updateCatalogReviewStatus,
  useCatalogReviews,
} from "@/lib/api/use-catalog-reviews";
import { useApiHealth } from "@/lib/api/use-api-health";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useViewerWriteUrlGuard } from "@/lib/hooks/use-viewer-write-url-guard";
import type { Review, ReviewStatus } from "@/lib/mock-data/reviews";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ReviewGrid = dynamic(
  () => import("@/components/reviews/review-grid").then((module) => module.ReviewGrid),
  {
    ssr: false,
    loading: () => <ListGridOpenFallback label="Opening reviews…" />,
  },
);

const ReviewFormDialog = dynamic(
  () =>
    import("@/components/reviews/review-form-dialog").then(
      (module) => module.ReviewFormDialog,
    ),
  { ssr: false },
);

function buildReviewsUrl(params: URLSearchParams) {
  const query = params.toString();
  return query ? `/website/reviews?${query}` : "/website/reviews";
}

function ReviewListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { reviews, total, pendingCount, loading, error, refetch } = useCatalogReviews();
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const reviewGridRef = useRef<ReviewGridHandle>(null);
  const [advancedFilterCount, setAdvancedFilterCount] = useState(0);

  const createOpen = searchParams.get("create") === "1";
  const editId = searchParams.get("edit");
  const viewId = searchParams.get("view");
  const statusParam = searchParams.get("status");

  const editReview = useMemo(
    () => (editId ? reviews.find((r) => r.id === editId) ?? null : null),
    [editId, reviews],
  );
  const viewReview = useMemo(
    () => (viewId ? reviews.find((r) => r.id === viewId) ?? null : null),
    [viewId, reviews],
  );

  useEffect(() => {
    if (error) {
      toast.error(`API: ${error}`, { id: "catalog-reviews-list-api" });
    }
  }, [error]);

  const pushParams = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    router.push(buildReviewsUrl(params), { scroll: false });
  };

  const openCreate = () => {
    pushParams((params) => {
      params.delete("edit");
      params.delete("view");
      params.set("create", "1");
    });
  };

  const handleView = (review: Review) => {
    pushParams((params) => {
      params.delete("create");
      params.delete("edit");
      params.set("view", review.id);
    });
  };

  const handleEdit = (review: Review) => {
    pushParams((params) => {
      params.delete("create");
      params.delete("view");
      params.set("edit", review.id);
    });
  };

  const closeForm = () => {
    pushParams((params) => {
      params.delete("create");
      params.delete("edit");
    });
  };

  const closeView = () => {
    pushParams((params) => {
      params.delete("view");
    });
  };

  useViewerWriteUrlGuard(createOpen || !!editId, closeForm);

  useEffect(() => {
    if (editId && !loading && !editReview) {
      toast.error("Review not found");
      closeForm();
    }
  }, [editId, editReview, loading]);

  const handleStatusChange = useCallback(
    async (id: string, nextStatus: ReviewStatus) => {
      try {
        await updateCatalogReviewStatus(id, nextStatus);
        await refetch();
        toast.success(
          nextStatus === "approved"
            ? "Review approved — now visible on storefront"
            : nextStatus === "archived"
              ? "Review archived"
              : `Review → ${nextStatus}`,
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Status update failed");
      }
    },
    [refetch],
  );

  const handleSaved = () => {
    void refetch();
  };

  const viewOpen = !!viewId && !createOpen && !editReview;
  const healthTitle =
    apiHealth.status === "connected"
      ? "API and database connected"
      : apiHealth.status === "partial"
        ? "API connected, database not connected"
        : apiHealth.status === "disconnected"
          ? "API/database not connected"
          : "Checking connection…";

  const headerLeftActions = (
    <ListGridHeaderStart title="Reviews">
      {canWrite ? (
        <Button size="sm" className="rounded-none" onClick={openCreate}>
          New
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(
              "relative h-[26px] w-[26px] shrink-0 rounded-none",
              apiHealth.status === "connected" &&
                "border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400",
              apiHealth.status === "partial" &&
                "border-amber-500/50 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400",
              apiHealth.status === "disconnected" &&
                "border-red-500/50 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400",
              apiHealth.status === "checking" && "text-muted-foreground",
            )}
            aria-label={`Settings (${healthTitle})`}
            title={healthTitle}
          >
            <Settings2 className="h-3.5 w-3.5" />
            {advancedFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 rounded-none bg-primary px-1 text-[9px] leading-3 text-primary-foreground">
                {advancedFilterCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[11rem]">
          <DropdownMenuItem
            onClick={() => {
              void refetch();
              apiHealth.recheck();
            }}
            disabled={loading}
          >
            <RefreshCw className={cn("mr-1.5 h-3 w-3", loading && "animate-spin")} />
            Refresh
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => reviewGridRef.current?.openFilters()}>
            <Filter className="mr-1.5 h-3 w-3" />
            Filters
            {advancedFilterCount > 0 ? (
              <span className="ml-auto text-[10px] text-muted-foreground">{advancedFilterCount}</span>
            ) : null}
          </DropdownMenuItem>
          {canWrite ? (
            <DropdownMenuItem onClick={() => reviewGridRef.current?.openLiveEdit()}>
              <MousePointerClick className="mr-1.5 h-3 w-3" />
              Live edit
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          {canWrite ? (
            <DropdownMenuItem onClick={() => toast.info("Import reviews — prototype")}>
              <Upload className="mr-1.5 h-3 w-3" />
              Import
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={() => toast.success("Export started (mock CSV)")}>
            <Download className="mr-1.5 h-3 w-3" />
            Export
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ListGridHeaderStart>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      {error && !loading ? (
        <div className="rounded-none border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <p className="font-medium text-destructive">Could not load reviews from API</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 rounded-none"
            onClick={() => void refetch()}
          >
            Retry
          </Button>
        </div>
      ) : (
        <ReviewGrid
          ref={reviewGridRef}
          reviews={reviews}
          loading={loading && reviews.length === 0}
          initialStatus={statusParam}
          onView={handleView}
          onEdit={canWrite ? handleEdit : undefined}
          onStatusChange={handleStatusChange}
          onAdvancedFilterCountChange={setAdvancedFilterCount}
          onStatusTabChange={(status) => {
            pushParams((params) => {
              if (status === "all") params.delete("status");
              else params.set("status", status);
            });
          }}
          headerLeftActions={headerLeftActions}
          footerLeftActions={
            <span className="px-2 text-[10px] text-muted-foreground">
              {loading ? "Loading…" : `${total} reviews${pendingCount ? ` · ${pendingCount} pending` : ""}`}
            </span>
          }
          className="min-h-0 flex-1"
        />
      )}

      {canWrite && (
        <Button
          size="sm"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full p-0 shadow-lg md:hidden"
          onClick={openCreate}
          aria-label="Add review"
        >
          <Plus className="h-5 w-5" />
        </Button>
      )}

      {viewOpen && (
        <ReviewFormDialog
          open
          mode="view"
          review={viewReview}
          loading={loading && !viewReview}
          onOpenChange={(open) => {
            if (!open) closeView();
          }}
          onEdit={canWrite ? handleEdit : undefined}
        />
      )}

      {canWrite && (createOpen || !!editReview) && (
        <ReviewFormDialog
          open
          mode={createOpen ? "create" : "edit"}
          review={editReview}
          onOpenChange={(open) => {
            if (!open) closeForm();
          }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

export default function ReviewListPage() {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={<ListGridOpenFallback label="Opening reviews…" />}>
        <ReviewListContent />
      </Suspense>
    </div>
  );
}
