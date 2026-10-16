"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { BlogCategory, BlogCategoryStatus } from "@/lib/blog/blog-category";
import { filterCategoriesForParentPicker } from "@/lib/blog/blog-category-tree";
import { fetchBlogCategory } from "@/lib/api/blog-categories";
import { useBlogCategories } from "@/lib/api/use-blog-categories";
import { useBlogArticles } from "@/lib/api/use-blog-articles";
import type { MediaLibraryItem } from "@/lib/mock-data/media-library";
import { MediaLibraryModal } from "@/components/media/media-library-modal";
import { useMediaStore } from "@/lib/store/media-store";
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
import { AgaincartClassicEditor, EDITOR_SHELL_DRAWER_FLUSH } from "@/components/products/againcart-classic-editor";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CategoryTab = "content" | "related" | "seo";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "create" | "edit";
  category?: BlogCategory | null;
  categories?: BlogCategory[];
  nested?: boolean;
  onSave: (data: {
    name: string;
    slug: string;
    description: string;
    status: BlogCategoryStatus;
    parentId: string | null;
    coverImageUrl: string | null;
    seoTitle: string;
    seoDescription: string;
    relatedArticleIds: string[];
  }) => Promise<BlogCategory | void>;
};

const EMPTY = {
  name: "",
  slug: "",
  description: "",
  status: "active" as BlogCategoryStatus,
  parentId: null as string | null,
  parentName: "",
  coverImageUrl: null as string | null,
  coverMediaId: null as string | null,
  seoTitle: "",
  seoDescription: "",
  relatedArticleIds: [] as string[],
};

const NOTEBOOK_TABS = [
  { id: "content" as const, label: "Content" },
  { id: "related" as const, label: "Related Articles" },
  { id: "seo" as const, label: "SEO" },
];

const BRAND_BTN =
  "h-8 rounded-md px-3 text-[13px] font-normal text-white hover:opacity-90 disabled:opacity-50";

