import type {
  NewWebsitePageInput,
  WebsiteManagedPage,
  WebsitePageAccess,
  WebsitePageAdvanced,
  WebsitePageFlags,
  WebsitePageSeo,
  WebsitePageStats,
  WebsitePageStatus,
  WebsitePageVersion,
  WebsiteSchemaType,
} from "@/lib/website/pages/types";
import { apiFetch } from "@/lib/api/client";

export type ApiWebsitePageSeo = {
  meta_title: string;
  meta_description: string;
  keywords: string;
  og_title: string;
  og_description: string;
  og_image: string | null;
  canonical_url: string | null;
  indexable: boolean;
  schema_type: WebsiteSchemaType;
};

export type ApiWebsitePageAdvanced = {
  css_class: string;
  body_class: string;
  cache_enabled: boolean;
  lazy_load: boolean;
  search_index: boolean;
};

export type ApiWebsitePageAccess = {
  owner: string;
  editors: string[];
  view_access: string;
  publish_permission: string;
};

export type ApiWebsitePageStats = {
  views: number;
  clicks: number;
  conversion: number;
  seo_score: number;
  performance_score: number;
};

export type ApiWebsitePageFlags = {
  is_home: boolean;
  is_system: boolean;
  is_locked: boolean;
  slug_locked: boolean;
  delete_disabled: boolean;
};

export type ApiWebsitePageVersion = {
  id: string;
  version: number;
  label: string;
  status: WebsitePageStatus;
  created_at: string;
  author: string;
  source: WebsitePageVersion["source"];
};

export type ApiWebsitePage = {
  id: string;
  company_id: string;
  name: string;
  slug: string;
  url: string;
  page_type: WebsiteManagedPage["pageType"];
  layout: WebsiteManagedPage["layout"];
  template: string;
  language: WebsiteManagedPage["language"];
  description: string;
  visibility: WebsiteManagedPage["visibility"];
  status: WebsitePageStatus;
  seo_status: WebsiteManagedPage["seoStatus"];
  creator: string;
  updated_by: string;
  published_at: string | null;
  scheduled_at: string | null;
  expires_at: string | null;
  current_version: number;
  seo: ApiWebsitePageSeo;
  advanced: ApiWebsitePageAdvanced;
  access: ApiWebsitePageAccess;
  stats: ApiWebsitePageStats;
  flags: ApiWebsitePageFlags;
  versions: ApiWebsitePageVersion[];
  permissions: string[];
  body_html?: string;
  created_at: string;
  updated_at: string;
};

export type ApiWebsitePageListResponse = {
  data: ApiWebsitePage[];
  meta: { count: number };
  errors: string[];
};

export type ApiWebsitePageResponse = {
  data: ApiWebsitePage;
  errors: string[];
};

export type UpdateWebsitePageInput = Partial<{
  name: string;
  slug: string;
  url: string;
  pageType: WebsiteManagedPage["pageType"];
  layout: WebsiteManagedPage["layout"];
  template: string;
  language: WebsiteManagedPage["language"];
  description: string;
  visibility: WebsiteManagedPage["visibility"];
  status: WebsitePageStatus;
  seoStatus: WebsiteManagedPage["seoStatus"];
  updatedBy: string;
  publishedAt: string | null;
  scheduledAt: string | null;
  expiresAt: string | null;
  currentVersion: number;
  seo: WebsitePageSeo;
  advanced: WebsitePageAdvanced;
  access: WebsitePageAccess;
  stats: WebsitePageStats;
  flags: WebsitePageFlags;
  versions: WebsitePageVersion[];
  permissions: string[];
  bodyHtml: string;
}>;

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function mapSeo(row: ApiWebsitePageSeo): WebsitePageSeo {
  return {
    metaTitle: row.meta_title ?? "",
    metaDescription: row.meta_description ?? "",
    keywords: row.keywords ?? "",
    ogTitle: row.og_title ?? "",
    ogDescription: row.og_description ?? "",
    ogImage: row.og_image,
    canonicalUrl: row.canonical_url,
    indexable: row.indexable ?? true,
    schemaType: row.schema_type ?? "WebPage",
  };
}

function mapAdvanced(row: ApiWebsitePageAdvanced): WebsitePageAdvanced {
  return {
    cssClass: row.css_class ?? "",
    bodyClass: row.body_class ?? "",
    cacheEnabled: row.cache_enabled ?? true,
    lazyLoad: row.lazy_load ?? true,
    searchIndex: row.search_index ?? true,
  };
}

