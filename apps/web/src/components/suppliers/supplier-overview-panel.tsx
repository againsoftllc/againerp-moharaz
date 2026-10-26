"use client";

import { useMemo } from "react";
import {
  PartnerKpiGrid,
  PartnerSectionTitle,
  PartnerStatusPill,
  PartnerTabEmpty,
} from "@/components/customers/partner-customer-sections";
import { usePurchaseOrders } from "@/lib/api/use-purchase-orders";
import { PURCHASE_ORDER_STATUS_LABELS, type PurchaseOrder } from "@/lib/mock-data/purchase-orders";
import type { SupplierDetail, SupplierStatus } from "@/lib/mock-data/suppliers";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

const SUPPLIER_STATUS: Record<SupplierStatus, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "success" },
  preferred: { label: "Preferred", tone: "brand" },
  blocked: { label: "Blocked", tone: "danger" },
};

const PO_PAYMENT: Record<NonNullable<PurchaseOrder["paymentStatus"]>, { label: string; tone: Tone }> = {
  not_billed: { label: "Not billed", tone: "neutral" },
  unpaid: { label: "Due", tone: "danger" },
  partial: { label: "Partial", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
};

function poStatusTone(status: PurchaseOrder["status"]): Tone {
  if (status === "completed" || status === "received" || status === "closed") return "success";
  if (status === "cancelled" || status === "rejected") return "danger";
  if (status === "draft") return "neutral";
  if (status === "pending_approval" || status === "partial_received" || status === "partially_received") return "warning";
  return "info";
}

/** One row of the recent-orders list; the figures sit in a table that scrolls sideways inside the drawer instead of squeezing. */
function RecentPurchaseOrders({ supplierId }: { supplierId: string }) {
  const params = useMemo(() => ({ supplier_id: supplierId, per_page: 5 }), [supplierId]);
  const { orders, loading } = usePurchaseOrders(params);

  if (loading && orders.length === 0) {
    return <p className="py-3 text-[12px] text-muted-foreground">Loading purchase orders…</p>;
  }
  if (orders.length === 0) {
    return (
      <PartnerTabEmpty
        title="No purchase orders yet"
        description="Place the first order with this supplier from Purchase › Orders; it shows up here."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[32rem]">
        <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)] gap-2 border-b border-border/60 px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>Order</span>
          <span>Date</span>
          <span>Status</span>
          <span>Payment</span>
          <span className="text-right">Total</span>
        </div>
        <ul className="divide-y divide-border/40">
          {orders.map((order) => {
            const payment = PO_PAYMENT[order.paymentStatus ?? "not_billed"];
            return (
              <li
                key={order.id}
                className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)] items-center gap-2 px-2.5 py-2 text-[13px] hover:bg-muted/30"
              >
                <span className="truncate font-medium text-foreground">{order.number}</span>
                <span className="truncate text-muted-foreground">{formatDate(order.orderDate)}</span>
                <PartnerStatusPill tone={poStatusTone(order.status)} className="justify-self-start">
                  {PURCHASE_ORDER_STATUS_LABELS[order.status] ?? order.status}
                </PartnerStatusPill>
                <PartnerStatusPill tone={payment.tone} className="justify-self-start">
                  {payment.label}
                </PartnerStatusPill>
                <span className="text-right tabular-nums text-foreground">{formatCurrency(order.total)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * Overview tab of the partner drawer when it was opened from the Suppliers list: what matters about a supplier
 * (open orders, spend, lead time, delivery record) instead of the customer metrics (orders, wallet, points).
 * Same grammar as the customer overview: smart stat boxes, titled lists, no outer boxes.
 */
export function SupplierOverviewPanel({
  supplier,
  supplierId,
  loading,
}: {
  supplier: SupplierDetail | null;
  supplierId: string;
  loading: boolean;
}) {
  if (!supplier) {
    return loading ? (
      <p className="py-3 text-[12px] text-muted-foreground">Loading supplier…</p>
    ) : (
      <PartnerTabEmpty
        title="Supplier details are not available"
        description="The supplier record could not be loaded. Close the drawer and open it again."
      />
    );
  }

  const status = SUPPLIER_STATUS[supplier.status] ?? SUPPLIER_STATUS.active;
  const timeline = [...(supplier.timeline ?? [])]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <PartnerStatusPill tone={status.tone}>{status.label}</PartnerStatusPill>
        {supplier.paymentTerms ? <PartnerStatusPill>{supplier.paymentTerms}</PartnerStatusPill> : null}
        {supplier.country ? <PartnerStatusPill>{supplier.country}</PartnerStatusPill> : null}
        <span className="text-[12px] text-muted-foreground">
          {supplier.vendorCode}
          {supplier.buyerName ? ` · Buyer ${supplier.buyerName}` : ""}
        </span>
      </div>

      <PartnerKpiGrid
        items={[
          { label: "Open POs", value: supplier.openPos, sub: "Not yet received" },
          { label: "Total POs", value: supplier.totalPos, sub: "All time" },
          { label: "Spend", value: formatCurrency(supplier.spendYtd), sub: "Year to date" },
          { label: "Lead Time", value: `${supplier.leadTimeDays} d`, sub: "Order to receipt" },
          { label: "On-time Delivery", value: `${supplier.performance.onTimeDeliveryPct}%`, sub: "Of receipts" },
          {
            label: "Quality Rejects",
            value: `${supplier.performance.qualityRejectRatePct}%`,
            sub: "Of received",
            alert: supplier.performance.qualityRejectRatePct > 5,
          },
          { label: "Receipts", value: supplier.receiptCount, sub: "Goods received" },
          { label: "RFQs", value: supplier.rfqCount, sub: "Requested" },
          { label: "Opening Balance", value: formatCurrency(supplier.openingBalance ?? 0), sub: "On books" },
          { label: "Credit Limit", value: formatCurrency(supplier.creditLimit ?? 0), sub: "Max payable" },
        ]}
      />

      <div>
        <PartnerSectionTitle title="Recent Purchase Orders" />
        <RecentPurchaseOrders supplierId={supplierId} />
      </div>

      <div>
        <PartnerSectionTitle title="Recent Activity" />
        {timeline.length === 0 ? (
          <PartnerTabEmpty
            title="No activity yet"
            description="Purchase orders, receipts and notes for this supplier are listed here."
          />
        ) : (
          <ul className="divide-y divide-border/40">
            {timeline.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between gap-3 px-2.5 py-2 text-[13px]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-medium text-foreground">{entry.title}</p>
                    <PartnerStatusPill className={entry.type === "po" || entry.type === "rfq" ? "uppercase" : undefined}>
                      {entry.type}
                    </PartnerStatusPill>
                  </div>
                  {entry.description ? (
                    <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">{entry.description}</p>
                  ) : null}
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">{formatDateTime(entry.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
