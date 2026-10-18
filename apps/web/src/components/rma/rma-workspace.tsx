"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  Factory,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import {
  fetchRmaHistory,
  fetchRmaTicket,
  recheckWarranty,
  removeRmaCharge,
  changeRmaStatus,
  scrapRmaTicket,
  RMA_STATUS_LABEL,
  RMA_STATUS_TONE,
  RESOLUTION_LABEL,
  WARRANTY_LABEL,
  WARRANTY_TONE,
  type RmaHistoryEntry,
  type RmaTicket,
} from "@/lib/api/rma";
import {
  BillDrawer,
  ChargeDrawer,
  InspectionDrawer,
  RefundDrawer,
  ReplacementDrawer,
  ResolveDrawer,
  RestockDrawer,
  ServiceFromRmaDrawer,
  StatusDrawer,
  SupplierJobDrawer,
  WarrantyDrawer,
} from "@/components/rma/rma-drawers";
import { cn, formatCurrency } from "@/lib/utils";

function Row({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex gap-3 border-b border-border py-1.5 last:border-b-0">
      <span className="w-[140px] shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words text-xs">{value || "—"}</span>
    </div>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
        <h3 className="text-xs font-semibold">{title}</h3>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div className="px-3 py-2">{children}</div>
    </section>
  );
}

