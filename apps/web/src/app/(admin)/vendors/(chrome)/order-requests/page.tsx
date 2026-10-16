"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { fetchVendor } from "@/lib/api/vendors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatMoney } from "@/lib/utils";
import {
  createQuotationFromOrderRequest,
  fetchOrderRequest,
  fetchOrderRequests,
  transitionOrderRequest,
  updateOrderRequest,
  type VendorOrderRequestAdmin,
} from "@/lib/api/vendor-orders";

const ORDER_REQUEST_TRANSITIONS: Record<string, string[]> = {
  submitted: ["under_review", "cancelled"],
  under_review: ["revision_required", "approved", "rejected"],
  revision_required: ["cancelled"],
  quotation_created: ["negotiation", "approved", "rejected"],
  negotiation: ["approved", "rejected"],
  approved: ["converted_to_order"],
};

function statusVariant(status: string) {
  if (status === "approved" || status === "converted_to_order") return "success" as const;
  if (status === "rejected" || status === "cancelled") return "warning" as const;
  if (status === "revision_required") return "outline" as const;
  return "muted" as const;
}

export default function VendorOrderRequestsPage() {
  const router = useRouter();
  const [rows, setRows] = React.useState<VendorOrderRequestAdmin[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [status, setStatus] = React.useState("all");
  // Deep link from the vendor list / drawer: /vendors/order-requests?vendor=<id>
  const [vendorFilter, setVendorFilter] = React.useState<string | null>(null);
  const [vendorFilterLabel, setVendorFilterLabel] = React.useState<string | null>(null);
  React.useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("vendor");
    if (!id) return;
    const t = setTimeout(() => setVendorFilter(id), 0);
    void fetchVendor(id)
      .then((v) => setVendorFilterLabel(v.display_name || v.company_name))
      .catch(() => setVendorFilterLabel(null));
    return () => clearTimeout(t);
  }, []);

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [active, setActive] = React.useState<VendorOrderRequestAdmin | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [internalNote, setInternalNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchOrderRequests({ status: status === "all" ? undefined : status }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load order requests");
    } finally {
      setLoading(false);
    }
  }, [status]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const openDetail = React.useCallback(async (id: string) => {
    setActiveId(id);
    setDetailLoading(true);
    try {
      const row = await fetchOrderRequest(id);
      setActive(row);
      setInternalNote(row.internal_note ?? "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load order request");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  async function saveNote() {
    if (!active) return;
    setBusy(true);
    try {
      const updated = await updateOrderRequest(active.id, { internal_note: internalNote });
      setActive(updated);
      toast.success("Internal note saved");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setBusy(false);
    }
  }

  async function doTransition(target: string) {
    if (!active) return;
    setBusy(true);
    try {
      const updated = await transitionOrderRequest(active.id, target);
      setActive(updated);
      toast.success(`Moved to ${target.replace(/_/g, " ")}`);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transition failed");
    } finally {
      setBusy(false);
    }
  }

  async function createQuotation() {
    if (!active) return;
    setBusy(true);
    try {
      const quotation = await createQuotationFromOrderRequest(active.id);
      toast.success(`Quotation ${quotation.quotation_number} created`);
      void openDetail(active.id);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create quotation");
    } finally {
      setBusy(false);
    }
  }

  const visibleRows = vendorFilter ? rows.filter((r) => r.vendor_id === vendorFilter) : rows;
  const vendorFilterName = vendorFilter
    ? (vendorFilterLabel ?? rows.find((r) => r.vendor_id === vendorFilter)?.vendor_name ?? "selected vendor")
    : null;

  const nextStatuses = active ? ORDER_REQUEST_TRANSITIONS[active.status] ?? [] : [];
  const canCreateQuotation = active && ["under_review", "negotiation"].includes(active.status);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div>
          <h1 className="text-base font-semibold">Order Requests</h1>
          <p className="text-xs text-muted-foreground">
            Vendor cart submissions awaiting review.
            {vendorFilter ? (
              <>
                {" "}
                · Showing <span className="font-medium text-foreground">{vendorFilterName}</span>{" "}
                <button
                  type="button"
                  className="underline hover:text-foreground"
                  onClick={() => {
                    setVendorFilter(null);
                    router.replace("/vendors/order-requests");
                  }}
                >
                  show all
                </button>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => router.push("/vendors/order-requests/new")}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            New
          </Button>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[180px]">
            <option value="all">All statuses</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under review</option>
            <option value="revision_required">Revision required</option>
            <option value="quotation_created">Quotation created</option>
            <option value="negotiation">Negotiation</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="converted_to_order">Converted to order</option>
            <option value="cancelled">Cancelled</option>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Request</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Credit</TableHead>
              <TableHead>Submitted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No order requests yet.
                </TableCell>
              </TableRow>
            )}
            {visibleRows.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => void openDetail(r.id)}>
                <TableCell className="font-medium">{r.order_request_number}</TableCell>
                <TableCell>{r.vendor_name}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(r.status)}>{r.status.replace(/_/g, " ")}</Badge>
                </TableCell>
                <TableCell>{formatMoney(r.grand_total)}</TableCell>
                <TableCell>{r.requires_credit_approval ? <Badge variant="warning">Over limit</Badge> : "—"}</TableCell>
                <TableCell>{formatDate(r.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!activeId} onOpenChange={(open) => !open && setActiveId(null)}>
        <SheetContent side="right" title={active?.order_request_number ?? "Order request"} className="w-full max-w-lg overflow-y-auto">
          {detailLoading || !active ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="flex items-center justify-between pr-8">
                <h2 className="text-base font-semibold">{active.order_request_number}</h2>
                <Badge variant={statusVariant(active.status)}>{active.status.replace(/_/g, " ")}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{active.vendor_name}</p>

              {active.requires_credit_approval && (
                <div className="mt-3 border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  This order would exceed the vendor&apos;s credit limit — review before approving.
                </div>
              )}

              <div className="mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Line total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {active.items.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell>
                          <div className="font-medium">{i.sku_snapshot}</div>
                          <div className="text-muted-foreground">{i.name_snapshot}</div>
                        </TableCell>
                        <TableCell>{i.quantity}</TableCell>
                        <TableCell>{formatMoney(i.unit_price)}</TableCell>
                        <TableCell>{formatMoney(i.line_total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-3 space-y-1 border-t pt-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatMoney(active.subtotal)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Grand total</span>
                  <span>{formatMoney(active.grand_total)}</span>
                </div>
              </div>

              {active.vendor_note && (
                <div className="mt-3">
                  <Label>Vendor note</Label>
                  <p className="text-sm">{active.vendor_note}</p>
                </div>
              )}

              <div className="mt-3">
                <Label htmlFor="internal_note">Internal note (staff only)</Label>
                <Textarea
                  id="internal_note"
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  rows={3}
                />
                <Button size="sm" variant="outline" className="mt-2" onClick={() => void saveNote()} disabled={busy}>
                  Save note
                </Button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                {canCreateQuotation && (
                  <Button size="sm" onClick={() => void createQuotation()} disabled={busy}>
                    Create Quotation
                  </Button>
                )}
                {nextStatuses.map((s) => (
                  <Button key={s} size="sm" variant="outline" onClick={() => void doTransition(s)} disabled={busy}>
                    {s.replace(/_/g, " ")}
                  </Button>
                ))}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
