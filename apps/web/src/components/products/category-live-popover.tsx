"use client";

import { useEffect, useRef } from "react";
import { CategoryCombobox } from "@/components/categories/category-combobox";
import type { Category } from "@/lib/mock-data/categories";

const HEIGHT_ESTIMATE = 330;

/**
 * Live edit of a row's categories (double click on the Category cell): the category TREE (expand / collapse, search, check boxes, several
 * at once, the picked ones scrolled into view) opens just under the row. Every tick goes to the row at once (`onChange` - the grid applies
 * and saves it); there is nothing to confirm. Click away or Esc closes it (no Done button, no chips row: the row itself shows the result). This is not an AG Grid editor on purpose: the row keeps
 * updating while the picker is open.
 */
export function CategoryLivePopover({
  anchor,
  categories,
  values,
  onChange,
  onClose,
}: {
  /** the cell's box on screen: the picker opens right under it (above it when there is no room below) */
  anchor: DOMRect;
  categories: Category[];
  values: string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onScroll = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return; // scrolling the picker's own list
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const below = anchor.bottom + HEIGHT_ESTIMATE <= window.innerHeight || anchor.top < HEIGHT_ESTIMATE;
  const width = 300;
  const left = Math.max(4, Math.min(anchor.left, window.innerWidth - width - 8));

  return (
    <div
      ref={ref}
      className="fixed z-[300] border border-border bg-popover p-1.5 text-popover-foreground shadow-md"
      style={{ width, left, ...(below ? { top: anchor.bottom + 2 } : { bottom: window.innerHeight - anchor.top + 2 }) }}
    >
      <CategoryCombobox multiple inline autoOpen chips={false} categories={categories} values={values} onChange={onChange} placeholder="Select categories" />
    </div>
  );
}
