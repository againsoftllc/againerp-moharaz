"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  createWebsitePage,
  managedPageToUpdatePayload,
  updateWebsitePage,
} from "@/lib/api/website-pages";
import type {
  NewWebsitePageInput,
  WebsiteManagedPage,
  WebsitePageLanguage,
  WebsitePageLayout,
  WebsitePageStatus,
  WebsitePageType,
  WebsitePageVisibility,
} from "@/lib/website/pages/types";
import {
  WEBSITE_PAGE_LANGUAGE_LABELS,
  WEBSITE_PAGE_LAYOUT_LABELS,
  WEBSITE_PAGE_LAYOUT_OPTIONS,
  WEBSITE_PAGE_STATUS_LABELS,
  WEBSITE_PAGE_STATUS_PUBLISH_OPTIONS,
  WEBSITE_PAGE_TEMPLATE_OPTIONS,
  WEBSITE_PAGE_TYPE_LABELS,
  WEBSITE_PAGE_TYPES_CREATABLE,
  WEBSITE_PAGE_VISIBILITY_LABELS,
  WEBSITE_PAGE_VISIBILITY_OPTIONS,
} from "@/lib/website/pages/types";
import { slugifyPageName } from "@/lib/website/pages/page-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { AgaincartClassicEditor } from "@/components/products/againcart-classic-editor";
import { cn } from "@/lib/utils";

type FormState = {
  name: string;
  slug: string;
  url: string;
  pageType: WebsitePageType;
  layout: WebsitePageLayout;
  template: string;
  language: WebsitePageLanguage;
  visibility: WebsitePageVisibility;
  status: WebsitePageStatus;
  description: string;
  bodyHtml: string;
  metaTitle: string;
  metaDescription: string;
};

function emptyForm(): FormState {
  return {
    name: "",
    slug: "",
    url: "/",
    pageType: "website",
    layout: "default",
    template: "Default",
    language: "en",
    visibility: "public",
    status: "draft",
    description: "",
    bodyHtml: "",
    metaTitle: "",
    metaDescription: "",
  };
}

function fromPage(page: WebsiteManagedPage): FormState {
  return {
    name: page.name,
    slug: page.slug,
    url: page.url,
    pageType: page.pageType,
    layout: page.layout,
    template: page.template,
    language: page.language,
    visibility: page.visibility,
    status: page.status,
    description: page.description,
    bodyHtml: page.bodyHtml || "",
    metaTitle: page.seo.metaTitle,
    metaDescription: page.seo.metaDescription,
  };
}

type Props = {
  mode: "create" | "edit";
  page?: WebsiteManagedPage | null;
  onClose: () => void;
  onSaved?: () => void;
};