function mapAccess(row: ApiWebsitePageAccess): WebsitePageAccess {
  return {
    owner: row.owner ?? "Admin",
    editors: row.editors ?? [],
    viewAccess: row.view_access ?? "Public",
    publishPermission: row.publish_permission ?? "Editors",
  };
}

function mapStats(row: ApiWebsitePageStats): WebsitePageStats {
  return {
    views: row.views ?? 0,
    clicks: row.clicks ?? 0,
    conversion: row.conversion ?? 0,
    seoScore: row.seo_score ?? 0,
    performanceScore: row.performance_score ?? 0,
  };
}

function mapFlags(row: ApiWebsitePageFlags): WebsitePageFlags {
  return {
    isHome: row.is_home ?? false,
    isSystem: row.is_system ?? false,
    isLocked: row.is_locked ?? false,
    slugLocked: row.slug_locked ?? false,
    deleteDisabled: row.delete_disabled ?? false,
  };
}

function mapVersions(rows: ApiWebsitePageVersion[]): WebsitePageVersion[] {
  return (rows ?? []).map((row) => ({
    id: row.id,
    version: row.version,
    label: row.label,
    status: row.status,
    createdAt: row.created_at,
    author: row.author,
    source: row.source,
  }));
}

export function apiPageToManagedPage(row: ApiWebsitePage): WebsiteManagedPage {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    url: row.url,
    pageType: row.page_type,
    layout: row.layout,
    template: row.template,
    language: row.language,
    description: row.description ?? "",
    visibility: row.visibility,
    status: row.status,
    updatedBy: row.updated_by,
    lastUpdated: dateOnly(row.updated_at) ?? "",
    creator: row.creator,
    createdAt: dateOnly(row.created_at) ?? "",
    publishedAt: dateOnly(row.published_at),
    scheduledAt: dateOnly(row.scheduled_at),
    expiresAt: dateOnly(row.expires_at),
    currentVersion: row.current_version,
    seo: mapSeo(row.seo),
    seoStatus: row.seo_status,
    advanced: mapAdvanced(row.advanced),
    access: mapAccess(row.access),
    stats: mapStats(row.stats),
    permissions: row.permissions ?? [],
    versions: mapVersions(row.versions),
    flags: mapFlags(row.flags),
    bodyHtml: row.body_html ?? "",
  };
}

function seoToApi(seo: WebsitePageSeo): ApiWebsitePageSeo {
  return {
    meta_title: seo.metaTitle,
    meta_description: seo.metaDescription,
    keywords: seo.keywords,
    og_title: seo.ogTitle,
    og_description: seo.ogDescription,
    og_image: seo.ogImage,
    canonical_url: seo.canonicalUrl,
    indexable: seo.indexable,
    schema_type: seo.schemaType,
  };
}

function advancedToApi(advanced: WebsitePageAdvanced): ApiWebsitePageAdvanced {
  return {
    css_class: advanced.cssClass,
    body_class: advanced.bodyClass,
    cache_enabled: advanced.cacheEnabled,
    lazy_load: advanced.lazyLoad,
    search_index: advanced.searchIndex,
  };
}

function accessToApi(access: WebsitePageAccess): ApiWebsitePageAccess {
  return {
    owner: access.owner,
    editors: access.editors,
    view_access: access.viewAccess,
    publish_permission: access.publishPermission,
  };
}

function statsToApi(stats: WebsitePageStats): ApiWebsitePageStats {
  return {
    views: stats.views,
    clicks: stats.clicks,
    conversion: stats.conversion,
    seo_score: stats.seoScore,
    performance_score: stats.performanceScore,
  };
}

function flagsToApi(flags: WebsitePageFlags): ApiWebsitePageFlags {
  return {
    is_home: flags.isHome,
    is_system: flags.isSystem,
    is_locked: flags.isLocked,
    slug_locked: flags.slugLocked,
    delete_disabled: flags.deleteDisabled,
  };
}

function versionsToApi(versions: WebsitePageVersion[]): ApiWebsitePageVersion[] {
  return versions.map((v) => ({
    id: v.id,
    version: v.version,
    label: v.label,
    status: v.status,
    created_at: v.createdAt,
    author: v.author,
    source: v.source,
  }));
}

