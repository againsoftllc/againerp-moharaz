"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus, Trash2, Upload, X } from "lucide-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AgainListGrid, NUMERIC_CELL, NUMERIC_HEADER } from "@/components/shared/again-list-grid";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import {
  fetchCollabComments,
  createCollabComment,
  fetchCollabFiles,
  uploadCollabFile,
  deleteCollabFile,
  fetchCollabLabels,
  addCollabLabel,
  removeCollabLabel,
  type CollabComment,
  type CollabFile,
  type CollabLabel,
} from "@/lib/api/collaboration";
import { fetchCrmProjects, fetchCrmTasks, fetchCrmTickets, type ApiCrmProject, type ApiCrmTask, type ApiCrmTicket } from "@/lib/api/crm";
import { fetchFinanceReceivables, type ApiFinanceReceivable } from "@/lib/api/finance";
import {
  fetchClient,
  fetchClientContacts,
  createClientContact,
  updateClientContact,
  deleteClientContact,
  fetchClientEstimates,
  fetchClientOrders,
  type ApiClient,
  type ApiClientContact,
  type ApiClientEstimate,
  type ApiClientOrder,
} from "@/lib/api/crm-clients";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";

const ENTITY = "customer";

type Tab = "info" | "contacts" | "projects" | "tasks" | "invoices" | "orders" | "estimates" | "tickets" | "notes" | "files";

const TABS: Tab[] = ["info", "contacts", "projects", "tasks", "invoices", "orders", "estimates", "tickets", "notes", "files"];
const TAB_LABELS: Record<Tab, string> = {
  info: "Client info",
  contacts: "Contacts",
  projects: "Projects",
  tasks: "Tasks",
  invoices: "Invoices",
  orders: "Orders",
  estimates: "Estimates",
  tickets: "Tickets",
  notes: "Notes",
  files: "Files",
};

function money(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  return Number.isFinite(n) ? formatCurrency(n) : String(value);
}

const PROJECT_COLUMNS: ColDef<ApiCrmProject>[] = [
  { field: "name", headerName: "Name", flex: 1.2, minWidth: 140 },
  { field: "status", headerName: "Status", width: 110, cellClass: "capitalize" },
  { field: "due_date", headerName: "Due", width: 100, valueGetter: (p) => p.data?.due_date ?? "—" },
];

const TASK_COLUMNS: ColDef<ApiCrmTask>[] = [
  { field: "title", headerName: "Title", flex: 1.2, minWidth: 140 },
  { field: "status", headerName: "Status", width: 110, cellClass: "capitalize" },
  { field: "due_date", headerName: "Deadline", width: 100, valueGetter: (p) => p.data?.due_date ?? "—" },
];

const RECEIVABLE_COLUMNS: ColDef<ApiFinanceReceivable>[] = [
  { field: "invoice_number", headerName: "Invoice #", flex: 1, minWidth: 120 },
  {
    colId: "amount",
    headerName: "Amount",
    width: 100,
    headerClass: NUMERIC_HEADER,
    cellClass: NUMERIC_CELL,
    valueGetter: (p) => Number(p.data?.amount ?? 0),
    valueFormatter: (p) => money(p.data?.amount),
  },
  {
    colId: "balance",
    headerName: "Balance",
    width: 100,
    headerClass: NUMERIC_HEADER,
    cellClass: NUMERIC_CELL,
    valueGetter: (p) => Number(p.data?.balance ?? 0),
    valueFormatter: (p) => money(p.data?.balance),
  },
  {
    field: "status",
    headerName: "Status",
    width: 100,
    cellRenderer: (p: ICellRendererParams<ApiFinanceReceivable>) =>
      p.data ? <GridChipBadge className="capitalize">{p.data.status}</GridChipBadge> : null,
  },
];

