"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Bell, Menu, Plus, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { openCommandPalette } from "@/lib/navigation/command-palette";
import { useAppStore } from "@/lib/store/app-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { quickCreateItems } from "@/lib/navigation";

/** WS-MOBILE-* — Zone F bottom navigation (mobile only). */
export function WorkspaceMobileNav() {
  const pathname = usePathname();
  const setAiDrawerOpen = useAppStore((s) => s.setAiDrawerOpen);
  const setMobileSidebarOpen = useAppStore((s) => s.setMobileSidebarOpen);

  const items = [
    { href: "/dashboard", label: "Home", icon: Home, match: (p: string) => p === "/home" || p === "/dashboard" },
    {
      href: "#search",
      label: "Search",
      icon: Search,
      action: () => openCommandPalette(),
    },
    {
      href: "#ai",
      label: "AI",
      icon: Sparkles,
      action: () => setAiDrawerOpen(true),
    },
    {
      href: "/notifications",
      label: "Alerts",
      icon: Bell,
      match: (p: string) => p.startsWith("/notifications"),
    },
    {
      href: "#menu",
      label: "Menu",
      icon: Menu,
      action: () => setMobileSidebarOpen(true),
    },
  ];

  return (
    <nav
      data-zone="F"
      data-component="WS-MOBILE-NAV"
      className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-stretch border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      aria-label="Mobile navigation"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.match?.(pathname) ?? pathname === item.href;
        if (item.action) {
          return (
            <button
              key={item.label}
              type="button"
              onClick={item.action}
              className="flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-muted-foreground"
            >
              <Icon className="h-5 w-5" aria-hidden />
              {item.label}
            </button>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 text-[10px]",
              active ? "text-primary font-medium" : "text-muted-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="h-5 w-5" aria-hidden />
            {item.label}
          </Link>
        );
      })}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="absolute -top-5 left-1/2 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border bg-primary text-primary-foreground shadow-md"
            aria-label="Quick create"
          >
            <Plus className="h-5 w-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="mb-2 w-48">
          {quickCreateItems.slice(0, 6).map((item) => (
            <DropdownMenuItem key={item.href} asChild>
              <Link href={item.href}>{item.label}</Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
