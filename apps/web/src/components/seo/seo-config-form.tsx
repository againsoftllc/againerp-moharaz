"use client";

import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import {
  DEFAULT_SEO_CONFIG,
  readSeoConfig,
  writeSeoConfig,
  type SeoConfigValues,
} from "@/lib/seo/seo-config-settings";

export type SeoConfigSection = "general" | "sitemap" | "robots" | "schema";

const COPY: Record<SeoConfigSection, { title: string; subtitle: string }> = {
  general: {
    title: "SEO Config",
    subtitle: "Canonical host, titles, and default indexing for the storefront.",
  },
  sitemap: {
    title: "Sitemap",
    subtitle: "Choose which URLs are published in sitemap.xml.",
  },
  robots: {
    title: "Robots.txt",
    subtitle: "Crawl rules search engines read at /robots.txt.",
  },
  schema: {
    title: "Schema & meta templates",
    subtitle: "Default JSON-LD type and title patterns for catalog pages.",
  },
};

function SquareCheck({
  id,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <input
      id={id}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        borderColor: checked ? "#00a09d" : "var(--input)",
        backgroundColor: checked ? "#00a09d" : "var(--background)",
        backgroundImage: checked
          ? `url("data:image/svg+xml,%3Csvg viewBox='0 0 12 12' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M2 6.2 4.8 9 10 3' fill='none' stroke='white' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`
          : undefined,
        backgroundSize: "12px 12px",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}

function CheckRow({
  id,
  label,
  help,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  help: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <SquareCheck id={id} checked={checked} onChange={onChange} disabled={disabled} />
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <p className="text-[13px] font-semibold text-foreground">{label}</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{help}</p>
      </label>
    </div>
  );
}

function Field({ label, help, children }: { label: string; help: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[13px] font-semibold text-foreground">{label}</p>
      <p className="mt-0.5 text-[12px] text-muted-foreground">{help}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

const inputClass =
  "h-8 w-full max-w-md rounded-none border border-input bg-background px-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function SeoConfigForm({ section }: { section: SeoConfigSection }) {
  const canWrite = useAdminCanWrite();
  const copy = COPY[section];
  const [draft, setDraft] = useState<SeoConfigValues>(DEFAULT_SEO_CONFIG);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(readSeoConfig());
    setDirty(false);
  }, [section]);

  const patch = <K extends keyof SeoConfigValues>(key: K, value: SeoConfigValues[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = () => {
    writeSeoConfig(draft);
    setDirty(false);
    toast.success("SEO config saved");
  };

  const handleDiscard = () => {
    setDraft(readSeoConfig());
    setDirty(false);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-semibold text-foreground">{copy.title}</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{copy.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {dirty ? (
            <Button type="button" variant="outline" size="sm" className="rounded-none" onClick={handleDiscard}>
              Discard
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="rounded-none"
            disabled={!dirty || !canWrite}
            onClick={handleSave}
          >
            Save
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {section === "general" ? (
          <section className="overflow-hidden rounded-none border border-border bg-card">
            <div className="border-b border-border bg-muted px-4 py-2">
              <h2 className="text-[13px] font-semibold text-foreground">Indexing</h2>
            </div>
            <div className="space-y-5 px-4 py-4">
              <Field label="Canonical host" help="Base URL used for canonical tags and sitemap locs. No trailing slash.">
                <Input
                  value={draft.canonicalHost}
                  onChange={(e) => patch("canonicalHost", e.target.value)}
                  className={inputClass}
                  placeholder="https://www.example.com"
                  disabled={!canWrite}
                />
              </Field>
              <Field label="Title template" help="Use %s for the page title. Shown in the browser tab and SERP title.">
                <Input
                  value={draft.titleTemplate}
                  onChange={(e) => patch("titleTemplate", e.target.value)}
                  className={inputClass}
                  placeholder="%s | Store"
                  disabled={!canWrite}
                />
              </Field>
              <Field label="Default meta description" help="Fallback when a page has no custom description.">
                <Textarea
                  value={draft.defaultMetaDescription}
                  onChange={(e) => patch("defaultMetaDescription", e.target.value)}
                  rows={3}
                  disabled={!canWrite}
                />
              </Field>
              <Field label="Trailing slash" help="How storefront URLs are normalized before they are indexed.">
                <select
                  value={draft.trailingSlash}
                  onChange={(e) => patch("trailingSlash", e.target.value as SeoConfigValues["trailingSlash"])}
                  className={inputClass}
                  disabled={!canWrite}
                >
                  <option value="keep">Keep as authored</option>
                  <option value="strip">Strip trailing slash</option>
                  <option value="add">Always trailing slash</option>
                </select>
              </Field>
              <CheckRow
                id="indexStorefront"
                label="Allow search indexing"
                help="When off, storefront pages send noindex."
                checked={draft.indexStorefront}
                onChange={(v) => patch("indexStorefront", v)}
                disabled={!canWrite}
              />
              <CheckRow
                id="noindexFilters"
                label="Noindex faceted filters"
                help="Keep color/size/price filter URLs out of the index."
                checked={draft.noindexFilters}
                onChange={(v) => patch("noindexFilters", v)}
                disabled={!canWrite}
              />
              <CheckRow
                id="noindexSearch"
                label="Noindex search results"
                help="Search result pages should not compete with category pages."
                checked={draft.noindexSearch}
                onChange={(v) => patch("noindexSearch", v)}
                disabled={!canWrite}
              />
            </div>
          </section>
        ) : null}

        {section === "sitemap" ? (
          <section className="overflow-hidden rounded-none border border-border bg-card">
            <div className="border-b border-border bg-muted px-4 py-2">
              <h2 className="text-[13px] font-semibold text-foreground">Sitemap.xml</h2>
            </div>
            <div className="space-y-5 px-4 py-4">
              <CheckRow
                id="sitemapEnabled"
                label="Auto-generate sitemap"
                help="Rebuild sitemap.xml when products, categories, or pages change."
                checked={draft.sitemapEnabled}
                onChange={(v) => patch("sitemapEnabled", v)}
                disabled={!canWrite}
              />
              <CheckRow
                id="includeProducts"
                label="Products"
                help="Include indexable product URLs."
                checked={draft.includeProducts}
                onChange={(v) => patch("includeProducts", v)}
                disabled={!canWrite || !draft.sitemapEnabled}
              />
              <CheckRow
                id="includeCategories"
                label="Categories"
                help="Include category listing pages."
                checked={draft.includeCategories}
                onChange={(v) => patch("includeCategories", v)}
                disabled={!canWrite || !draft.sitemapEnabled}
              />
              <CheckRow
                id="includeBrands"
                label="Brands"
                help="Include brand landing pages."
                checked={draft.includeBrands}
                onChange={(v) => patch("includeBrands", v)}
                disabled={!canWrite || !draft.sitemapEnabled}
              />
              <CheckRow
                id="includeBlog"
                label="Blog"
                help="Include published articles and the blog index."
                checked={draft.includeBlog}
                onChange={(v) => patch("includeBlog", v)}
                disabled={!canWrite || !draft.sitemapEnabled}
              />
              <CheckRow
                id="includePages"
                label="CMS pages"
                help="Include published website pages."
                checked={draft.includePages}
                onChange={(v) => patch("includePages", v)}
                disabled={!canWrite || !draft.sitemapEnabled}
              />
              <CheckRow
                id="includeImages"
                label="Image sitemap"
                help="Attach product and article images as sitemap image entries."
                checked={draft.includeImages}
                onChange={(v) => patch("includeImages", v)}
                disabled={!canWrite || !draft.sitemapEnabled}
              />
              <CheckRow
                id="pingSearchEngines"
                label="Ping search engines"
                help="Notify Google after a successful sitemap rebuild."
                checked={draft.pingSearchEngines}
                onChange={(v) => patch("pingSearchEngines", v)}
                disabled={!canWrite || !draft.sitemapEnabled}
              />
            </div>
          </section>
        ) : null}

        {section === "robots" ? (
          <section className="overflow-hidden rounded-none border border-border bg-card">
            <div className="border-b border-border bg-muted px-4 py-2">
              <h2 className="text-[13px] font-semibold text-foreground">Crawl rules</h2>
            </div>
            <div className="space-y-5 px-4 py-4">
              <CheckRow
                id="robotsEnabled"
                label="Publish robots.txt"
                help="Serve this file at the storefront origin."
                checked={draft.robotsEnabled}
                onChange={(v) => patch("robotsEnabled", v)}
                disabled={!canWrite}
              />
              <Field label="robots.txt" help="One directive per line. Sitemap URL should match the canonical host.">
                <Textarea
                  value={draft.robotsTxt}
                  onChange={(e) => patch("robotsTxt", e.target.value)}
                  rows={14}
                  className="font-mono text-[12px]"
                  disabled={!canWrite || !draft.robotsEnabled}
                />
              </Field>
            </div>
          </section>
        ) : null}

        {section === "schema" ? (
          <section className="overflow-hidden rounded-none border border-border bg-card">
            <div className="border-b border-border bg-muted px-4 py-2">
              <h2 className="text-[13px] font-semibold text-foreground">Structured data</h2>
            </div>
            <div className="space-y-5 px-4 py-4">
              <CheckRow
                id="schemaMarkup"
                label="Output JSON-LD"
                help="Emit schema.org markup on product, category, and CMS pages."
                checked={draft.schemaMarkup}
                onChange={(v) => patch("schemaMarkup", v)}
                disabled={!canWrite}
              />
              <Field label="Default schema type" help="Used on CMS pages that do not set their own type.">
                <select
                  value={draft.defaultSchemaType}
                  onChange={(e) => patch("defaultSchemaType", e.target.value)}
                  className={inputClass}
                  disabled={!canWrite || !draft.schemaMarkup}
                >
                  <option value="WebPage">WebPage</option>
                  <option value="Article">Article</option>
                  <option value="Product">Product</option>
                  <option value="CollectionPage">CollectionPage</option>
                  <option value="LocalBusiness">LocalBusiness</option>
                </select>
              </Field>
              <Field
                label="Product title pattern"
                help="Tokens: %name%, %sku%, %brand%. Applied when a product has no custom meta title."
              >
                <Input
                  value={draft.productTitlePattern}
                  onChange={(e) => patch("productTitlePattern", e.target.value)}
                  className={inputClass}
                  disabled={!canWrite}
                />
              </Field>
              <Field
                label="Category title pattern"
                help="Tokens: %name%. Applied when a category has no custom meta title."
              >
                <Input
                  value={draft.categoryTitlePattern}
                  onChange={(e) => patch("categoryTitlePattern", e.target.value)}
                  className={inputClass}
                  disabled={!canWrite}
                />
              </Field>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
