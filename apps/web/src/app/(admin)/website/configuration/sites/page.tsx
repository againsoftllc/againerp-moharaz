"use client";

import { StoreList } from "@/components/settings/store-list";

/** Website › Configuration › Sites — the storefront / company sites; open one for its settings and connections. */
export default function WebsiteSitesPage() {
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-auto p-3 lg:p-4">
      <div className="mb-1 shrink-0">
        <h1 className="page-title">Sites</h1>
      </div>
      <StoreList />
    </div>
  );
}
