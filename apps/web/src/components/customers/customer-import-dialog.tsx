"use client";

import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createCommerceCustomer, type CreateCustomerInput } from "@/lib/api/commerce-customers";
import { downloadXlsx, readXlsx } from "@/lib/list-io/spreadsheet";
import type { Customer, CustomerGroup } from "@/lib/mock-data/customers";

/** The header names this import understands (any subset, any order; matched without case). */
const HEADER_FIELDS: Record<string, keyof CreateCustomerInput> = {
  name: "name",
  "customer name": "name",
  phone: "phone",
  mobile: "phone",
  email: "email",
  group: "group",
  city: "city",
  region: "region",
  district: "region",
  country: "country",
  notes: "notes",
  "opening balance": "openingBalance",
  "credit limit": "creditLimit",
};

const GROUPS: CustomerGroup[] = ["retail", "wholesale", "dealer", "corporate", "vip", "employee", "partner"];
const SAMPLE_HEADERS = ["Name", "Phone", "Email", "Group", "City", "Region", "Country", "Opening balance", "Credit limit", "Notes"];
const SAMPLE_ROW = ["Rahim Traders", "01711000000", "rahim@example.com", "wholesale", "Dhaka", "Dhaka", "Bangladesh", 0, 50000, "imported from Excel"];

type Plan = { row: number; input: CreateCustomerInput };
type Parsed = { plans: Plan[]; problems: string[]; ignored: string[]; total: number };

const digits = (v: string) => v.replace(/\D/g, "");

function parseSheet(rows: string[][], existing: Customer[]): Parsed {
  if (rows.length < 2) return { plans: [], problems: ["The file has no data rows (the first row must be the header)."], ignored: [], total: 0 };
  const headers = rows[0].map((h) => h.trim());
  const fields = headers.map((h) => HEADER_FIELDS[h.toLowerCase()] ?? null);
  const ignored = headers.filter((h, i) => h && !fields[i]);
  const knownPhones = new Set(existing.map((c) => digits(c.phone ?? "")).filter(Boolean));
  const knownEmails = new Set(existing.map((c) => (c.email ?? "").trim().toLowerCase()).filter(Boolean));
  const problems: string[] = [];
  const plans: Plan[] = [];

  rows.slice(1).forEach((cells, i) => {
    const rowNo = i + 2;
    if (!cells.some((c) => c.trim())) return;
    const get = (field: keyof CreateCustomerInput) => {
      const idx = fields.indexOf(field);
      return idx === -1 ? "" : (cells[idx] ?? "").trim();
    };
    const name = get("name");
    if (!name) {
      problems.push(`Row ${rowNo}: a customer needs a Name`);
      return;
    }
    const phone = get("phone");
    const email = get("email");
    if (phone && knownPhones.has(digits(phone))) {
      problems.push(`Row ${rowNo}: ${name} — phone ${phone} already belongs to a customer (skipped)`);
      return;
    }
    if (email && knownEmails.has(email.toLowerCase())) {
      problems.push(`Row ${rowNo}: ${name} — email ${email} already belongs to a customer (skipped)`);
      return;
    }
    const input: CreateCustomerInput = { name };
    if (phone) input.phone = phone;
    if (email) input.email = email;
    const group = get("group").toLowerCase();
    if (group) {
      if (GROUPS.includes(group as CustomerGroup)) input.group = group as CustomerGroup;
      else problems.push(`Row ${rowNo}: group "${group}" is not one of ${GROUPS.join(" / ")} (retail used)`);
    }
    for (const f of ["city", "region", "country", "notes"] as const) {
      const v = get(f);
      if (v) input[f] = v;
    }
    for (const f of ["openingBalance", "creditLimit"] as const) {
      const v = get(f);
      if (!v) continue;
      const n = Number(v.replace(/[^\d.-]/g, ""));
      if (Number.isFinite(n)) input[f] = n;
      else problems.push(`Row ${rowNo}: "${v}" is not a number (left out)`);
    }
    if (phone) knownPhones.add(digits(phone));
    if (email) knownEmails.add(email.toLowerCase());
    plans.push({ row: rowNo, input });
  });
  return { plans, problems, ignored, total: rows.length - 1 };
}

