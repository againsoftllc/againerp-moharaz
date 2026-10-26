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
import { fetchSerials, lookupSerial, SERIAL_STATUS_LABEL, type SerialStatus } from "@/lib/api/inventory-serials";
import { cn } from "@/lib/utils";

type Note = { text: string; tone: "ok" | "warn" };

/** How many in-stock units are listed at once; a bigger stock is searched on the server. */
const LIST_LIMIT = 500;

/**
 * Pick the serial units a sales line sells, from what is in stock at the order's location. Opens from the "x / n serials"
 * count under a serial-tracked product: scan or type a serial and it selects itself, tick units from the list, or paste a
 * list. A unit sitting at another location cannot be picked - change the order's Business Location for those.
 */
export function LineSerialsDrawer({
  open,
  onOpenChange,
  product,
  itemId,
  sku,
  warehouseId,
  warehouseName,
  selected,
  quantity,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: string;
  itemId: string;
  sku: string;
  /** The order's Business Location: only the units in stock there are listed. */
  warehouseId: string;
  warehouseName: string;
  /** Serials already on the line. */
  selected: string[];
  /** What the line sells now; units beyond it raise it. */
  quantity: number;
  onSave: (serials: string[]) => void;
}) {
  const [units, setUnits] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>(selected);
  const [query, setQuery] = useState("");
  const [paste, setPaste] = useState("");
  const [note, setNote] = useState<Note | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Mounted fresh each time it opens (the order drawer renders it only for the line being picked), so the state above starts
  // from the props and only the stock needs fetching.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchSerials({ item_id: itemId, warehouse_id: warehouseId || undefined, status: "in_stock", limit: LIST_LIMIT })
      .then((res) => {
        if (cancelled) return;
        const loaded = res.data.map((s) => s.serial_number);
        // a confirmed order's own units read "sold" but stay on the line
        setUnits([...selected.filter((s) => !loaded.includes(s)), ...loaded]);
        setTotal(res.meta.total_matching ?? loaded.length);
      })
      .catch((err) => {
        if (cancelled) return;
        setUnits(selected);
        setTotal(selected.length);
        setLoadError(err instanceof Error ? err.message : "Could not load the serials in stock");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    const timer = window.setTimeout(() => inputRef.current?.focus(), 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // the selection is taken when the drawer opens; later changes to the props must not undo what is being ticked
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemId, warehouseId]);

  const known = useMemo(() => new Map(units.map((s) => [s.toLowerCase(), s])), [units]);
  const filter = query.trim().toLowerCase();
  const visible = filter ? units.filter((s) => s.toLowerCase().includes(filter)) : units;
  /** More units in stock than the list holds: what is typed is looked up on the server as well. */
  const partial = total > units.filter((s) => !selected.includes(s)).length;

  // typed text that the loaded part of a big stock does not hold: ask the server for matches and add them to the list
  useEffect(() => {
    if (!open || !partial || filter.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetchSerials({ item_id: itemId, warehouse_id: warehouseId || undefined, status: "in_stock", q: filter, limit: 50 })
        .then((res) => {
          if (cancelled) return;
          const found = res.data.map((s) => s.serial_number);
          setUnits((current) => [...current, ...found.filter((s) => !current.includes(s))]);
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, partial, filter, itemId, warehouseId]);

  /** Why a serial that is not in the list cannot be sold from here. */
  const explainMissing = async (raw: string): Promise<string> => {
    try {
      const found = (await lookupSerial(raw)).data;
      if (!found) return `${raw} is not registered`;
      const sameProduct = (!!itemId && found.item_id === itemId) || (!!sku && found.sku === sku);
      if (!sameProduct) return `${found.serial_number} belongs to ${found.sku || found.product_name}, not ${sku || product}`;
      if (found.status !== "in_stock") return `${found.serial_number} is ${SERIAL_STATUS_LABEL[found.status as SerialStatus]?.toLowerCase() ?? found.status}`;
      if (warehouseId && found.warehouse_id && found.warehouse_id !== warehouseId) {
        return `${found.serial_number} is at ${found.warehouse_name ?? "another location"}, not ${warehouseName}. Change the Business Location to sell it.`;
      }
      return `${found.serial_number} is not in stock at ${warehouseName}`;
    } catch (err) {
      return err instanceof Error ? err.message : `Could not check ${raw}`;
    }
  };

  /** Selects one serial found in the list; says why when it cannot. */
  const select = (raw: string, current: string[]): { next: string[]; result: "added" | "already" | "missing"; serial?: string } => {
    const serial = known.get(raw.trim().toLowerCase());
    if (!serial) return { next: current, result: "missing" };
    if (current.includes(serial)) return { next: current, result: "already", serial };
    return { next: [...current, serial], result: "added", serial };
  };

  const scan = async (raw: string) => {
    const label = raw.trim();
    if (!label) return;
    let { next, result } = select(label, picked);
    if (result === "missing" && partial) {
      // a serial of a big stock that was not loaded: ask the server for exactly this one
      try {
        const res = await fetchSerials({ item_id: itemId, warehouse_id: warehouseId || undefined, status: "in_stock", q: label, limit: 20 });
        const hit = res.data.find((s) => s.serial_number.toLowerCase() === label.toLowerCase());
        if (hit) {
          setUnits((current) => (current.includes(hit.serial_number) ? current : [...current, hit.serial_number]));
          next = picked.includes(hit.serial_number) ? picked : [...picked, hit.serial_number];
          result = picked.includes(hit.serial_number) ? "already" : "added";
        }
      } catch {
        /* falls through to the explanation below */
      }
    }
    if (result === "added") {
      setPicked(next);
      setNote({ text: `${label} selected`, tone: "ok" });
    } else if (result === "already") {
      setNote({ text: `${label} is already selected`, tone: "warn" });
    } else {
      setNote({ text: await explainMissing(label), tone: "warn" });
    }
    setQuery("");
  };

  const toggle = (serial: string) =>
    setPicked((current) => (current.includes(serial) ? current.filter((s) => s !== serial) : [...current, serial]));

  const addPasted = () => {
    const values = parseSerialPaste(paste);
    if (!values.length) return;
    let current = picked;
    const skipped: string[] = [];
    for (const value of values) {
      const { next, result } = select(value, current);
      if (result === "missing") skipped.push(value);
      current = next;
    }
    setPicked(current);
    setPaste("");
    setNote(
      skipped.length
        ? {
            text: `${skipped.length} not selected (not in stock at ${warehouseName}): ${skipped.slice(0, 3).join(", ")}${skipped.length > 3 ? "…" : ""}`,
            tone: "warn",
          }
        : { text: `${values.length} serial${values.length === 1 ? "" : "s"} selected`, tone: "ok" },
    );
  };

  /** Fills the line up to its quantity from what is listed (and not picked yet). */
  const fillQuantity = () =>
    setPicked((current) => {
      const room = Math.max(0, quantity - current.length);
      return [...current, ...visible.filter((s) => !current.includes(s)).slice(0, room)];
    });

  const over = picked.length > quantity;

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title={`${product} — Serials`}
      nested
      resizable
      defaultWidth={460}
      minWidth={340}
      widthStorageKey="again-line-serials-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar trailing={<AgainDrawerCloseButton onClick={() => onOpenChange(false)} />}>
          <AgainDrawerButton
            variant="primary"
            onClick={() => {
              onSave(picked);
              onOpenChange(false);
            }}
          >
            Done
          </AgainDrawerButton>
          <AgainDrawerButton onClick={() => onOpenChange(false)}>Cancel</AgainDrawerButton>
          <span className="ml-1 truncate text-[13px] font-medium text-foreground">{product}</span>
        </AgainDrawerControlBar>
        <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
          <span className={cn(picked.length === quantity && "text-emerald-600 dark:text-emerald-400")}>
            {picked.length} / {quantity} selected
          </span>
          {" · "}
          {loading ? "loading…" : `${total} in stock at ${warehouseName || "the order's location"}`}
          {over ? <span className="text-amber-600 dark:text-amber-400"> · quantity becomes {picked.length}</span> : null}
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
                  const hit = known.get(value.trim().toLowerCase());
                  const lower = value.trim().toLowerCase();
                  if (hit && !units.some((s) => s !== hit && s.toLowerCase().startsWith(lower))) void scan(value);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (query.trim()) void scan(query);
                }}
                placeholder="Scan a serial to select it, or type to search"
                autoComplete="off"
                spellCheck={false}
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
              {loadError ? <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{loadError}</p> : null}
            </div>

            <div>
              <div className="flex items-end justify-between gap-3">
                <AgainFormGroupTitle className="flex-1">In stock{warehouseName ? ` · ${warehouseName}` : ""}</AgainFormGroupTitle>
                <span className="mb-1 flex shrink-0 items-center gap-3 text-[11px]">
                  {quantity > 0 ? (
                    <button type="button" className="text-[#00a09d] hover:underline" onClick={fillQuantity}>
                      Select {quantity}
                    </button>
                  ) : null}
                  <button type="button" className="text-muted-foreground hover:underline" onClick={() => setPicked([])}>
                    Clear
                  </button>
                </span>
              </div>
              {loading ? (
                <p className="px-1 py-4 text-center text-xs text-muted-foreground">Loading serials…</p>
              ) : visible.length === 0 ? (
                <p className="px-1 py-4 text-center text-xs text-muted-foreground">
                  {units.length === 0 ? `No serial numbers in stock at ${warehouseName || "this location"}.` : "No serial matches."}
                </p>
              ) : (
                <ul className="space-y-1">
                  {visible.map((serial) => {
                    const checked = picked.includes(serial);
                    return (
                      <li key={serial}>
                        <label
                          className={cn(
                            "flex cursor-pointer items-center gap-2 border px-2 py-1.5 font-mono text-[12px]",
                            checked ? "border-[#00a09d] bg-[#00a09d]/10 text-foreground" : "border-border text-muted-foreground",
                          )}
                        >
                          <input type="checkbox" checked={checked} onChange={() => toggle(serial)} />
                          <span className="min-w-0 flex-1 truncate">{serial}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              {partial && !loading ? (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Showing {units.length} of {total}. Type a serial to find the others.
                </p>
              ) : null}
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
