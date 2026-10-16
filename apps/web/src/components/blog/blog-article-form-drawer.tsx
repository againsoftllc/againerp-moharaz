"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, Loader2, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { BlogArticle, BlogArticleStatus } from "@/lib/blog/blog-article";
import { fetchBlogArticle } from "@/lib/api/blog-articles";
import { useCatalogProducts } from "@/lib/api/use-catalog-products";
import { useBlogCategories } from "@/lib/api/use-blog-categories";
import type { MediaLibraryItem } from "@/lib/mock-data/media-library";
import { MediaLibraryModal } from "@/components/media/media-library-modal";
import { useMediaStore } from "@/lib/store/media-store";
import { useBlogArticleFavoriteStore } from "@/lib/store/blog-article-favorite-store";
import {
  AGAIN_DRAWER_ACTION_BTN,
  AGAIN_DRAWER_FIELD_SHEET_CLASS,
  AgainDrawerActionBar,
  AgainDrawerControlBar,
  AgainDrawerLayout,
  AgainDrawerPanel,
  AgainDrawerScrollBody,
} from "@/components/again/again-drawer";
import { AgainFormNotebook } from "@/components/again/again-form-sheet-layout";
import {
  AgainFormRecordTitle,
  AgainFormRow,
  AgainUnderlineInput,
  AgainUnderlineTextarea,
} from "@/components/again/again-form-sheet";
import { BlogCategoryCombobox } from "@/components/blog/blog-category-combobox";
import { BlogCategoryFormDrawer } from "@/components/blog/blog-category-form-drawer";
import { AgaincartClassicEditor, EDITOR_SHELL_DRAWER_FLUSH } from "@/components/products/againcart-classic-editor";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type BlogArticleFormMode = "create" | "edit" | "view";

type ArticleTab = "content" | "related" | "seo";

type Props = {
  open: boolean;
  mode: BlogArticleFormMode;
  article: BlogArticle | null;
  onOpenChange: (open: boolean) => void;
  onSave: (input: {
    title: string;
    slug: string;
    excerpt: string;
    content: string;
    status: BlogArticleStatus;
    categoryId: string | null;
    categoryName: string;
    authorName: string;
    coverImageUrl: string | null;
    seoTitle: string;
    seoDescription: string;
    relatedProductIds: string[];
  }) => Promise<void>;
};

const EMPTY_FORM = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  status: "draft" as BlogArticleStatus,
  categoryId: null as string | null,
  categoryName: "",
  authorName: "",
  coverImageUrl: null as string | null,
  coverMediaId: null as string | null,
  seoTitle: "",
  seoDescription: "",
  relatedProductIds: [] as string[],
};

const NOTEBOOK_TABS = [
  { id: "content" as const, label: "Content" },
  { id: "related" as const, label: "Related Products" },
  { id: "seo" as const, label: "SEO" },
];

const BRAND_BTN =
  "h-8 rounded-md px-3 text-[13px] font-normal text-white hover:opacity-90 disabled:opacity-50";