export function RmaWorkspace({
  ticketId,
  embedded = false,
  onChanged,
}: {
  ticketId: string;
  embedded?: boolean;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const canWrite = useAdminCanWrite();
  const [ticket, setTicket] = useState<RmaTicket | null>(null);
  const [history, setHistory] = useState<RmaHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusOpen, setStatusOpen] = useState(false);
  const [warrantyOpen, setWarrantyOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [restockOpen, setRestockOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, h] = await Promise.all([
        fetchRmaTicket(ticketId),
        fetchRmaHistory(ticketId).catch(() => []),
      ]);
      setTicket(t);
      setHistory(h);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the claim");
      setTicket(null);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    void load();
    onChanged?.();
  }, [load, onChanged]);

  const dropCharge = async (chargeId: string) => {
    try {
      await removeRmaCharge(ticketId, chargeId);
      toast.success("Charge removed");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the charge");
    }
  };

  const recheck = async () => {
    try {
      await recheckWarranty(ticketId);
      toast.success("Warranty rechecked from the order");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Recheck failed");
    }
  };

  const runStatus = async (status: Parameters<typeof changeRmaStatus>[1], note: string) => {
    try {
      await changeRmaStatus(ticketId, status, note);
      toast.success(note);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the claim");
    }
  };

  const scrap = async () => {
    try {
      await scrapRmaTicket(ticketId);
      toast.success("Unit marked scrap");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not scrap the unit");
    }
  };

  if (loading && !ticket) {
    return <div className="p-4 text-sm text-muted-foreground">Loading claim…</div>;
  }
  if (!ticket) {
    return (
      <div className="p-4">
        <p className="text-sm font-medium">Claim not found</p>
        {!embedded && (
          <Button size="sm" className="mt-3 rounded-none" onClick={() => router.push("/inventory/rma")}>
            Back to claims
          </Button>
        )}
      </div>
    );
  }

  const billed = ticket.bill_status === "billed";
  const closed = ticket.status === "closed" || ticket.status === "cancelled" || ticket.status === "rejected";
  const notInHouse =
    ticket.status === "draft" ||
    ticket.status === "pending_approval" ||
    ticket.status === "approved" ||
    ticket.status === "awaiting_return";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border">
        <div className={cn("flex flex-wrap items-center gap-2 px-3 py-2", embedded && "pr-10")}>
          {!embedded && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 rounded-none px-1.5"
              onClick={() => router.push("/inventory/rma")}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
          )}
          <div className="min-w-0">
            <h1 className="truncate font-mono text-sm font-semibold">{ticket.rma_number}</h1>
            <p className="truncate text-[11px] text-muted-foreground">
              {ticket.product_name || ticket.sku} · {ticket.customer_name}
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn("rounded-none text-[10px]", RMA_STATUS_TONE[ticket.status])}
          >
            {RMA_STATUS_LABEL[ticket.status]}
          </Badge>
          <Badge
            variant="outline"
            className={cn("rounded-none text-[10px]", WARRANTY_TONE[ticket.warranty_status])}
          >
            {WARRANTY_LABEL[ticket.warranty_status]}
          </Badge>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="h-[26px] w-[26px] rounded-none"
              aria-label="Refresh"
              onClick={() => void load()}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
            {canWrite && !closed && (
              <>
                {ticket.status === "pending_approval" && (
                  <Button
                    size="sm"
                    className="rounded-none"
                    onClick={() => void runStatus("approved", "Approved")}
                  >
                    Approve
                  </Button>
                )}
                {(ticket.status === "approved" || ticket.status === "awaiting_return") && (
                  <Button
                    size="sm"
                    className="rounded-none"
                    onClick={() => void runStatus("received", "Unit received into holding")}
                  >
                    Receive
                  </Button>
                )}
                {!notInHouse && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-none"
                    onClick={() => setInspectOpen(true)}
                  >
                    Inspect
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-none"
                  onClick={() => setResolveOpen(true)}
                >
                  Resolution
                </Button>
                {!ticket.service_job_id && !notInHouse && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-none"
                    onClick={() => setServiceOpen(true)}
                  >
                    Create service job
                  </Button>
                )}
                {ticket.service_job_id ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-none"
                    onClick={() => router.push(`/service/jobs?job=${ticket.service_job_id}`)}
                  >
                    Open job card
                  </Button>
                ) : null}
                {ticket.order_id && !ticket.refund_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-none"
                    onClick={() => setRefundOpen(true)}
                  >
                    Refund
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-none"
                  onClick={() => setReplaceOpen(true)}
                >
                  Replacement
                </Button>
                {ticket.item_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-none"
                    onClick={() => setRestockOpen(true)}
                  >
                    Restock
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-none"
                  onClick={() => void scrap()}
                >
                  Scrap
                </Button>
                <Button size="sm" className="rounded-none" onClick={() => setStatusOpen(true)}>
                  Move on
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Unit">
            <Row label="SKU" value={ticket.sku} />
            <Row label="Product" value={ticket.product_name} />
            <Row label="Serial" value={ticket.serial_number} />
            <Row label="Quantity" value={ticket.quantity} />
            <Row label="Received" value={ticket.received_at.slice(0, 10)} />
            <Row label="Received by" value={ticket.received_by} />
            <Row label="Accessories" value={ticket.accessories} />
            <Row label="Condition" value={ticket.condition_notes} />
          </Panel>

          <Panel title="Customer & sale">
            <Row label="Customer" value={ticket.customer_name} />
            <Row label="Phone" value={ticket.customer_phone} />
            <Row label="Email" value={ticket.customer_email} />
            <Row label="Order" value={ticket.order_number} />
            <Row label="Purchased" value={ticket.purchased_at} />
            <Row label="Priority" value={ticket.priority} />
            <Row label="Assigned to" value={ticket.assigned_to} />
          </Panel>
        </div>

        <Panel
          title="Warranty"
          action={
            canWrite && (
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 rounded-none text-[11px]"
                  onClick={() => void recheck()}
                >
                  Recheck
                </Button>
                <Button
                  size="sm"
                  className="h-6 rounded-none text-[11px]"
                  onClick={() => setWarrantyOpen(true)}
                >
                  <ShieldCheck className="mr-1 h-3 w-3" /> Set by hand
                </Button>
              </div>
            )
          }
        >
          <Row label="Verdict" value={WARRANTY_LABEL[ticket.warranty_status]} />
          <Row
            label="Decided by"
            value={ticket.warranty_source === "manual" ? "An agent, by hand" : "Order + product terms"}
          />
          <Row label="Expires" value={ticket.warranty_expires_on} />
          <Row label="Note" value={ticket.warranty_note} />
        </Panel>

        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Inspection">
            <Row label="Physical" value={ticket.physical_condition} />
            <Row label="Functional" value={ticket.functional_result} />
            <Row label="QC" value={ticket.qc_result} />
            <Row label="Inspector" value={ticket.inspected_by} />
            <Row label="Inspected" value={ticket.inspected_at?.slice(0, 16).replace("T", " ")} />
            <Row label="Notes" value={ticket.inspection_notes} />
          </Panel>
          <Panel title="Resolution">
            <Row
              label="Type"
              value={
                ticket.resolution_type
                  ? RESOLUTION_LABEL[ticket.resolution_type] ?? ticket.resolution_type
                  : null
              }
            />
            <Row label="Status" value={ticket.resolution_status} />
            <Row label="Service job" value={ticket.service_job_id} />
            <Row
              label="Refund"
              value={
                ticket.refund_id
                  ? formatCurrency(Number(ticket.refund_amount ?? 0))
                  : null
              }
            />
            <Row label="Replacement SKU" value={ticket.replacement_sku} />
            <Row label="Courier" value={ticket.courier} />
            <Row label="Tracking" value={ticket.tracking_number} />
          </Panel>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Fault">
            <Row label="Reported" value={ticket.fault_reported} />
            <Row label="Diagnosed" value={ticket.fault_diagnosed} />
            <Row label="Resolution" value={ticket.resolution_type} />
          </Panel>

          <Panel
            title="Supplier job"
            action={
              canWrite && (
                <Button
                  size="sm"
                  className="h-6 rounded-none text-[11px]"
                  onClick={() => setSupplierOpen(true)}
                >
                  <Factory className="mr-1 h-3 w-3" />
                  {ticket.supplier_job ? "Update" : "Send out"}
                </Button>
              )
            }
          >
            {ticket.supplier_job ? (
              <>
                <Row label="Supplier" value={ticket.supplier_job.supplier_name} />
                <Row label="Job status" value={ticket.supplier_job.status} />
                <Row label="Their ref" value={ticket.supplier_job.supplier_reference} />
                <Row label="Dispatched" value={ticket.supplier_job.dispatched_at} />
                <Row label="Expected back" value={ticket.supplier_job.expected_return_date} />
                <Row label="Returned" value={ticket.supplier_job.returned_at} />
                <Row
                  label="Supplier cost"
                  value={formatCurrency(Number(ticket.supplier_job.cost))}
                />
                <Row label="Notes" value={ticket.supplier_job.notes} />
              </>
            ) : (
              <p className="py-3 text-xs text-muted-foreground">
                Not sent to a supplier. Record the job here before moving the claim to
                &ldquo;sent to supplier&rdquo;.
              </p>
            )}
          </Panel>
        </div>

        <section className="border border-border">
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
            <h3 className="text-xs font-semibold">Charges</h3>
            <span className="text-[11px] text-muted-foreground">
              {formatCurrency(Number(ticket.total))} total
              {billed && " · billed"}
            </span>
            {canWrite && !billed && (
              <Button
                size="sm"
                className="ml-auto h-6 rounded-none text-[11px]"
                onClick={() => setChargeOpen(true)}
              >
                <Plus className="mr-1 h-3 w-3" /> Add charge
              </Button>
            )}
            {canWrite && !billed && Number(ticket.total) > 0 && (
              <Button
                size="sm"
                variant="outline"
                className={cn("h-6 rounded-none text-[11px]", !canWrite && "hidden")}
                onClick={() => setBillOpen(true)}
              >
                <Banknote className="mr-1 h-3 w-3" /> Bill customer
              </Button>
            )}
          </div>

          {ticket.charges.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              No parts or labour recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-xs">
                <thead className="border-b border-border text-left text-[11px] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Type</th>
                    <th className="px-3 py-1.5 font-medium">Description</th>
                    <th className="px-3 py-1.5 text-right font-medium">Qty</th>
                    <th className="px-3 py-1.5 text-right font-medium">Unit</th>
                    <th className="px-3 py-1.5 text-right font-medium">Tax</th>
                    <th className="px-3 py-1.5 text-right font-medium">Total</th>
                    <th className="px-3 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {ticket.charges.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-1.5 capitalize">{c.kind}</td>
                      <td className="px-3 py-1.5">
                        {c.description}
                        {c.sku && (
                          <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                            {c.sku}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{Number(c.quantity)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatCurrency(Number(c.unit_price))}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {Number(c.tax_rate) > 0 ? `${Number(c.tax_rate)}%` : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatCurrency(Number(c.line_total))}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {canWrite && !billed && (
                          <button
                            type="button"
                            aria-label="Remove charge"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => void dropCharge(c.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-border">
                  <tr>
                    <td colSpan={5} className="px-3 py-1.5 text-right text-muted-foreground">
                      Parts {formatCurrency(Number(ticket.parts_total))} · Labour{" "}
                      {formatCurrency(Number(ticket.labour_total))} · Tax{" "}
                      {formatCurrency(Number(ticket.tax_total))}
                    </td>
                    <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                      {formatCurrency(Number(ticket.total))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        <Panel title="History">
          {history.length === 0 ? (
            <p className="py-3 text-xs text-muted-foreground">No stage changes recorded.</p>
          ) : (
            <ol className="space-y-1.5 py-1">
              {history.map((h) => (
                <li key={h.id} className="flex gap-3 text-xs">
                  <span className="w-[130px] shrink-0 text-muted-foreground">
                    {h.created_at.slice(0, 16).replace("T", " ")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-muted-foreground">
                      {h.from_status ? RMA_STATUS_LABEL[h.from_status as never] : "Opened"} →{" "}
                    </span>
                    <span className="font-medium">
                      {RMA_STATUS_LABEL[h.to_status as never] ?? h.to_status}
                    </span>
                    {h.note && <span className="ml-2 text-muted-foreground">{h.note}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <StatusDrawer
        key={`status:${statusOpen}:${ticket.status}`}
        open={statusOpen}
        onOpenChange={setStatusOpen}
        ticket={ticket}
        onDone={refresh}
      />
      <WarrantyDrawer
        key={`warranty:${warrantyOpen}`}
        open={warrantyOpen}
        onOpenChange={setWarrantyOpen}
        ticket={ticket}
        onDone={refresh}
      />
      <ChargeDrawer
        key={`charge:${chargeOpen}`}
        open={chargeOpen}
        onOpenChange={setChargeOpen}
        ticket={ticket}
        onDone={refresh}
      />
      <SupplierJobDrawer
        key={`supplier:${supplierOpen}`}
        open={supplierOpen}
        onOpenChange={setSupplierOpen}
        ticket={ticket}
        onDone={refresh}
      />
      <BillDrawer
        key={`bill:${billOpen}`}
        open={billOpen}
        onOpenChange={setBillOpen}
        ticket={ticket}
        onDone={refresh}
      />
      <InspectionDrawer
        key={`inspect:${inspectOpen}`}
        open={inspectOpen}
        onOpenChange={setInspectOpen}
        ticket={ticket}
        onDone={refresh}
      />
      <ResolveDrawer
        key={`resolve:${resolveOpen}`}
        open={resolveOpen}
        onOpenChange={setResolveOpen}
        ticket={ticket}
        onDone={refresh}
      />
      <ServiceFromRmaDrawer
        key={`service:${serviceOpen}`}
        open={serviceOpen}
        onOpenChange={setServiceOpen}
        ticket={ticket}
        onDone={refresh}
      />
      <RefundDrawer
        key={`refund:${refundOpen}`}
        open={refundOpen}
        onOpenChange={setRefundOpen}
        ticket={ticket}
        onDone={refresh}
      />
      <ReplacementDrawer
        key={`replace:${replaceOpen}`}
        open={replaceOpen}
        onOpenChange={setReplaceOpen}
        ticket={ticket}
        onDone={refresh}
      />
      <RestockDrawer
        key={`restock:${restockOpen}`}
        open={restockOpen}
        onOpenChange={setRestockOpen}
        ticket={ticket}
        onDone={refresh}
      />
    </div>
  );
}
