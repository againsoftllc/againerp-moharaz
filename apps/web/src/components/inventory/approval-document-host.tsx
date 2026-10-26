"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ApprovalReviewDialog } from "@/components/inventory/approval-review-dialog";
import { getCommerceCustomer } from "@/lib/api/commerce-customers";
import { fetchPurchaseOrder, type ApiPurchaseOrder } from "@/lib/api/purchase-orders";
import { fetchPurchaseReceipt, type ApiPurchaseReceipt } from "@/lib/api/purchase-receipts";
import { apiReturnToPurchaseReturn, fetchPurchaseReturn } from "@/lib/api/purchase-returns";
import {
  apiSalesOrderToOrder,
  apiSalesQuotationToOrder,
  fetchSalesOrder,
  fetchSalesQuotation,
  persistSalesOrder,
} from "@/lib/api/sales";
import { apiReturnToSalesReturn, fetchSalesReturn } from "@/lib/api/sales-returns";
import { fetchStockAdjustment, type ApiStockAdjustment } from "@/lib/api/stock-adjustments";
import { fetchStockTransfer, type ApiStockTransfer } from "@/lib/api/stock-transfers";
import { useInventoryWarehouses } from "@/lib/api/use-inventory";
import type { ApprovalRequest } from "@/lib/api/approvals";
import type { Customer } from "@/lib/mock-data/customers";
import type { Order } from "@/lib/mock-data/orders";

const SalesOrderFormDrawer = dynamic(() => import("@/components/sales/sales-order-form-drawer").then((m) => m.SalesOrderFormDrawer), { ssr: false });
const StockAdjustmentDrawer = dynamic(() => import("@/components/inventory/stock-adjustment-drawer").then((m) => m.StockAdjustmentDrawer), { ssr: false });
const StockTransferDrawer = dynamic(() => import("@/components/inventory/stock-transfer-drawer").then((m) => m.StockTransferDrawer), { ssr: false });
const ReceiptDrawer = dynamic(() => import("@/components/suppliers/receipt-drawer").then((m) => m.ReceiptDrawer), { ssr: false });
const ReturnDrawer = dynamic(() => import("@/components/purchase/return-drawer").then((m) => m.ReturnDrawer), { ssr: false });
const SalesReturnDrawer = dynamic(() => import("@/components/sales/sales-return-drawer").then((m) => m.SalesReturnDrawer), { ssr: false });
const AgainPartnerDrawer = dynamic(() => import("@/components/shared/again-partner-drawer").then((m) => m.AgainPartnerDrawer), { ssr: false });
const SupplierDetailDrawer = dynamic(() => import("@/components/suppliers/supplier-detail-drawer").then((m) => m.SupplierDetailDrawer), { ssr: false });
const RmaDetailDrawer = dynamic(() => import("@/components/rma/rma-detail-drawer").then((m) => m.RmaDetailDrawer), { ssr: false });

/** The records the Approve screen opens in their OWN drawer: the same one their own page opens (docs/approval.md). */
export type DocKind =
  | "sales_order"
  | "quotation"
  | "sales_return"
  | "purchase_receipt"
  | "purchase_return"
  | "stock_adjustment"
  | "stock_transfer"
  | "customer"
  | "supplier"
  | "rma_ticket";
export type DocTarget = { kind: DocKind; id: string };

type Loaded =
  | { kind: "order"; order: Order }
  | { kind: "adjustment"; row: ApiStockAdjustment }
  | { kind: "transfer"; row: ApiStockTransfer }
  | { kind: "receipt"; receipt: ApiPurchaseReceipt; order: ApiPurchaseOrder | null }
  | { kind: "purchase_return"; record: ReturnType<typeof apiReturnToPurchaseReturn> }
  | { kind: "sales_return"; record: ReturnType<typeof apiReturnToSalesReturn> }
  | { kind: "customer"; customer: Customer };

/** The record a request opens: the one the API named, or (for rows saved before it did) the one its action implies. */
export function targetOf(request: ApprovalRequest): DocTarget | null {
  if (request.doc_kind && request.doc_id) return { kind: request.doc_kind as DocKind, id: request.doc_id };
  if (!request.entity_id) return null;
  switch (request.action_key) {
    case "sales.sales_order":
    case "sales.invoice":
    case "sales.invoice_link":
      return { kind: "sales_order", id: request.entity_id };
    case "sales.quotation":
      return { kind: "quotation", id: request.entity_id };
    case "purchase.stock_adjustment":
      return { kind: "stock_adjustment", id: request.entity_id };
    case "sales.product_transfer_ship":
    case "sales.product_transfer_receive":
      return { kind: "stock_transfer", id: request.entity_id };
    default:
      return null;
  }
}

/**
 * Opens a request's document in its ORIGINAL drawer (the sales order drawer for a sales order, the receipt drawer for a goods
 * receipt, the RMA drawer for an RMA decision …) so the approver can cross-check it. Approve / Reject are buttons in the list
 * itself. The few requests with no drawer of their own (a voucher between accounts, a standalone invoice) open a small review
 * dialog instead. Finalizing the document from its own drawer also settles its request (the API closes it).
 */
