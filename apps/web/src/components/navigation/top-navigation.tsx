"use client";

import { Menu } from "lucide-react";
import { NotificationCenter } from "@/components/layout/notification-center";
import { AgainErpCenterLink } from "@/components/layout/againerp-center-link";
import { ScopeSwitchers } from "@/components/layout/scope-switchers";
import { UserMenu } from "@/components/layout/user-menu";
import { ThemeSwitch } from "@/components/theme/theme-switch";
import { TopNavAiAssistant } from "@/components/navigation/top-nav-ai-assistant";
import { TopNavGlobalSearch } from "@/components/navigation/top-nav-global-search";
import { TopNavQuickCreate } from "@/components/navigation/top-nav-quick-create";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  onMobileMenuClick?: () => void;
  showMobileMenuButton?: boolean;
};

/** Global tools header — company/branch stay in their own group (no brand here). */
export function TopNavigation({
  className,
  onMobileMenuClick,
  showMobileMenuButton = true,
}: Props) {
  return (
    <header
      className={cn(
        "shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        className,
      )}
      role="banner"
    >
      <div className="flex h-14 items-center gap-1.5 px-2 sm:gap-2 lg:px-3">
        {showMobileMenuButton && onMobileMenuClick ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={onMobileMenuClick}
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </Button>
        ) : null}

        <div className="hidden min-w-0 flex-1 md:flex">
          <TopNavGlobalSearch />
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:gap-2 md:flex-none">
          <AgainErpCenterLink className="hidden sm:inline-flex" />
          <TopNavGlobalSearch compact className="md:hidden" />

          {/* Company + branch — separate scope block */}
          <div
            className="flex shrink-0 items-center gap-1 border-l border-border pl-1.5 sm:pl-2"
            data-component="WS-HEADER-SCOPE"
            aria-label="Company and branch"
          >
            <ScopeSwitchers />
          </div>

          <div className="flex shrink-0 items-center gap-0.5 border-l border-border pl-1.5 sm:gap-1 sm:pl-2">
            <TopNavQuickCreate />
            <NotificationCenter />
            <TopNavAiAssistant />
            <ThemeSwitch variant="icon" className="hidden sm:inline-flex" />
            <UserMenu />
          </div>
        </div>
      </div>
    </header>
  );
}
