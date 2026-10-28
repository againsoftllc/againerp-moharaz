"use client";

import { use } from "react";
import { SiteSettingsForm } from "@/components/settings/site-settings-form";

type Props = {
  params: Promise<{ id: string }>;
};

/** Website › Configuration › Sites › one site's settings. */
export default function WebsiteSiteSettingsPage({ params }: Props) {
  const { id } = use(params);
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto p-3 lg:p-4">
      <SiteSettingsForm siteId={id} />
    </div>
  );
}
