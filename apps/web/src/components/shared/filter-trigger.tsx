"use client";

import type { KeyboardEvent } from "react";
import { ChevronDown, X } from "lucide-react";

/**
 * The inside of every list filter's trigger button (the "common datatable" filter look): the down arrow on the LEFT, the label, and a
 * cross on the RIGHT that clears the filter once something is picked. The button needs the `group` class (the arrow turns up while the
 * menu is open). Used by FilterSelect, CategoryTreeFilter, the brand filter ... - and CategoryCombobox draws the same.
 */
export function FilterTriggerContent({
  label,
  active,
  onClear,
  clearLabel = "Clear filter",
}: {
  label: string;
  /** a value other than "all" is picked: show the cross */
  active: boolean;
  onClear: () => void;
  clearLabel?: string;
}) {
  const clear = (e: { stopPropagation: () => void; preventDefault?: () => void }) => {
    e.stopPropagation();
    e.preventDefault?.();
    onClear();
  };
  return (
    <>
      <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground transition group-data-[state=open]:rotate-180" />
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {active ? (
        <span
          role="button"
          tabIndex={0}
          aria-label={clearLabel}
          title={clearLabel}
          // the trigger opens its menu on pointer down: the cross must not
          onPointerDown={(e) => e.stopPropagation()}
          onClick={clear}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") clear(e);
          }}
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-none hover:bg-muted"
        >
          <X className="h-3 w-3" />
        </span>
      ) : null}
    </>
  );
}
