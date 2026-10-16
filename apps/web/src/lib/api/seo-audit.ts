import { apiFetch } from "@/lib/api/client";
import type { AuditCategory, AuditIssueStatus, SeoIssueSeverity } from "@/lib/mock-data/seo";

export type ApiSeoAuditIssue = {
  id: string;
  issue_type: string;
  category: AuditCategory;
  severity: SeoIssueSeverity;
  url: string;
  entity: string;
  suggestion: string;
  status: AuditIssueStatus;
  affected_count: number;
  source: string;
  created_at: string;
  updated_at: string;
};

export type ApiSeoAuditIssueMeta = {
  count: number;
  open_count: number;
  fixed_count: number;
  ignored_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
};

export type ApiSeoAuditRun = {
  id: string;
  pages_crawled: number;
  issues_found: number;
  health_score: number;
  live_pages_crawled: number;
  storefront_reachable: boolean;
  duration_ms: number;
  /** Only the categories the run could inspect — performance/mobile need a live crawl. */
  category_scores: Partial<Record<AuditCategory, number>>;
  started_at: string;
  completed_at: string | null;
};

export type ApiSeoDashboard = {
  health_score: number;
  last_run: ApiSeoAuditRun | null;
  open_issues: number;
  high_issues: number;
  issues_by_category: Partial<Record<AuditCategory, number>>;
  url_count: number;
  indexable_count: number;
  redirect_count: number;
  meta_count: number;
  avg_meta_score: number;
};

export type SeoAuditIssueParams = {
  search?: string;
  category?: string;
  severity?: string;
  status?: string;
};

/** Human-readable names for the checks the analyzer emits. */
export const SEO_ISSUE_LABELS: Record<string, string> = {
  missing_meta_title: "Missing meta title",
  missing_meta_description: "Missing meta description",
  title_too_long: "Title too long",
  title_too_short: "Title too short",
  description_too_long: "Description too long",
  short_description: "Description too short",
  duplicate_title: "Duplicate title",
  missing_og_image: "Missing social image",
  missing_schema: "Missing structured data",
  missing_content: "No content",
  thin_content: "Thin content",
  duplicate_content: "Duplicate content",
  duplicate_url: "Duplicate URL",
  redirect_loop: "Redirect loop",
  redirect_chain: "Redirect chain",
  broken_redirect_target: "Redirect goes nowhere",
  redirected_live_page: "Live page shadowed by redirect",
  noindex_published_page: "Published but not indexable",
  broken_link: "Broken internal link",
  orphan_page: "Orphan page",
  page_error: "Page returns an error",
  slow_response: "Slow response",
  large_page: "Large page",
  missing_viewport: "No mobile viewport",
  missing_h1: "Missing H1",
};

export function issueLabel(issueType: string): string {
  return SEO_ISSUE_LABELS[issueType] ?? issueType.replace(/_/g, " ");
}

export const SEVERITY_TONE: Record<SeoIssueSeverity, string> = {
  high: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  low: "border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-400",
};

export const ISSUE_STATUS_TONE: Record<AuditIssueStatus, string> = {
  open: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  fixed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  ignored: "border-slate-500/30 bg-slate-500/10 text-slate-500 dark:text-slate-400",
};

// --- transport -------------------------------------------------------------

const BASE = "/api/v1/seo";

export function buildIssueQuery(params?: SeoAuditIssueParams): string {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.category && params.category !== "all") q.set("category", params.category);
  if (params?.severity && params.severity !== "all") q.set("severity", params.severity);
  if (params?.status && params.status !== "all") q.set("status", params.status);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function fetchSeoAuditIssues(params?: SeoAuditIssueParams) {
  return apiFetch<{ data: ApiSeoAuditIssue[]; meta: ApiSeoAuditIssueMeta }>(
    `${BASE}/audit/issues${buildIssueQuery(params)}`,
  );
}

export async function fetchLatestAuditRun() {
  const res = await apiFetch<{ data: ApiSeoAuditRun | null }>(`${BASE}/audit/latest`);
  return res.data;
}

export async function fetchAuditRuns(limit = 20) {
  const res = await apiFetch<{ data: ApiSeoAuditRun[] }>(`${BASE}/audit/runs?limit=${limit}`);
  return res.data;
}

/**
 * `probeLive` adds an HTTP crawl of a sample of pages — the only way to score
 * performance and mobile, but it reaches out over the network, so it is opt-in.
 */
export async function startAuditRun(probeLive = false, liveSample = 8) {
  const res = await apiFetch<{ data: ApiSeoAuditRun }>(`${BASE}/audit/run`, {
    method: "POST",
    body: JSON.stringify({ probe_live: probeLive, live_sample: liveSample }),
  });
  return res.data;
}

export async function updateAuditIssue(id: string, status: AuditIssueStatus) {
  const res = await apiFetch<{ data: ApiSeoAuditIssue }>(`${BASE}/audit/issues/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return res.data;
}

export async function fetchSeoDashboard() {
  return apiFetch<ApiSeoDashboard>(`${BASE}/dashboard`);
}
