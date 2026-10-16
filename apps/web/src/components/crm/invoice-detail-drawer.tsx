"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus, Trash2, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AgainListGrid } from "@/components/shared/again-list-grid";
import type { ColDef } from "ag-grid-community";
import {
  fetchCollabFiles,
  uploadCollabFile,
  deleteCollabFile,
  fetchCollabLabels,
  addCollabLabel,
  removeCollabLabel,
  type CollabFile,
  type CollabLabel,
} from "@/lib/api/collaboration";
import { fetchClients, type ApiClient } from "@/lib/api/crm-clients";
import { fetchCrmProjects, fetchCrmTasks, createCrmTask, type ApiCrmProject, type ApiCrmTask } from "@/lib/api/crm";
import {
  fetchSalesInvoice,
  updateSalesInvoice,
  deleteSalesInvoice,
  addSalesInvoiceLine,
  updateSalesInvoiceLine,
  deleteSalesInvoiceLine,
  fetchSalesInvoicePayments,
  addSalesInvoicePayment,
  type ApiSalesInvoice,
  type ApiSalesInvoiceLine,
  type ApiSalesInvoicePayment,
} from "@/lib/api/sales-invoices";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";

const ENTITY = "invoice";

type Tab = "details" | "payments" | "tasks";

function money(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  return Number.isFinite(n) ? formatCurrency(n) : String(value);
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  open: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  partial: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  paid: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  overdue: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string | null;
  onChanged?: () => void;
};

