"use client";

import { useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createCatalogProduct, updateCatalogProduct } from "@/lib/api/use-catalog-products";
import { downloadXlsx, readXlsx } from "@/lib/list-io/spreadsheet";
import type { Category } from "@/lib/mock-data/categories";
import type { Product } from "@/lib/mock-data/products";

/** The header names this import understands - the same words the list's Export writes for those columns (any subset, any order). */
const HEADER_FIELDS: Record<string, string> = {
  name: "name",
  "product name": "name",
  sku: "sku",
  model: "model",
  slug: "slug",
  price: "price",
  "compare-at price": "compare_at_price",
  "compare at price": "compare_at_price",
  "cost price": "purchase_price",
  stock: "stock",
  status: "status",
  category: "category",
  brand: "brand",
  warranty: "warranty",
  "seo title": "seo_title",
  remarks: "remarks",
  "source link": "source_url",
  source_url: "source_url",
};

const SAMPLE_HEADERS = ["Name", "SKU", "Model", "Slug", "Price", "Compare-at price", "Cost price", "Stock", "Status", "Category", "Brand", "Warranty", "SEO Title", "Remarks"];
const SAMPLE_ROW = ["Sample Laptop 15", "SKU-000001", "SL-15", "sample-laptop-15", 65000, 70000, 58000, 10, "draft", "Laptop", "Asus", "1 Year", "Sample Laptop 15 price in Bangladesh", "imported from Excel"];
const STATUSES = ["draft", "published", "unlisted", "archived"];

type Plan = {
  row: number; // the row number in the Excel file
  mode: "create" | "update";
  productId?: string;
  data: Record<string, unknown>;
  label: string;
};
type Parsed = { plans: Plan[]; problems: string[]; ignored: string[]; total: number };

function toNumber(v: string): number | null {
  const n = Number(v.replace(/[^\d.-]/g, ""));
  return v.trim() && Number.isFinite(n) ? n : null;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "product";
}

function parseSheet(rows: string[][], products: Product[], categories: Category[]): Parsed {
  const problems: string[] = [];
  if (rows.length < 2) return { plans: [], problems: ["The file has no data rows (the first row must be the header)."], ignored: [], total: 0 };
  const headers = rows[0].map((h) => h.trim());
  const fields = headers.map((h) => HEADER_FIELDS[h.toLowerCase()] ?? null);
  const ignored = headers.filter((h, i) => h && !fields[i]);
  const bySku = new Map(products.map((p) => [p.sku.trim().toLowerCase(), p]));
  const catByName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const plans: Plan[] = [];

  rows.slice(1).forEach((cells, i) => {
    const rowNo = i + 2;
    if (!cells.some((c) => c.trim())) return;
    const get = (field: string) => {
      const idx = fields.indexOf(field);
      return idx === -1 ? undefined : (cells[idx] ?? "").trim();
    };
    const sku = get("sku") ?? "";
    const existing = sku ? bySku.get(sku.toLowerCase()) : undefined;
    const data: Record<string, unknown> = {};
    const bad = (msg: string) => problems.push(`Row ${rowNo}: ${msg}`);
    let ok = true;

    const name = get("name");
    if (name !== undefined && name) data.name = name;
    for (const f of ["model", "slug", "warranty", "seo_title", "remarks", "source_url"] as const) {
      const v = get(f);
      if (v !== undefined && (v || existing)) data[f] = v || null;
    }
    for (const f of ["price", "compare_at_price", "purchase_price", "stock"] as const) {
      const v = get(f);
      if (v === undefined || (!v && !existing)) continue;
      if (!v) {
        if (f === "compare_at_price" || f === "purchase_price") data[f] = null;
        continue;
      }
      const n = toNumber(v);
      if (n === null || n < 0) {
        bad(`${f.replace(/_/g, " ")} "${v}" is not a number`);
        ok = false;
      } else data[f] = f === "stock" ? Math.round(n) : n;
    }
    const status = get("status");
    if (status) {
      const s = status.toLowerCase();
      if (STATUSES.includes(s)) data.status = s;
      else {
        bad(`status "${status}" must be one of ${STATUSES.join(" / ")}`);
        ok = false;
      }
    }
    const category = get("category");
    if (category) {
      const ids: string[] = [];
      for (const part of category.split(/[;,|]/).map((x) => x.trim()).filter(Boolean)) {
        const id = catByName.get(part.toLowerCase());
        if (id) ids.push(id);
        else bad(`category "${part}" does not exist (left out)`);
      }
      if (ids.length) data.category_ids = ids;
    }
    const brand = get("brand");
    if (brand) data.brand = brand;

    if (!existing) {
      if (!data.name) {
        bad("a new product needs a Name");
        ok = false;
      }
      if (data.price === undefined) {
        bad("a new product needs a Price");
        ok = false;
      }
    }
    if (!ok) return;
    if (existing) plans.push({ row: rowNo, mode: "update", productId: existing.id, data, label: `${existing.sku} - ${existing.name}` });
    else {
      data.slug = (data.slug as string | undefined) || slugify(String(data.name));
      data.sku = sku;
      plans.push({ row: rowNo, mode: "create", data, label: String(data.name) });
    }
  });
  return { plans, problems, ignored, total: rows.length - 1 };
}

