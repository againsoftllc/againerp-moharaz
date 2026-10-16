"use client";

import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export type SearchDropdownItem = { id: string; primary: string; secondary?: string; imageUrl?: string };

const LINK = "text-[13px] text-[#00a09d] hover:underline";

/** Shared Odoo-style many2one search dropdown — portal-rendered list under an anchored input. */
export function SearchDropdown({
  open,
  items,
  onSelect,
  onSearchMore,
  searchMoreLabel = "Search more...",
  renderItem,
  getAnchor,
  portalContainer,
  placement = "auto",
}: {
  open: boolean;
  items: SearchDropdownItem[];
  onSelect: (id: string) => void;
  onSearchMore?: () => void;
  searchMoreLabel?: string;
  renderItem?: (item: SearchDropdownItem) => React.ReactNode;
  /** Anchor to the input row so menu sits under it. */
  getAnchor: () => HTMLElement | null;
  /**
   * Must be inside the Sheet content so pointer-events work (Radix modal
   * blocks clicks on portals attached to document.body).
   */
  portalContainer: HTMLElement | null;
  /** `bottom` keeps the list under the field (order lines); `auto` may flip up. */
  placement?: "bottom" | "auto";
}) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 240 });

  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = getAnchor();
        if (!el) return;
        const r = el.getBoundingClientRect();
        const menuH = Math.min(320, 48 + items.length * (renderItem ? 52 : 32) + 36);
        const spaceBelow = window.innerHeight - r.bottom - 8;
        const openUp =
          placement === "auto" && spaceBelow < menuH && r.top > spaceBelow;
        setPos({
          top: openUp ? Math.max(8, r.top - menuH - 2) : r.bottom + 2,
          left: r.left,
          width: Math.max(r.width, 120),
        });
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    document.addEventListener("pointermove", update);
    const observers: ResizeObserver[] = [];
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(update);
      const anchor = getAnchor();
      if (anchor) ro.observe(anchor);
      if (portalContainer) ro.observe(portalContainer);
      observers.push(ro);
    }
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      document.removeEventListener("pointermove", update);
      for (const observer of observers) observer.disconnect();
    };
  }, [open, getAnchor, items.length, placement, renderItem, portalContainer]);

  if (!open || !portalContainer) return null;

  return createPortal(
    <div
      data-again-search-dropdown
      className="overflow-hidden rounded-none border border-border bg-popover text-popover-foreground shadow-xl"
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width: pos.width,
        zIndex: 300,
        maxHeight: 320,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ul className="max-h-[280px] overflow-y-auto py-1">
        {items.length === 0 ? (
          <li className="px-3 py-2 text-[13px] text-muted-foreground">No results</li>
        ) : (
          items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={cn(
                  "flex w-full px-3 py-1.5 text-left text-[13px] hover:bg-accent",
                  renderItem ? "items-start" : "items-center justify-between gap-3",
                )}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelect(item.id);
                }}
              >
                {renderItem ? (
                  renderItem(item)
                ) : (
                  <>
                    <span className="truncate text-foreground">{item.primary}</span>
                    {item.secondary ? (
                      <span className="shrink-0 text-muted-foreground">{item.secondary}</span>
                    ) : null}
                  </>
                )}
              </button>
            </li>
          ))
        )}
      </ul>
      {onSearchMore ? (
        <button
          type="button"
          className={cn(
            "sticky bottom-0 block w-full border-t border-border bg-popover px-3 py-1.5 text-left",
            LINK,
          )}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSearchMore();
          }}
        >
          Search more...
        </button>
      ) : null}
    </div>,
    portalContainer,
  );
}
