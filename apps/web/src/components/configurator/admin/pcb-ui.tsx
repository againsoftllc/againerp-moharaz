"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import type { ConfiguratorFilterField } from "@/lib/api/use-configurator-filters";

/** Small shared pieces of the Smart PC Builder admin panel (chips, tokens,
 * filter-type colours) so the Tabs & Slots and Rules tabs look the same. */

export const prettyCode = (code: string) => code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const TYPE_CHIP: Record<string, { label: string; cls: string }> = {
  dropdown: { label: "Dynamic", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  multi_select: { label: "Multi-select", cls: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300" },
  number: { label: "Range", cls: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  boolean: { label: "Boolean", cls: "bg-purple-500/15 text-purple-600 dark:text-purple-400" },
  lookup: { label: "Lookup", cls: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400" },
};

export function typeChipFor(field?: ConfiguratorFilterField) {
  if (!field) return null;
  const key = field.source === "lookup" ? "lookup" : (field.field_type ?? "");
  return TYPE_CHIP[key] ?? { label: field.field_type ?? "Text", cls: "bg-muted text-muted-foreground" };
}

export function Chip({ cls, children }: { cls: string; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap px-1.5 py-px text-[11px] font-semibold ${cls}`}>{children}</span>;
}

export function Tok({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap border border-border bg-muted/40 px-1.5 py-px font-mono text-xs">{children}</span>;
}

/** Click to open, type to narrow the slot's products, click one to pick it. */
export function ProductPicker({
  products,
  value,
  onChange,
  label,
}: {
  products: { id: string; name: string; in_stock?: boolean }[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = products.find((p) => p.id === value);
  const term = q.trim().toLowerCase();
  const shown = term ? products.filter((p) => p.name.toLowerCase().includes(term)) : products;

  return (
    <div ref={boxRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        aria-label={label}
        onClick={() => {
          setOpen((o) => !o);
          setQ("");
        }}
        className="flex h-8 w-full items-center justify-between gap-1 border border-input bg-background px-2 text-left text-xs"
      >
        <span className={`truncate ${selected ? "" : "text-muted-foreground"}`}>{selected?.name ?? "— নির্বাচন করুন —"}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-full min-w-[260px] border border-input bg-background shadow-lg">
          <div className="flex items-center gap-1.5 border-b border-input px-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`${label} খুঁজুন…`}
              className="h-8 w-full bg-transparent text-xs outline-none"
            />
          </div>
          <div className="max-h-56 overflow-auto">
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs text-destructive hover:bg-muted"
              >
                <X className="h-3 w-3" /> বাদ দিন
              </button>
            )}
            {shown.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">কোনো প্রোডাক্ট পাওয়া যায়নি</p>
            ) : (
              shown.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted ${p.id === value ? "bg-primary/10" : ""}`}
                >
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {p.in_stock === false && <span className="shrink-0 text-[10px] text-muted-foreground">Out of stock</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** A slot icon is either an emoji or the URL of an uploaded SVG/PNG. */
export const isIconImage = (icon: string) => /^(https?:)?\/\/|^\/|^data:image\//.test(icon);

export function SlotIconView({ icon, size = 20 }: { icon: string; size?: number }) {
  if (isIconImage(icon)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt="" width={size} height={size} className="inline-block object-contain" style={{ width: size, height: size }} />;
  }
  if (/^[a-z][a-z0-9_]*$/.test(icon)) {
    return <span className="material-icons" style={{ fontSize: size }}>{icon}</span>;
  }
  return <span style={{ fontSize: size * 0.9, lineHeight: 1 }}>{icon}</span>;
}
