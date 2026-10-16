"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, MoreHorizontal, MoreVertical, MousePointerClick, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  BlogArticleGrid,
  type BlogArticleGridHandle,
} from "@/components/blog/blog-article-grid";
import {
  BlogArticleFormDrawer,
} from "@/components/blog/blog-article-form-drawer";
import { BlogArticleViewDialog } from "@/components/blog/blog-article-view-dialog";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import type { BlogArticle } from "@/lib/blog/blog-article";
import { useBlogArticles } from "@/lib/api/use-blog-articles";
import { useApiHealth } from "@/lib/api/use-api-health";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useViewerWriteUrlGuard } from "@/lib/hooks/use-viewer-write-url-guard";
import { cn } from "@/lib/utils";

function buildArticlesUrl(basePath: string, params: URLSearchParams) {
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function ArticleListContent() {
  const router = useRouter();
  // Also mounted at bare /blog (see ../page.tsx) — stay on whichever path this
  // is currently rendered under instead of always jumping to /blog/articles.
  const pathname = usePathname() || "/blog/articles";
  const searchParams = useSearchParams();
  const { articles, loading, error, refetch, saveArticle } = useBlogArticles();
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const articleGridRef = useRef<BlogArticleGridHandle>(null);
  const [advancedFilterCount, setAdvancedFilterCount] = useState(0);

  const createOpen = searchParams.get("create") === "1";
  const editId = searchParams.get("edit");
  const viewId = searchParams.get("view");

  const editArticle = useMemo(
    () => (editId ? articles.find((a) => a.id === editId) ?? null : null),
    [editId, articles],
  );

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "blog-articles-api" });
  }, [error]);

  const pushParams = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    router.push(buildArticlesUrl(pathname, params), { scroll: false });
  };

  const openCreate = () => {
    pushParams((params) => {
      params.delete("edit");
      params.delete("view");
      params.set("create", "1");
    });
  };

  const handleEdit = (article: BlogArticle) => {
    pushParams((params) => {
      params.delete("create");
      params.delete("view");
      params.set("edit", article.id);
    });
  };

  const handleView = (article: BlogArticle) => {
    pushParams((params) => {
      params.delete("create");
      params.delete("edit");
      params.set("view", article.id);
    });
  };

  const handleEditFromView = (article: BlogArticle) => {
    handleEdit(article);
  };

  const closeForm = () => {
    pushParams((params) => {
      params.delete("create");
      params.delete("edit");
    });
  };

  useViewerWriteUrlGuard(createOpen || !!editId, closeForm);

  const closeView = () => {
    pushParams((params) => {
      params.delete("view");
    });
  };

  const handleSaved = () => {
    void refetch();
  };

  useEffect(() => {
    if (editId && !loading && !editArticle) {
      toast.error("Article not found");
      closeForm();
    }
  }, [editId, editArticle, loading]);

  const viewOpen = !!viewId && !createOpen && !editArticle;

  const headerLeftActions = (
    <ListGridHeaderStart title="Articles">
      {canWrite ? (
        <Button size="sm" onClick={openCreate}>
          New
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Blog sections">
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => router.push("/website/blog/categories")}>
            Category
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/website/blog/comments")}>
            Comment
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ListGridHeaderStart>
  );

  const footerLeftActions = (
    <>
      <span className="text-sm font-medium">Articles</span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          void refetch();
          apiHealth.recheck();
        }}
        disabled={loading}
        aria-label={`Refresh articles (API/DB ${apiHealth.status})`}
        title={
          apiHealth.status === "connected"
            ? "API and database connected"
            : apiHealth.status === "partial"
              ? "API connected, database not connected"
              : apiHealth.status === "disconnected"
                ? "API/database not connected"
                : "Checking connection…"
        }
        className={cn(
          apiHealth.status === "connected" &&
            "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 hover:text-emerald-700 dark:text-emerald-400",
          apiHealth.status === "partial" &&
            "border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 hover:text-amber-700 dark:text-amber-400",
          apiHealth.status === "disconnected" &&
            "border-red-500/40 bg-red-500/10 text-red-700 hover:bg-red-500/15 hover:text-red-700 dark:text-red-400",
        )}
      >
        <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="relative h-7 w-7"
        onClick={() => articleGridRef.current?.openFilters()}
        aria-label="Filters"
        title="Filters"
      >
        <Filter className="h-3.5 w-3.5" />
        {advancedFilterCount > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground">
            {advancedFilterCount}
          </span>
        )}
      </Button>
      {canWrite && (
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => articleGridRef.current?.openLiveEdit()}
          aria-label="Live edit"
          title="Live edit"
        >
          <MousePointerClick className="h-3.5 w-3.5" />
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" aria-label="More actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => toast.info("Import — prototype")}>
            Import
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toast.success("Export started (mock CSV)")}>
            Export
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      {error && !loading ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <p className="font-medium text-destructive">Could not load articles from API</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Ensure FastAPI is running:{" "}
            <code className="rounded bg-muted px-1">uvicorn main:app --port 8010</code>
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <BlogArticleGrid
          ref={articleGridRef}
          articles={articles}
          loading={loading}
          canWrite={canWrite}
          onView={handleView}
          onEdit={handleEdit}
          onAdvancedFilterCountChange={setAdvancedFilterCount}
          footerLeftActions={footerLeftActions}
          headerLeftActions={headerLeftActions}
          className="min-h-0 flex-1"
        />
      )}

      {canWrite && (
        <Button
          size="sm"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full p-0 shadow-lg md:hidden"
          onClick={openCreate}
          aria-label="Add article"
        >
          <Plus className="h-5 w-5" />
        </Button>
      )}

      <BlogArticleViewDialog
        open={viewOpen}
        onOpenChange={(open) => {
          if (!open) closeView();
        }}
        articleId={viewId}
        onEdit={canWrite ? handleEditFromView : undefined}
      />

      {canWrite && (
        <BlogArticleFormDrawer
          open={createOpen || !!editArticle}
          mode={createOpen ? "create" : "edit"}
          article={editArticle}
          onOpenChange={(open) => {
            if (!open) closeForm();
          }}
          onSave={async (input) => {
            await saveArticle(createOpen ? null : editArticle?.id ?? null, {
              ...input,
              categoryId: input.categoryId,
            });
            handleSaved();
          }}
        />
      )}
    </div>
  );
}

export default function BlogArticlesPage() {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={<ContentDataSkeleton label="Loading articles…" />}>
        <ArticleListContent />
      </Suspense>
    </div>
  );
}
