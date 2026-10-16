"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { markPosReceiptPrinted, type PosReceipt } from "@/lib/api/pos";
import { formatCurrency, formatDateTime } from "@/lib/utils";

type ReceiptData = {
  receipt_number?: string;
  order_number?: string;
  invoice_number?: string;
  cart_number?: string;
  business_name?: string;
  branch?: string;
  address?: string | null;
  cashier?: string | null;
  terminal?: string;
  customer?: string;
  customer_phone?: string | null;
  subtotal?: number;
  discount?: number;
  tax?: number;
  total?: number;
  paid?: number;
  change?: number;
  receipt_size?: string;
  footer?: string | null;
  return_policy?: string | null;
  show_warranty?: boolean;
  lines?: {
    sku: string;
    name: string;
    quantity: number;
    unit_price: number;
    discount?: number;
    line_total: number;
    serial_number?: string | null;
    warranty?: string | null;
  }[];
  payments?: { method: string; amount: number; reference?: string | null }[];
  completed_at?: string | null;
};

export function PosReceiptView({
  receipt,
  onNewSale,
}: {
  receipt: PosReceipt;
  onNewSale?: () => void;
}) {
  const data = (receipt.receipt_data || {}) as ReceiptData;
  const width = data.receipt_size === "58mm" ? "58mm" : "80mm";

  const html = useMemo(() => {
    const lines = data.lines ?? [];
    const payments = data.payments ?? [];
    return `
<!doctype html>
<html>
<head>
  <title>${data.receipt_number || "Receipt"}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; margin: 0; padding: 8px; width: ${width}; color: #111; }
    h1 { font-size: 14px; margin: 0 0 4px; text-align: center; }
    p, td { font-size: 11px; }
    .muted { color: #555; text-align: center; margin: 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    td { padding: 2px 0; vertical-align: top; }
    .right { text-align: right; }
    hr { border: 0; border-top: 1px dashed #999; margin: 8px 0; }
  </style>
</head>
<body>
  <h1>${data.business_name || "AgainERP"}</h1>
  <p class="muted">${data.branch || ""}</p>
  <p class="muted">${data.address || ""}</p>
  <hr>
  <p>POS ${data.cart_number || ""}</p>
  <p>Invoice ${data.invoice_number || data.receipt_number || ""}</p>
  <p>${data.completed_at ? formatDateTime(data.completed_at) : ""}</p>
  <p>Cashier: ${data.cashier || ""}</p>
  <p>Customer: ${data.customer || "Walk-in"}</p>
  <hr>
  <table>
    ${lines
      .map(
        (line) => `<tr>
      <td>${line.quantity} × ${line.name}${line.serial_number ? `<br>SN ${line.serial_number}` : ""}${
          data.show_warranty && line.warranty ? `<br>${line.warranty}` : ""
        }</td>
      <td class="right">${line.line_total.toFixed(2)}</td>
    </tr>`,
      )
      .join("")}
  </table>
  <hr>
  <table>
    <tr><td>Subtotal</td><td class="right">${Number(data.subtotal || 0).toFixed(2)}</td></tr>
    <tr><td>Discount</td><td class="right">${Number(data.discount || 0).toFixed(2)}</td></tr>
    <tr><td>Tax</td><td class="right">${Number(data.tax || 0).toFixed(2)}</td></tr>
    <tr><td><strong>Total</strong></td><td class="right"><strong>${Number(data.total || 0).toFixed(2)}</strong></td></tr>
  </table>
  <hr>
  ${payments.map((p) => `<p>${p.method}: ${Number(p.amount).toFixed(2)}</p>`).join("")}
  <p>Paid: ${Number(data.paid || 0).toFixed(2)}</p>
  <p>Change: ${Number(data.change || 0).toFixed(2)}</p>
  <hr>
  <p class="muted">${data.footer || "Thank you"}</p>
  <p class="muted">${data.return_policy || ""}</p>
</body>
</html>`;
  }, [data, width]);

  function printReceipt() {
    const frame = window.open("", "pos-receipt", "width=420,height=640");
    if (!frame) return;
    frame.document.write(html);
    frame.document.close();
    frame.focus();
    frame.print();
    void markPosReceiptPrinted(receipt.id).catch(() => undefined);
  }

  function downloadReceipt() {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.receipt_number || "receipt"}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="border border-border bg-background p-3">
      <p className="text-sm font-semibold">{data.business_name || "AgainERP"}</p>
      <p className="text-[11px] text-muted-foreground">{data.branch}</p>
      <p className="mt-2 text-xs">
        {data.cart_number} · {data.invoice_number || data.receipt_number}
      </p>
      <p className="text-xs">Customer: {data.customer || "Walk-in"}</p>
      <p className="mt-2 text-lg font-semibold tabular-nums">{formatCurrency(Number(data.total || 0))}</p>
      <p className="text-xs text-muted-foreground">
        Paid {formatCurrency(Number(data.paid || 0))} · Change {formatCurrency(Number(data.change || 0))}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button type="button" size="sm" className="rounded-none" onClick={printReceipt}>
          Print receipt
        </Button>
        <Button type="button" size="sm" variant="outline" className="rounded-none" onClick={downloadReceipt}>
          Download
        </Button>
        {onNewSale ? (
          <Button type="button" size="sm" variant="outline" className="rounded-none" onClick={onNewSale}>
            New sale
          </Button>
        ) : null}
      </div>
    </div>
  );
}
