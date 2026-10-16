"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SearchDropdown } from "@/components/again/again-search-dropdown";
import type { ApiStockLevel } from "@/lib/api/inventory";
import { findItemByScan, scanProductCode } from "@/lib/api/product-scan";

export const STOCK_LINE_CELL_INPUT =
  "h-8 min-w-0 w-full overflow-hidden border-b border-border/50 bg-transparent text-right text-[13px] outline-none focus:border-[#00a09d]";

export const STOCK_LINE_LINK =
  "text-[13px] font-normal text-[#00a09d] hover:text-[#00c4bf] hover:underline";

export function StockProductSearchAdd({
  items,
  disabled,
  placeholder,
  portalHost,
  itemSecondary,
  onPick,
}: {
  items: ApiStockLevel[];
  disabled?: boolean;
  placeholder: string;
  portalHost: HTMLElement | null;
  itemSecondary?: (row: ApiStockLevel) => string;
  onPick: (item: ApiStockLevel) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [localHost, setLocalHost] = useState<HTMLElement | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? items.filter((row) => `${row.sku} ${row.name}`.toLowerCase().includes(q))
      : items;
    return pool.slice(0, 40);
  }, [items, query]);

  const pick = (row: ApiStockLevel) => {
    onPick(row);
    setQuery("");
    setOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const pickFromCode = async (raw: string) => {
    const code = raw.trim();
    if (!code || disabled) return;
    const q = code.toLowerCase();
    const exact = items.find(
      (item) =>
        item.sku.toLowerCase() === q ||
        item.name.toLowerCase() === q,
    );
    if (exact) {
      pick(exact);
      return;
    }
    const hit = await scanProductCode(code);
    if (!hit) {
      if (matches[0]) pick(matches[0]);
      else toast.error("No product for that barcode or serial");
      return;
    }
    const row = findItemByScan(items, hit);
    if (row) {
      pick(row);
      return;
    }
    toast.error(`${hit.name} is not in this warehouse list`);
  };

  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2 || disabled) return;
    const exact = items.find(
      (item) => item.sku.toLowerCase() === q || item.name.toLowerCase() === q,
    );
    if (exact) {
      pick(exact);
      return;
    }
    const timer = window.setTimeout(() => {
      if (matches.length === 1) {
        pick(matches[0]);
        return;
      }
      if (matches.length > 0 || q.includes(" ")) return;
      void scanProductCode(query.trim()).then((hit) => {
        if (!hit) return;
        const row = findItemByScan(items, hit);
        if (row) pick(row);
      });
    }, 280);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, items, disabled]);

  return (
    <div
      ref={(el) => {
        wrapRef.current = el;
        setLocalHost(el);
      }}
      className="relative flex min-w-0 flex-1 items-stretch"
    >
      <div
        ref={searchBoxRef}
        className="flex h-8 min-w-0 flex-1 items-center border border-input bg-background"
      >
        <Search className="ml-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          disabled={disabled}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void pickFromCode(query);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          className="h-8 min-w-0 flex-1 bg-transparent px-2 text-[13px] outline-none placeholder:text-muted-foreground disabled:opacity-60"
          aria-label="Search product"
          autoComplete="off"
        />
      </div>
      <SearchDropdown
        open={Boolean(!disabled && open && query.trim().length >= 1)}
        placement="bottom"
        getAnchor={() => searchBoxRef.current}
        portalContainer={portalHost ?? localHost}
        items={matches.map((row) => ({
          id: row.item_id ?? row.id,
          primary: row.name,
          imageUrl: row.thumbnail ?? undefined,
          secondary: itemSecondary
            ? itemSecondary(row)
            : `${row.sku} · system ${row.on_hand}`,
        }))}
        renderItem={(item) => (
          <div className="flex min-w-0 w-full items-start gap-2.5 text-left">
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.imageUrl}
                alt=""
                className="mt-0.5 h-9 w-9 shrink-0 border border-border bg-muted object-cover"
              />
            ) : (
              <span className="mt-0.5 h-9 w-9 shrink-0 border border-border bg-muted" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium leading-snug text-foreground">
                {item.primary}
              </p>
              {item.secondary ? (
                <p className="mt-0.5 truncate text-[11px] leading-snug text-muted-foreground">
                  {item.secondary}
                </p>
              ) : null}
            </div>
          </div>
        )}
        onSelect={(id) => {
          const row = items.find((item) => (item.item_id ?? item.id) === id);
          if (row) pick(row);
        }}
      />
    </div>
  );
}

export function StockLineDeleteBtn({ onRemove }: { onRemove: () => void }) {
  return (
    <button
      type="button"
      className="absolute right-0 top-1/2 z-10 inline-flex -translate-y-1/2 bg-white/95 px-0.5 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-destructive group-hover:opacity-100 dark:bg-muted/50"
      onClick={onRemove}
      aria-label="Delete line"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
