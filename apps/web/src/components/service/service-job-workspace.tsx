"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useInventoryWarehouses } from "@/lib/api/use-inventory";
import {
  SERVICE_JOB_STATUS_LABEL,
  SERVICE_JOB_STATUS_TONE,
  SERVICE_JOB_TYPE_LABEL,
  addServiceJobLine,
  approveServiceJob,
  billServiceJob,
  cancelServiceJob,
  completeServiceWork,
  diagnoseServiceJob,
  deliverServiceJob,
  fetchServiceJob,
  fetchServiceJobHistory,
  patchServiceJob,
  qcServiceJob,
  rejectServiceJob,
  removeServiceJobLine,
  searchServiceCatalog,
  startServiceDiagnosis,
  startServiceJob,
  type ServiceCatalogItem,
  type ServiceJob,
  type ServiceJobHistory,
} from "@/lib/api/service-jobs";
import { cn, formatCurrency } from "@/lib/utils";

type TabId =
  | "overview"
  | "complaint"
  | "diagnosis"
  | "work"
  | "qc"
  | "invoice"
  | "timeline";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "complaint", label: "Complaint" },
  { id: "diagnosis", label: "Diagnosis" },
  { id: "work", label: "Work" },
  { id: "qc", label: "QC" },
  { id: "invoice", label: "Invoice" },
  { id: "timeline", label: "Timeline" },
];

function Row({ label, value }: { label: string; children?: never; value?: string | number | null }) {
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
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      <div className="px-3 py-2">{children}</div>
    </section>
  );
}

