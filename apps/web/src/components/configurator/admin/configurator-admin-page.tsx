"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { Plus } from "lucide-react";
import { useCatalogModuleBasePath, DROPSHIPPING_MODULE_BASE } from "@/lib/catalog/catalog-module-base-path";
import { Button } from "@/components/ui/button";

/** Default Catalog module configurator base (non-hook callers). */
export const CONFIGURATOR_ADMIN_BASE = "/website/product-configurator";

type Props = {
  section: string;
  title: string;
  count?: number;
  description: string;
  children: ReactNode;
  createLabel?: string;
  onCreate?: () => void;
  addTrigger?: number;
  setAddTrigger?: (fn: (n: number) => number) => void;
};

export function ConfiguratorAdminPage({
  section,
  title,
  count,
  description,
  children,
  createLabel,
  onCreate,
}: Props) {
  const moduleBase = useCatalogModuleBasePath();
  const base = `${moduleBase}/product-configurator`;
  const isDropshipping = moduleBase === DROPSHIPPING_MODULE_BASE;
  const rootLabel = isDropshipping ? "Dropshipping" : "Catalog";

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="page-subtitle">
            <Link href={`${moduleBase}/products`} className="hover:text-foreground">
              {rootLabel}
            </Link>
            {" › "}
            <Link href={base} className="hover:text-foreground">
              Builders
            </Link>
            {` › ${section}`}
          </p>
          <h1 className="page-title">
            {title}
            {count !== undefined && (
              <span className="ml-2 text-base font-normal text-muted-foreground">({count})</span>
            )}
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{description}</p>
        </div>
        {createLabel && onCreate && (
          <Button size="sm" className="hidden sm:flex" onClick={onCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {createLabel}
          </Button>
        )}
      </div>
      <div className="mt-3 min-h-0 flex-1">{children}</div>
    </div>
  );
}