export function WebsitePageForm({ mode, page, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(() =>
    mode === "edit" && page ? fromPage(page) : emptyForm(),
  );
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [urlTouched, setUrlTouched] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode === "edit" && page) {
      setForm(fromPage(page));
      setSlugTouched(true);
      setUrlTouched(true);
    } else if (mode === "create") {
      setForm(emptyForm());
      setSlugTouched(false);
      setUrlTouched(false);
    }
  }, [mode, page]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "name" && typeof value === "string") {
        const slug = slugifyPageName(value) || "page";
        if (!slugTouched) next.slug = slug;
        if (!urlTouched) next.url = `/${slug}`;
        if (!prev.metaTitle) next.metaTitle = value;
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!form.slug.trim()) {
      toast.error("Slug is required");
      return;
    }
    setSaving(true);
    try {
      if (mode === "create") {
        const input: NewWebsitePageInput = {
          name: form.name.trim(),
          slug: form.slug.trim().replace(/^\/+/, ""),
          pageType: form.pageType,
          description: form.description,
          language: form.language,
          layout: form.layout,
          template: form.template,
          visibility: form.visibility,
          status: form.status,
          scheduledAt: null,
          seo: {
            metaTitle: form.metaTitle || form.name.trim(),
            metaDescription: form.metaDescription,
            ogImage: null,
            canonicalUrl: null,
            indexable: true,
          },
        };
        const created = await createWebsitePage(input);
        if (form.url && form.url !== created.url) {
          await updateWebsitePage(created.id, { url: form.url });
        }
        if (form.bodyHtml.trim()) {
          await updateWebsitePage(created.id, { bodyHtml: form.bodyHtml });
        }
        toast.success(`Created "${form.name.trim()}"`);
      } else if (page) {
        const payload = managedPageToUpdatePayload({
          ...page,
          name: form.name.trim(),
          slug: form.slug.trim().replace(/^\/+/, ""),
          url: form.url.trim() || `/${form.slug.trim().replace(/^\/+/, "")}`,
          pageType: form.pageType,
          layout: form.layout,
          template: form.template,
          language: form.language,
          visibility: form.visibility,
          status: form.status,
          description: form.description,
          bodyHtml: form.bodyHtml,
          seo: {
            ...page.seo,
            metaTitle: form.metaTitle || form.name.trim(),
            metaDescription: form.metaDescription,
            ogTitle: form.metaTitle || form.name.trim(),
            ogDescription: form.metaDescription,
          },
          seoStatus: form.metaTitle && form.metaDescription ? "complete" : "partial",
        });
        await updateWebsitePage(page.id, payload);
        toast.success(`Updated "${form.name.trim()}"`);
      }
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const fieldClass = "space-y-1.5";

  return (
    <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <div className={fieldClass}>
          <Label htmlFor="page-name">Name</Label>
          <Input
            id="page-name"
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            className="rounded-none"
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={fieldClass}>
            <Label htmlFor="page-slug">Slug</Label>
            <Input
              id="page-slug"
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                setField("slug", e.target.value);
              }}
              className="rounded-none font-mono text-sm"
              required
            />
          </div>
          <div className={fieldClass}>
            <Label htmlFor="page-url">URL</Label>
            <Input
              id="page-url"
              value={form.url}
              onChange={(e) => {
                setUrlTouched(true);
                setField("url", e.target.value);
              }}
              className="rounded-none font-mono text-sm"
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={fieldClass}>
            <Label htmlFor="page-type">Type</Label>
            <Select
              id="page-type"
              value={form.pageType}
              onChange={(e) => setField("pageType", e.target.value as WebsitePageType)}
              className="rounded-none"
            >
              {WEBSITE_PAGE_TYPES_CREATABLE.map((t) => (
                <option key={t} value={t}>
                  {WEBSITE_PAGE_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>
          <div className={fieldClass}>
            <Label htmlFor="page-status">Status</Label>
            <Select
              id="page-status"
              value={form.status}
              onChange={(e) => setField("status", e.target.value as WebsitePageStatus)}
              className="rounded-none"
            >
              {WEBSITE_PAGE_STATUS_PUBLISH_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {WEBSITE_PAGE_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={fieldClass}>
            <Label htmlFor="page-layout">Layout</Label>
            <Select
              id="page-layout"
              value={form.layout}
              onChange={(e) => setField("layout", e.target.value as WebsitePageLayout)}
              className="rounded-none"
            >
              {WEBSITE_PAGE_LAYOUT_OPTIONS.map((l) => (
                <option key={l} value={l}>
                  {WEBSITE_PAGE_LAYOUT_LABELS[l]}
                </option>
              ))}
            </Select>
          </div>
          <div className={fieldClass}>
            <Label htmlFor="page-template">Template</Label>
            <Select
              id="page-template"
              value={form.template}
              onChange={(e) => setField("template", e.target.value)}
              className="rounded-none"
            >
              {WEBSITE_PAGE_TEMPLATE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={fieldClass}>
            <Label htmlFor="page-language">Language</Label>
            <Select
              id="page-language"
              value={form.language}
              onChange={(e) => setField("language", e.target.value as WebsitePageLanguage)}
              className="rounded-none"
            >
              {(Object.keys(WEBSITE_PAGE_LANGUAGE_LABELS) as WebsitePageLanguage[]).map((l) => (
                <option key={l} value={l}>
                  {WEBSITE_PAGE_LANGUAGE_LABELS[l]}
                </option>
              ))}
            </Select>
          </div>
          <div className={fieldClass}>
            <Label htmlFor="page-visibility">Visibility</Label>
            <Select
              id="page-visibility"
              value={form.visibility}
              onChange={(e) => setField("visibility", e.target.value as WebsitePageVisibility)}
              className="rounded-none"
            >
              {WEBSITE_PAGE_VISIBILITY_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {WEBSITE_PAGE_VISIBILITY_LABELS[v]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className={fieldClass}>
          <Label htmlFor="page-description">Description</Label>
          <p className="text-xs text-muted-foreground">
            Short intro shown in the page header on the storefront.
          </p>
          <AgaincartClassicEditor
            value={form.description}
            onChange={(value) => setField("description", value)}
            placeholder="Write a short intro..."
            minRows={4}
            fieldLabel="Description"
            aiContext="generic"
            editorClassName="text-sm"
          />
        </div>
        <div className={fieldClass}>
          <Label htmlFor="page-body">Page content</Label>
          <p className="text-xs text-muted-foreground">
            Main body published on the storefront.
          </p>
          <AgaincartClassicEditor
            value={form.bodyHtml}
            onChange={(value) => setField("bodyHtml", value)}
            placeholder="Write the page content..."
            minRows={12}
            fieldLabel="Page content"
            aiContext="generic"
            editorClassName="text-sm"
          />
        </div>
        <div className={cn("border-t border-border pt-4", fieldClass)}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            SEO
          </p>
          <div className={fieldClass}>
            <Label htmlFor="page-meta-title">Meta title</Label>
            <Input
              id="page-meta-title"
              value={form.metaTitle}
              onChange={(e) => setField("metaTitle", e.target.value)}
              className="rounded-none"
            />
          </div>
          <div className={fieldClass}>
            <Label htmlFor="page-meta-description">Meta description</Label>
            <Textarea
              id="page-meta-description"
              value={form.metaDescription}
              onChange={(e) => setField("metaDescription", e.target.value)}
              className="min-h-[72px] rounded-none"
            />
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border pt-3">
        <Button type="button" variant="outline" size="sm" className="rounded-none" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" className="rounded-none" disabled={saving}>
          {saving ? "Saving…" : mode === "create" ? "Create page" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
