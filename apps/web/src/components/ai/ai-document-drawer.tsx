"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PoFormDrawer } from "@/components/suppliers/po-form-drawer";
import { SalesOrderFormDrawer } from "@/components/sales/sales-order-form-drawer";
import { TaskDetailDrawer } from "@/components/crm/task-detail-drawer";
import { LeadDetailDrawer } from "@/components/crm/lead-detail-drawer";
import { DealDrawer, type DealInput } from "@/components/crm/deal-drawer";
import { fetchPurchaseOrder, type ApiPurchaseOrder } from "@/lib/api/purchase-orders";
import { useCommerceSuppliers } from "@/lib/api/use-commerce-suppliers";
import { useSalesOrders } from "@/lib/api/use-sales-orders";
import { apiSalesOrderToOrder, apiSalesQuotationToOrder, fetchSalesOrder, fetchSalesQuotation, type SalesRecordMeta } from "@/lib/api/sales";
import { fetchCrmDeals, fetchCrmLeads, fetchCrmTasks, updateCrmDeal, type ApiCrmDeal, type ApiCrmLead, type ApiCrmTask } from "@/lib/api/crm";
import { fetchMentionableUsers } from "@/lib/api/auth-users";
import { ProductFormDialog } from "@/components/products/product-form-dialog";
import { apiFetch } from "@/lib/api/client";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import type { ApiMedia } from "@/lib/api/catalog-media";
import type { Order } from "@/lib/mock-data/orders";
import type { Product } from "@/lib/mock-data/products";

/**
 * Opens an ERP document *inside the AI page* — the same drawers the module pages use, fed
 * by id — so a number the assistant mentions (SO-2026-0274, PO-2026-0273, a task, a lead)
 * can be inspected and edited without leaving the conversation. Deep links (`/sales?open=`)
 * still take the user to the module itself.
 */
export type AiDocumentType = "purchase_order" | "sales_order" | "sales_quotation" | "task" | "lead" | "deal" | "product" | "media";
export type AiDocumentRef = { type: AiDocumentType; id: string; label?: string };