function ArticleStatusToggle({
  status,
  readOnly,
  onChange,
}: {
  status: BlogArticleStatus;
  readOnly?: boolean;
  onChange: (status: BlogArticleStatus) => void;
}) {
  const enabled = status === "published";

  if (readOnly) {
    return (
      <span className="text-[13px] font-medium text-foreground">
        {enabled ? "Enabled" : "Disabled"}
      </span>
    );
  }

  return (
    <div className="flex overflow-hidden rounded-md border border-border text-[13px]">
      <button
        type="button"
        onClick={() => onChange("published")}
        className={cn(
          "h-8 px-3 transition-colors",
          enabled
            ? "bg-[#00a09d] font-medium text-white"
            : "bg-muted/50 text-muted-foreground hover:bg-muted",
        )}
      >
        Enable
      </button>
      <button
        type="button"
        onClick={() => onChange("draft")}
        className={cn(
          "h-8 border-l border-border px-3 transition-colors",
          !enabled
            ? "bg-muted font-medium text-foreground"
            : "bg-muted/50 text-muted-foreground hover:bg-muted",
        )}
      >
        Disable
      </button>
    </div>
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function BlogArticleFormDrawer({
  open,
  mode,
  article,
  onOpenChange,
  onSave,
}: Props) {
  const readOnly = mode === "view";
  const { products, loading: productsLoading } = useCatalogProducts();
  const { categories, saveCategory, refetch } = useBlogCategories();
  const mediaItems = useMediaStore((state) => state.items);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [activeTab, setActiveTab] = useState<ArticleTab>("content");
  const articleId = article?.id;
  const starred = useBlogArticleFavoriteStore((s) =>
    articleId ? Boolean(s.starredIds[articleId]) : false,
  );
  const toggleFavorite = useBlogArticleFavoriteStore((s) => s.toggle);
  const [coverMediaOpen, setCoverMediaOpen] = useState(false);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);

  const patch = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const coverMediaSelectedId = useMemo(() => {
    if (form.coverMediaId) return form.coverMediaId;
    if (!form.coverImageUrl) return null;
    return mediaItems.find((item) => item.url === form.coverImageUrl)?.id ?? null;
  }, [form.coverMediaId, form.coverImageUrl, mediaItems]);

  useEffect(() => {
    if (!open) return;
    setActiveTab("content");
    if (!article) {
      setForm(EMPTY_FORM);
      setSlugTouched(false);
      setProductSearch("");
      return;
    }

    let cancelled = false;
    setLoadingDetail(true);
    void fetchBlogArticle(article.id)
      .then((detail) => {
        if (cancelled) return;
        setForm({
          title: detail.title,
          slug: detail.slug,
          excerpt: detail.excerpt,
          content: detail.content,
          status: detail.status,
          categoryId: detail.categoryId,
          categoryName: detail.categoryName,
          authorName: detail.authorName,
          coverImageUrl: detail.coverImageUrl,
          coverMediaId:
            mediaItems.find((item) => item.url === detail.coverImageUrl)?.id ?? null,
          seoTitle: detail.seoTitle,
          seoDescription: detail.seoDescription,
          relatedProductIds: detail.relatedProducts.map((p) => p.productId),
        });
        setSlugTouched(true);
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to load article");
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, article]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products.slice(0, 50);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [products, productSearch]);

  const toggleProduct = (productId: string) => {
    if (readOnly) return;
    setForm((prev) => {
      const exists = prev.relatedProductIds.includes(productId);
      return {
        ...prev,
        relatedProductIds: exists
          ? prev.relatedProductIds.filter((id) => id !== productId)
          : [...prev.relatedProductIds, productId],
      };
    });
  };

  const handleSubmit = async () => {
    if (readOnly) return;
    if (!form.title.trim() || !form.slug.trim()) {
      toast.error("Title and slug are required");
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
      toast.success(mode === "create" ? "Article created" : "Article saved");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const drawerTitle =
    mode === "create" ? "New article" : mode === "view" ? "View article" : "Edit article";
  const titleLabel = form.title.trim() || (mode === "create" ? "New article" : drawerTitle);

  return (
    <AgainDrawerPanel open={open} onOpenChange={onOpenChange} title={drawerTitle}>
      <AgainDrawerLayout>
        <AgainDrawerControlBar>
          <span className="text-[12px] font-medium text-[#00a09d]">Blog</span>
          <span className="text-[13px] text-muted-foreground">/</span>
          <span className="truncate text-[13px] font-medium text-foreground">{titleLabel}</span>
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </AgainDrawerControlBar>

        <AgainDrawerActionBar
          trailing={
            !loadingDetail ? (
              <ArticleStatusToggle
                status={form.status}
                readOnly={readOnly}
                onChange={(v) => patch("status", v)}
              />
            ) : null
          }
        >
          {!readOnly ? (
            <button
              type="button"
              className={cn(BRAND_BTN)}
              style={{ backgroundColor: "#714B67" }}
              disabled={saving || loadingDetail}
              onClick={() => void handleSubmit()}
            >
              {saving ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </span>
              ) : (
                "Save"
              )}
            </button>
          ) : null}
          <button type="button" className={AGAIN_DRAWER_ACTION_BTN} onClick={() => onOpenChange(false)}>
            {readOnly ? "Close" : "Discard"}
          </button>
        </AgainDrawerActionBar>

        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
          {loadingDetail ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading article…
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  aria-label={starred ? "Unfavorite" : "Favorite"}
                  disabled={!articleId}
                  className="mt-2 shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
                  onClick={() => {
                    if (articleId) toggleFavorite(articleId);
                  }}
                >
                  <Star
                    className={cn(
                      "h-5 w-5",
                      starred && "fill-amber-400 text-amber-400",
                    )}
                    strokeWidth={1.5}
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <AgainFormRecordTitle
                    value={form.title}
                    readOnly={readOnly}
                    placeholder={mode === "create" ? "New article" : "Article title"}
                    onChange={(v) => {
                      patch("title", v);
                      if (!slugTouched) patch("slug", slugify(v));
                    }}
                  />
                </div>
              </div>

              <div className="mt-5 grid gap-x-12 gap-y-1 lg:grid-cols-2">
                <div>
                  <AgainFormRow label="Slug">
                    <AgainUnderlineInput
                      value={form.slug}
                      readOnly={readOnly}
                      placeholder="article-slug"
                      onChange={(v) => {
                        setSlugTouched(true);
                        patch("slug", v);
                      }}
                    />
                  </AgainFormRow>
                  <AgainFormRow label="Category">
                    <BlogCategoryCombobox
                      categories={categories}
                      value={form.categoryId ?? ""}
                      selectedName={form.categoryName}
                      readOnly={readOnly}
                      onChange={(categoryId, categoryName) => {
                        patch("categoryId", categoryId || null);
                        patch("categoryName", categoryName);
                      }}
                      onAdd={() => setCategoryDrawerOpen(true)}
                    />
                  </AgainFormRow>
                  <AgainFormRow label="Author">
                    <AgainUnderlineInput
                      value={form.authorName}
                      readOnly={readOnly}
                      placeholder="Author name"
                      onChange={(v) => patch("authorName", v)}
                    />
                  </AgainFormRow>
                </div>

                <div className="flex justify-end">
                  <div className="group relative h-[90px] w-[90px] shrink-0">
                    <button
                      type="button"
                      disabled={readOnly && !form.coverImageUrl}
                      onClick={() => {
                        if (!readOnly && !form.coverImageUrl) setCoverMediaOpen(true);
                      }}
                      className={cn(
                        "relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg border border-border/80 bg-muted/20 text-muted-foreground transition-colors",
                        !readOnly && !form.coverImageUrl && "hover:bg-muted/40",
                        readOnly && !form.coverImageUrl && "opacity-60",
                      )}
                      aria-label={form.coverImageUrl ? "Cover image" : "Add cover image"}
                    >
                      {form.coverImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={form.coverImageUrl}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        <>
                          <Camera className="h-8 w-8" strokeWidth={1.5} />
                          <span className="absolute bottom-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background shadow-sm">
                            <Plus className="h-3 w-3" />
                          </span>
                        </>
                      )}
                    </button>

                    {!readOnly ? (
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/55 to-transparent px-1.5 pb-1 pt-5 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          aria-label={form.coverImageUrl ? "Change cover image" : "Add cover image"}
                          className="pointer-events-auto flex h-6 w-6 items-center justify-center rounded-sm text-white hover:bg-white/20"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCoverMediaOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {form.coverImageUrl ? (
                          <button
                            type="button"
                            aria-label="Remove cover image"
                            className="pointer-events-auto flex h-6 w-6 items-center justify-center rounded-sm text-white hover:bg-white/20"
                            onClick={(e) => {
                              e.stopPropagation();
                              setForm((prev) => ({
                                ...prev,
                                coverImageUrl: null,
                                coverMediaId: null,
                              }));
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <span className="h-6 w-6" aria-hidden />
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-6 -mx-4 sm:-mx-6">
                <AgainFormNotebook
                  tabs={NOTEBOOK_TABS}
                  active={activeTab}
                  onChange={setActiveTab}
                  contentClassName={activeTab === "content" ? "px-0 pt-0 pb-0" : undefined}
                >
                  {activeTab === "content" ? (
                    readOnly ? (
                      <div className={cn(EDITOR_SHELL_DRAWER_FLUSH)}>
                        <div className="border-b border-input bg-muted/30 px-3 py-1.5 text-xs font-medium text-foreground">
                          Content
                        </div>
                        {form.content ? (
                          <div
                            className="prose prose-sm dark:prose-invert max-w-none px-4 py-3 text-foreground"
                            dangerouslySetInnerHTML={{ __html: form.content }}
                          />
                        ) : (
                          <p className="px-4 py-3 text-sm text-muted-foreground">—</p>
                        )}
                      </div>
                    ) : (
                      <AgaincartClassicEditor
                        value={form.content}
                        onChange={(v) => patch("content", v)}
                        placeholder="Write article content…"
                        fieldLabel="Content"
                        aiContext="generic"
                        shellClassName={EDITOR_SHELL_DRAWER_FLUSH}
                        aiVariables={{
                          article_title: form.title,
                          category: form.categoryName,
                          author: form.authorName,
                          current_content: form.content,
                        }}
                      />
                    )
                  ) : null}

                  {activeTab === "related" ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="font-medium text-foreground">Related products</span>
                        <span className="text-muted-foreground">
                          {form.relatedProductIds.length} selected
                        </span>
                      </div>
                      {!readOnly ? (
                        <AgainUnderlineInput
                          value={productSearch}
                          placeholder="Search products…"
                          onChange={setProductSearch}
                        />
                      ) : null}
                      <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-sm border border-border/60 bg-background/60">
                        {productsLoading ? (
                          <p className="px-3 py-2 text-xs text-muted-foreground">Loading products…</p>
                        ) : filteredProducts.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-muted-foreground">No products found.</p>
                        ) : (
                          filteredProducts.map((product) => {
                            const checked = form.relatedProductIds.includes(product.id);
                            return (
                              <label
                                key={product.id}
                                className={cn(
                                  "flex cursor-pointer items-center gap-2 border-b border-border/40 px-3 py-2 text-[13px] last:border-b-0 hover:bg-muted/40",
                                  readOnly && "cursor-default hover:bg-transparent",
                                )}
                              >
                                <input
                                  type="checkbox"
                                  className="h-3.5 w-3.5 rounded border-border accent-[#00a09d]"
                                  checked={checked}
                                  disabled={readOnly}
                                  onChange={() => toggleProduct(product.id)}
                                />
                                <span className="min-w-0 flex-1 truncate text-foreground">{product.name}</span>
                                <span className="shrink-0 text-xs text-muted-foreground">{product.sku}</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ) : null}

                  {activeTab === "seo" ? (
                    <div className="space-y-1">
                      <AgainFormRow label="SEO title">
                        <AgainUnderlineInput
                          value={form.seoTitle}
                          readOnly={readOnly}
                          placeholder="Meta title"
                          onChange={(v) => patch("seoTitle", v)}
                        />
                      </AgainFormRow>
                      <AgainFormRow label="SEO description">
                        <AgainUnderlineTextarea
                          value={form.seoDescription}
                          readOnly={readOnly}
                          rows={4}
                          placeholder="Meta description"
                          onChange={(v) => patch("seoDescription", v)}
                        />
                      </AgainFormRow>
                    </div>
                  ) : null}
                </AgainFormNotebook>
              </div>
            </>
          )}
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>

      <MediaLibraryModal
        open={coverMediaOpen}
        onOpenChange={setCoverMediaOpen}
        mode="single"
        title="Cover image"
        accept={["image"]}
        initialSelectedIds={coverMediaSelectedId ? [coverMediaSelectedId] : []}
        onSelect={(items: MediaLibraryItem[]) => {
          const item = items[0];
          if (!item) return;
          setForm((prev) => ({
            ...prev,
            coverImageUrl: item.url,
            coverMediaId: item.id,
          }));
        }}
      />

      <BlogCategoryFormDrawer
        open={categoryDrawerOpen}
        onOpenChange={setCategoryDrawerOpen}
        mode="create"
        nested
        categories={categories}
        onSave={async (data) => {
          const saved = await saveCategory(null, data);
          setForm((prev) => ({
            ...prev,
            categoryId: saved.id,
            categoryName: saved.name,
          }));
          await refetch();
          return saved;
        }}
      />
    </AgainDrawerPanel>
  );
}
