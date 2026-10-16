/** Canonical storefront path builders — AgainERP-style flat URLs */

export function categoryPath(slug: string) {
  return `/${encodeURIComponent(slug)}`;
}

export function productPath(slug: string) {
  return `/${encodeURIComponent(slug)}`;
}

export function brandPath(slug: string) {
  return `/${encodeURIComponent(slug)}`;
}

export function cmsPagePath(slug: string) {
  return `/${encodeURIComponent(slug)}`;
}

export function blogIndexPath() {
  return "/blog";
}

export function blogPostPath(slug: string) {
  return `/blog/${encodeURIComponent(slug)}`;
}
