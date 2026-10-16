"use client";

import { SeoConfigForm } from "@/components/seo/seo-config-form";

export default function SeoSitemapConfigPage() {
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto">
      <SeoConfigForm section="sitemap" />
    </div>
  );
}