const ORDER_COLUMNS: ColDef<ApiClientOrder>[] = [
  { field: "order_number", headerName: "Order #", flex: 1, minWidth: 120 },
  { field: "date", headerName: "Date", width: 100 },
  {
    colId: "total",
    headerName: "Total",
    width: 100,
    headerClass: NUMERIC_HEADER,
    cellClass: NUMERIC_CELL,
    valueFormatter: (p) => money(p.data?.total),
  },
  {
    field: "status",
    headerName: "Status",
    width: 100,
    cellRenderer: (p: ICellRendererParams<ApiClientOrder>) =>
      p.data ? <GridChipBadge className="capitalize">{p.data.status}</GridChipBadge> : null,
  },
];

const ESTIMATE_COLUMNS: ColDef<ApiClientEstimate>[] = [
  { field: "quotation_number", headerName: "Estimate #", flex: 1, minWidth: 130 },
  { field: "quote_date", headerName: "Date", width: 100 },
  { field: "valid_until", headerName: "Valid until", width: 110, valueGetter: (p) => p.data?.valid_until ?? "—" },
  {
    colId: "total",
    headerName: "Total",
    width: 100,
    headerClass: NUMERIC_HEADER,
    cellClass: NUMERIC_CELL,
    valueFormatter: (p) => money(p.data?.total),
  },
  {
    field: "status",
    headerName: "Status",
    width: 100,
    cellRenderer: (p: ICellRendererParams<ApiClientEstimate>) =>
      p.data ? <GridChipBadge className="capitalize">{p.data.status}</GridChipBadge> : null,
  },
];

const TICKET_COLUMNS: ColDef<ApiCrmTicket>[] = [
  { field: "subject", headerName: "Subject", flex: 1.2, minWidth: 140 },
  { field: "status", headerName: "Status", width: 110, cellClass: "capitalize" },
  { field: "priority", headerName: "Priority", width: 100, cellClass: "capitalize" },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string | null;
};

