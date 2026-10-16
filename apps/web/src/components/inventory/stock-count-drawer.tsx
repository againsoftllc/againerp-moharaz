"use client";

import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { GRID_CHIP_CLASS } from "@/components/shared/grid-chip-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  cancelStockCount,
  fetchStockCount,
  postStockCount,
  updateStockCountLine,
  type ApiStockCount,
} from "@/lib/api/inventory";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  countId: string | null;
  canWrite: boolean;
  onChanged?: () => void;
};

export function StockCountDrawer({ open, onOpenChange, countId, canWrite, onChanged }: Props) {
  const [count, setCount] = React.useState<ApiStockCount | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [savingLineId, setSavingLineId] = React.useState<string | null>(null);
  const [posting, setPosting] = React.useState(false);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [serialDrafts, setSerialDrafts] = React.useState<Record<string, string>>({});

  const load = React.useCallback(async () => {
    if (!countId) return;
    setLoading(true);
    try {
      const row = await fetchStockCount(countId);
      setCount(row);
      setDrafts(
        Object.fromEntries(row.lines.map((l) => [l.id, l.counted_qty === null ? "" : String(l.counted_qty)])),
      );
      setSerialDrafts(
        Object.fromEntries(
          row.lines.map((l) => [
            l.id,
            (l.counted_serials?.length ? l.counted_serials : l.expected_serials ?? []).join("\n"),
          ]),
        ),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load count");
    } finally {
      setLoading(false);
    }
  }, [countId]);

  React.useEffect(() => {
    if (open && countId) void load();
  }, [open, countId, load]);

  const isDraft = count?.status === "draft";

  async function commitLine(lineId: string) {
    if (!count) return;
    const line = count.lines.find((l) => l.id === lineId);
    if (!line) return;
    if (line.tracking_type === "serial") {
      const serials = (serialDrafts[lineId] ?? "")
        .split(/[\n,]+/)
        .map((value) => value.trim())
        .filter(Boolean);
      setSavingLineId(lineId);
      try {
        const updated = await updateStockCountLine(count.id, lineId, serials.length, serials);
        setCount(updated);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save count");
      } finally {
        setSavingLineId(null);
      }
      return;
    }
    const raw = drafts[lineId];
    const value = raw.trim() === "" ? null : Number.parseInt(raw, 10);
    if (value !== null && (!Number.isFinite(value) || value < 0)) return;
    if (line.counted_qty === value) return;
    setSavingLineId(lineId);
    try {
      const updated = await updateStockCountLine(count.id, lineId, value);
      setCount(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save count");
    } finally {
      setSavingLineId(null);
    }
  }

  async function handlePost() {
    if (!count) return;
    if (!confirm(`Post ${count.count_number}? This writes stock adjustments for every counted line with a variance.`)) return;
    setPosting(true);
    try {
      const posted = await postStockCount(count.id);
      setCount(posted);
      toast.success(`${posted.count_number} posted`);
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to post count");
    } finally {
      setPosting(false);
    }
  }

  async function handleCancel() {
    if (!count) return;
    if (!confirm(`Cancel ${count.count_number}? This discards the count without touching stock.`)) return;
    try {
      const cancelled = await cancelStockCount(count.id);
      setCount(cancelled);
      toast.success(`${cancelled.count_number} cancelled`);
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel count");
    }
  }

  const variances = count?.lines.filter((l) => l.variance !== null && l.variance !== 0).length ?? 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title={count?.count_number ?? "Stock count"}
        resizable
        closeButton="inside"
        className="w-[480px] min-w-[160px] max-w-[720px] overflow-y-auto rounded-none"
      >
        <div className="flex items-start justify-between gap-2 pr-8">
          <div>
            <h2 className="text-base font-semibold">{count?.count_number ?? "Stock count"}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{count?.warehouse_name}</p>
          </div>
          {count && (
            <Badge
              variant={count.status === "cancelled" ? "muted" : "outline"}
              className={cn(
                "shrink-0 capitalize",
                GRID_CHIP_CLASS,
                count.status === "draft" &&
                  "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
                count.status === "completed" &&
                  "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
              )}
            >
              {count.status}
            </Badge>
          )}
        </div>

        {loading || !count ? (
          <p className="mt-6 text-xs text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
              <span>{count.lines.length} lines</span>
              <span>{variances} with variance</span>
            </div>

            <div className="mt-3 overflow-hidden rounded-none border border-border">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 bg-muted/50 text-left text-[11px] font-medium text-muted-foreground">
                  <tr>
                    <th className="px-2.5 py-1.5">SKU</th>
                    <th className="px-2.5 py-1.5">Name</th>
                    <th className="px-2.5 py-1.5 text-right">Expected</th>
                    <th className="px-2.5 py-1.5 text-right">Counted</th>
                    <th className="px-2.5 py-1.5 text-right">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {count.lines.map((line) => (
                    <React.Fragment key={line.id}>
                    <tr className="border-t border-border/60">
                      <td className="px-2.5 py-1.5 font-mono">{line.sku}</td>
                      <td className="px-2.5 py-1.5">
                        {line.name}
                        {line.tracking_type === "serial" ? (
                          <span className="ml-1 text-[10px] text-muted-foreground">serial</span>
                        ) : null}
                      </td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums text-muted-foreground">
                        {line.expected_qty}
                      </td>
                      <td className="px-2.5 py-1.5 text-right">
                        {line.tracking_type === "serial" ? (
                          <span className="tabular-nums">{line.counted_qty ?? "—"}</span>
                        ) : (
                        <Input
                          type="number"
                          min={0}
                          value={drafts[line.id] ?? ""}
                          onChange={(e) => setDrafts((d) => ({ ...d, [line.id]: e.target.value }))}
                          onBlur={() => void commitLine(line.id)}
                          disabled={!canWrite || !isDraft || savingLineId === line.id}
                          className="h-6 w-20 rounded-none text-right"
                        />
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-2.5 py-1.5 text-right tabular-nums font-medium",
                          line.variance !== null && line.variance !== 0
                            ? line.variance > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-600 dark:text-red-400"
                            : "text-muted-foreground",
                        )}
                      >
                        {line.variance === null ? "—" : line.variance > 0 ? `+${line.variance}` : line.variance}
                      </td>
                    </tr>
                    {line.tracking_type === "serial" ? (
                      <tr className="border-t border-border/40 bg-muted/20">
                        <td colSpan={5} className="px-2.5 py-2">
                          <p className="mb-1 text-[10px] text-muted-foreground">
                            Counted serials (one per line). Expected: {(line.expected_serials ?? []).join(", ") || "none"}
                          </p>
                          <textarea
                            value={serialDrafts[line.id] ?? ""}
                            onChange={(e) => setSerialDrafts((d) => ({ ...d, [line.id]: e.target.value }))}
                            onBlur={() => void commitLine(line.id)}
                            disabled={!canWrite || !isDraft || savingLineId === line.id}
                            rows={3}
                            className="w-full rounded-none border border-border bg-background p-1.5 font-mono text-[11px]"
                          />
                        </td>
                      </tr>
                    ) : null}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {isDraft && canWrite && (
              <div className="mt-5 flex justify-end gap-2 border-t border-input pt-4">
                <Button variant="outline" size="sm" onClick={() => void handleCancel()}>
                  Cancel count
                </Button>
                <Button size="sm" onClick={() => void handlePost()} disabled={posting}>
                  {posting ? "Posting…" : "Post count"}
                </Button>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
