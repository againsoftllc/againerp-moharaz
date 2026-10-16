"use client";

import type { BlogSettings } from "@/lib/blog/blog-settings";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Props = {
  values: BlogSettings;
  onChange: (patch: Partial<BlogSettings>) => void;
  disabled?: boolean;
  className?: string;
};

function SettingRow({
  id,
  label,
  help,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  label: string;
  help: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4">
      <div className="min-w-0 flex-1">
        <Label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">{help}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function BlogSettingsForm({ values, onChange, disabled = false, className }: Props) {
  return (
    <div className={cn("space-y-8", className)}>
      <Section title="General">
        <SettingRow
          id="blog-enabled"
          label="Enable blog"
          help="Publish blog articles on the storefront when Monarch blog pages are wired."
          checked={values.enabled}
          onCheckedChange={(enabled) => onChange({ enabled })}
          disabled={disabled}
        />
        <div className="grid gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="blog-posts-per-page">Posts per page</Label>
            <Input
              id="blog-posts-per-page"
              type="number"
              min={1}
              max={100}
              value={values.postsPerPage}
              disabled={disabled}
              onChange={(e) => onChange({ postsPerPage: Number(e.target.value) || 1 })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="blog-default-author">Default author</Label>
            <Input
              id="blog-default-author"
              value={values.defaultAuthor}
              disabled={disabled}
              onChange={(e) => onChange({ defaultAuthor: e.target.value })}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="blog-base-slug">Blog URL slug</Label>
            <Input
              id="blog-base-slug"
              value={values.blogBaseSlug}
              disabled={disabled}
              onChange={(e) => onChange({ blogBaseSlug: e.target.value })}
              placeholder="blog"
            />
            <p className="text-xs text-muted-foreground">
              Storefront path prefix, e.g. `/blog/your-article-slug`.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Comments">
        <SettingRow
          id="blog-comments-enabled"
          label="Allow comments"
          help="Readers can submit comments on published articles."
          checked={values.commentsEnabled}
          onCheckedChange={(commentsEnabled) => onChange({ commentsEnabled })}
          disabled={disabled}
        />
        <SettingRow
          id="blog-moderate-comments"
          label="Moderate comments before publish"
          help="New comments stay pending until approved in Blog › Comment."
          checked={values.moderateComments}
          onCheckedChange={(moderateComments) => onChange({ moderateComments })}
          disabled={disabled || !values.commentsEnabled}
        />
      </Section>

      <Section title="RSS & SEO">
        <SettingRow
          id="blog-rss-enabled"
          label="RSS feed"
          help="Expose an RSS feed for published articles."
          checked={values.rssEnabled}
          onCheckedChange={(rssEnabled) => onChange({ rssEnabled })}
          disabled={disabled}
        />
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="space-y-2">
            <Label htmlFor="blog-rss-limit">RSS items limit</Label>
            <Input
              id="blog-rss-limit"
              type="number"
              min={1}
              max={100}
              value={values.rssItemsLimit}
              disabled={disabled || !values.rssEnabled}
              onChange={(e) => onChange({ rssItemsLimit: Number(e.target.value) || 1 })}
            />
          </div>
        </div>
        <SettingRow
          id="blog-seo-index"
          label="Allow search engine indexing"
          help="Include blog listing and article pages in sitemap/indexing rules."
          checked={values.seoIndexBlog}
          onCheckedChange={(seoIndexBlog) => onChange({ seoIndexBlog })}
          disabled={disabled}
        />
      </Section>

      <Section title="Articles">
        <SettingRow
          id="blog-related-products"
          label="Show related products on articles"
          help="Display linked catalog products on the article detail page."
          checked={values.showRelatedProducts}
          onCheckedChange={(showRelatedProducts) => onChange({ showRelatedProducts })}
          disabled={disabled}
        />
      </Section>
    </div>
  );
}