export function parseDocLink(href: string): AiDocumentRef | null {
  const m = /^doc:\/\/([a-z_]+)\/([^/?#\s]+)/i.exec(href.trim());
  if (!m) return null;
  const type = m[1].toLowerCase() as AiDocumentType;
  if (!["purchase_order", "sales_order", "sales_quotation", "task", "lead", "deal", "product", "media"].includes(type)) return null;
  return { type, id: decodeURIComponent(m[2]) };
}

export function AiDocumentDrawer({ doc, onClose }: { doc: AiDocumentRef | null; onClose: () => void }) {
  if (!doc) return null;
  switch (doc.type) {
    case "purchase_order":
      return <PurchaseOrderDoc key={doc.id} id={doc.id} onClose={onClose} />;
    case "sales_order":
    case "sales_quotation":
      return <SalesDoc key={doc.id} id={doc.id} kind={doc.type} onClose={onClose} />;
    case "task":
      return <TaskDoc key={doc.id} id={doc.id} onClose={onClose} />;
    case "lead":
      return <LeadDoc key={doc.id} id={doc.id} onClose={onClose} />;
    case "deal":
      return <DealDoc key={doc.id} id={doc.id} onClose={onClose} />;
    case "product":
      return <ProductDoc key={doc.id} id={doc.id} onClose={onClose} />;
    case "media":
      return <MediaDoc key={doc.id} id={doc.id} onClose={onClose} />;
    default:
      return null;
  }
}

function useLoad<T>(loader: () => Promise<T | null>, what: string, onClose: () => void) {
  const [record, setRecord] = useState<T | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await loader();
      if (!r) {
        toast.error(`${what} not found`);
        onClose();
        return;
      }
      setRecord(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Could not open ${what.toLowerCase()}`);
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loader, what]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);
  return { record, setRecord, reload: load };
}

function PurchaseOrderDoc({ id, onClose }: { id: string; onClose: () => void }) {
  const { suppliers } = useCommerceSuppliers();
  const loader = useCallback(() => fetchPurchaseOrder(id), [id]);
  const { record, reload } = useLoad<ApiPurchaseOrder>(loader, "Purchase order", onClose);
  if (!record) return null;
  return (
    <PoFormDrawer
      open
      onOpenChange={(o) => !o && onClose()}
      order={record}
      suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, country: s.country, phone: s.phone, email: s.email }))}
      onCreated={() => void reload()}
    />
  );
}

function SalesDoc({ id, kind, onClose }: { id: string; kind: "sales_order" | "sales_quotation"; onClose: () => void }) {
  const { orders, saveOrder } = useSalesOrders();
  const loader = useCallback(async () => {
    if (kind === "sales_quotation") return apiSalesQuotationToOrder(await fetchSalesQuotation(id));
    return apiSalesOrderToOrder(await fetchSalesOrder(id));
  }, [id, kind]);
  const { record, setRecord } = useLoad<Order & SalesRecordMeta>(loader, kind === "sales_quotation" ? "Quotation" : "Sales order", onClose);
  if (!record) return null;
  return (
    <SalesOrderFormDrawer
      open
      mode="edit"
      order={record}
      orders={orders}
      onOpenChange={(o) => !o && onClose()}
      onSave={() => {}}
      onSaveAction={async (order, action) => {
        const saved = await saveOrder(order, action);
        setRecord(saved as Order & SalesRecordMeta);
        return saved;
      }}
      onSaved={(saved) => setRecord(saved as Order & SalesRecordMeta)}
      initialKind={kind === "sales_quotation" ? "quotation" : "order"}
    />
  );
}

function TaskDoc({ id, onClose }: { id: string; onClose: () => void }) {
  const loader = useCallback(async () => {
    const res = await fetchCrmTasks({ status: "all" });
    return res.data.find((t) => t.id === id) ?? null;
  }, [id]);
  const { record, setRecord } = useLoad<ApiCrmTask>(loader, "Task", onClose);
  if (!record) return null;
  return (
    <TaskDetailDrawer
      open
      onOpenChange={(o) => !o && onClose()}
      task={record}
      onEdit={() => toast.info("Edit this task from CRM → Tasks")}
      onCloned={() => toast.success("Task cloned")}
      onUpdated={setRecord}
    />
  );
}

function LeadDoc({ id, onClose }: { id: string; onClose: () => void }) {
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const loader = useCallback(async () => {
    const [res, u] = await Promise.all([fetchCrmLeads({ status: "all" }), fetchMentionableUsers().catch(() => [])]);
    setUsers(u);
    return res.data.find((l) => l.id === id) ?? null;
  }, [id]);
  const { record, setRecord } = useLoad<ApiCrmLead>(loader, "Lead", onClose);
  if (!record) return null;
  return (
    <LeadDetailDrawer
      open
      onOpenChange={(o) => !o && onClose()}
      lead={record}
      users={users}
      onUpdated={setRecord}
      onConverted={onClose}
      onEdit={() => toast.info("Edit this lead from CRM → Leads")}
    />
  );
}

function DealDoc({ id, onClose }: { id: string; onClose: () => void }) {
  const loader = useCallback(async () => {
    const res = await fetchCrmDeals({ stage: "all" });
    return res.data.find((d) => d.id === id) ?? null;
  }, [id]);
  const { record, reload } = useLoad<ApiCrmDeal>(loader, "Deal", onClose);
  if (!record) return null;
  return (
    <DealDrawer
      open
      onOpenChange={(o) => !o && onClose()}
      deal={record}
      onCreate={async () => {}}
      onSave={async (dealId: string, input: DealInput) => {
        await updateCrmDeal(dealId, input as Parameters<typeof updateCrmDeal>[1]);
        await reload();
        toast.success("Deal updated");
      }}
    />
  );
}

function ProductDoc({ id, onClose }: { id: string; onClose: () => void }) {
  // ProductFormDialog fetches the full record itself once given an id — no separate loader needed.
  return (
    <ProductFormDialog
      open
      mode="edit"
      product={{ id } as Product}
      onOpenChange={(o) => !o && onClose()}
      onSaved={() => toast.success("Product updated")}
    />
  );
}

function MediaDoc({ id, onClose }: { id: string; onClose: () => void }) {
  const loader = useCallback(async () => {
    const res = await apiFetch<{ data: ApiMedia }>(`/api/v1/media/${id}`);
    return res.data;
  }, [id]);
  const { record } = useLoad<ApiMedia>(loader, "Image", onClose);
  if (!record) return null;
  const isImage = record.media_type === "image";
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background p-4 shadow-xl">
          <Dialog.Title className="text-sm font-semibold">{record.title || record.name}</Dialog.Title>
          <div className="mt-3 flex items-center justify-center overflow-hidden rounded-lg bg-muted/40">
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={record.url} alt={record.alt || record.title || record.name} className="max-h-[60vh] w-full object-contain" />
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">{record.mime_type}</div>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {record.folder} · {record.mime_type} · {record.size_kb} KB
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <a href={record.url} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm">
                Open full size
              </Button>
            </a>
            <Button size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
