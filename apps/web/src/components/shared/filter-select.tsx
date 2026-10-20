"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { FilterTriggerContent } from "@/components/shared/filter-trigger";

export type FilterSelectOption = {
  value: string;
  label: string;
};

/** CSS variables of a list-filter menu for a given font size (see globals.css [data-list-filter-menu]). */
export function menuVars(fontSize?: number): React.CSSProperties | undefined {
  if (!fontSize) return undefined;
  return {
    "--filter-menu-font": `${fontSize}px`,
    "--filter-menu-row": `${Math.round(fontSize * 2.3)}px`,
    "--filter-menu-input": `${Math.round(fontSize * 2.4)}px`,
  } as React.CSSProperties;
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: FilterSelectOption[];
  /** Search box appears when options exceed this count (select2 style). */
  searchThreshold?: number;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  width?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /** Flip the menu above the trigger when there is no room below (use inside drawers). */
  avoidCollisions?: boolean;
  /** The "no filter" value the cross resets to (default: the option whose value is "all" or ""; none -> no cross). */
  clearValue?: string;
  /** Font size (px) of the open menu - the search box and every option; by default the list-filter size (10px x list zoom). */
  menuFontSize?: number;
};

/**
 * Square filter combobox — replaces native <select> in list filter bars.
 * Dropdown always opens below the trigger and follows dark/light theme.
 */
export function FilterSelect({
  value,
  onChange,
  options,
  searchThreshold = 8,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  className,
  width = "w-[140px]",
  ariaLabel,
  disabled = false,
  avoidCollisions = false,
  clearValue,
  menuFontSize,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const showSearch = options.length > searchThreshold;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, search]);

  const current = options.find((o) => o.value === value);
  const resetValue = clearValue ?? options.find((o) => o.value === "all" || o.value === "")?.value;

  const select = (next: string) => {
    onChange(next);
    setOpen(false);
    setSearch("");
  };

  return (
    <DropdownMenu
      modal={false}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            "group justify-start gap-1 rounded-none px-2 text-left font-normal shadow-sm",
            width,
            className,
          )}
        >
          <FilterTriggerContent
            label={current?.label ?? placeholder}
            active={resetValue !== undefined && value !== resetValue}
            onClear={() => resetValue !== undefined && onChange(resetValue)}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={2}
        avoidCollisions={avoidCollisions}
        collisionPadding={8}
        className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] min-w-[8rem] overflow-hidden p-0"
        data-list-filter-menu=""
        style={menuVars(menuFontSize)}
        // Inside a drawer the Dialog locks page scroll (react-remove-scroll) and also blocks the wheel in this portalled menu:
        // stopping the event here lets the option list scroll
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        {showSearch && (
          <div className="border-b border-input p-1" onPointerDown={(e) => e.stopPropagation()}>
            <div className="relative">
              <Search className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-6 rounded-none pl-6 text-[11px]"
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        )}
        <div className="max-h-60 overflow-y-auto p-0.5">
          {filtered.length === 0 ? (
            <p className="px-2 py-2.5 text-[11px] text-muted-foreground">No results</p>
          ) : (
            filtered.map((option) => (
              <DropdownMenuItem
                key={option.value}
                className={cn("gap-1.5", option.value === value && "bg-accent")}
                onClick={() => select(option.value)}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.value === value && <Check className="h-3 w-3 shrink-0" />}
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
