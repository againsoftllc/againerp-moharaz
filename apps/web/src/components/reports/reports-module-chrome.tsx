"use client";

import { useId, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { AgainSystray } from "@/components/again/again-systray";
import { WorkspaceNavDrawerToggle } from "@/components/workspace/workspace-nav-drawer-toggle";

const REPORTS_NAV = {
  bg: "#2c2e3f",
  border: "#1e2030",
} as const;

function ReportsAppIcon({ className }: { className?: string }) {
  const clipId = useId();
  return (
    <svg viewBox="0 0 28 28" className={cn("h-5 w-5 shrink-0", className)} aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <rect width="28" height="28" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="28" height="28" fill="#714B67" />
        <rect x="14" y="0" width="14" height="14" fill="#00A09D" />
        <rect x="0" y="14" width="14" height="14" fill="#F0AD4E" />
        <rect x="14" y="14" width="14" height="14" fill="#714B67" opacity="0.55" />
        <rect x="7" y="16" width="3" height="6" fill="#fff" opacity="0.9" />
        <rect x="12.5" y="12" width="3" height="10" fill="#fff" opacity="0.9" />
        <rect x="18" y="8" width="3" height="14" fill="#fff" opacity="0.9" />
      </g>
    </svg>
  );
}

export function ReportsModuleNavbar() {
  const router = useRouter();

  return (
    <header className="shrink-0 bg-background" data-component="reports-module-heading">
      <nav
        className="relative z-50 flex h-[34px] shrink-0 items-center overflow-visible border-b text-white [&_[data-component=again\_menu\_systray]_button]:text-white/65 [&_[data-component=again\_menu\_systray]_button:hover]:bg-white/[0.08] [&_[data-component=again\_menu\_systray]_button:hover]:text-white"
        style={{
          backgroundColor: REPORTS_NAV.bg,
          borderColor: REPORTS_NAV.border,
        }}
        aria-label="Reports module"
        data-component="again_main_navbar"
      >
        <WorkspaceNavDrawerToggle tone="dark" />
        <button
          type="button"
          className="inline-flex h-[34px] shrink-0 items-center gap-1.5 px-2.5 text-[12px] font-bold text-white hover:bg-white/[0.06]"
          onClick={() => router.push("/reports")}
        >
          <ReportsAppIcon />
          Reports
        </button>
        <div className="flex min-w-0 flex-1" />
        <AgainSystray />
      </nav>
    </header>
  );
}

export function ReportsModuleBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 w-full min-w-0 flex-1 flex-col", className)}>{children}</div>
  );
}
