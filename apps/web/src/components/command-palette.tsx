"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { COMMAND_PALETTE_OPEN_EVENT } from "@/lib/navigation/command-palette";
import { flattenWorkspaceNav } from "@/lib/workspace/navigation-config";
import { useAppStore } from "@/lib/store/app-store";

const navItems = flattenWorkspaceNav();

export function CommandPalette() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const recentPages = useAppStore((s) => s.recentPages);

  const isCenterRoute = false;

  useEffect(() => {
    if (isCenterRoute) return;
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const openFromEvent = () => setOpen(true);
    document.addEventListener("keydown", down);
    document.addEventListener(COMMAND_PALETTE_OPEN_EVENT, openFromEvent);
    return () => {
      document.removeEventListener("keydown", down);
      document.removeEventListener(COMMAND_PALETTE_OPEN_EVENT, openFromEvent);
    };
  }, [isCenterRoute]);

  if (isCenterRoute || !open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/50" onClick={() => setOpen(false)}>
      <div
        className="mx-auto mt-[12vh] w-full max-w-lg overflow-hidden rounded-lg border border-input bg-background text-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Command.Input
              placeholder="Search pages, actions…"
              className="flex h-10 w-full bg-transparent py-2 text-xs outline-none"
            />
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results.
            </Command.Empty>
            {recentPages.length > 0 && (
              <Command.Group heading="Recent">
                {recentPages.map((p) => (
                  <Command.Item
                    key={p.href}
                    value={p.title}
                    onSelect={() => {
                      router.push(p.href);
                      setOpen(false);
                    }}
                    className="cursor-pointer rounded-md px-2 py-2 text-sm aria-selected:bg-accent"
                  >
                    {p.title}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            <Command.Group heading="Navigation">
              {navItems.map((item) => (
                <Command.Item
                  key={item.href}
                  value={item.title}
                  onSelect={() => {
                    router.push(item.href);
                    setOpen(false);
                  }}
                  className="cursor-pointer rounded-md px-2 py-2 text-sm aria-selected:bg-accent"
                >
                  {item.title}
                </Command.Item>
              ))}
            </Command.Group>
            <Command.Group heading="AI (mock)">
              <Command.Item
                onSelect={() => setOpen(false)}
                className="cursor-pointer rounded-md px-2 py-2 text-sm aria-selected:bg-accent"
              >
                Generate product description
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