export function InvoiceDetailDrawer({ open, onOpenChange, invoiceId, onChanged }: Props) {
  const [tab, setTab] = React.useState<Tab>("details");
  const [invoice, setInvoice] = React.useState<ApiSalesInvoice | null>(null);
  const [loading, setLoading] = React.useState(false);

  const [editing, setEditing] = React.useState(false);
  const [clients, setClients] = React.useState<ApiClient[]>([]);
  const [projects, setProjects] = React.useState<ApiCrmProject[]>([]);
  const [editCustomerId, setEditCustomerId] = React.useState("");
  const [editProjectId, setEditProjectId] = React.useState("");
  const [editBillDate, setEditBillDate] = React.useState("");
  const [editDueDate, setEditDueDate] = React.useState("");
  const [editTax, setEditTax] = React.useState("0");
  const [editSecondTax, setEditSecondTax] = React.useState("0");
  const [editTds, setEditTds] = React.useState("0");
  const [editNotes, setEditNotes] = React.useState("");
  const [savingHeader, setSavingHeader] = React.useState(false);

  const [payments, setPayments] = React.useState<ApiSalesInvoicePayment[]>([]);
  const [tasks, setTasks] = React.useState<ApiCrmTask[]>([]);
  const [loadingTab, setLoadingTab] = React.useState(false);
  const [taskTitle, setTaskTitle] = React.useState("");
  const [addingTask, setAddingTask] = React.useState(false);

  const [labels, setLabels] = React.useState<CollabLabel[]>([]);
  const [labelInput, setLabelInput] = React.useState("");
  const [labelBusy, setLabelBusy] = React.useState(false);

  const [files, setFiles] = React.useState<CollabFile[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [itemSheetOpen, setItemSheetOpen] = React.useState(false);
  const [editingLine, setEditingLine] = React.useState<ApiSalesInvoiceLine | null>(null);

  const [paymentSheetOpen, setPaymentSheetOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    try {
      const [res, labelRes] = await Promise.all([fetchSalesInvoice(invoiceId), fetchCollabLabels(ENTITY, invoiceId)]);
      setInvoice(res.data);
      setLabels(labelRes);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load invoice");
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  const openedId = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!open || !invoiceId) {
      openedId.current = null;
      return;
    }
    if (openedId.current === invoiceId) return;
    openedId.current = invoiceId;
    setTab("details");
    setEditing(false);
    void load();
  }, [open, invoiceId, load]);

  React.useEffect(() => {
    if (!open || !invoiceId) return;
    let cancelled = false;
    async function run() {
      setLoadingTab(true);
      try {
        if (tab === "payments") {
          const res = await fetchSalesInvoicePayments(invoiceId!);
          if (!cancelled) setPayments(res.data);
        } else if (tab === "tasks") {
          const res = await fetchCrmTasks({ related_type: ENTITY, related_id: invoiceId! });
          if (!cancelled) setTasks(res.data);
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
  }, [open, invoiceId, tab]);

  React.useEffect(() => {
    if (!open || !invoiceId) return;
    void fetchCollabFiles(ENTITY, invoiceId).then(setFiles).catch(() => setFiles([]));
  }, [open, invoiceId]);

  function startEdit() {
    if (!invoice) return;
    setEditCustomerId(invoice.customer_id);
    setEditProjectId(invoice.project_id ?? "");
    setEditBillDate(invoice.bill_date);
    setEditDueDate(invoice.due_date ?? "");
    setEditTax(invoice.tax_rate);
    setEditSecondTax(invoice.second_tax_rate);
    setEditTds(invoice.tds_rate);
    setEditNotes(invoice.notes ?? "");
    void fetchClients().then((res) => setClients(res.data)).catch(() => setClients([]));
    void fetchCrmProjects({ customer_id: invoice.customer_id }).then((res) => setProjects(res.data)).catch(() => setProjects([]));
    setEditing(true);
  }

  async function handleSaveHeader() {
    if (!invoiceId) return;
    setSavingHeader(true);
    try {
      await updateSalesInvoice(invoiceId, {
        customer_id: editCustomerId,
        project_id: editProjectId || null,
        bill_date: editBillDate,
        due_date: editDueDate || null,
        tax_rate: editTax || "0",
        second_tax_rate: editSecondTax || "0",
        tds_rate: editTds || "0",
        notes: editNotes.trim() || null,
      });
      toast.success("Invoice updated");
      setEditing(false);
      void load();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update invoice");
    } finally {
      setSavingHeader(false);
    }
  }

  async function handleDelete() {
    if (!invoiceId) return;
    if (!window.confirm("Delete this invoice? This cannot be undone.")) return;
    try {
      await deleteSalesInvoice(invoiceId);
      toast.success("Invoice deleted");
      onOpenChange(false);
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete invoice");
    }
  }

  async function handleDeleteLine(line: ApiSalesInvoiceLine) {
    if (!invoiceId) return;
    if (!window.confirm(`Remove "${line.name}"?`)) return;
    try {
      await deleteSalesInvoiceLine(invoiceId, line.id);
      void load();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove item");
    }
  }

  async function handleAddTask() {
    if (!invoiceId || !taskTitle.trim()) return;
    setAddingTask(true);
    try {
      await createCrmTask({ title: taskTitle.trim(), related_type: ENTITY, related_id: invoiceId });
      setTaskTitle("");
      const res = await fetchCrmTasks({ related_type: ENTITY, related_id: invoiceId });
      setTasks(res.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add task");
    } finally {
      setAddingTask(false);
    }
  }

  async function handleAddLabel() {
    if (!invoiceId || !labelInput.trim()) return;
    setLabelBusy(true);
    try {
      await addCollabLabel(ENTITY, invoiceId, labelInput.trim().toLowerCase().replace(/\s+/g, "_"));
      setLabelInput("");
      setLabels(await fetchCollabLabels(ENTITY, invoiceId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add label");
    } finally {
      setLabelBusy(false);
    }
  }

  async function handleRemoveLabel(label: CollabLabel) {
    if (!invoiceId) return;
    setLabelBusy(true);
    try {
      await removeCollabLabel(ENTITY, invoiceId, label.label);
      setLabels(await fetchCollabLabels(ENTITY, invoiceId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove label");
    } finally {
      setLabelBusy(false);
    }
  }

  async function handleUploadFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!invoiceId || !file) return;
    setUploading(true);
    try {
      await uploadCollabFile(ENTITY, invoiceId, file);
      toast.success("File uploaded");
      setFiles(await fetchCollabFiles(ENTITY, invoiceId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDeleteFile(file: CollabFile) {
    if (!invoiceId) return;
    try {
      await deleteCollabFile(ENTITY, invoiceId, file.id);
      setFiles(await fetchCollabFiles(ENTITY, invoiceId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete file");
    }
  }

  const TASK_COLUMNS: ColDef<ApiCrmTask>[] = React.useMemo(
    () => [
      { field: "title", headerName: "Title", flex: 1.2, minWidth: 140 },
      { field: "status", headerName: "Status", width: 110, cellClass: "capitalize" },
      { field: "due_date", headerName: "Deadline", width: 100, valueGetter: (p) => p.data?.due_date ?? "—" },
    ],
    [],
  );

  if (!invoiceId) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title={invoice ? `Invoice ${invoice.invoice_number}` : "Invoice"}
        resizable
        resizeMaxWidth={1400}
        className="flex w-full max-w-[70vw] flex-col overflow-hidden"
      >
        <div className="shrink-0">
          <div className="flex items-center justify-between pr-8">
            <h2 className="text-lg font-semibold">
              {loading ? "Loading…" : invoice ? `INVOICE #${invoice.invoice_number}` : "Invoice"}
            </h2>
            {invoice && (
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => setPaymentSheetOpen(true)}>
                  Add payment
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      Actions
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={startEdit}>Edit invoice</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void handleDelete()} className="text-destructive">
                      Delete invoice
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center gap-1 overflow-x-auto border-b border-border [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(["details", "payments", "tasks"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "shrink-0 whitespace-nowrap border-b-2 px-3 py-1.5 text-xs font-medium capitalize",
                  tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "details" && invoice && (
            <div className="mt-3 flex flex-col gap-4 lg:flex-row">
              {/* Document */}
              <div className="min-w-0 flex-1 border border-border p-4">
                <div className="mb-4 flex items-start justify-between border-b border-border pb-3">
                  <div>
                    <p className="text-lg font-bold">Againsoft</p>
                    <p className="text-[11px] text-muted-foreground">Dhaka, Bangladesh</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold tracking-wide">INVOICE</p>
                    <p className="text-xs text-muted-foreground">#{invoice.invoice_number}</p>
                  </div>
                </div>

                <div className="mb-4 flex flex-wrap justify-between gap-3 text-xs">
                  <div>
                    <p className="mb-1 font-semibold text-muted-foreground">Bill To</p>
                    <p className="font-medium">{invoice.customer_name ?? "—"}</p>
                  </div>
                  <div className="text-right">
                    <p>
                      <span className="text-muted-foreground">Bill date: </span>
                      {invoice.bill_date}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Due date: </span>
                      {invoice.due_date ?? "—"}
                    </p>
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-center">Taxable</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoice.lines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                          No items yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      invoice.lines.map((line) => (
                        <TableRow
                          key={line.id}
                          className="cursor-pointer"
                          onClick={() => {
                            setEditingLine(line);
                            setItemSheetOpen(true);
                          }}
                        >
                          <TableCell>
                            <p className="font-medium">{line.name || "—"}</p>
                            {line.description && <p className="text-[10px] text-muted-foreground">{line.description}</p>}
                          </TableCell>
                          <TableCell className="text-right">
                            {line.quantity} {line.unit_type}
                          </TableCell>
                          <TableCell className="text-right">{money(line.rate)}</TableCell>
                          <TableCell className="text-center">{line.taxable ? "Yes" : "No"}</TableCell>
                          <TableCell className="text-right">{money(line.line_total)}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-1 text-muted-foreground hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDeleteLine(line);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>

                <div className="mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => {
                      setEditingLine(null);
                      setItemSheetOpen(true);
                    }}
                  >
                    <Plus className="mr-1 h-3 w-3" /> Add item
                  </Button>
                </div>

                <div className="ml-auto mt-4 w-full max-w-[240px] space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sub Total</span>
                    <span>{money(invoice.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax</span>
                    <span>{money(invoice.tax_total)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">TDS</span>
                    <span>-{money(invoice.tds_total)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1 font-semibold">
                    <span>Total</span>
                    <span>{money(invoice.total)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-red-600 dark:text-red-400">
                    <span>Balance Due</span>
                    <span>{money(invoice.balance)}</span>
                  </div>
                </div>
              </div>

              {/* Sidebar */}
              <div className="w-full shrink-0 space-y-4 lg:w-[260px]">
                {editing ? (
                  <div className="space-y-2.5 border border-input bg-muted/30 p-2.5">
                    <div className="flex flex-col gap-1">
                      <Label className="text-[11px]">Client</Label>
                      <Select value={editCustomerId} onChange={(e) => setEditCustomerId(e.target.value)} className="w-full rounded-none">
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-[11px]">Project</Label>
                      <Select value={editProjectId} onChange={(e) => setEditProjectId(e.target.value)} className="w-full rounded-none">
                        <option value="">No project</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <Label className="text-[11px]">Bill date</Label>
                        <Input type="date" value={editBillDate} onChange={(e) => setEditBillDate(e.target.value)} className="h-7 text-xs" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-[11px]">Due date</Label>
                        <Input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} className="h-7 text-xs" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="flex flex-col gap-1">
                        <Label className="text-[11px]">TAX</Label>
                        <Input type="number" value={editTax} onChange={(e) => setEditTax(e.target.value)} className="h-7 text-xs" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-[11px]">2nd TAX</Label>
                        <Input type="number" value={editSecondTax} onChange={(e) => setEditSecondTax(e.target.value)} className="h-7 text-xs" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-[11px]">TDS</Label>
                        <Input type="number" value={editTds} onChange={(e) => setEditTds(e.target.value)} className="h-7 text-xs" />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-[11px]">Note</Label>
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        rows={2}
                        className="w-full rounded-none border border-input bg-background px-2 py-1 text-xs"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setEditing(false)} disabled={savingHeader}>
                        Cancel
                      </Button>
                      <Button size="sm" className="h-7 px-2 text-[11px]" onClick={() => void handleSaveHeader()} disabled={savingHeader}>
                        {savingHeader ? "Saving…" : "Save"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5 text-xs">
                    <div>
                      <p className="font-bold">Client</p>
                      <button className="text-primary hover:underline" onClick={startEdit}>
                        {invoice.customer_name ?? "—"}
                      </button>
                    </div>
                    <div>
                      <p className="font-bold">Project</p>
                      <button className="text-primary hover:underline" onClick={startEdit}>
                        {invoice.project_name ?? "Add project"}
                      </button>
                    </div>
                    <div>
                      <p className="font-bold">Status</p>
                      <Badge className={cn("capitalize", STATUS_COLORS[invoice.status] ?? "")}>{invoice.status}</Badge>
                    </div>
                    <div>
                      <p className="font-bold">Last email sent</p>
                      <p className="text-muted-foreground">{invoice.last_email_sent_at ? formatDateTime(invoice.last_email_sent_at) : "Never"}</p>
                    </div>
                    <div>
                      <p className="font-bold">Reminders (Private)</p>
                      <button className="text-primary hover:underline" onClick={startEdit}>
                        Add reminder
                      </button>
                    </div>
                  </div>
                )}

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
                      className="h-7 w-full text-xs"
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

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground">Files</p>
                    <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => void handleUploadFile(e.target.files)} />
                    <Button size="sm" variant="outline" className="h-6 px-1.5 text-[10px]" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                      <Upload className="mr-1 h-3 w-3" /> {uploading ? "Uploading…" : "Upload"}
                    </Button>
                  </div>
                  {files.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No files yet.</p>
                  ) : (
                    <div className="space-y-1">
                      {files.map((f) => (
                        <div key={f.id} className="flex items-center justify-between border border-border p-1.5">
                          <a href={f.storage_ref} target="_blank" rel="noreferrer" className="truncate text-[11px] text-primary hover:underline">
                            {f.filename}
                          </a>
                          <Button size="sm" variant="ghost" className="h-6 px-1 text-muted-foreground hover:text-destructive" onClick={() => void handleDeleteFile(f)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "payments" && (
            <div className="mt-3 space-y-2">
              {loadingTab ? (
                <p className="py-4 text-center text-xs text-muted-foreground">Loading…</p>
              ) : payments.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">No payments recorded yet.</p>
              ) : (
                payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between border border-border p-2 text-xs">
                    <div>
                      <p className="font-medium">{p.payment_number}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {p.payment_date} · {p.payment_method} {p.reference ? `· ${p.reference}` : ""}
                      </p>
                    </div>
                    <p className="font-semibold">{money(p.amount)}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "tasks" && invoice && (
            <div className="mt-3">
              <div className="mb-3 flex items-center gap-1.5">
                <Input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Quick add a task…"
                  className="h-7 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleAddTask();
                    }
                  }}
                />
                <Button size="sm" className="h-7 px-2 text-[11px]" disabled={addingTask || !taskTitle.trim()} onClick={() => void handleAddTask()}>
                  Add
                </Button>
              </div>
              <AgainListGrid<ApiCrmTask>
                embedded
                className="h-[360px]"
                rowData={tasks}
                columnDefs={TASK_COLUMNS}
                loading={loadingTab}
                emptyTitle="No tasks yet."
                getRowId={(p) => p.data.id}
              />
            </div>
          )}
        </div>
      </SheetContent>

      <InvoiceItemSheet
        open={itemSheetOpen}
        onOpenChange={setItemSheetOpen}
        invoiceId={invoiceId}
        line={editingLine}
        onSaved={() => {
          void load();
          onChanged?.();
        }}
      />
      <InvoicePaymentSheet
        open={paymentSheetOpen}
        onOpenChange={setPaymentSheetOpen}
        invoiceId={invoiceId}
        balance={invoice?.balance}
        onSaved={() => {
          void load();
          if (tab === "payments" && invoiceId) {
            void fetchSalesInvoicePayments(invoiceId).then((res) => setPayments(res.data));
          }
          onChanged?.();
        }}
      />
    </Sheet>
  );
}

function InvoiceItemSheet({
  open,
  onOpenChange,
  invoiceId,
  line,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string | null;
  line: ApiSalesInvoiceLine | null;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [unitType, setUnitType] = React.useState("Unit");
  const [rate, setRate] = React.useState("0");
  const [taxable, setTaxable] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(line?.name ?? "");
    setDescription(line?.description ?? "");
    setQuantity(line?.quantity ?? "1");
    setUnitType(line?.unit_type ?? "Unit");
    setRate(line?.rate ?? "0");
    setTaxable(line?.taxable ?? true);
  }, [open, line]);

  const isValid = name.trim().length > 0;

  async function handleSave() {
    if (!invoiceId || !isValid) return;
    setSaving(true);
    try {
      const payload = { name: name.trim(), description: description.trim() || undefined, quantity, unit_type: unitType, rate, taxable };
      if (line) {
        await updateSalesInvoiceLine(invoiceId, line.id, payload);
      } else {
        await addSalesInvoiceLine(invoiceId, payload);
      }
      toast.success(line ? "Item updated" : "Item added");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save item");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" title={line ? "Edit item" : "Add item"} className="flex w-full max-w-md flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-3 border-b border-input pb-3 pr-8">
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" onClick={() => void handleSave()} disabled={!isValid || saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
          <h2 className="text-base font-semibold">{line ? "Edit item" : "Add item"}</h2>
        </div>

        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto">
          <div className="flex flex-col gap-1.5">
            <Label>Item</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Select from list or create new item…" disabled={saving} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Description</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              disabled={saving}
              className="w-full rounded-none border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Quantity</Label>
              <Input type="number" min="0" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} disabled={saving} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Unit type</Label>
              <Input value={unitType} onChange={(e) => setUnitType(e.target.value)} disabled={saving} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Rate</Label>
            <Input type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} disabled={saving} />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={taxable}
              onChange={(e) => setTaxable(e.target.checked)}
              disabled={saving}
              className="h-3.5 w-3.5 rounded-none border-input"
            />
            Taxable
          </label>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function InvoicePaymentSheet({
  open,
  onOpenChange,
  invoiceId,
  balance,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string | null;
  balance?: string;
  onSaved: () => void;
}) {
  const [amount, setAmount] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setAmount(balance ?? "");
    setReference("");
    setNotes("");
  }, [open, balance]);

  const isValid = Number(amount) > 0;

  async function handleSave() {
    if (!invoiceId || !isValid) return;
    setSaving(true);
    try {
      await addSalesInvoicePayment(invoiceId, { amount, reference: reference.trim() || undefined, notes: notes.trim() || undefined });
      toast.success("Payment recorded");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" title="Add payment" className="flex w-full max-w-md flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-3 border-b border-input pb-3 pr-8">
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" onClick={() => void handleSave()} disabled={!isValid || saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
          <h2 className="text-base font-semibold">Add payment</h2>
        </div>

        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto">
          <div className="flex flex-col gap-1.5">
            <Label>Amount {balance ? `(balance ${money(balance)})` : ""}</Label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={saving} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Reference (optional)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} disabled={saving} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Notes (optional)</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              disabled={saving}
              className="w-full rounded-none border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
