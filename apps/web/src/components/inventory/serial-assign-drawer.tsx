"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { assignSerialsToOrder, type SerialBatchResponse } from "@/lib/api/inventory-serials";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Bind in-stock units to the order they went out on. Stamps warranty expiry
 * from the product's warranty text and the order date.
 */
export function SerialAssignDrawer({
  open,
  onOpenChange,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssigned?: () => void;
}) {
  const [orderNumber, setOrderNumber] = useState("");
  const [serialText, setSerialText] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<SerialBatchResponse | null>(null);

  const serialCount = serialText
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean).length;

  const submit = async () => {
    if (!orderNumber.trim() || serialCount === 0) return;
    setSaving(true);
    try {
      const serials = serialText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await assignSerialsToOrder({
        serial_numbers: serials,
        order_number: orderNumber.trim(),
      });
      setResult(res);
      if (res.created > 0) {
        toast.success(`${res.created} unit${res.created === 1 ? "" : "s"} marked sold`);
        onAssigned?.();
      }
      if (res.rejected > 0) {
        toast.message(`${res.rejected} could not be assigned — see details below`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Assignment failed");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setOrderNumber("");
    setSerialText("");
    setResult(null);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <SheetContent side="right" className="flex w-[420px] flex-col gap-0 overflow-y-auto">
        <div className="border-b border-border pb-3">
          <h3 className="text-sm font-semibold">Assign to an order</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Only units still in stock can be assigned — this marks them sold.
          </p>
        </div>

        <div className="flex-1 space-y-4 py-4">
          <Field label="Order number">
            <Input
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="ORD-1001"
              className="rounded-none"
            />
          </Field>

          <Field
            label="Serial numbers"
            hint={`One per line or comma-separated. ${serialCount} unit${serialCount === 1 ? "" : "s"}.`}
          >
            <Textarea
              value={serialText}
              onChange={(e) => setSerialText(e.target.value)}
              rows={6}
              placeholder={"SN-000123\nSN-000124"}
              className="rounded-none font-mono text-[12px]"
            />
          </Field>

          {result && (
            <div className="border border-border">
              <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px]">
                <span>{result.created} marked sold</span>
                <span className="text-muted-foreground">·</span>
                <span>{result.rejected} rejected</span>
              </div>
              <div className="max-h-40 divide-y divide-border overflow-y-auto">
                {result.data.map((r) => (
                  <div
                    key={r.serial_number}
                    className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px]"
                  >
                    <span className="truncate font-mono">{r.serial_number}</span>
                    <span className="flex items-center gap-1.5">
                      {r.detail && <span className="text-muted-foreground">{r.detail}</span>}
                      <Badge
                        variant="outline"
                        className={
                          r.outcome === "created"
                            ? "rounded-none border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400"
                            : "rounded-none border-red-500/30 bg-red-500/10 text-[10px] text-red-600 dark:text-red-400"
                        }
                      >
                        {r.outcome === "created" ? "sold" : r.outcome}
                      </Badge>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-border pt-3">
          <Button
            className="rounded-none"
            disabled={!orderNumber.trim() || serialCount === 0 || saving}
            onClick={submit}
          >
            {saving ? "Assigning…" : `Assign ${serialCount || ""}`.trim()}
          </Button>
          <Button variant="outline" className="rounded-none" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
