"use client";

import { useId, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { AgainSystray } from "@/components/again/again-systray";
import { WorkspaceNavDrawerToggle } from "@/components/workspace/workspace-nav-drawer-toggle";

type NavLink = { id: string; label: string; href: string };

/** Again blog main navbar — same dark strip as Catalog. */
const BLOG_NAV = {
  bg: "#2c2e3f",
  border: "#1e2030",
  activeBg: "#243b3b",
  activeBorder: "#3d5a58",
} as const;

const NAV_SLOT = "inline-flex h-[34px] shrink-0 items-center";
const NAV_CHIP =
  "inline-flex h-[24px] items-center rounded-none border px-2 text-[12px] font-normal leading-none outline-none";
const NAV_CHIP_IDLE =
  "border-transparent text-white/85 hover:bg-white/[0.06] hover:text-white";
const NAV_CHIP_ACTIVE = "text-white";

const DIRECT_LINKS: NavLink[] = [
  { id: "articles", label: "Article", href: "/blog/articles" },
  { id: "categories", label: "Category", href: "/blog/categories" },
  { id: "comments", label: "Comment", href: "/blog/comments" },
  { id: "settings", label: "Configuration", href: "/blog/settings" },
];

function isActiveHref(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function resolveBlogNav(pathname: string): { activeNav: string } {
  for (const item of DIRECT_LINKS) {
    if (isActiveHref(pathname, item.href)) {
      return { activeNav: item.id };
    }
  }
  return { activeNav: "articles" };
}

function navButtonStyle(highlighted: boolean) {
  return {
    backgroundColor: highlighted ? BLOG_NAV.activeBg : "transparent",
    borderColor: highlighted ? BLOG_NAV.activeBorder : "transparent",
  };
}

function BlogAppIcon({ className }: { className?: string }) {
  const clipId = useId();
  return (
    <svg viewBox="0 0 28 28" className={cn("h-5 w-5 shrink-0", className)} aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <rect width="28" height="28" rx="6" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="28" height="28" fill="#714B67" />
        <rect x="14" y="0" width="14" height="14" fill="#00A09D" />
        <rect x="0" y="14" width="14" height="14" fill="#F0AD4E" />
        <rect x="14" y="14" width="14" height="14" fill="#714B67" opacity="0.55" />
        <rect x="7" y="8" width="14" height="2" rx="1" fill="#ffffff" opacity="0.9" />
        <rect x="7" y="12" width="14" height="1.5" rx="0.75" fill="#ffffff" opacity="0.7" />
        <rect x="7" y="16" width="10" height="1.5" rx="0.75" fill="#ffffff" opacity="0.7" />
      </g>
    </svg>
  );
}

export function BlogModuleNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { activeNav } = resolveBlogNav(pathname);

  return (
    <header className="shrink-0 bg-background" data-component="blog-module-heading">
      <nav
        className="relative z-50 flex h-[34px] shrink-0 items-center overflow-visible border-b text-white [&_[data-component=again\_menu\_systray]_button]:text-white/65 [&_[data-component=again\_menu\_systray]_button:hover]:bg-white/[0.08] [&_[data-component=again\_menu\_systray]_button:hover]:text-white"
        style={{
          backgroundColor: BLOG_NAV.bg,
          borderColor: BLOG_NAV.border,
        }}
        aria-label="Blog module"
        data-component="again_main_navbar"
      >
        <WorkspaceNavDrawerToggle tone="dark" />
        <button
          type="button"
          className="inline-flex h-[34px] shrink-0 items-center gap-1.5 px-2.5 text-[12px] font-bold text-white hover:bg-white/[0.06]"
          onClick={() => router.push("/blog/articles")}
        >
          <BlogAppIcon />
          Blog
        </button>

        <div className="flex min-w-0 flex-1 items-center overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {DIRECT_LINKS.map((item) => {
            const active = activeNav === item.id;
            return (
              <div key={item.id} className={NAV_SLOT}>
                <button
                  type="button"
                  className={cn(NAV_CHIP, active ? NAV_CHIP_ACTIVE : NAV_CHIP_IDLE)}
                  style={navButtonStyle(active)}
                  onClick={() => router.push(item.href)}
                >
                  {item.label}
                </button>
              </div>
            );
          })}
        </div>

        <AgainSystray />
      </nav>
    </header>
  );
}

/** Content below navbar — flush with module edges (Catalog pattern). */
export function BlogModuleBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 w-full min-w-0 flex-1 flex-col", className)}>
      {children}
    </div>
  );
}
