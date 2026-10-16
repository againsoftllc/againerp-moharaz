"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  AGAIN_DRAWER_ACTION_BTN,
  AGAIN_DRAWER_PRIMARY_BTN,
  AGAIN_DRAWER_PRIMARY_COLOR,
  AgainDrawerControlBar,
} from "@/components/again/again-drawer";
import { cn } from "@/lib/utils";
import type { ApiPurchaseOrderLine } from "@/lib/api/purchase-orders";

export type TrackingType = "none" | "serial" | "batch";

export function trackingOf(line: ApiPurchaseOrderLine): TrackingType {
  const raw = line.tracking_type;
  if (raw === "serial" || raw === "batch") return raw;
  return "none";
}

export function remainingOf(line: ApiPurchaseOrderLine) {
  if (typeof line.quantity_remaining === "number") return Math.max(0, line.quantity_remaining);
  return Math.max(0, line.quantity_ordered - line.quantity_received);
}

export function parseBatchNotes(notes?: string | null) {
  const raw = (notes ?? "").trim();
  if (!raw.toUpperCase().startsWith("BATCH:")) return { batchNumber: "", batchExpiry: "" };
  const rest = raw.slice(6);
  const [number, expiryPart] = rest.split("|exp=");
  return { batchNumber: number.trim(), batchExpiry: (expiryPart ?? "").trim() };
}

export function parseSerialPaste(raw: string) {
  return raw
    .split(/[\n,;\t]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}

/**
 * Serial number entry for a single receiving line. Shared by the inline
 * Order Lines receiving controls (po-form-drawer.tsx) and the standalone
 * receipt drawer (receipt-drawer.tsx) so serial capture behaves identically
 * everywhere a receipt line is serial-tracked.
 */
export function SerialsDrawer({
  open,
  onOpenChange,
  product,
  required,
  value,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: string;
  required: number;
  value: string[];
  onSave: (serials: string[]) => void;
}) {
  const [rows, setRows] = useState<string[]>(value);
  const [paste, setPaste] = useState("");
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (open) {
      const next = [...value];
      while (next.length < required) next.push("");
      setRows(next.slice(0, Math.max(required, value.length)));
      setPaste("");
      setFocusIndex(0);
    }
  }, [open, required, value]);

  useEffect(() => {
    if (focusIndex == null) return;
    const el = inputRefs.current[focusIndex];
    if (!el) return;
    el.focus();
    el.select();
    setFocusIndex(null);
  }, [focusIndex, rows.length]);

  const filled = rows.map((s) => s.trim()).filter(Boolean);
  const uniqueCount = new Set(filled.map((s) => s.toLowerCase())).size;
  const complete = filled.length === required && required > 0 && uniqueCount === filled.length;
  const minRows = Math.max(required, 1);

  const commitAndAdvance = (index: number, typed: string) => {
    const cleaned = typed.trim();
    const isLast = index >= rows.length - 1;
    setRows((current) => {
      const next = current.map((v, i) => (i === index ? cleaned : v));
      if (isLast && cleaned) next.push("");
      return next;
    });
    if (isLast && !cleaned) return;
    setFocusIndex(index + 1);
  };

  const removeRow = (index: number) => {
    setRows((current) => {
      const next = current.filter((_, i) => i !== index);
      while (next.length < minRows) next.push("");
      return next;
    });
    setFocusIndex(Math.min(index, Math.max(0, rows.length - 2)));
  };

  const autoFillSerials = () => {
    const base = Date.now().toString(36).toUpperCase();
    setRows((current) => {
      const next = [...current];
      while (next.length < required) next.push("");
      let n = 0;
      return next.map((v) => {
        if (v.trim()) return v;
        n += 1;
        return `AUTO-${base}-${n}`;
      });
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title={`${product} — Serial Numbers`}
        resizable
        resizeMaxWidth={560}
        className="z-[260] flex min-w-[160px] w-[420px] max-w-[560px] flex-col gap-0 p-0"
      >
        <AgainDrawerControlBar>
          <button
            type="button"
            className={cn(AGAIN_DRAWER_PRIMARY_BTN, "h-6 px-2 text-[11px]")}
            style={{ backgroundColor: AGAIN_DRAWER_PRIMARY_COLOR }}
            disabled={!complete}
            onClick={() => {
              const keys = filled.map((s) => s.toLowerCase());
              if (new Set(keys).size !== keys.length) return;
              onSave(filled);
              onOpenChange(false);
            }}
          >
            Save serials
          </button>
          <button
            type="button"
            className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <span className="ml-1 text-[13px] font-medium text-foreground">{product} — Serial Numbers</span>
        </AgainDrawerControlBar>
        <div className="border-b border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {filled.length} / {required} serials added
            {complete ? " · Serial numbers complete" : ""}
            {filled.length > 0 && uniqueCount !== filled.length ? " · Duplicate serials are not allowed" : ""}
          </p>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <div className="space-y-1.5">
            {rows.map((row, index) => (
              <div key={index} className="flex items-center gap-1.5">
                <span className="w-6 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  #{index + 1}
                </span>
                <Input
                  ref={(el) => {
                    inputRefs.current[index] = el;
                  }}
                  value={row}
                  onChange={(e) =>
                    setRows((current) => current.map((v, i) => (i === index ? e.target.value : v)))
                  }
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    commitAndAdvance(index, e.currentTarget.value);
                  }}
                  placeholder="Scan or enter serial"
                  className="h-8 rounded-none"
                  autoComplete="off"
                />
                {row.trim() ? (
                  <span className="w-3.5 shrink-0 text-[11px] text-emerald-600 dark:text-emerald-400">✓</span>
                ) : (
                  <span className="w-3.5 shrink-0" />
                )}
                <button
                  type="button"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Remove serial ${index + 1}`}
                  onClick={() => removeRow(index)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <Field label="Paste serials">
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={"SN001\nSN002\nSN003"}
              className="min-h-[72px] w-full rounded-none border border-input bg-background px-2 py-1.5 text-[13px] outline-none"
            />
          </Field>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-none"
              onClick={() => {
                const parsed = parseSerialPaste(paste);
                if (!parsed.length) return;
                setRows((current) => {
                  const next = [...current];
                  let slot = 0;
                  for (const serial of parsed) {
                    while (slot < next.length && next[slot].trim()) slot += 1;
                    if (slot >= next.length) next.push(serial);
                    else next[slot] = serial;
                    slot += 1;
                  }
                  return next;
                });
                setPaste("");
              }}
            >
              Paste serials
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-none"
              onClick={() => setRows((current) => [...current, ""])}
            >
              Add serial
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-none"
              onClick={autoFillSerials}
            >
              Auto serial
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Auto serial fills any blank rows with a placeholder (AUTO-…) so you can receive now and
            replace them with the real serials later.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