export function ServiceJobWorkspace({
  jobId,
  open,
  onOpenChange,
  onChanged,
  canWrite = true,
}: {
  jobId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
  canWrite?: boolean;
}) {
  const { warehouses } = useInventoryWarehouses();
  const [job, setJob] = useState<ServiceJob | null>(null);
  const [history, setHistory] = useState<ServiceJobHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<TabId>("overview");
  const [busy, setBusy] = useState(false);

  const [diagnosis, setDiagnosis] = useState("");
  const [foundProblems, setFoundProblems] = useState("");
  const [recommended, setRecommended] = useState("");
  const [estCost, setEstCost] = useState("0");
  const [estHours, setEstHours] = useState("0");
  const [qcNotes, setQcNotes] = useState("");
  const [deliveredBy, setDeliveredBy] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [catalogQ, setCatalogQ] = useState("");
  const [catalog, setCatalog] = useState<ServiceCatalogItem[]>([]);
  const [customName, setCustomName] = useState("");
  const [customRate, setCustomRate] = useState("");
  const [customQty, setCustomQty] = useState("1");
  const [warehouseId, setWarehouseId] = useState("");

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const [row, hist] = await Promise.all([fetchServiceJob(jobId), fetchServiceJobHistory(jobId)]);
      setJob(row);
      setHistory(hist);
      setDiagnosis(row.diagnosis ?? "");
      setFoundProblems(row.found_problems ?? "");
      setRecommended(row.recommended_action ?? "");
      setEstCost(String(row.estimated_cost ?? "0"));
      setEstHours(String(row.estimated_hours ?? "0"));
      setQcNotes(row.qc_notes ?? "");
      setDeliveredBy(row.delivered_by ?? "");
      setReceivedBy(row.received_by_name ?? "");
      setWarehouseId(row.warehouse_id ?? "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load job card");
      setJob(null);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (open && jobId) void load();
  }, [open, jobId, load]);

  useEffect(() => {
    if (!catalogQ.trim()) return;
    const t = window.setTimeout(() => {
      void searchServiceCatalog(catalogQ)
        .then(setCatalog)
        .catch(() => setCatalog([]));
    }, 200);
    return () => window.clearTimeout(t);
  }, [catalogQ]);

  const run = async (fn: () => Promise<ServiceJob>, ok: string) => {
    setBusy(true);
    try {
      const next = await fn();
      setJob(next);
      toast.success(ok);
      onChanged?.();
      void fetchServiceJobHistory(next.id).then(setHistory).catch(() => undefined);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const warranty = job?.service_type === "warranty_repair";
  const services = catalogQ.trim() ? catalog.filter((c) => c.kind === "service") : [];
  const parts = catalogQ.trim() ? catalog.filter((c) => c.kind === "part") : [];

  const actions = (() => {
    if (!job || !canWrite) return [];
    const out: { label: string; onClick: () => void; variant?: "default" | "outline" }[] = [];
    if (job.status === "received") {
      out.push({
        label: "Start diagnosis",
        onClick: () => {
          setTab("diagnosis");
          void run(() => startServiceDiagnosis(job.id), "Diagnosis started");
        },
      });
      out.push({
        label: "Start work",
        variant: "outline",
        onClick: () => void run(() => startServiceJob(job.id), "Work started"),
      });
    }
    if (job.status === "diagnosis") {
      out.push({ label: "Save diagnosis", onClick: () => setTab("diagnosis") });
    }
    if (job.status === "waiting_approval") {
      out.push({
        label: "Approve",
        onClick: () => void run(() => approveServiceJob(job.id), "Customer approved"),
      });
      out.push({
        label: "Reject",
        variant: "outline",
        onClick: () => void run(() => rejectServiceJob(job.id, "Customer rejected"), "Rejected"),
      });
    }
    if (job.status === "approved") {
      out.push({
        label: "Start work",
        onClick: () => void run(() => startServiceJob(job.id), "Work started"),
      });
    }
    if (job.status === "in_progress" || job.status === "waiting_parts") {
      out.push({ label: "Add parts / service", variant: "outline", onClick: () => setTab("work") });
      out.push({
        label: "Complete work",
        onClick: () => void run(() => completeServiceWork(job.id), "Ready for QC"),
      });
    }
    if (job.status === "ready_for_qc") {
      out.push({ label: "QC", onClick: () => setTab("qc") });
    }
    if (job.status === "ready_for_delivery") {
      out.push({
        label: "Deliver",
        onClick: () => setTab("qc"),
      });
    }
    if (job.is_billable && job.bill_status !== "billed" && job.customer_id) {
      out.push({
        label: "Raise invoice",
        variant: "outline",
        onClick: () => void run(() => billServiceJob(job.id), "Invoice raised"),
      });
    }
    if (!["completed", "cancelled"].includes(job.status)) {
      out.push({
        label: "Cancel",
        variant: "outline",
        onClick: () => void run(() => cancelServiceJob(job.id), "Job cancelled"),
      });
    }
    return out;
  })();

  const addCatalogLine = async (item: ServiceCatalogItem) => {
    if (!job) return;
    const wh = warehouseId || job.warehouse_id;
    if (item.kind === "part" && !wh) {
      toast.error("Choose a warehouse before using inventory parts");
      return;
    }
    await run(
      () =>
        addServiceJobLine(job.id, {
          kind: item.kind,
          item_id: item.id,
          name: item.name,
          sku: item.sku,
          unit: item.unit,
          unit_price: Number(item.rate) || 0,
          quantity: 1,
          warehouse_id: item.kind === "part" ? wh : undefined,
        }),
      `${item.name} added`,
    );
    setCatalogQ("");
    setCatalog([]);
  };

  const addCustom = async () => {
    if (!job || !customName.trim()) return;
    await run(
      () =>
        addServiceJobLine(job.id, {
          kind: "custom",
          name: customName.trim(),
          unit: "job",
          unit_price: Number(customRate) || 0,
          quantity: Number(customQty) || 1,
        }),
      "Custom service added",
    );
    setCustomName("");
    setCustomRate("");
    setCustomQty("1");
  };

  const saveDiagnosis = async () => {
    if (!job || !diagnosis.trim()) {
      toast.error("Diagnosis notes are required");
      return;
    }
    await run(
      () =>
        diagnoseServiceJob(job.id, {
          diagnosis: diagnosis.trim(),
          found_problems: foundProblems.trim() || undefined,
          recommended_action: recommended.trim() || undefined,
          estimated_cost: Number(estCost) || 0,
          estimated_hours: Number(estHours) || 0,
        }),
      "Diagnosis saved",
    );
  };

  const saveWarehouse = async (id: string) => {
    if (!job) return;
    setWarehouseId(id);
    await run(() => patchServiceJob(job.id, { warehouse_id: id }), "Warehouse saved");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        closeButton="inside"
        resizable
        className="flex min-w-[160px] w-[720px] max-w-[960px] flex-col p-0"
      >
        {!job && loading ? (
          <p className="px-4 py-6 text-xs text-muted-foreground">Loading job card…</p>
        ) : !job ? (
          <p className="px-4 py-6 text-xs text-muted-foreground">Job card not found.</p>
        ) : (
          <>
            <div className="border-b border-border px-4 py-3 pr-10">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-mono text-sm font-semibold">{job.job_number}</h2>
                <Badge
                  variant="outline"
                  className={cn("rounded-none text-[10px]", SERVICE_JOB_STATUS_TONE[job.status])}
                >
                  {SERVICE_JOB_STATUS_LABEL[job.status] ?? job.status}
                </Badge>
                <Badge variant="outline" className="rounded-none text-[10px]">
                  {SERVICE_JOB_TYPE_LABEL[job.service_type] ?? job.service_type}
                </Badge>
                <span className="text-[11px] text-muted-foreground">{job.priority}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {job.customer_name}
                {job.product_name ? ` · ${job.product_name}` : ""}
                {job.technician_name ? ` · ${job.technician_name}` : ""}
              </p>
              {warranty || job.rma_id ? (
                <div className="mt-2 border border-border bg-muted/40 px-2 py-1.5 text-[11px]">
                  Source: {job.rma_id ? (
                    <Link href={`/inventory/rma?claim=${job.rma_id}`} className="text-primary hover:underline">
                      RMA
                    </Link>
                  ) : (
                    "Walk-in"
                  )}
                  {" · "}
                  Warranty: {warranty ? "Covered" : "Not covered"}
                  {" · "}
                  Customer charge: {warranty ? formatCurrency(0) : formatCurrency(Number(job.total))}
                </div>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {actions.map((a) => (
                  <Button
                    key={a.label}
                    size="sm"
                    variant={a.variant ?? "default"}
                    className="rounded-none"
                    disabled={busy}
                    onClick={a.onClick}
                  >
                    {a.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex shrink-0 gap-0 overflow-x-auto border-b border-border">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={cn(
                    "shrink-0 border-b-2 px-3 py-1.5 text-[12px]",
                    tab === t.id
                      ? "border-primary font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              {tab === "overview" ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  <Panel title="Customer">
                    <Row label="Name" value={job.customer_name} />
                    <Row label="Phone" value={job.customer_phone} />
                    <Row label="Email" value={job.customer_email} />
                    <Row label="Technician" value={job.technician_name} />
                    <Row label="Expected" value={job.expected_at?.slice(0, 10)} />
                  </Panel>
                  <Panel title="Device">
                    <Row label="Product" value={job.product_name} />
                    <Row label="Brand" value={job.brand} />
                    <Row label="Model" value={job.model} />
                    <Row label="SKU" value={job.sku} />
                    <Row label="Serial" value={job.serial_number} />
                    <Row label="IMEI" value={job.imei} />
                  </Panel>
                </div>
              ) : null}

              {tab === "complaint" ? (
                <Panel title="Customer complaint">
                  <p className="whitespace-pre-wrap text-xs">{job.issue || "—"}</p>
                  <div className="mt-3 border-t border-border pt-2">
                    <p className="text-[11px] text-muted-foreground">Received condition</p>
                    <p className="mt-1 whitespace-pre-wrap text-xs">{job.condition_notes || "—"}</p>
                  </div>
                </Panel>
              ) : null}

              {tab === "diagnosis" ? (
                <Panel title="Diagnosis">
                  <div className="space-y-2">
                    <Textarea
                      value={diagnosis}
                      onChange={(e) => setDiagnosis(e.target.value)}
                      rows={4}
                      placeholder="Found problems / diagnosis"
                      disabled={!canWrite}
                    />
                    <Textarea
                      value={foundProblems}
                      onChange={(e) => setFoundProblems(e.target.value)}
                      rows={2}
                      placeholder="Found problems"
                      disabled={!canWrite}
                    />
                    <Textarea
                      value={recommended}
                      onChange={(e) => setRecommended(e.target.value)}
                      rows={2}
                      placeholder="Recommended action"
                      disabled={!canWrite}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] text-muted-foreground">Estimated cost</label>
                        <Input
                          type="number"
                          min={0}
                          value={estCost}
                          onChange={(e) => setEstCost(e.target.value)}
                          className="rounded-none"
                          disabled={!canWrite}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-muted-foreground">Estimated hours</label>
                        <Input
                          type="number"
                          min={0}
                          value={estHours}
                          onChange={(e) => setEstHours(e.target.value)}
                          className="rounded-none"
                          disabled={!canWrite}
                        />
                      </div>
                    </div>
                    {canWrite && ["received", "diagnosis", "on_hold"].includes(job.status) ? (
                      <Button
                        size="sm"
                        className="rounded-none"
                        disabled={busy}
                        onClick={() => void saveDiagnosis()}
                      >
                        Save diagnosis
                      </Button>
                    ) : null}
                    <p className="text-[11px] text-muted-foreground">
                      Status: {job.diagnosis_status}
                      {job.approval_status !== "not_required"
                        ? ` · Approval: ${job.approval_status}`
                        : ""}
                    </p>
                  </div>
                </Panel>
              ) : null}

              {tab === "work" ? (
                <div className="space-y-3">
                  <Panel
                    title="Warehouse"
                    action={
                      <Select
                        value={warehouseId}
                        onChange={(e) => void saveWarehouse(e.target.value)}
                        className="h-7 w-[180px]"
                        disabled={!canWrite}
                      >
                        <option value="">Select</option>
                        {warehouses
                          .filter((w) => w.active)
                          .map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                      </Select>
                    }
                  >
                    <p className="text-[11px] text-muted-foreground">
                      Inventory parts deduct stock through stock movements. Service lines never move stock.
                    </p>
                  </Panel>
                  {canWrite ? (
                    <Panel title="Add item">
                      <Input
                        value={catalogQ}
                        onChange={(e) => setCatalogQ(e.target.value)}
                        className="rounded-none"
                        placeholder="Search services and products…"
                      />
                      {catalog.length > 0 ? (
                        <div className="mt-2 max-h-48 overflow-auto border border-border">
                          {services.length > 0 ? (
                            <>
                              <div className="bg-muted/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Services
                              </div>
                              {services.map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  className="flex w-full items-center justify-between border-b border-border px-2 py-1.5 text-left text-xs last:border-b-0 hover:bg-accent"
                                  onClick={() => void addCatalogLine(item)}
                                >
                                  <span>
                                    {item.name}
                                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                                      {item.sku}
                                    </span>
                                  </span>
                                  <span className="tabular-nums">{formatCurrency(Number(item.rate))}</span>
                                </button>
                              ))}
                            </>
                          ) : null}
                          {parts.length > 0 ? (
                            <>
                              <div className="bg-muted/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Products
                              </div>
                              {parts.map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  className="flex w-full items-center justify-between border-b border-border px-2 py-1.5 text-left text-xs last:border-b-0 hover:bg-accent"
                                  onClick={() => void addCatalogLine(item)}
                                >
                                  <span>
                                    {item.name}
                                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                                      {item.sku}
                                    </span>
                                  </span>
                                  <span className="tabular-nums">{formatCurrency(Number(item.rate))}</span>
                                </button>
                              ))}
                            </>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="mt-3 grid grid-cols-[1fr_80px_80px_auto] gap-1.5">
                        <Input
                          value={customName}
                          onChange={(e) => setCustomName(e.target.value)}
                          className="rounded-none"
                          placeholder="Custom service name"
                        />
                        <Input
                          type="number"
                          min={1}
                          value={customQty}
                          onChange={(e) => setCustomQty(e.target.value)}
                          className="rounded-none"
                          placeholder="Qty"
                        />
                        <Input
                          type="number"
                          min={0}
                          value={customRate}
                          onChange={(e) => setCustomRate(e.target.value)}
                          className="rounded-none"
                          placeholder="Rate"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-none"
                          disabled={busy || !customName.trim()}
                          onClick={() => void addCustom()}
                        >
                          Add
                        </Button>
                      </div>
                    </Panel>
                  ) : null}
                  <Panel title="Lines">
                    {job.lines.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No service or parts yet.</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead className="text-left text-[11px] text-muted-foreground">
                          <tr>
                            <th className="py-1 font-medium">Type</th>
                            <th className="py-1 font-medium">Item</th>
                            <th className="py-1 text-right font-medium">Qty</th>
                            <th className="py-1 text-right font-medium">Total</th>
                            <th className="py-1" />
                          </tr>
                        </thead>
                        <tbody>
                          {job.lines.map((line) => (
                            <tr key={line.id} className="border-t border-border">
                              <td className="py-1.5 capitalize">{line.kind}</td>
                              <td className="py-1.5">
                                {line.name}
                                {line.stock_moved ? (
                                  <span className="ml-1 text-[10px] text-muted-foreground">stock out</span>
                                ) : null}
                              </td>
                              <td className="py-1.5 text-right tabular-nums">{line.quantity}</td>
                              <td className="py-1.5 text-right tabular-nums">
                                {formatCurrency(Number(line.line_total))}
                              </td>
                              <td className="py-1.5 text-right">
                                {canWrite && !line.stock_moved ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-none"
                                    disabled={busy}
                                    onClick={() =>
                                      void run(
                                        () => removeServiceJobLine(job.id, line.id),
                                        "Line removed",
                                      )
                                    }
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <div className="mt-2 flex justify-end gap-4 text-xs">
                      <span>Labour {formatCurrency(Number(job.labour_total))}</span>
                      <span>Parts {formatCurrency(Number(job.parts_total))}</span>
                      <span className="font-medium">Total {formatCurrency(Number(job.total))}</span>
                    </div>
                  </Panel>
                </div>
              ) : null}

              {tab === "qc" ? (
                <div className="space-y-3">
                  <Panel title="Quality check">
                    <Row label="QC status" value={job.qc_status} />
                    <Row label="Checked by" value={job.qc_checked_by} />
                    <Row
                      label="Checked"
                      value={job.qc_checked_at?.slice(0, 16).replace("T", " ")}
                    />
                    <Textarea
                      className="mt-2"
                      value={qcNotes}
                      onChange={(e) => setQcNotes(e.target.value)}
                      rows={3}
                      placeholder="QC notes"
                      disabled={!canWrite}
                    />
                    {canWrite && job.status === "ready_for_qc" ? (
                      <div className="mt-2 flex gap-1.5">
                        <Button
                          size="sm"
                          className="rounded-none"
                          disabled={busy}
                          onClick={() =>
                            void run(() => qcServiceJob(job.id, "passed", qcNotes), "QC passed")
                          }
                        >
                          Pass
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-none"
                          disabled={busy}
                          onClick={() =>
                            void run(() => qcServiceJob(job.id, "failed", qcNotes), "QC failed — back to work")
                          }
                        >
                          Fail
                        </Button>
                      </div>
                    ) : null}
                  </Panel>
                  <Panel title="Delivery">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] text-muted-foreground">Delivered by</label>
                        <Input
                          value={deliveredBy}
                          onChange={(e) => setDeliveredBy(e.target.value)}
                          className="rounded-none"
                          disabled={!canWrite}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-muted-foreground">Received by</label>
                        <Input
                          value={receivedBy}
                          onChange={(e) => setReceivedBy(e.target.value)}
                          className="rounded-none"
                          disabled={!canWrite}
                        />
                      </div>
                    </div>
                    <Textarea
                      className="mt-2"
                      value={deliveryNotes}
                      onChange={(e) => setDeliveryNotes(e.target.value)}
                      rows={2}
                      placeholder="Delivery notes"
                      disabled={!canWrite}
                    />
                    {canWrite && job.status === "ready_for_delivery" ? (
                      <Button
                        size="sm"
                        className="mt-2 rounded-none"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              deliverServiceJob(job.id, {
                                delivered_by: deliveredBy || undefined,
                                received_by_name: receivedBy || undefined,
                                notes: deliveryNotes || undefined,
                              }),
                            "Job completed",
                          )
                        }
                      >
                        Complete delivery
                      </Button>
                    ) : null}
                    <Row label="Delivered" value={job.delivered_at?.slice(0, 16).replace("T", " ")} />
                  </Panel>
                </div>
              ) : null}

              {tab === "invoice" ? (
                <Panel title="Invoice">
                  <Row label="Billable" value={job.is_billable ? "Yes" : "No"} />
                  <Row label="Status" value={job.bill_status} />
                  <Row label="Invoice" value={job.invoice_number} />
                  <Row label="Total" value={formatCurrency(Number(job.total))} />
                  {job.invoice_number ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Record payment in{" "}
                      <Link href="/finance/receivables" className="text-primary hover:underline">
                        Finance → Receivables
                      </Link>
                      .
                    </p>
                  ) : warranty ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Warranty repair — no customer invoice.
                    </p>
                  ) : !job.customer_id ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Link a CRM customer before raising an invoice.
                    </p>
                  ) : canWrite ? (
                    <Button
                      size="sm"
                      className="mt-2 rounded-none"
                      disabled={busy || !job.is_billable}
                      onClick={() => void run(() => billServiceJob(job.id), "Invoice raised")}
                    >
                      Raise invoice
                    </Button>
                  ) : null}
                </Panel>
              ) : null}

              {tab === "timeline" ? (
                <Panel title="Activity">
                  {history.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No history yet.</p>
                  ) : (
                    <ol className="space-y-2">
                      {history.map((entry) => (
                        <li key={entry.id} className="border-b border-border pb-2 last:border-b-0">
                          <p className="text-xs">
                            {entry.from_status
                              ? `${SERVICE_JOB_STATUS_LABEL[entry.from_status] ?? entry.from_status} → `
                              : ""}
                            {SERVICE_JOB_STATUS_LABEL[entry.to_status] ?? entry.to_status}
                          </p>
                          {entry.note ? (
                            <p className="text-[11px] text-muted-foreground">{entry.note}</p>
                          ) : null}
                          <p className="text-[10px] text-muted-foreground">
                            {entry.created_at.slice(0, 16).replace("T", " ")}
                          </p>
                        </li>
                      ))}
                    </ol>
                  )}
                </Panel>
              ) : null}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
