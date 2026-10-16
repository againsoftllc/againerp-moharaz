"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  type OverrideProductInfo,
  type ProductOverride,
  createProductOverride,
  deleteProductOverride,
  getLookupOptions,
  getOverrideProductInfo,
  listProductOverrides,
  searchPickableProducts,
  updateProductOverride,
} from "@/lib/api/configurator-lookups";
import { Chip, Tok, TYPE_CHIP, prettyCode } from "@/components/configurator/admin/pcb-ui";

const typeChip = (fieldType?: string | null) => {
  const chip = fieldType ? TYPE_CHIP[fieldType] : undefined;
  return chip ? <Chip cls={chip.cls}>{chip.label}</Chip> : null;
};

/** Overrides tab: a PC-Builder-only value for one product + field. The catalog
 * product itself is never touched. Lookup order the builder follows:
 * Override → Alias → stored spec → Lookup. */
export function SmartPcBuilderOverrides() {
  const [rows, setRows] = useState<ProductOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ id: string | null; product_id: string; field_code: string; value: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await listProductOverrides());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load overrides");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <p className="mb-3 max-w-3xl text-xs text-muted-foreground">
        কোনো প্রোডাক্টে দরকারি মান নেই বা ভুল আছে, কিন্তু প্রোডাক্ট এডিট করতে চান না? এখানে মান দিলে বিল্ডার সেটাই ব্যবহার করবে। মান খোঁজার ক্রম:{" "}
        <Tok>Override</Tok> → <Tok>Alias</Tok> → <Tok>Filter মান</Tok> → <Tok>Lookup</Tok>
      </p>
      <section className="rounded-none border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-[15px] font-semibold">Overrides</h2>
          <Button size="sm" onClick={() => setEditing({ id: null, product_id: "", field_code: "", value: "" })}>
            + Override
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2">প্রোডাক্ট</th>
                <th className="px-3 py-2">ফিল্টার</th>
                <th className="px-3 py-2">প্রোডাক্টে আছে</th>
                <th className="px-3 py-2">বিল্ডার ধরবে</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="px-4 py-6 text-center text-xs text-muted-foreground">Loading…</td></tr>}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-5 text-center text-xs text-muted-foreground">কোনো Override নেই</td></tr>
              )}
              {rows.map((o) => (
                <tr key={o.id} className="border-b border-border/60">
                  <td className="px-4 py-3">{o.product_name ?? o.product_id}</td>
                  <td className="px-3 py-3">
                    {o.field_name ?? prettyCode(o.field_code)} {typeChip(o.field_type)}
                  </td>
                  <td className="px-3 py-3"><Tok>{o.product_value || "খালি"}</Tok></td>
                  <td className="px-3 py-3"><Tok>{o.value}</Tok></td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-none px-2 text-xs"
                      onClick={() => setEditing({ id: o.id, product_id: o.product_id, field_code: o.field_code, value: o.value })}
                    >
                      Edit
                    </Button>{" "}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive"
                      aria-label="Delete"
                      onClick={() => void deleteProductOverride(o.id).then(load).catch((e) => toast.error(e instanceof Error ? e.message : "মোছা যায়নি"))}
                    >
                      ✕
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <OverrideSheet
          initial={editing}
          existing={rows}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function OverrideSheet({
  initial,
  existing,
  onClose,
  onSaved,
}: {
  initial: { id: string | null; product_id: string; field_code: string; value: string };
  existing: ProductOverride[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [productId, setProductId] = useState(initial.product_id);
  const [productName, setProductName] = useState(existing.find((o) => o.product_id === initial.product_id)?.product_name ?? "");
  const [fieldCode, setFieldCode] = useState(initial.field_code);
  const [value, setValue] = useState(initial.value);
  const [info, setInfo] = useState<OverrideProductInfo | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  // product search
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (search.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      searchPickableProducts(search.trim())
        .then((r) => !cancelled && setResults(r))
        .catch(() => !cancelled && setResults([]));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search]);

  // fields that apply to the chosen product
  useEffect(() => {
    if (!productId) {
      setInfo(null);
      return;
    }
    let cancelled = false;
    getOverrideProductInfo(productId)
      .then((i) => {
        if (cancelled) return;
        setInfo(i);
        setProductName(i.product.name);
        setFieldCode((cur) => (cur && i.fields.some((f) => f.code === cur) ? cur : (i.fields[0]?.code ?? cur)));
      })
      .catch(() => !cancelled && setInfo(null));
    return () => {
      cancelled = true;
    };
  }, [productId]);

  useEffect(() => {
    void getLookupOptions().then((o) => setFieldValues(o.field_values)).catch(() => undefined);
  }, []);

  const field = info?.fields.find((f) => f.code === fieldCode);
  const placeholder =
    field?.field_type === "number"
      ? "শুধু সংখ্যা, যেমন 160"
      : field?.field_type === "multi_select"
        ? "কমা দিয়ে, যেমন ATX, Micro-ATX"
        : "যেমন LGA1700";

  const save = async () => {
    if (!productId || !fieldCode) {
      toast.error("প্রোডাক্ট আর ফিল্টার বাছুন");
      return;
    }
    if (!value.trim()) {
      toast.error("মান দিন");
      return;
    }
    setSaving(true);
    try {
      const body = { product_id: productId, field_code: fieldCode, value: value.trim() };
      // One override per product + field: saving over an existing pair replaces it.
      const same = existing.find((o) => o.product_id === productId && o.field_code === fieldCode);
      const targetId = initial.id ?? same?.id;
      if (targetId) await updateProductOverride(targetId, body);
      else await createProductOverride(body);
      toast.success("Override সেভ হয়েছে");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Override সেভ হয়নি");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-[620px]">
        <div className="border-b border-input pb-3">
          <h2 className="text-base font-semibold">Override দিন</h2>
        </div>
        <p className="text-xs text-muted-foreground">এই মান শুধু PC Builder মডিউলে সেভ হবে। প্রোডাক্ট পেজে কিছু বদলাবে না।</p>

        <div className="space-y-1">
          <Label className="text-xs">প্রোডাক্ট</Label>
          {productId ? (
            <div className="flex items-center justify-between border border-input bg-muted/30 px-3 py-2 text-sm">
              <span>{productName || productId}</span>
              {!initial.id && (
                <button type="button" className="text-xs text-muted-foreground underline" onClick={() => { setProductId(""); setProductName(""); setInfo(null); setSearch(""); }}>
                  বদলান
                </button>
              )}
            </div>
          ) : (
            <>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="প্রোডাক্টের নাম লিখে খুঁজুন…" autoFocus />
              <div className="grid max-h-48 gap-1 overflow-auto">
                {results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="border border-border bg-background px-2.5 py-1.5 text-left text-xs hover:bg-muted/50"
                    onClick={() => { setProductId(p.id); setProductName(p.name); }}
                  >
                    {p.name}
                  </button>
                ))}
                {search.trim().length >= 2 && results.length === 0 && (
                  <span className="text-[11px] text-muted-foreground">কিছু পাওয়া যায়নি</span>
                )}
              </div>
            </>
          )}
        </div>

        <div className="space-y-1">
          <Label className="text-xs">ফিল্টার</Label>
          <Select value={fieldCode} onChange={(e) => setFieldCode(e.target.value)} className="h-9 text-xs" disabled={!info}>
            {!info && <option value={fieldCode}>{fieldCode ? prettyCode(fieldCode) : "— আগে প্রোডাক্ট বাছুন —"}</option>}
            {info?.fields.map((f) => (
              <option key={f.code} value={f.code}>{f.name}</option>
            ))}
          </Select>
          {field && (
            <span className="text-[11px] text-muted-foreground">
              প্রোডাক্টে এখন আছে: <Tok>{field.stored_value || "খালি"}</Tok>
            </span>
          )}
        </div>

        <div className="space-y-1">
          <Label className="text-xs">বিল্ডার যে মান ধরবে</Label>
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} list="override-values" />
          <datalist id="override-values">
            {(fieldValues[fieldCode] ?? []).map((v) => <option key={v} value={v} />)}
          </datalist>
        </div>

        <div className="mt-auto flex justify-end gap-2 border-t border-input pt-3">
          <Button variant="outline" size="sm" onClick={onClose}>বাতিল</Button>
          <Button size="sm" disabled={saving} onClick={() => void save()}>সেভ করুন</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