export function ApprovalReviewHost({
  request,
  onClose,
  onChanged,
}: {
  request: ApprovalRequest | null;
  onClose: () => void;
  /** The queue may have changed (the document was finalized from its own drawer). */
  onChanged: () => void;
}) {
  // a document picked from the review dialog (one of several orders) replaces the request's own target while it is open
  const [picked, setPicked] = useState<DocTarget | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const target = picked ?? (request ? targetOf(request) : null);
  const { warehouses } = useInventoryWarehouses(target?.kind === "stock_adjustment" || target?.kind === "stock_transfer");

  const kind = target?.kind;
  const id = target?.id;
  useEffect(() => {
    if (!kind || !id) return;
    let cancelled = false;
    const done = (value: Loaded) => {
      if (!cancelled) setLoaded(value);
    };
    void (async () => {
      try {
        if (kind === "sales_order") done({ kind: "order", order: apiSalesOrderToOrder(await fetchSalesOrder(id)) });
        else if (kind === "quotation") done({ kind: "order", order: apiSalesQuotationToOrder(await fetchSalesQuotation(id)) });
        else if (kind === "stock_adjustment") done({ kind: "adjustment", row: await fetchStockAdjustment(id) });
        else if (kind === "stock_transfer") done({ kind: "transfer", row: await fetchStockTransfer(id) });
        else if (kind === "purchase_receipt") {
          const receipt = await fetchPurchaseReceipt(id);
          const order = await fetchPurchaseOrder(receipt.purchase_order_id).catch(() => null);
          done({ kind: "receipt", receipt, order });
        } else if (kind === "purchase_return") done({ kind: "purchase_return", record: apiReturnToPurchaseReturn(await fetchPurchaseReturn(id)) });
        else if (kind === "sales_return") done({ kind: "sales_return", record: apiReturnToSalesReturn(await fetchSalesReturn(id)) });
        else if (kind === "customer") done({ kind: "customer", customer: await getCommerceCustomer(id) });
        // supplier and rma_ticket drawers load their own record from the id
      } catch (err) {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : "Could not open the document");
        onClose();
      }
    })();
    return () => {
      cancelled = true;
      setLoaded(null);
    };
    // onClose changes identity on every render of the page; the target alone decides what to load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);

  if (!request) return null;

  const changed = () => onChanged();
  const close = () => {
    setPicked(null);
    onClose();
  };

  let drawer: React.ReactNode = null;
  if (target) {
    if (kind === "supplier") {
      drawer = <SupplierDetailDrawer open supplierId={id ?? null} onOpenChange={(open) => !open && close()} onChanged={changed} />;
    } else if (kind === "rma_ticket") {
      drawer = <RmaDetailDrawer ticketId={id ?? null} onClose={close} onChanged={changed} />;
    } else if (loaded?.kind === "order") {
      drawer = (
        <SalesOrderFormDrawer
          key={loaded.order.id}
          open
          mode="edit"
          order={loaded.order}
          onOpenChange={(open) => !open && close()}
          onSave={() => {}}
          onSaveAction={async (next, action) => {
            const saved = await persistSalesOrder(next, action);
            setLoaded({ kind: "order", order: saved });
            changed();
            return saved;
          }}
          onSaved={(saved) => {
            setLoaded({ kind: "order", order: saved });
            changed();
          }}
        />
      );
    } else if (loaded?.kind === "adjustment") {
      drawer = (
        <StockAdjustmentDrawer key={loaded.row.id} open onOpenChange={(open) => !open && close()} warehouses={warehouses} adjustment={loaded.row} onChanged={changed} />
      );
    } else if (loaded?.kind === "transfer") {
      drawer = (
        <StockTransferDrawer key={loaded.row.id} open onOpenChange={(open) => !open && close()} warehouses={warehouses} transfer={loaded.row} onChanged={changed} />
      );
    } else if (loaded?.kind === "receipt") {
      drawer = <ReceiptDrawer key={loaded.receipt.id} open onOpenChange={(open) => !open && close()} order={loaded.order} receipt={loaded.receipt} onReceived={changed} />;
    } else if (loaded?.kind === "purchase_return") {
      drawer = (
        <ReturnDrawer
          key={loaded.record.id}
          open
          onOpenChange={(open) => !open && close()}
          orders={[]}
          record={loaded.record}
          onUpdated={(row) => {
            setLoaded({ kind: "purchase_return", record: row });
            changed();
          }}
        />
      );
    } else if (loaded?.kind === "sales_return") {
      drawer = (
        <SalesReturnDrawer
          key={loaded.record.id}
          open
          onOpenChange={(open) => !open && close()}
          orders={[]}
          record={loaded.record}
          onUpdated={(row) => {
            setLoaded({ kind: "sales_return", record: row });
            changed();
          }}
        />
      );
    } else if (loaded?.kind === "customer") {
      drawer = <AgainPartnerDrawer open customer={loaded.customer} mode="edit" initialTab="ledger" onOpenChange={(open) => !open && close()} />;
    }
  }

  return (
    <>
      {drawer}
      {!target ? <ApprovalReviewDialog request={request} onClose={close} onOpenOrder={(orderId) => setPicked({ kind: "sales_order", id: orderId })} /> : null}
    </>
  );
}