function toApiPayload(input: UpdateWebsitePageInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.slug !== undefined) payload.slug = input.slug;
  if (input.url !== undefined) payload.url = input.url;
  if (input.pageType !== undefined) payload.page_type = input.pageType;
  if (input.layout !== undefined) payload.layout = input.layout;
  if (input.template !== undefined) payload.template = input.template;
  if (input.language !== undefined) payload.language = input.language;
  if (input.description !== undefined) payload.description = input.description;
  if (input.visibility !== undefined) payload.visibility = input.visibility;
  if (input.status !== undefined) payload.status = input.status;
  if (input.seoStatus !== undefined) payload.seo_status = input.seoStatus;
  if (input.updatedBy !== undefined) payload.updated_by = input.updatedBy;
  if (input.publishedAt !== undefined) payload.published_at = input.publishedAt;
  if (input.scheduledAt !== undefined) payload.scheduled_at = input.scheduledAt;
  if (input.expiresAt !== undefined) payload.expires_at = input.expiresAt;
  if (input.currentVersion !== undefined) payload.current_version = input.currentVersion;
  if (input.seo !== undefined) payload.seo = seoToApi(input.seo);
  if (input.advanced !== undefined) payload.advanced = advancedToApi(input.advanced);
  if (input.access !== undefined) payload.access = accessToApi(input.access);
  if (input.stats !== undefined) payload.stats = statsToApi(input.stats);
  if (input.flags !== undefined) payload.flags = flagsToApi(input.flags);
  if (input.versions !== undefined) payload.versions = versionsToApi(input.versions);
  if (input.permissions !== undefined) payload.permissions = input.permissions;
  if (input.bodyHtml !== undefined) payload.body_html = input.bodyHtml;
  return payload;
}

export function createInputToApiPayload(input: NewWebsitePageInput): Record<string, unknown> {
  return {
    name: input.name.trim(),
    slug: input.slug.replace(/^\/+/, ""),
    page_type: input.pageType,
    layout: input.layout,
    template: input.template,
    language: input.language,
    description: input.description,
    visibility: input.visibility,
    status: input.status,
    scheduled_at: input.scheduledAt,
    seo: {
      meta_title: input.seo.metaTitle,
      meta_description: input.seo.metaDescription,
      keywords: "",
      og_title: input.seo.metaTitle,
      og_description: input.seo.metaDescription,
      og_image: input.seo.ogImage,
      canonical_url: input.seo.canonicalUrl,
      indexable: input.seo.indexable,
      schema_type: "WebPage",
    },
  };
}

/** Map a full managed page into a PATCH payload (detail editor save). */
export function managedPageToUpdatePayload(page: WebsiteManagedPage): UpdateWebsitePageInput {
  return {
    name: page.name,
    slug: page.slug,
    url: page.url,
    pageType: page.pageType,
    layout: page.layout,
    template: page.template,
    language: page.language,
    description: page.description,
    visibility: page.visibility,
    status: page.status,
    seoStatus: page.seoStatus,
    updatedBy: page.updatedBy,
    publishedAt: page.publishedAt,
    scheduledAt: page.scheduledAt,
    expiresAt: page.expiresAt,
    currentVersion: page.currentVersion,
    seo: page.seo,
    advanced: page.advanced,
    access: page.access,
    stats: page.stats,
    flags: page.flags,
    versions: page.versions,
    permissions: page.permissions,
    bodyHtml: page.bodyHtml,
  };
}

export async function fetchWebsitePages(): Promise<WebsiteManagedPage[]> {
  const res = await apiFetch<ApiWebsitePageListResponse>("/api/v1/website/pages");
  return res.data.map(apiPageToManagedPage);
}

export async function fetchWebsitePage(id: string): Promise<WebsiteManagedPage> {
  const res = await apiFetch<ApiWebsitePageResponse>(`/api/v1/website/pages/${id}`);
  return apiPageToManagedPage(res.data);
}

export async function createWebsitePage(input: NewWebsitePageInput): Promise<WebsiteManagedPage> {
  const res = await apiFetch<ApiWebsitePageResponse>("/api/v1/website/pages", {
    method: "POST",
    body: JSON.stringify(createInputToApiPayload(input)),
  });
  return apiPageToManagedPage(res.data);
}

export async function updateWebsitePage(
  id: string,
  input: UpdateWebsitePageInput,
): Promise<WebsiteManagedPage> {
  const res = await apiFetch<ApiWebsitePageResponse>(`/api/v1/website/pages/${id}`, {
    method: "PATCH",
    body: JSON.stringify(toApiPayload(input)),
  });
  return apiPageToManagedPage(res.data);
}

export async function deleteWebsitePage(id: string): Promise<void> {
  await apiFetch(`/api/v1/website/pages/${id}`, { method: "DELETE" });
}
