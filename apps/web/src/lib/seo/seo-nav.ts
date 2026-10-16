/**
 * AgainERP SEO navigation — top module chrome.
 */

export type SeoNavEntry =
  | { kind: "header"; id: string; label: string }
  | { kind: "item"; id: string; label: string; href: string; description?: string };

export type SeoNavMenu = {
  id: string;
  label: string;
  /** Single destination — render as a top-level chip (no dropdown). */
  direct?: boolean;
  href?: string;
  children: SeoNavEntry[];
};

export const SEO_NAV_MENUS: SeoNavMenu[] = [
  { id: "urls", label: "URLs", direct: true, href: "/seo", children: [] },
  { id: "audit", label: "Audit", direct: true, href: "/seo/audit", children: [] },
  { id: "meta", label: "Meta tags", direct: true, href: "/seo/meta", children: [] },
  { id: "redirects", label: "Redirects", direct: true, href: "/seo/redirects", children: [] },
];

/** Website navbar — Config dropdown for technical SEO settings. */
export const SEO_CONFIG_MENU: SeoNavMenu = {
  id: "config",
  label: "Config",
  href: "/seo/config",
  children: [
    {
      kind: "item",
      id: "general",
      label: "General",
      href: "/seo/config",
      description: "Canonical host, title template, and default indexing.",
    },
    {
      kind: "item",
      id: "sitemap",
      label: "Sitemap",
      href: "/seo/config/sitemap",
      description: "Which catalog and content URLs go into sitemap.xml.",
    },
    {
      kind: "item",
      id: "robots",
      label: "Robots.txt",
      href: "/seo/config/robots",
      description: "Crawl rules published at /robots.txt.",
    },
    {
      kind: "item",
      id: "schema",
      label: "Schema & meta templates",
      href: "/seo/config/schema",
      description: "Default JSON-LD types and title/description patterns.",
    },
  ],
};
