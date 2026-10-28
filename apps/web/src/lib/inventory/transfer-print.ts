import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { transferLabel, type ApiStockTransfer } from "@/lib/api/stock-transfers";

const esc = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** The stock transfer note that travels with the goods: route, products (with serials / batch), signatures for dispatch and receipt. */
export function stockTransferNoteHtml(t: ApiStockTransfer): string {
  const units = t.lines.reduce((sum, l) => sum + l.quantity, 0);
  const value = t.lines.reduce((sum, l) => sum + l.quantity * Number(l.unit_cost ?? 0), 0);
  const showValue = t.lines.some((l) => l.unit_cost != null && Number(l.unit_cost) > 0);
  const rows = t.lines
    .map((l, i) => {
      const detail =
        l.tracking_type === "serial"
          ? l.serials.map((s) => s.serial_number).filter(Boolean).join(", ")
          : l.tracking_type === "batch"
            ? (l.notes ?? "").replace(/^BATCH:/i, "Batch ")
            : "";
      return `<tr>
        <td class="n">${i + 1}</td>
        <td><b>${esc(l.name)}</b><br><span class="mono">${esc(l.sku)}</span>${detail ? `<br><span class="small">${esc(detail)}</span>` : ""}</td>
        <td class="r">${l.quantity}</td>
        <td class="r">${t.status === "draft" ? "" : l.received_qty}</td>
        ${showValue ? `<td class="r">${esc(formatCurrency(l.quantity * Number(l.unit_cost ?? 0)))}</td>` : ""}
      </tr>`;
    })
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t.transfer_number)}</title>
<style>
  *{box-sizing:border-box} body{font:13px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2430;margin:32px}
  h1{font-size:22px;margin:0 0 2px} .muted{color:#6b7280} .mono{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:#6b7280}
  .small{font-size:11px;color:#6b7280} .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #714b67;padding-bottom:10px;margin-bottom:14px}
  .status{border:1px solid #00a09d;color:#00a09d;padding:2px 10px;font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:.04em}
  .route{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #d6d9de;margin-bottom:14px}
  .route>div{padding:10px 12px} .route>div+div{border-left:1px solid #d6d9de} .lbl{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280}
  .meta{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px} .meta b{display:block}
  table{width:100%;border-collapse:collapse} th{background:#f3f4f6;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;padding:6px 8px;border-bottom:1px solid #d6d9de}
  td{padding:7px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top} .r{text-align:right;font-variant-numeric:tabular-nums} .n{width:28px;color:#6b7280}
  tfoot td{font-weight:600;border-bottom:0;border-top:2px solid #d6d9de}
  .sign{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;margin-top:64px} .sign div{border-top:1px solid #1f2430;padding-top:4px;font-size:11px;color:#6b7280}
  .notes{margin-top:12px;padding:8px 10px;background:#f9fafb;border-left:3px solid #714b67}
  @media print{body{margin:14mm}}
</style></head><body>
  <div class="top"><div><h1>Stock Transfer Note</h1><div class="muted">${esc(t.transfer_number)}${t.reference_number ? ` · Ref ${esc(t.reference_number)}` : ""}</div></div>
  <span class="status">${esc(transferLabel(t.status))}</span></div>
  <div class="route"><div><div class="lbl">From warehouse</div><b>${esc(t.from_warehouse_name ?? "")}</b></div>
  <div><div class="lbl">To warehouse</div><b>${esc(t.to_warehouse_name ?? "")}</b></div></div>
  <div class="meta">
    <div><span class="lbl">Transfer date</span><b>${esc(formatDate(t.transfer_date))}</b></div>
    <div><span class="lbl">Requested by</span><b>${esc(t.requested_by_name ?? "—")}</b></div>
    <div><span class="lbl">Shipped</span><b>${t.shipped_at ? esc(formatDateTime(t.shipped_at)) : "—"}</b></div>
    <div><span class="lbl">Received</span><b>${t.completed_at ? esc(formatDateTime(t.completed_at)) : "—"}</b></div>
  </div>
  <table><thead><tr><th class="n">#</th><th>Product</th><th class="r">Qty</th><th class="r">Received</th>${showValue ? '<th class="r">Value</th>' : ""}</tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr><td></td><td>Total · ${t.lines.length} product${t.lines.length === 1 ? "" : "s"}</td><td class="r">${units}</td><td class="r">${t.status === "draft" ? "" : t.lines.reduce((s, l) => s + l.received_qty, 0)}</td>${showValue ? `<td class="r">${esc(formatCurrency(value))}</td>` : ""}</tr></tfoot></table>
  ${t.notes ? `<div class="notes"><span class="lbl">Notes</span><br>${esc(t.notes)}</div>` : ""}
  <div class="sign"><div>Prepared by${t.requested_by_name ? ` — ${esc(t.requested_by_name)}` : ""}</div><div>Dispatched by${t.shipped_by_name ? ` — ${esc(t.shipped_by_name)}` : ""}</div><div>Received by${t.received_by_name ? ` — ${esc(t.received_by_name)}` : ""}</div></div>
  <script>window.addEventListener("load",function(){setTimeout(function(){window.print()},200)})</script>
</body></html>`;
}

/** Opens the transfer note in a new tab and prints it. Returns false when the browser blocked the pop-up. */
export function printStockTransfer(t: ApiStockTransfer): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(stockTransferNoteHtml(t));
  win.document.close();
  return true;
}