function CategoryStatusToggle({
  status,
  onChange,
}: {
  status: BlogCategoryStatus;
  onChange: (status: BlogCategoryStatus) => void;
}) {
  const enabled = status === "active";

  return (
    <div className="flex overflow-hidden rounded-md border border-border text-[13px]">
      <button
        type="button"
        onClick={() => onChange("active")}
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
        onClick={() => onChange("inactive")}
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

export function BlogCategoryFormDrawer({
  open,
  onOpenChange,
  mode = "create",
  category,
  categories: categoriesProp,
  nested = false,
  onSave,
}: Props) {
  const { categories: hookCategories, loading: categoriesLoading, saveCategory, refetch } =
    useBlogCategories();
  const categories = categoriesProp ?? hookCategories;
  const { articles, loading: articlesLoading } = useBlogArticles();
  const mediaItems = useMediaStore((state) => state.items);
  const [form, setForm] = useState(EMPTY);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [articleSearch, setArticleSearch] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [activeTab, setActiveTab] = useState<CategoryTab>("content");
  const [coverMediaOpen, setCoverMediaOpen] = useState(false);
  const [parentDrawerOpen, setParentDrawerOpen] = useState(false);

  const patch = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const parentCategories = useMemo(
    () => filterCategoriesForParentPicker(categories, mode === "edit" ? category?.id : null),
    [categories, category?.id, mode],
  );

  const coverMediaSelectedId = useMemo(() => {
    if (form.coverMediaId) return form.coverMediaId;
    if (!form.coverImageUrl) return null;
    return mediaItems.find((item) => item.url === form.coverImageUrl)?.id ?? null;
  }, [form.coverMediaId, form.coverImageUrl, mediaItems]);

  useEffect(() => {
    if (!open) return;
    setActiveTab("content");
    setArticleSearch("");
    if (!category) {
      setForm(EMPTY);
      setSlugTouched(false);
      return;
    }

    let cancelled = false;
    setLoadingDetail(true);
    void fetchBlogCategory(category.id)
      .then((detail) => {
        if (cancelled) return;
        setForm({
          name: detail.name,
          slug: detail.slug,
          description: detail.description,
          status: detail.status,
          parentId: detail.parentId,
          parentName:
            categories.find((row) => row.id === detail.parentId)?.name ?? "",
          coverImageUrl: detail.coverImageUrl,
          coverMediaId:
            mediaItems.find((item) => item.url === detail.coverImageUrl)?.id ?? null,
          seoTitle: detail.seoTitle,
          seoDescription: detail.seoDescription,
          relatedArticleIds: detail.relatedArticleIds,
        });
        setSlugTouched(true);
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to load category");
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, category, mediaItems]);

  const filteredArticles = useMemo(() => {
    const q = articleSearch.trim().toLowerCase();
    if (!q) return articles.slice(0, 50);
    return articles
      .filter(
        (article) =>
          article.title.toLowerCase().includes(q) ||
          article.slug.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [articles, articleSearch]);

  const toggleArticle = (articleId: string) => {
    setForm((prev) => {
      const exists = prev.relatedArticleIds.includes(articleId);
      return {
        ...prev,
        relatedArticleIds: exists
          ? prev.relatedArticleIds.filter((id) => id !== articleId)
          : [...prev.relatedArticleIds, articleId],
      };
    });
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error("Title and slug are required");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: form.name,
        slug: form.slug,
        description: form.description,
        status: form.status,
        parentId: form.parentId,
        coverImageUrl: form.coverImageUrl,
        seoTitle: form.seoTitle,
        seoDescription: form.seoDescription,
        relatedArticleIds: form.relatedArticleIds,
      });
      toast.success(mode === "create" ? "Category created" : "Category saved");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const drawerTitle = mode === "create" ? "New category" : "Edit category";
  const titleLabel = form.name.trim() || (mode === "create" ? "New category" : drawerTitle);

  return (
    <AgainDrawerPanel open={open} onOpenChange={onOpenChange} title={drawerTitle} nested={nested}>
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
              <CategoryStatusToggle
                status={form.status}
                onChange={(v) => patch("status", v)}
              />
            ) : null
          }
        >
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
          <button type="button" className={AGAIN_DRAWER_ACTION_BTN} onClick={() => onOpenChange(false)}>
            Discard
          </button>
        </AgainDrawerActionBar>

        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
          {loadingDetail ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading category…
            </div>
          ) : (
            <>
              <div className="min-w-0 flex-1">
                <AgainFormRecordTitle
                  value={form.name}
                  placeholder={mode === "create" ? "New category" : "Category title"}
                  onChange={(v) => {
                    patch("name", v);
                    if (!slugTouched) patch("slug", slugify(v));
                  }}
                />
              </div>

              <div className="mt-5 grid gap-x-12 gap-y-1 lg:grid-cols-2">
                <div>
                  <AgainFormRow label="Slug">
                    <AgainUnderlineInput
                      value={form.slug}
                      placeholder="category-slug"
                      onChange={(v) => {
                        setSlugTouched(true);
                        patch("slug", v);
                      }}
                    />
                  </AgainFormRow>
                  <AgainFormRow label="Parent">
                    <BlogCategoryCombobox
                      categories={parentCategories}
                      value={form.parentId ?? ""}
                      selectedName={form.parentName}
                      placeholder={
                        categoriesLoading && parentCategories.length === 0
                          ? "Loading categories…"
                          : "Select parent category"
                      }
                      includeInactive
                      onChange={(parentId, parentName) => {
                        patch("parentId", parentId || null);
                        patch("parentName", parentName);
                      }}
                      onAdd={() => setParentDrawerOpen(true)}
                    />
                  </AgainFormRow>
                </div>

                <div className="flex justify-end">
                  <div className="group relative h-[90px] w-[90px] shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (!form.coverImageUrl) setCoverMediaOpen(true);
                      }}
                      className={cn(
                        "relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg border border-border/80 bg-muted/20 text-muted-foreground transition-colors",
                        !form.coverImageUrl && "hover:bg-muted/40",
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
                    <AgaincartClassicEditor
                      value={form.description}
                      onChange={(v) => patch("description", v)}
                      placeholder="Write category content…"
                      fieldLabel="Content"
                      aiContext="generic"
                      shellClassName={EDITOR_SHELL_DRAWER_FLUSH}
                      aiVariables={{
                        category_name: form.name,
                        current_content: form.description,
                      }}
                    />
                  ) : null}

                  {activeTab === "related" ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="font-medium text-foreground">Related articles</span>
                        <span className="text-muted-foreground">
                          {form.relatedArticleIds.length} selected
                        </span>
                      </div>
                      <AgainUnderlineInput
                        value={articleSearch}
                        placeholder="Search articles…"
                        onChange={setArticleSearch}
                      />
                      <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-sm border border-border/60 bg-background/60">
                        {articlesLoading ? (
                          <p className="px-3 py-2 text-xs text-muted-foreground">Loading articles…</p>
                        ) : filteredArticles.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-muted-foreground">No articles found.</p>
                        ) : (
                          filteredArticles.map((article) => {
                            const checked = form.relatedArticleIds.includes(article.id);
                            return (
                              <label
                                key={article.id}
                                className="flex cursor-pointer items-center gap-2 border-b border-border/40 px-3 py-2 text-[13px] last:border-b-0 hover:bg-muted/40"
                              >
                                <input
                                  type="checkbox"
                                  className="h-3.5 w-3.5 rounded border-border accent-[#00a09d]"
                                  checked={checked}
                                  onChange={() => toggleArticle(article.id)}
                                />
                                <span className="min-w-0 flex-1 truncate text-foreground">{article.title}</span>
                                <span className="shrink-0 text-xs text-muted-foreground">{article.slug}</span>
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
                          placeholder="Meta title"
                          onChange={(v) => patch("seoTitle", v)}
                        />
                      </AgainFormRow>
                      <AgainFormRow label="SEO description">
                        <AgainUnderlineTextarea
                          value={form.seoDescription}
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
        open={parentDrawerOpen}
        onOpenChange={setParentDrawerOpen}
        mode="create"
        nested
        categories={categories}
        onSave={async (data) => {
          const saved = await saveCategory(null, data);
          setForm((prev) => ({
            ...prev,
            parentId: saved.id,
            parentName: saved.name,
          }));
          await refetch();
          return saved;
        }}
      />
    </AgainDrawerPanel>
  );
}