/**
 * Products > Import from Excel. The file is read in the browser; a preview says what will be created / updated (a row whose SKU already exists
 * updates that product - only the columns present in the file; any other row creates a new product) and what is wrong, then it is applied.
 * Any subset of the columns the list's Export writes works; "Download sample" gives a ready template.
 */
export function ProductImportDialog({
  open,
  onOpenChange,
  products,
  categories,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  categories: Category[];
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [reading, setReading] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failures, setFailures] = useState<string[]>([]);

  const counts = useMemo(
    () => ({
      create: parsed?.plans.filter((p) => p.mode === "create").length ?? 0,
      update: parsed?.plans.filter((p) => p.mode === "update").length ?? 0,
    }),
    [parsed],
  );

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
      setParsed(parseSheet(rows, products, categories));
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
          if (plan.mode === "update" && plan.productId) await updateCatalogProduct(plan.productId, plan.data);
          else
            await createCatalogProduct({
              name: String(plan.data.name),
              slug: String(plan.data.slug),
              sku: String(plan.data.sku ?? ""),
              price: Number(plan.data.price),
              ...plan.data,
              in_inventory: false,
              on_website: true,
            } as Parameters<typeof createCatalogProduct>[0]);
        } catch (err) {
          errors.push(`Row ${plan.row} (${plan.label}): ${err instanceof Error ? err.message : "failed"}`);
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
      toast.success(`${okCount} product${okCount === 1 ? "" : "s"} imported${errors.length ? `, ${errors.length} failed` : ""}`);
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
            <FileSpreadsheet className="h-4 w-4" /> Import products from Excel
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            Use the same columns the list&apos;s Export writes (any of them, in any order): Name, SKU, Model, Slug, Price, Compare-at price, Cost price,
            Stock, Status, Category, Brand, Warranty, SEO Title, Remarks. A row whose <b>SKU already exists updates that product</b> (only the columns in the
            file); any other row <b>creates a new product</b> (Name and Price needed; a blank SKU gets the next serial). Several categories: separate them
            with commas.
          </Dialog.Description>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void downloadXlsx({ headers: SAMPLE_HEADERS, rows: [SAMPLE_ROW] }, "products-import-sample", "Products")}
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
                <b>{counts.create}</b> new product{counts.create === 1 ? "" : "s"} · <b>{counts.update}</b> to update · <b>{parsed.problems.length}</b> problem
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
              {parsed && parsed.plans.length ? `Import ${parsed.plans.length} row${parsed.plans.length === 1 ? "" : "s"}` : "Import"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
