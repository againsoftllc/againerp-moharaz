"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, List, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { amountWithSymbol, type CurrencyOption } from "@/lib/localisation/currency-options";
import { CurrencyGlyph } from "@/components/localisation/currency-glyph";

type Props = {
  options: CurrencyOption[];
  value: string;
  onChange: (code: string) => void;
  onList?: () => void;
  onRename?: (code: string, name: string) => void;
  onDelete?: (code: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

function labelOf(option: CurrencyOption): string {
  return `${option.code} — ${option.name}`;
}

export function CurrencyCombobox({
  options,
  value,
  onChange,
  onList,
  placeholder = "Select currency",
  className,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected =
    options.find((o) => o.code.toLowerCase() === value.trim().toLowerCase()) ??
    (value.trim() ? { code: value.trim(), name: value.trim() } : null);

  const filtered = options.filter((o) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      o.name.toLowerCase().includes(q) ||
      o.code.toLowerCase().includes(q) ||
      (o.symbol ?? "").toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setSearch("");
  }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded-none border border-input bg-background px-2.5 py-1 text-xs shadow-sm hover:bg-accent/30",
          !selected && "text-muted-foreground",
          disabled && "pointer-events-none opacity-70",
        )}
      >
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition", open && "rotate-180")}
        />
        {selected ? (
          <CurrencyGlyph currency={selected} className="text-[13px]" />
        ) : null}
        <span className="min-w-0 flex-1 truncate text-left">
          {selected ? labelOf(selected) : placeholder}
        </span>
        <div className="flex h-4 shrink-0 items-center gap-0.5">
          {selected && !disabled ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.stopPropagation();
                  onChange("");
                }
              }}
              className="inline-flex h-4 w-4 items-center justify-center rounded-none hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </span>
          ) : null}
          {onList ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onList();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.stopPropagation();
                  onList();
                }
              }}
              className="inline-flex h-4 w-4 items-center justify-center rounded-none bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              title="Currency list"
            >
              <List className="h-3 w-3" />
            </span>
          ) : null}
        </div>
      </button>

      {open ? (
        <div className="absolute z-50 mt-1 w-[240px] min-w-full rounded-none border bg-popover shadow-md">
          <div className="flex items-center border-b px-2 py-1">
            <Search className="mr-1.5 h-3 w-3 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search currencies…"
              className="w-full bg-transparent text-[11px] outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-0.5">
            {filtered.length === 0 ? (
              <p className="px-2.5 py-1.5 text-[11px] text-muted-foreground">No currencies found</p>
            ) : (
              filtered.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  onClick={() => {
                    onChange(option.code);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-1.5 px-2.5 py-1 text-left text-[11px] hover:bg-accent",
                    option.code.toLowerCase() === value.trim().toLowerCase() && "bg-accent/60 font-medium",
                  )}
                >
                  <CurrencyGlyph currency={option} className="w-7 text-[12px]" />
                  <span className="min-w-0 flex-1 truncate">{labelOf(option)}</span>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {amountWithSymbol(1234, option)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
