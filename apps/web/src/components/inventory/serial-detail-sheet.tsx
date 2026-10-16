"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, MapPin, Package } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { GRID_CHIP_CLASS } from "@/components/shared/grid-chip-badge";
import { cn, formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import {
  fetchSerial,
  serialSourceLabel,
  SERIAL_STATUS_LABEL,
  SERIAL_STATUS_TONE,
  type InventorySerial,
} from "@/lib/api/inventory-serials";

/** One-line answer to "where is this unit right now?" — shared with the grid's mobile cards. */
export function serialWhereabouts(row: InventorySerial): string {
  const warehouse = row.warehouse_name?.trim();
  const customer = row.customer_name?.trim();
  switch (row.status) {
    case "in_stock":
      return warehouse ? `In stock at ${warehouse}` : "In stock · location not set";
    case "sold": {
      const parts = [`Sold to ${customer || "customer"}`];
      if (row.sold_at) parts[0] += ` on ${formatDate(row.sold_at)}`;
      if (row.order_number) parts.push(row.order_number);
      return parts.join(" · ");
    }
    case "in_transit":
      return warehouse ? `In transit · ${warehouse}` : "In transit";
    case "in_service":
      return row.rma_id ? "In service · RMA claim open" : "In service";
    case "replaced":
      return customer ? `Replaced under RMA · was sold to ${customer}` : "Replaced under RMA";
    default:
      return warehouse
        ? `${SERIAL_STATUS_LABEL[row.status]} · last at ${warehouse}`
        : SERIAL_STATUS_LABEL[row.status];
  }
}

type TimelineStep = {
  key: string;
  title: string;
  detail?: string;
  date?: string | null;
  current?: boolean;
  action?: ReactNode;
};

function warrantyHint(iso: string | null | undefined): string {
  if (!iso) return "";
  const until = new Date(iso);
  if (Number.isNaN(until.getTime())) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return until.getTime() < today.getTime() ? "Expired" : "Active";
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border pt-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

/**
 * Trace view for one serial unit: where it is now, and how it got there
 * (received → sold → returned → service), plus notes and warranty.
 */
export function SerialDetailSheet({
  open,
  serial,
  onOpenChange,
  onOpenOrder,
  onOpenCustomer,
}: {
  open: boolean;
  serial: InventorySerial | null;
  onOpenChange: (open: boolean) => void;
  onOpenOrder?: (serial: InventorySerial) => void;
  onOpenCustomer?: (serial: InventorySerial) => void;
}) {
  const router = useRouter();
  const [fresh, setFresh] = useState<InventorySerial | null>(null);

  // Show the grid row at once, then swap in the fresh record — the row may
  // predate a sale/return made since the list loaded. Keyed by id so a stale
  // fetch for the previous serial can never show under the next one.
  useEffect(() => {
    if (!open || !serial) return;
    let cancelled = false;
    fetchSerial(serial.id)
      .then((row) => {
        if (!cancelled) setFresh(row);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, serial]);
  const record = fresh && serial && fresh.id === serial.id ? fresh : serial;

  const canOpenOrder = Boolean(record?.order_id && record.order_kind === "sales" && onOpenOrder);
  const canOpenCustomer = Boolean(record?.customer_id && onOpenCustomer);

  const copySerial = async () => {
    if (!record) return;
    try {
      await navigator.clipboard.writeText(record.serial_number);
      toast.success("Serial copied");
    } catch {
      toast.error("Could not copy — select the serial and copy it manually");
    }
  };

  const steps: TimelineStep[] = [];
  if (record) {
    const supplier = record.supplier_name?.trim();
    const receivedBy = record.received_by_name?.trim();
    const cost = record.purchase_unit_cost != null ? Number(record.purchase_unit_cost) : null;
    steps.push({
      key: "received",
      title: `Received · ${serialSourceLabel(record)}`,
      detail:
        [
          supplier ? `Supplier · ${supplier}` : null,
          receivedBy ? `Received by ${receivedBy}` : null,
          cost != null ? `Cost ${formatCurrency(cost)}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || undefined,
      date: record.received_at ?? record.created_at,
    });
    const wasSold = Boolean(record.sold_at || record.order_number || record.status === "sold");
    if (wasSold) {
      const customer = record.customer_name?.trim();
      const soldBy = record.sold_by_name?.trim();
      const price = record.sold_unit_price != null ? Number(record.sold_unit_price) : null;
      steps.push({
        key: "sold",
        title: customer ? `Sold to ${customer}` : "Sold",
        detail:
          [
            record.order_number ? `Order ${record.order_number}` : null,
            soldBy ? `Sold by ${soldBy}` : null,
            price != null ? `Price ${formatCurrency(price)}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
        date: record.sold_at,
        action: canOpenOrder ? (
          <button
            type="button"
            className="text-[11px] text-primary hover:underline"
            onClick={() => onOpenOrder?.(record)}
          >
            Open order
          </button>
        ) : undefined,
      });
    }
    if (record.returned_at) {
      steps.push({ key: "returned", title: "Returned by customer", date: record.returned_at });
    }
    if (record.rma_id) {
      steps.push({
        key: "rma",
        title: record.status === "replaced" ? "Replaced under RMA" : "Service claim",
        action: (
          <button
            type="button"
            className="text-[11px] text-primary hover:underline"
            onClick={() => router.push(`/rma/${record.rma_id}`)}
          >
            Open claim
          </button>
        ),
      });
    }
    steps.push({
      key: "now",
      title: `Now · ${SERIAL_STATUS_LABEL[record.status]}`,
      detail: serialWhereabouts(record),
      date: record.updated_at,
      current: true,
    });
  }

  const warranty = record?.warranty_expires_on ?? null;
  const hint = warrantyHint(warranty);
  const lastNote = record?.last_note?.trim();
  const notes = record?.notes?.trim();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title="Serial trace"
        className="flex w-[440px] flex-col gap-0 overflow-y-auto"
        data-serial-detail-sheet
      >
        {record ? (
          <>
            <div className="border-b border-border pb-3 pr-8">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Serial</p>
              <div className="mt-0.5 flex items-center gap-2">
                <p className="font-mono text-sm font-semibold" data-serial-number>
                  {record.serial_number}
                </p>
                <Badge
                  variant="outline"
                  className={cn(GRID_CHIP_CLASS, SERIAL_STATUS_TONE[record.status])}
                  title={SERIAL_STATUS_LABEL[record.status]}
                >
                  {SERIAL_STATUS_LABEL[record.status]}
                </Badge>
              </div>
              <div className="mt-2 flex items-center gap-2">
                {record.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={record.thumbnail} alt="" className="h-8 w-8 shrink-0 object-cover" />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-muted">
                    <Package className="h-4 w-4 text-muted-foreground" aria-hidden />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{record.product_name || "—"}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {record.sku || "—"}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-3 py-3 text-xs">
              <div
                className="flex items-start gap-2 border border-border bg-muted/30 px-3 py-2"
                data-serial-whereabouts
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <p className="font-medium">{serialWhereabouts(record)}</p>
              </div>

              <Section title="Timeline">
                <ol className="space-y-0" data-serial-timeline>
                  {steps.map((step, i) => {
                    const last = i === steps.length - 1;
                    return (
                      <li key={step.key} className="relative flex gap-3 pb-3 last:pb-0">
                        <div className="flex w-3 shrink-0 flex-col items-center">
                          <span
                            className={cn(
                              "mt-1 h-2.5 w-2.5 shrink-0 rounded-full border",
                              step.current
                                ? "border-primary bg-primary"
                                : "border-muted-foreground/60 bg-background",
                            )}
                            aria-hidden
                          />
                          {!last ? <span className="mt-1 w-px flex-1 bg-border" aria-hidden /> : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className={cn("font-medium", step.current && "text-primary")}>
                              {step.title}
                            </p>
                            <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
                              {step.date ? formatDateTime(step.date) : "—"}
                            </span>
                          </div>
                          {step.detail ? (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">{step.detail}</p>
                          ) : null}
                          {step.action ? <div className="mt-0.5">{step.action}</div> : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </Section>

              <Section title="Customer">
                {record.customer_name?.trim() ? (
                  canOpenCustomer ? (
                    <button
                      type="button"
                      className="text-left font-medium text-foreground hover:text-primary hover:underline"
                      onClick={() => onOpenCustomer?.(record)}
                    >
                      {record.customer_name}
                    </button>
                  ) : (
                    <p className="font-medium">{record.customer_name}</p>
                  )
                ) : (
                  <p className="text-muted-foreground">—</p>
                )}
              </Section>

              <Section title="Warranty">
                <p className="font-medium">
                  {warranty ? formatDate(warranty) : "—"}
                  {hint ? (
                    <span
                      className={cn(
                        "ml-2 text-[11px]",
                        hint === "Expired"
                          ? "text-red-600 dark:text-red-400"
                          : "text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {hint}
                    </span>
                  ) : null}
                </p>
              </Section>

              <Section title="Notes">
                <p className="whitespace-pre-wrap">{notes || "—"}</p>
                {lastNote && lastNote !== notes ? (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    <span className="uppercase tracking-wide">Latest · </span>
                    {lastNote}
                  </p>
                ) : null}
              </Section>
            </div>

            <div className="flex items-center gap-2 border-t border-border pt-3">
              {canOpenOrder ? (
                <Button
                  size="sm"
                  className="h-7 rounded-none text-xs"
                  onClick={() => onOpenOrder?.(record)}
                >
                  <ExternalLink className="mr-1 h-3 w-3" /> Open order
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                className="h-7 rounded-none text-xs"
                onClick={() => void copySerial()}
              >
                <Copy className="mr-1 h-3 w-3" /> Copy serial
              </Button>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
