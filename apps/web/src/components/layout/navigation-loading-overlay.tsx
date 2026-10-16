"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const MAX_VISIBLE_MS = 4000;

/**
 * Thin top progress bar during client navigations — keeps the shell visible
 * (desktop-app feel) instead of a full-screen white flash.
 */
export function NavigationLoadingOverlay() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<"idle" | "loading" | "finishing">("idle");
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathRef = useRef(pathname);

  const clearTimers = () => {
    if (maxTimer.current) clearTimeout(maxTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    maxTimer.current = null;
    hideTimer.current = null;
  };

  const finish = () => {
    clearTimers();
    setPhase("finishing");
    hideTimer.current = setTimeout(() => setPhase("idle"), 220);
  };

  const start = () => {
    clearTimers();
    setPhase("loading");
    maxTimer.current = setTimeout(finish, MAX_VISIBLE_MS);
  };

  useEffect(() => {
    if (pathRef.current === pathname) return;
    pathRef.current = pathname;
    // Route settled — finish on next tick (avoids sync setState-in-effect lint).
    const t = setTimeout(finish, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    const shouldHandle = (href: string | null, el: Element) => {
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return false;
      }
      if (href.startsWith("http") || href.startsWith("//")) return false;
      if (el.getAttribute("target") === "_blank") return false;
      if (el.hasAttribute("download")) return false;
      try {
        const next = new URL(href, window.location.origin);
        if (next.pathname === window.location.pathname && next.search === window.location.search) {
          return false;
        }
        const currentModule = window.location.pathname.split("/")[1] ?? "";
        const nextModule = next.pathname.split("/")[1] ?? "";
        // Intra-module navigation keeps its persistent navbar and uses a
        // body-only skeleton/transition; no global top loading indicator.
        if (currentModule === nextModule) return false;
      } catch {
        return false;
      }
      return true;
    };

    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!a) return;
      if (!shouldHandle(a.getAttribute("href"), a)) return;
      start();
    };

    document.addEventListener("click", onClick, true);

    // Catch Next.js client navigations that use router.push (not only <a> clicks).
    // Defer setState — Next may call pushState inside useInsertionEffect where
    // scheduling React updates is forbidden.
    const deferredStart = () => setTimeout(start, 0);
    const origPush = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);
    history.pushState = (...args: Parameters<History["pushState"]>) => {
      try {
        const url = args[2];
        if (typeof url === "string") {
          const next = new URL(url, window.location.origin);
          const currentModule = window.location.pathname.split("/")[1] ?? "";
          const nextModule = next.pathname.split("/")[1] ?? "";
          if (
            currentModule !== nextModule &&
            (next.pathname !== window.location.pathname ||
              next.search !== window.location.search)
          ) {
            deferredStart();
          }
        }
      } catch {
        /* ignore */
      }
      return origPush(...args);
    };
    history.replaceState = (...args: Parameters<History["replaceState"]>) => {
      return origReplace(...args);
    };

    return () => {
      document.removeEventListener("click", onClick, true);
      history.pushState = origPush;
      history.replaceState = origReplace;
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "idle") return null;

  const complete = phase === "finishing";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={!complete}
      aria-label="Loading page"
      className="pointer-events-none fixed inset-x-0 top-0 z-[99999] h-[2px] overflow-hidden bg-transparent"
    >
      <div
        className={cn(
          "h-full bg-primary shadow-[0_0_6px_color-mix(in_srgb,var(--primary)_55%,transparent)]",
          complete
            ? "w-full opacity-0 transition-[width,opacity] duration-200 ease-out"
            : "opacity-100",
        )}
        style={
          complete ? undefined : { animation: "nav-progress-pulse 1.05s ease-in-out infinite" }
        }
      />
      <style>{`
        @keyframes nav-progress-pulse {
          0% { width: 8%; }
          40% { width: 55%; }
          70% { width: 78%; }
          100% { width: 90%; }
        }
      `}</style>
    </div>
  );
}
