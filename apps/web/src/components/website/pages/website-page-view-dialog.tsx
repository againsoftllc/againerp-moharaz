"use client";

import { ExternalLink, MousePointerClick, Pencil } from "lucide-react";
import { useWebsitePage } from "@/lib/api/use-website-pages";
import type { WebsiteManagedPage } from "@/lib/website/pages/types";
import {
  WEBSITE_PAGE_LANGUAGE_LABELS,
  WEBSITE_PAGE_LAYOUT_LABELS,
  WEBSITE_PAGE_STATUS_LABELS,
  WEBSITE_PAGE_TYPE_LABELS,
  WEBSITE_PAGE_VISIBILITY_LABELS,
} from "@/lib/website/pages/types";
import {
  liveEditAdminUrl,
  storefrontUrlForPage,
  supportsLiveEdit,
} from "@/lib/website/pages/page-actions";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId?: string | null;
  page?: WebsiteManagedPage | null;
  onEdit?: (page: WebsiteManagedPage) => void;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 border-b border-border py-2 text-sm last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  );
}

export function WebsitePageViewDialog({
  open,
  onOpenChange,
  pageId,
  page: listPage,
  onEdit,
}: Props) {
  const useApi = Boolean(pageId);
  const { page: apiPage, loading, error } = useWebsitePage(
    open && useApi && pageId ? pageId : "",
  );
  const page = useApi ? apiPage : listPage;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title={page ? `Page: ${page.name}` : "Page details"}
        resizable
        resizeMaxWidth={900}
        closeButton="chevron"
        className="w-[min(100%,40rem)] min-w-[320px] max-w-[900px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
        aria-describedby={undefined}
      >
        <div className="flex h-full min-h-0 flex-col px-4 pb-4 pt-3 pr-10">
          {useApi && loading && (
            <ContentDataSkeleton label="Loading page…" showFilters={false} rows={8} />
          )}
          {useApi && error && !loading && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          {page && !(useApi && loading) ? (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                {onEdit ? (
                  <Button
                    size="sm"
                    className="rounded-none"
                    onClick={() => onEdit(page)}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </Button>
                ) : null}
                {supportsLiveEdit(page) ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="rounded-none"
                    onClick={() => {
                      const url = liveEditAdminUrl(page);
                      if (url) window.open(url, "_blank", "noopener,noreferrer");
                    }}
                  >
                    <MousePointerClick className="mr-1.5 h-3.5 w-3.5" />
                    Live Edit
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-none"
                  onClick={() =>
                    window.open(storefrontUrlForPage(page), "_blank", "noopener,noreferrer")
                  }
                >
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  Open storefront
                </Button>
              </div>
              <dl className="min-h-0 flex-1 overflow-y-auto">
                <Row label="Name">{page.name}</Row>
                <Row label="URL">
                  <span className="font-mono text-xs">{page.url}</span>
                </Row>
                <Row label="Slug">
                  <span className="font-mono text-xs">{page.slug || "—"}</span>
                </Row>
                <Row label="Type">
                  {WEBSITE_PAGE_TYPE_LABELS[page.pageType] ?? page.pageType}
                </Row>
                <Row label="Status">
                  <Badge
                    variant={
                      page.status === "published"
                        ? "success"
                        : page.status === "archived"
                          ? "muted"
                          : "warning"
                    }
                    className="capitalize"
                  >
                    {WEBSITE_PAGE_STATUS_LABELS[page.status]}
                  </Badge>
                </Row>
                <Row label="Visibility">
                  {WEBSITE_PAGE_VISIBILITY_LABELS[page.visibility]}
                </Row>
                <Row label="Language">
                  {WEBSITE_PAGE_LANGUAGE_LABELS[page.language]}
                </Row>
                <Row label="Layout">
                  {WEBSITE_PAGE_LAYOUT_LABELS[page.layout]}
                </Row>
                <Row label="Template">{page.template}</Row>
                <Row label="SEO">{page.seoStatus}</Row>
                <Row label="Updated">{page.lastUpdated?.slice(0, 10) || "—"}</Row>
                <Row label="Updated by">{page.updatedBy || "—"}</Row>
                <Row label="Description">{page.description || "—"}</Row>
                <Row label="Meta title">{page.seo.metaTitle || "—"}</Row>
                <Row label="Meta desc">{page.seo.metaDescription || "—"}</Row>
              </dl>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
