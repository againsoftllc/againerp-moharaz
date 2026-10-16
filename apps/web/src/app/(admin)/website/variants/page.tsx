"use client";

import { Suspense, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Filter, Plus, RefreshCw, Settings2, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { VariantCatalogListHandle } from "@/components/variants/variant-catalog-list";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { useApiHealth } from "@/lib/api/use-api-health";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useCatalogModuleBasePath } from "@/lib/catalog/catalog-module-base-path";
import { cn } from "@/lib/utils";

const VariantCatalogList = dynamic(
  () =>
    import("@/components/variants/variant-catalog-list").then(
      (module) => module.VariantCatalogList,
    ),
  {
    ssr: false,
    loading: () => <ContentDataSkeleton label="Loading variants…" />,
  },
);

function VariantListContent() {
  const router = useRouter();
  const moduleBase = useCatalogModuleBasePath();
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const listRef = useRef<VariantCatalogListHandle>(null);
  const [advancedFilterCount, setAdvancedFilterCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const openProductCreate = () => {
    router.push(`${moduleBase}/products?create=1`);
  };

  const refetch = () => {
    void listRef.current?.refetch().then(() => {
      apiHealth.recheck();
      toast.message("Variants refreshed");
    });
  };

  const healthTitle =
    apiHealth.status === "connected"
      ? "API and database connected"
      : apiHealth.status === "partial"
        ? "API connected, database not connected"
        : apiHealth.status === "disconnected"
          ? "API/database not connected"
          : "Checking connection…";

  const headerLeftActions = (
    <ListGridHeaderStart title="Variants">
      {canWrite ? (
        <Button size="sm" className="rounded-none" onClick={openProductCreate} title="Variants are edited on the product form">
          New
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(
              "relative h-[26px] w-[26px] shrink-0 rounded-none",
              apiHealth.status === "connected" &&
                "border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400",
              apiHealth.status === "partial" &&
                "border-amber-500/50 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400",
              apiHealth.status === "disconnected" &&
                "border-red-500/50 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400",
              apiHealth.status === "checking" && "text-muted-foreground",
            )}
            aria-label={`Settings (${healthTitle})`}
            title={healthTitle}
          >
            <Settings2 className="h-3.5 w-3.5" />
            {advancedFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 rounded-none bg-primary px-1 text-[9px] leading-3 text-primary-foreground">
                {advancedFilterCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[11rem]">
          <DropdownMenuItem onClick={refetch} disabled={loading}>
            <RefreshCw className={cn("mr-1.5 h-3 w-3", loading && "animate-spin")} />
            Refresh
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => listRef.current?.openFilters()}>
            <Filter className="mr-1.5 h-3 w-3" />
            Filters
            {advancedFilterCount > 0 ? (
              <span className="ml-auto text-[10px] text-muted-foreground">{advancedFilterCount}</span>
            ) : null}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => toast.info("Import — prototype")}>
            <Upload className="mr-1.5 h-3 w-3" />
            Import
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toast.success("Export started (mock CSV)")}>
            <Download className="mr-1.5 h-3 w-3" />
            Export
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ListGridHeaderStart>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <VariantCatalogList
        ref={listRef}
        onAdvancedFilterCountChange={setAdvancedFilterCount}
        onLoadingChange={setLoading}
        headerLeftActions={headerLeftActions}
        className="min-h-0 flex-1"
      />

      {canWrite && (
        <Button
          size="sm"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full p-0 shadow-lg md:hidden"
          onClick={openProductCreate}
          aria-label="Add product (variants)"
        >
          <Plus className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}

export default function VariantsPage() {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={<ContentDataSkeleton label="Loading variants…" />}>
        <VariantListContent />
      </Suspense>
    </div>
  );
}