export function ClientDetailDrawer({ open, onOpenChange, customerId }: Props) {
  const [tab, setTab] = React.useState<Tab>("info");
  const [client, setClient] = React.useState<ApiClient | null>(null);
  const [loadingClient, setLoadingClient] = React.useState(false);

  const [contacts, setContacts] = React.useState<ApiClientContact[]>([]);
  const [contactFormOpen, setContactFormOpen] = React.useState(false);
  const [contactName, setContactName] = React.useState("");
  const [contactTitle, setContactTitle] = React.useState("");
  const [contactEmail, setContactEmail] = React.useState("");
  const [contactPhone, setContactPhone] = React.useState("");
  const [contactBusy, setContactBusy] = React.useState(false);

  const [projects, setProjects] = React.useState<ApiCrmProject[]>([]);
  const [tasks, setTasks] = React.useState<ApiCrmTask[]>([]);
  const [receivables, setReceivables] = React.useState<ApiFinanceReceivable[]>([]);
  const [orders, setOrders] = React.useState<ApiClientOrder[]>([]);
  const [estimates, setEstimates] = React.useState<ApiClientEstimate[]>([]);
  const [tickets, setTickets] = React.useState<ApiCrmTicket[]>([]);
  const [loadingTab, setLoadingTab] = React.useState(false);

  const [labels, setLabels] = React.useState<CollabLabel[]>([]);
  const [labelInput, setLabelInput] = React.useState("");
  const [labelBusy, setLabelBusy] = React.useState(false);

  const [comments, setComments] = React.useState<CollabComment[]>([]);
  const [composerText, setComposerText] = React.useState("");
  const [notesBusy, setNotesBusy] = React.useState(false);

  const [files, setFiles] = React.useState<CollabFile[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const loadClient = React.useCallback(async () => {
    if (!customerId) return;
    setLoadingClient(true);
    try {
      const [clientRes, labelRes] = await Promise.all([fetchClient(customerId), fetchCollabLabels(ENTITY, customerId)]);
      setClient(clientRes.data);
      setLabels(labelRes);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load client");
    } finally {
      setLoadingClient(false);
    }
  }, [customerId]);

  const loadContacts = React.useCallback(async () => {
    if (!customerId) return;
    try {
      const res = await fetchClientContacts(customerId);
      setContacts(res.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load contacts");
    }
  }, [customerId]);

  const openedId = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!open || !customerId) {
      openedId.current = null;
      return;
    }
    if (openedId.current === customerId) return;
    openedId.current = customerId;
    setTab("info");
    void loadClient();
    void loadContacts();
  }, [open, customerId, loadClient, loadContacts]);

  React.useEffect(() => {
    if (!open || !customerId) return;
    let cancelled = false;
    async function run() {
      setLoadingTab(true);
      try {
        if (tab === "projects") {
          const res = await fetchCrmProjects({ customer_id: customerId! });
          if (!cancelled) setProjects(res.data);
        } else if (tab === "tasks") {
          const res = await fetchCrmTasks({ related_type: "customer", related_id: customerId! });
          if (!cancelled) setTasks(res.data);
        } else if (tab === "invoices") {
          const res = await fetchFinanceReceivables({ customer_id: customerId! });
          if (!cancelled) setReceivables(res.data);
        } else if (tab === "orders") {
          const res = await fetchClientOrders(customerId!);
          if (!cancelled) setOrders(res.data);
        } else if (tab === "estimates") {
          const res = await fetchClientEstimates(customerId!);
          if (!cancelled) setEstimates(res.data);
        } else if (tab === "tickets") {
          const res = await fetchCrmTickets({ customer_id: customerId! });
          if (!cancelled) setTickets(res.data);
        } else if (tab === "notes") {
          const res = await fetchCollabComments(ENTITY, customerId!);
          if (!cancelled) setComments(res);
        } else if (tab === "files") {
          const res = await fetchCollabFiles(ENTITY, customerId!);
          if (!cancelled) setFiles(res);
        }
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : `Failed to load ${tab}`);
      } finally {
        if (!cancelled) setLoadingTab(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [open, customerId, tab]);

  async function handleAddContact() {
    if (!customerId || !contactName.trim()) return;
    setContactBusy(true);
    try {
      await createClientContact(customerId, {
        name: contactName.trim(),
        title: contactTitle.trim() || undefined,
        email: contactEmail.trim() || undefined,
        phone: contactPhone.trim() || undefined,
        is_primary: contacts.length === 0,
      });
      setContactFormOpen(false);
      setContactName("");
      setContactTitle("");
      setContactEmail("");
      setContactPhone("");
      void loadContacts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add contact");
    } finally {
      setContactBusy(false);
    }
  }

  async function handleSetPrimary(contact: ApiClientContact) {
    if (!customerId) return;
    setContactBusy(true);
    try {
      await updateClientContact(customerId, contact.id, { is_primary: true });
      void loadContacts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update contact");
    } finally {
      setContactBusy(false);
    }
  }

  async function handleDeleteContact(contact: ApiClientContact) {
    if (!customerId) return;
    setContactBusy(true);
    try {
      await deleteClientContact(customerId, contact.id);
      void loadContacts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete contact");
    } finally {
      setContactBusy(false);
    }
  }

  async function handleAddLabel() {
    if (!customerId || !labelInput.trim()) return;
    setLabelBusy(true);
    try {
      await addCollabLabel(ENTITY, customerId, labelInput.trim().toLowerCase().replace(/\s+/g, "_"));
      setLabelInput("");
      const res = await fetchCollabLabels(ENTITY, customerId);
      setLabels(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add label");
    } finally {
      setLabelBusy(false);
    }
  }

  async function handleRemoveLabel(label: CollabLabel) {
    if (!customerId) return;
    setLabelBusy(true);
    try {
      await removeCollabLabel(ENTITY, customerId, label.label);
      const res = await fetchCollabLabels(ENTITY, customerId);
      setLabels(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove label");
    } finally {
      setLabelBusy(false);
    }
  }

  async function handlePostComment() {
    if (!customerId || !composerText.trim()) return;
    setNotesBusy(true);
    try {
      await createCollabComment(ENTITY, customerId, { comment: composerText.trim() });
      setComposerText("");
      const res = await fetchCollabComments(ENTITY, customerId);
      setComments(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add note");
    } finally {
      setNotesBusy(false);
    }
  }

  async function handleUploadFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!customerId || !file) return;
    setUploading(true);
    try {
      await uploadCollabFile(ENTITY, customerId, file);
      toast.success("File uploaded");
      const res = await fetchCollabFiles(ENTITY, customerId);
      setFiles(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDeleteFile(file: CollabFile) {
    if (!customerId) return;
    try {
      await deleteCollabFile(ENTITY, customerId, file.id);
      const res = await fetchCollabFiles(ENTITY, customerId);
      setFiles(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete file");
    }
  }

  if (!customerId) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title={client?.name ?? "Client"}
        resizable
        resizeMaxWidth={1400}
        className="flex w-full max-w-[70vw] flex-col overflow-hidden"
      >
        <div className="shrink-0">
          <div className="pr-8">
            <h2 className="text-lg font-semibold">{loadingClient ? "Loading…" : client?.name ?? "Client"}</h2>
            {client && (
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {client.email && <span>{client.email}</span>}
                {client.phone && <span>{client.phone}</span>}
                <Badge variant="outline" className="capitalize">{client.group}</Badge>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center gap-1 overflow-x-auto border-b border-border [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "shrink-0 whitespace-nowrap border-b-2 px-3 py-1.5 text-xs font-medium",
                  tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "info" && (
            <div className="mt-3 space-y-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 border border-border p-3 text-xs sm:grid-cols-3">
                <div>
                  <p className="text-muted-foreground">Client code</p>
                  <p className="font-medium">{client?.customer_code ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-medium capitalize">{client?.status ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">City</p>
                  <p className="font-medium">{client?.city || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Client group</p>
                  <p className="font-medium capitalize">{client?.group ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Client since</p>
                  <p className="font-medium">{client ? formatDateTime(client.created_at) : "—"}</p>
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Labels</p>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {labels.length === 0 ? (
                    <span className="text-xs text-muted-foreground">No labels.</span>
                  ) : (
                    labels.map((l) => (
                      <span
                        key={l.id}
                        className="flex items-center gap-1 rounded-none border px-1.5 py-0.5 text-[10px]"
                        style={l.color ? { borderColor: l.color, color: l.color } : undefined}
                      >
                        {l.label_display}
                        <button type="button" disabled={labelBusy} onClick={() => void handleRemoveLabel(l)}>
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Input
                    value={labelInput}
                    onChange={(e) => setLabelInput(e.target.value)}
                    placeholder="Add a label…"
                    className="h-7 w-[200px] text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleAddLabel();
                      }
                    }}
                  />
                  <Button size="sm" className="h-7 px-2 text-[11px]" disabled={labelBusy || !labelInput.trim()} onClick={() => void handleAddLabel()}>
                    Add
                  </Button>
                </div>
              </div>
            </div>
          )}

          {tab === "contacts" && (
            <div className="mt-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{contacts.length} contact{contacts.length === 1 ? "" : "s"}</p>
                {!contactFormOpen && (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setContactFormOpen(true)}>
                    <Plus className="mr-1 h-3 w-3" /> Add contact
                  </Button>
                )}
              </div>
              {contactFormOpen && (
                <div className="mb-3 space-y-2 border border-input bg-muted/30 p-2.5">
                  <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Name" className="h-7 text-xs" />
                  <Input value={contactTitle} onChange={(e) => setContactTitle(e.target.value)} placeholder="Title (optional)" className="h-7 text-xs" />
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Email (optional)" className="h-7 text-xs" />
                    <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="Phone (optional)" className="h-7 text-xs" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setContactFormOpen(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" className="h-7 px-2 text-[11px]" disabled={contactBusy || !contactName.trim()} onClick={() => void handleAddContact()}>
                      Add
                    </Button>
                  </div>
                </div>
              )}
              {contacts.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">No contacts yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {contacts.map((c) => (
                    <div key={c.id} className="flex items-center justify-between border border-border p-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium">{c.name}</p>
                          {c.is_primary && <Badge variant="success">Primary</Badge>}
                        </div>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {[c.title, c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {!c.is_primary && (
                          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" disabled={contactBusy} onClick={() => void handleSetPrimary(c)}>
                            Make primary
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-6 px-1 text-muted-foreground hover:text-destructive" disabled={contactBusy} onClick={() => void handleDeleteContact(c)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "projects" && (
            <div className="mt-3">
              <AgainListGrid<ApiCrmProject> embedded className="h-[400px]" rowData={projects} columnDefs={PROJECT_COLUMNS} loading={loadingTab} emptyTitle="No projects yet." getRowId={(p) => p.data.id} />
            </div>
          )}

          {tab === "tasks" && (
            <div className="mt-3">
              <AgainListGrid<ApiCrmTask> embedded className="h-[400px]" rowData={tasks} columnDefs={TASK_COLUMNS} loading={loadingTab} emptyTitle="No tasks yet." getRowId={(p) => p.data.id} />
            </div>
          )}

          {tab === "invoices" && (
            <div className="mt-3">
              <AgainListGrid<ApiFinanceReceivable> embedded className="h-[400px]" rowData={receivables} columnDefs={RECEIVABLE_COLUMNS} loading={loadingTab} emptyTitle="No invoices yet." getRowId={(p) => p.data.id} />
            </div>
          )}

          {tab === "orders" && (
            <div className="mt-3">
              <AgainListGrid<ApiClientOrder> embedded className="h-[400px]" rowData={orders} columnDefs={ORDER_COLUMNS} loading={loadingTab} emptyTitle="No orders yet." getRowId={(p) => p.data.id} />
            </div>
          )}

          {tab === "estimates" && (
            <div className="mt-3">
              <AgainListGrid<ApiClientEstimate> embedded className="h-[400px]" rowData={estimates} columnDefs={ESTIMATE_COLUMNS} loading={loadingTab} emptyTitle="No estimates yet." getRowId={(p) => p.data.id} />
            </div>
          )}

          {tab === "tickets" && (
            <div className="mt-3">
              <AgainListGrid<ApiCrmTicket> embedded className="h-[400px]" rowData={tickets} columnDefs={TICKET_COLUMNS} loading={loadingTab} emptyTitle="No tickets yet." getRowId={(p) => p.data.id} />
            </div>
          )}

          {tab === "notes" && (
            <div className="mt-3">
              <div className="mb-3 space-y-2 border border-input bg-muted/30 p-2.5">
                <textarea
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value)}
                  rows={2}
                  placeholder="Write a note…"
                  className="w-full rounded-none border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex justify-end">
                  <Button size="sm" className="h-7 px-2 text-[11px]" disabled={notesBusy || !composerText.trim()} onClick={() => void handlePostComment()}>
                    Post note
                  </Button>
                </div>
              </div>
              {loadingTab ? (
                <p className="py-4 text-center text-xs text-muted-foreground">Loading…</p>
              ) : comments.length === 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground">No notes yet.</p>
              ) : (
                <div className="space-y-2">
                  {comments.map((c) => (
                    <div key={c.id} className="border border-border p-2">
                      <p className="whitespace-pre-wrap text-xs">{c.comment}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{formatDateTime(c.created_at)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "files" && (
            <div className="mt-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{files.length} file{files.length === 1 ? "" : "s"}</p>
                <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => void handleUploadFile(e.target.files)} />
                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                  <Upload className="mr-1 h-3 w-3" /> {uploading ? "Uploading…" : "Upload file"}
                </Button>
              </div>
              {loadingTab ? (
                <p className="py-4 text-center text-xs text-muted-foreground">Loading…</p>
              ) : files.length === 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground">No files yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {files.map((f) => (
                    <div key={f.id} className="flex items-center justify-between border border-border p-2">
                      <a href={f.storage_ref} target="_blank" rel="noreferrer" className="truncate text-xs text-primary hover:underline">
                        {f.filename}
                      </a>
                      <Button size="sm" variant="ghost" className="h-7 px-1.5 text-muted-foreground hover:text-destructive" onClick={() => void handleDeleteFile(f)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
