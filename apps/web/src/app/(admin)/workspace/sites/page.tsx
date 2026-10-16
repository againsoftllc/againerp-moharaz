"use client";

import { StoreList } from "@/components/settings/store-list";

/** Workspace Sites — storefront / company site list (connections live in site settings). */
export default function WorkspaceSitesPage() {
  return (
    <div className="-m-3 flex min-h-0 w-[calc(100%+1.5rem)] max-w-none flex-1 flex-col overflow-auto p-3 lg:-m-4 lg:w-[calc(100%+2rem)] lg:p-4">
      <div className="mb-1 shrink-0">
        <h1 className="page-title">Sites</h1>
        <p className="text-xs text-muted-foreground">
          Manage storefront / company sites. Open a site to configure settings and connections.
        </p>
      </div>
      <StoreList />
    </div>
  );
}
