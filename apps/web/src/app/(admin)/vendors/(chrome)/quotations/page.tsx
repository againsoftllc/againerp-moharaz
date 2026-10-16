"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/utils";
import {
  convertQuotationToOrder,
  declineNegotiation,
  fetchNegotiations,
  fetchQuotation,
  fetchQuotations,
  reviseQuotation,
  transitionQuotation,
  type VendorNegotiation,
  type VendorQuotation,
  type VendorQuotationItem,
} from "@/lib/api/vendor-quotations";

function statusVariant(status: string) {
  if (status === "accepted") return "success" as const;
  if (status === "rejected" || status === "expired" || status === "cancelled") return "warning" as const;
  if (status === "superseded") return "muted" as const;
  if (status === "negotiation") return "outline" as const;
  return "muted" as const;
}

type EditableLine = VendorQuotationItem & { _key: string };

export default function VendorQuotationsPage() {
  const [rows, setRows] = React.useState<VendorQuotation[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [status, setStatus] = React.useState("all");

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [active, setActive] = React.useState<VendorQuotation | null>(null);
  const [negotiations, setNegotiations] = React.useState<VendorNegotiation[]>([]);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const [editing, setEditing] = React.useState(false);
  const [editLines, setEditLines] = React.useState<EditableLine[]>([]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchQuotations({ status: status === "all" ? undefined : status }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load quotations");
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
    setEditing(false);
    try {
      const [row, negs] = await Promise.all([fetchQuotation(id), fetchNegotiations(id)]);
      setActive(row);
      setNegotiations(negs);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load quotation");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  function startEdit(prefillFromNegotiation?: VendorNegotiation) {
    if (!active) return;
    setEditLines(
      active.items.map((i, idx) => ({
        ...i,
        _key: `${i.id}-${idx}`,
        unit_price: prefillFromNegotiation?.requested_price ?? i.unit_price,
        quantity: prefillFromNegotiation?.requested_quantity ?? i.quantity,
      })),
    );
    setEditing(true);
  }

  async function saveRevision(negotiationId?: string) {
    if (!active) return;
    setBusy(true);
    try {
      const revised = await reviseQuotation(active.id, {
        negotiation_id: negotiationId,
        items: editLines.map((l) => ({
          item_id: l.item_id,
          sku_snapshot: l.sku_snapshot,
          name_snapshot: l.name_snapshot,
          unit_price: Number(l.unit_price),
          quantity: Number(l.quantity),
        })),
      });
      toast.success(`Revision ${revised.quotation_number} (rev ${revised.revision_number}) created`);
      setEditing(false);
      void openDetail(revised.id);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revise quotation");
    } finally {
      setBusy(false);
    }
  }

  async function doTransition(target: string) {
    if (!active) return;
    setBusy(true);
    try {
      const updated = await transitionQuotation(active.id, target);
      setActive(updated);
      toast.success(`Moved to ${target}`);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transition failed");
    } finally {
      setBusy(false);
    }
  }

  async function doConvert() {
    if (!active) return;
    setBusy(true);
    try {
      const order = await convertQuotationToOrder(active.id);
      toast.success(`Order ${order.order_number} created`);
      void openDetail(active.id);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Conversion failed");
    } finally {
      setBusy(false);
    }
  }

  async function doDeclineNegotiation(neg: VendorNegotiation) {
    setBusy(true);
    try {
      await declineNegotiation(neg.id, "The original terms stand.");
      toast.success("Negotiation declined");
      if (active) void openDetail(active.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to decline");
    } finally {
      setBusy(false);
    }
  }

  const canRevise = active && ["sent", "viewed", "negotiation"].includes(active.status);
  const pendingNegotiation = negotiations.find((n) => n.status === "pending");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div>
          <h1 className="text-base font-semibold">Quotations</h1>
          <p className="text-xs text-muted-foreground">Priced offers sent to vendors, with revision history.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[180px]">
            <option value="all">All statuses</option>
            <option value="sent">Sent</option>
            <option value="viewed">Viewed</option>
            <option value="negotiation">Negotiation</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="superseded">Superseded</option>
            <option value="expired">Expired</option>
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
              <TableHead>Quotation</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Rev</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No quotations yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => void openDetail(r.id)}>
                <TableCell className="font-medium">{r.quotation_number}</TableCell>
                <TableCell>{r.vendor_name}</TableCell>
                <TableCell>v{r.revision_number}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                </TableCell>
                <TableCell>{formatMoney(r.grand_total)}</TableCell>
                <TableCell>{formatDate(r.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!activeId} onOpenChange={(open) => !open && setActiveId(null)}>
        <SheetContent side="right" title={active?.quotation_number ?? "Quotation"} className="w-full max-w-lg overflow-y-auto">
          {detailLoading || !active ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="flex items-center justify-between pr-8">
                <h2 className="text-base font-semibold">
                  {active.quotation_number} <span className="text-muted-foreground">rev {active.revision_number}</span>
                </h2>
                <Badge variant={statusVariant(active.status)}>{active.status}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{active.vendor_name}</p>

              {active.superseded_by_id && (
                <div className="mt-3 border border-input bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Superseded by a newer revision of this quotation.
                </div>
              )}

              {!editing ? (
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
                  <div className="mt-3 flex justify-between border-t pt-3 text-sm font-medium">
                    <span>Grand total</span>
                    <span>{formatMoney(active.grand_total)}</span>
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {editLines.map((line, idx) => (
                    <div key={line._key} className="grid grid-cols-[1fr_80px_110px] items-center gap-2 border border-input p-2">
                      <div className="text-xs">
                        <div className="font-medium">{line.sku_snapshot}</div>
                        <div className="text-muted-foreground">{line.name_snapshot}</div>
                      </div>
                      <Input
                        type="number"
                        value={line.quantity}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setEditLines((prev) => prev.map((l, i) => (i === idx ? { ...l, quantity: v } : l)));
                        }}
                      />
                      <Input
                        type="number"
                        value={line.unit_price}
                        onChange={(e) => {
                          const v = e.target.value;
                          setEditLines((prev) => prev.map((l, i) => (i === idx ? { ...l, unit_price: v } : l)));
                        }}
                      />
                    </div>
                  ))}
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={busy}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={() => void saveRevision(pendingNegotiation?.id)} disabled={busy}>
                      Save as new revision
                    </Button>
                  </div>
                </div>
              )}

              {negotiations.length > 0 && (
                <div className="mt-4 border-t pt-3">
                  <h3 className="text-sm font-semibold">Negotiation requests</h3>
                  <div className="mt-2 space-y-2">
                    {negotiations.map((n) => (
                      <div key={n.id} className="border border-input p-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium capitalize">{n.request_type} request</span>
                          <Badge variant={n.status === "pending" ? "outline" : n.status === "resolved" ? "success" : "muted"}>
                            {n.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">{n.message}</p>
                        {n.requested_price && <p>Requested price: {formatMoney(n.requested_price)}</p>}
                        {n.status === "pending" && (
                          <div className="mt-2 flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => startEdit(n)} disabled={busy}>
                              Respond with revision
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground"
                              onClick={() => void doDeclineNegotiation(n)}
                              disabled={busy}
                            >
                              Decline
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!editing && (
                <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                  {active.status === "accepted" && (
                    <Button size="sm" onClick={() => void doConvert()} disabled={busy}>
                      Convert to Final Order
                    </Button>
                  )}
                  {canRevise && (
                    <Button size="sm" variant="outline" onClick={() => startEdit()} disabled={busy}>
                      Revise
                    </Button>
                  )}
                  {!["accepted", "rejected", "expired", "cancelled", "superseded"].includes(active.status) && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => void doTransition("cancelled")} disabled={busy}>
                        Cancel
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void doTransition("expired")} disabled={busy}>
                        Mark expired
                      </Button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
