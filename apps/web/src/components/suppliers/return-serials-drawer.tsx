"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AGAIN_DRAWER_FIELD_SHEET_CLASS,
  AgainDrawerButton,
  AgainDrawerCloseButton,
  AgainDrawerControlBar,
  AgainDrawerLayout,
  AgainDrawerPanel,
  AgainDrawerScrollBody,
} from "@/components/again/again-drawer";
import { AgainFormGroupTitle } from "@/components/again/again-form-sheet";
import { parseSerialPaste } from "@/components/suppliers/receiving-shared";
import { cn } from "@/lib/utils";

type Note = { text: string; tone: "ok" | "warn" };

/** One serial unit that can go back and where it is now. */
export type ReturnSerialUnit = { serial: string; locationId: string; location: string };

/**
 * Pick the serial units of a product that go back to the supplier. Opens like the serial entry used when goods are received:
 * scan or type a serial and it is selected on its own, paste a list, or tick units from what is in stock. A return leaves
 * from one location, so the units of one location are chosen at a time - the first one picked decides the location, and
 * `onSave` reports it so the return follows.
 */
export function ReturnSerialsDrawer({
  open,
  onOpenChange,
  product,
  units,
  selected,
  max,
  preferredLocationId,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: string;
  /** Every unit that can go back, in whatever location it is. */
  units: ReturnSerialUnit[];
  selected: string[];
  /** How many units can go back at most (what was received and not returned yet). */
  max: number;
  /** The location the return is set to now: its units are listed first. */
  preferredLocationId: string;
  onSave: (serials: string[], locationId: string | null) => void;
}) {
  const [picked, setPicked] = useState<string[]>(selected);
  const [query, setQuery] = useState("");
  const [paste, setPaste] = useState("");
  const [note, setNote] = useState<Note | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setPicked(selected.filter((s) => units.some((u) => u.serial === s)));
    setQuery("");
    setPaste("");
    setNote(null);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 150);
    return () => window.clearTimeout(timer);
    // the selection is taken when the drawer opens; later changes to the props must not undo what is being ticked
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const byKey = useMemo(() => new Map(units.map((u) => [u.serial.toLowerCase(), u])), [units]);
  const sorted = useMemo(
    () =>
      [...units].sort(
        (a, b) =>
          Number(b.locationId === preferredLocationId) - Number(a.locationId === preferredLocationId) ||
          a.location.localeCompare(b.location) ||
          a.serial.localeCompare(b.serial),
      ),
    [units, preferredLocationId],
  );
  const multiLocation = new Set(units.map((u) => u.locationId)).size > 1;
  /** The location of the units picked so far; the others cannot be mixed in. */
  const pickedLocation = picked.length ? units.find((u) => u.serial === picked[0]) : undefined;
  const filter = query.trim().toLowerCase();
  const visible = filter ? sorted.filter((u) => u.serial.toLowerCase().includes(filter)) : sorted;

  /** Selects one serial; says why when it cannot. Works on `current` so a pasted list can add many in one go. */
  const add = (
    raw: string,
    current: string[],
  ): { next: string[]; result: "added" | "already" | "missing" | "full" | "other-location"; unit?: ReturnSerialUnit } => {
    const unit = byKey.get(raw.trim().toLowerCase());
    if (!unit) return { next: current, result: "missing" };
    if (current.includes(unit.serial)) return { next: current, result: "already", unit };
    if (current.length >= max) return { next: current, result: "full", unit };
    const first = current.length ? units.find((u) => u.serial === current[0]) : undefined;
    if (first && first.locationId !== unit.locationId) return { next: current, result: "other-location", unit };
    return { next: [...current, unit.serial], result: "added", unit };
  };

  const scan = (raw: string) => {
    const { next, result, unit } = add(raw, picked);
    const label = raw.trim();
    if (result === "added") {
      setPicked(next);
      setNote({ text: `${label} selected${multiLocation && unit ? ` · ${unit.location}` : ""}`, tone: "ok" });
    } else if (result === "already") {
      setNote({ text: `${label} is already selected`, tone: "warn" });
    } else if (result === "full") {
      setNote({ text: `Only ${max} unit${max === 1 ? "" : "s"} can go back`, tone: "warn" });
    } else if (result === "other-location") {
      setNote({
        text: `${label} is at ${unit?.location}, the selected units are at ${pickedLocation?.location}. A return leaves from one location.`,
        tone: "warn",
      });
    } else {
      setNote({ text: `${label} is not in stock or was not received on this order`, tone: "warn" });
    }
    setQuery("");
  };

  const toggle = (unit: ReturnSerialUnit) =>
    setPicked((current) => {
      if (current.includes(unit.serial)) return current.filter((s) => s !== unit.serial);
      const { next } = add(unit.serial, current);
      return next;
    });

  const addPasted = () => {
    const values = parseSerialPaste(paste);
    if (!values.length) return;
    let current = picked;
    const skipped: string[] = [];
    for (const value of values) {
      const { next, result } = add(value, current);
      if (result === "missing" || result === "other-location" || result === "full") skipped.push(value);
      current = next;
    }
    setPicked(current);
    setPaste("");
    setNote(
      skipped.length
        ? {
            text: `${skipped.length} not selected (not in stock, at another location, or over the limit): ${skipped.slice(0, 3).join(", ")}${skipped.length > 3 ? "…" : ""}`,
            tone: "warn",
          }
        : { text: `${values.length} serial${values.length === 1 ? "" : "s"} selected`, tone: "ok" },
    );
  };

  /** Everything of the location of the units picked so far (or of the preferred one), up to the limit. */
  const selectAll = () => {
    const locationId = pickedLocation?.locationId ?? sorted[0]?.locationId;
    setPicked(sorted.filter((u) => u.locationId === locationId).slice(0, max).map((u) => u.serial));
  };

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title={`${product} — Return serials`}
      nested
      resizable
      defaultWidth={460}
      minWidth={340}
      widthStorageKey="again-return-serials-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar trailing={<AgainDrawerCloseButton onClick={() => onOpenChange(false)} />}>
          <AgainDrawerButton
            variant="primary"
            onClick={() => {
              onSave(picked, pickedLocation?.locationId ?? null);
              onOpenChange(false);
            }}
          >
            Done
          </AgainDrawerButton>
          <AgainDrawerButton onClick={() => onOpenChange(false)}>Cancel</AgainDrawerButton>
          <span className="ml-1 truncate text-[13px] font-medium text-foreground">{product}</span>
        </AgainDrawerControlBar>
        <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
          {picked.length} / {max} selected
          {pickedLocation ? ` · returning from ${pickedLocation.location}` : ""} · {units.length} in stock
        </div>
        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
          <div className="space-y-4">
            <div>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  const value = e.target.value;
                  setQuery(value);
                  // a scanned serial selects itself: the whole serial matches one unit and no other serial starts with it
                  const hit = byKey.get(value.trim().toLowerCase());
                  if (hit && !units.some((u) => u !== hit && u.serial.toLowerCase().startsWith(value.trim().toLowerCase()))) {
                    scan(value);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (query.trim()) scan(query);
                }}
                placeholder="Scan or type a serial to select it"
                autoComplete="off"
                className="h-9 w-full border border-input bg-background px-2 text-[13px] outline-none focus:border-[#00a09d]"
              />
              {note ? (
                <p
                  className={cn(
                    "mt-1 text-[11px]",
                    note.tone === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400",
                  )}
                >
                  {note.text}
                </p>
              ) : null}
            </div>

            <div>
              <div className="flex items-end justify-between gap-3">
                <AgainFormGroupTitle className="flex-1">In stock</AgainFormGroupTitle>
                <span className="mb-1 flex shrink-0 items-center gap-3 text-[11px]">
                  <button type="button" className="text-[#00a09d] hover:underline" onClick={selectAll}>
                    Select all
                  </button>
                  <button type="button" className="text-muted-foreground hover:underline" onClick={() => setPicked([])}>
                    Clear
                  </button>
                </span>
              </div>
              {visible.length === 0 ? (
                <p className="px-1 py-4 text-center text-xs text-muted-foreground">
                  {units.length === 0 ? "No serial numbers in stock." : "No serial matches."}
                </p>
              ) : (
                <ul className="space-y-1">
                  {visible.map((unit) => {
                    const checked = picked.includes(unit.serial);
                    const otherLocation = !checked && !!pickedLocation && pickedLocation.locationId !== unit.locationId;
                    const full = !checked && picked.length >= max;
                    const disabled = otherLocation || full;
                    return (
                      <li key={unit.serial}>
                        <label
                          className={cn(
                            "flex cursor-pointer items-center gap-2 border px-2 py-1.5 font-mono text-[12px]",
                            checked ? "border-[#00a09d] bg-[#00a09d]/10 text-foreground" : "border-border text-muted-foreground",
                            disabled && "cursor-not-allowed opacity-50",
                          )}
                          title={otherLocation ? `At ${unit.location}: a return leaves from one location` : undefined}
                        >
                          <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(unit)} />
                          <span className="min-w-0 flex-1 truncate">{unit.serial}</span>
                          {multiLocation ? (
                            <span className="shrink-0 font-sans text-[11px] text-muted-foreground">{unit.location}</span>
                          ) : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div>
              <AgainFormGroupTitle>Paste serials</AgainFormGroupTitle>
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder={"SN001\nSN002\nSN003"}
                rows={3}
                className="mt-1 w-full border border-input bg-background px-2 py-1.5 text-[13px] outline-none focus:border-[#00a09d]"
              />
              <AgainDrawerButton className="mt-1.5" disabled={!paste.trim()} onClick={addPasted}>
                Select pasted serials
              </AgainDrawerButton>
            </div>
          </div>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}
