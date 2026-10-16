"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getLocalisationHref,
  getLocalisationResource,
  LOCALISATION_MORE_TABS,
  LOCALISATION_PRIMARY_TABS,
  type LocalisationResourceId,
} from "@/lib/localisation/resources";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function LocalisationNav({ compact }: { compact?: boolean }) {
  const pathname = usePathname();

  const isActive = (id: LocalisationResourceId) => pathname === getLocalisationHref(id);

  const moreActive = LOCALISATION_MORE_TABS.some((id) => isActive(id));

  const tabs = compact ? LOCALISATION_PRIMARY_TABS.slice(0, 2) : LOCALISATION_PRIMARY_TABS;

  return (
    <nav className="flex flex-wrap items-center gap-1 rounded-xl border border-input/70 bg-muted/20 p-1">
      {tabs.map((id) => {
        const resource = getLocalisationResource(id);
        if (!resource) return null;
        return (
          <Link
            key={id}
            href={getLocalisationHref(id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              isActive(id)
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
          >
            {resource.title}
          </Link>
        );
      })}
      {!compact && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 gap-1 rounded-lg px-3 text-xs font-medium",
                moreActive && "bg-background text-foreground shadow-sm",
              )}
            >
              More <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[180px]">
            {LOCALISATION_MORE_TABS.map((id) => {
              const resource = getLocalisationResource(id);
              if (!resource) return null;
              return (
                <DropdownMenuItem key={id} asChild>
                  <Link href={getLocalisationHref(id)} className={cn(isActive(id) && "font-semibold")}>
                    {resource.title}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </nav>
  );
}