/**
 * Customers > Import from Excel. Each row creates a customer (Name needed); rows whose phone or email already belongs
 * to a customer are skipped. The file is read in the browser and previewed before anything is created.
 */
export function CustomerImportDialog({
  open,
  onOpenChange,
  customers,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: Customer[];
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [reading, setReading] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failures, setFailures] = useState<string[]>([]);

  const reset = () => {
    setFileName("");
    setParsed(null);
    setProgress(0);
    setFailures([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setFailures([]);
    try {
      const rows = await readXlsx(file);
      setFileName(file.name);
      setParsed(parseSheet(rows, customers));
    } catch (err) {
      toast.error(err instanceof Error ? `Could not read the file: ${err.message}` : "Could not read the file");
      reset();
    } finally {
      setReading(false);
    }
  };

  const run = async () => {
    if (!parsed || parsed.plans.length === 0) return;
    setRunning(true);
    setProgress(0);
    const errors: string[] = [];
    let next = 0;
    let done = 0;
    const worker = async () => {
      while (next < parsed.plans.length) {
        const plan = parsed.plans[next];
        next += 1;
        try {
          await createCommerceCustomer(plan.input);
        } catch (err) {
          errors.push(`Row ${plan.row} (${plan.input.name}): ${err instanceof Error ? err.message : "failed"}`);
        }
        done += 1;
        setProgress(done);
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    setRunning(false);
    setFailures(errors);
    const okCount = parsed.plans.length - errors.length;
    if (okCount > 0) {
      toast.success(`${okCount} customer${okCount === 1 ? "" : "s"} imported${errors.length ? `, ${errors.length} failed` : ""}`);
      onDone();
    } else toast.error("Nothing was imported");
    if (errors.length === 0) {
      reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (running) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-input bg-background p-6 shadow-xl">
          <Dialog.Title className="flex items-center gap-2 text-base font-semibold">
            <FileSpreadsheet className="h-4 w-4" /> Import customers from Excel
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            Columns (any of them, in any order): Name, Phone, Email, Group, City, Region, Country, Opening balance, Credit limit, Notes. Every row{" "}
            <b>creates a new customer</b> (Name needed). A row whose phone or email already belongs to a customer is skipped.
          </Dialog.Description>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void downloadXlsx({ headers: SAMPLE_HEADERS, rows: [SAMPLE_ROW] }, "customers-import-sample", "Customers")}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> Download sample Excel
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <Button type="button" size="sm" disabled={reading || running} onClick={() => fileRef.current?.click()}>
              {reading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
              {fileName ? "Choose another file" : "Choose Excel file"}
            </Button>
            {fileName ? <span className="truncate text-xs text-muted-foreground">{fileName}</span> : null}
          </div>

          {parsed ? (
            <div className="mt-4 space-y-2 border border-border p-3 text-sm">
              <p>
                <b>{parsed.plans.length}</b> new customer{parsed.plans.length === 1 ? "" : "s"} · <b>{parsed.problems.length}</b> problem
                {parsed.problems.length === 1 ? "" : "s"} (of {parsed.total} rows)
              </p>
              {parsed.ignored.length ? (
                <p className="text-xs text-muted-foreground">Columns not used: {parsed.ignored.join(", ")}</p>
              ) : null}
              {parsed.problems.length ? (
                <ul className="max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-amber-700 dark:text-amber-400">
                  {parsed.problems.slice(0, 30).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                  {parsed.problems.length > 30 ? <li>… and {parsed.problems.length - 30} more</li> : null}
                </ul>
              ) : null}
            </div>
          ) : null}

          {running ? (
            <p className="mt-3 flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Importing {progress} / {parsed?.plans.length ?? 0}…
            </p>
          ) : null}
          {failures.length ? (
            <ul className="mt-3 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-destructive">
              {failures.slice(0, 30).map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          ) : null}

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={running} onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button size="sm" disabled={running || !parsed || parsed.plans.length === 0} onClick={() => void run()}>
              {parsed && parsed.plans.length ? `Import ${parsed.plans.length} customer${parsed.plans.length === 1 ? "" : "s"}` : "Import"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
