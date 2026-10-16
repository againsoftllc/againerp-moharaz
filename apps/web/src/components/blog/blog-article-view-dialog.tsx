"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Pencil } from "lucide-react";
import type { BlogArticle } from "@/lib/blog/blog-article";
import { fetchBlogArticle } from "@/lib/api/blog-articles";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  articleId?: string | null;
  onEdit?: (article: BlogArticle) => void;
};

export function BlogArticleViewDialog({ open, onOpenChange, articleId, onEdit }: Props) {
  const [article, setArticle] = useState<BlogArticle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !articleId) {
      setArticle(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchBlogArticle(articleId)
      .then((row) => {
        if (!cancelled) setArticle(row);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load article");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, articleId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title={article ? `Article: ${article.title}` : "Article details"}
        className="w-full max-w-3xl gap-0 overflow-hidden p-0 sm:max-w-3xl [&>button.absolute]:hidden"
        aria-describedby={undefined}
      >
        <div className="flex h-full min-h-0 flex-col px-4 pb-4 pt-3">
          {loading && (
            <p className="text-sm text-muted-foreground">Loading article from database…</p>
          )}
          {error && !loading && <p className="text-sm text-destructive">{error}</p>}
          {article && !loading && (
            <>
              <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b pb-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold leading-tight">{article.title}</h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="outline" className="capitalize">
                      {article.status}
                    </Badge>
                    {article.categoryName ? (
                      <Badge variant="secondary">{article.categoryName}</Badge>
                    ) : null}
                    {article.publishedAt ? (
                      <span className="text-xs text-muted-foreground">
                        Published {String(article.publishedAt).slice(0, 10)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {article.authorName} · /{article.slug}
                  </p>
                </div>
                {onEdit ? (
                  <Button size="sm" onClick={() => onEdit(article)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </Button>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pt-4">
                {article.coverImageUrl ? (
                  <div className="relative aspect-[2/1] w-full overflow-hidden rounded-md border bg-muted">
                    <Image
                      src={article.coverImageUrl}
                      alt=""
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                ) : null}

                {article.excerpt ? (
                  <p className="text-sm text-muted-foreground">{article.excerpt}</p>
                ) : null}

                {article.content ? (
                  <div
                    className="prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: article.content }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">No body content.</p>
                )}

                {article.relatedProductCount > 0 ? (
                  <div className="rounded-md border bg-muted/30 p-3">
                    <p className="text-sm font-medium">Related products</p>
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {article.relatedProducts.map((product) => (
                        <li key={product.productId}>{product.productName}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {(article.seoTitle || article.seoDescription) && (
                  <div className="rounded-md border bg-muted/30 p-3 text-sm">
                    <p className="font-medium">SEO</p>
                    {article.seoTitle ? (
                      <p className="mt-2 text-foreground">{article.seoTitle}</p>
                    ) : null}
                    {article.seoDescription ? (
                      <p className="mt-1 text-muted-foreground">{article.seoDescription}</p>
                    ) : null}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
