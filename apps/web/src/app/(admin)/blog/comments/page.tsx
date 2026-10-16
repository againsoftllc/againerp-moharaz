"use client";

import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { BlogCommentGrid } from "@/components/blog/blog-comment-grid";
import { ApiRefreshButton } from "@/components/products/api-refresh-button";
import { Button } from "@/components/ui/button";
import type { BlogCommentStatus } from "@/lib/blog/blog-comment";
import { useBlogComments } from "@/lib/api/use-blog-comments";
import { useApiHealth } from "@/lib/api/use-api-health";

export default function BlogCommentsPage() {
  const { comments, loading, error, refetch, setStatus } = useBlogComments();
  const apiHealth = useApiHealth();

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "blog-comments-api" });
  }, [error]);

  const handleStatusChange = useCallback(
    async (id: string, status: BlogCommentStatus) => {
      try {
        await setStatus(id, status);
        toast.success("Comment updated");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Update failed");
      }
    },
    [setStatus],
  );

  const footerLeftActions = (
    <>
      <span className="text-sm font-medium text-foreground">Comments</span>
      <ApiRefreshButton
        status={apiHealth.status}
        loading={loading}
        onRefresh={() => {
          void refetch();
          apiHealth.recheck();
        }}
        disabled={loading}
      />
    </>
  );

  return (
    <div className="flex h-[calc(100dvh-2.75rem-1.5rem)] min-h-0 w-full flex-1 flex-col overflow-hidden lg:h-[calc(100dvh-2.75rem-2rem)]">
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          {error && !loading ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
              <p className="font-medium text-destructive">Could not load comments from API</p>
              <p className="mt-1 text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <BlogCommentGrid
              comments={comments}
              loading={loading}
              onStatusChange={handleStatusChange}
              footerLeftActions={footerLeftActions}
              className="min-h-0 flex-1"
            />
          )}
        </div>
    </div>
  );
}
