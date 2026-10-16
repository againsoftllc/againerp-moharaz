"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { ViewerReadOnlyBanner } from "@/components/auth/viewer-read-only-banner";
import { WorkspaceMainContent } from "./workspace-main-content";
import { WorkspaceUtilityPanel } from "./workspace-utility-panel";
import { WorkspaceMobileNav } from "./workspace-mobile-nav";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAppStore } from "@/lib/store/app-store";

const WorkspaceSidebar = dynamic(
  () => import("./workspace-sidebar").then((module) => module.WorkspaceSidebar),
  { ssr: false },
);

type Props = {
  children: React.ReactNode;
};

/**
 * AgainERP workspace shell — drawer menu + main content.
 * Module navbars host the drawer hamburger; no global fallback bar.
 */
export function WorkspaceShell({ children }: Props) {
  const pathname = usePathname();
  const isPos = pathname.startsWith("/pos");
  const navDrawerOpen = useAppStore((s) => s.mobileSidebarOpen);
  const setNavDrawerOpen = useAppStore((s) => s.setMobileSidebarOpen);

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {isPos ? null : <ViewerReadOnlyBanner />}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <WorkspaceMainContent flush={isPos}>{children}</WorkspaceMainContent>
        </div>
      </div>

      <WorkspaceUtilityPanel />
      {isPos ? null : <WorkspaceMobileNav />}

      <Sheet open={navDrawerOpen} onOpenChange={setNavDrawerOpen}>
        <SheetContent
          side="left"
          title="Main navigation"
          className="w-[min(100vw,15rem)] gap-0 border-border bg-card p-0 text-foreground sm:max-w-[15rem]"
        >
          {navDrawerOpen ? (
            <WorkspaceSidebar
              className="h-full w-full border-0"
              onNavigate={() => setNavDrawerOpen(false)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
