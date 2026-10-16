"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  type AttributeAlias,
  type ChipsetLookupRow,
  type FieldSource,
  type LookupOptions,
  createAttributeAlias,
  addFieldSourceValue,
  createChipsetLookup,
  deleteAttributeAlias,
  deleteChipsetLookup,
  getLookupOptions,
  listAttributeAliases,
  listChipsetLookup,
  listFieldSources,
  updateChipsetLookup,
} from "@/lib/api/configurator-lookups";
import { useSmartPcBuilderNavStore } from "@/lib/store/smart-pc-builder-nav-store";
import { Chip, Tok, TYPE_CHIP } from "@/components/configurator/admin/pcb-ui";
import { SmartPcBuilderFieldSources } from "@/components/configurator/admin/smart-pc-builder-field-sources";

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const key = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "");
/** "LGA1700" and "lga_1700" are the same socket to the rule engine. */
const sameValue = (a: string, b: string) => key(a) === key(b);

type Draft = { id: string; chipset: string; socket: string };

export function SmartPcBuilderLookups() {
  const [rows, setRows] = useState<ChipsetLookupRow[]>([]);
  const [aliases, setAliases] = useState<AttributeAlias[]>([]);
  const [options, setOptions] = useState<LookupOptions | null>(null);
  const [sources, setSources] = useState<FieldSource[]>([]);
  // "+ নতুন মান": a value that is not in the attribute yet is added to the attribute, then used here.
  const [adding, setAdding] = useState<{ field: string; then: (value: string) => void | Promise<void> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [genRow, setGenRow] = useState<ChipsetLookupRow | null>(null);

  const [aliasForm, setAliasForm] = useState({ field_code: "", raw_pattern: "", normalized_value: "" });
  const takeAliasDraft = useSmartPcBuilderNavStore((s) => s.takeAliasDraft);
  const takeChipsetDraft = useSmartPcBuilderNavStore((s) => s.takeChipsetDraft);

  const load = useCallback(async () => {
    try {
      const [r, a, o, f] = await Promise.all([listChipsetLookup(), listAttributeAliases(), getLookupOptions(), listFieldSources()]);
      setRows(r);
      setAliases(a);
      setOptions(o);
      setSources(f);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load lookup data");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // Prefills from the Overview's "Alias বানান" / "Lookup-এ যোগ" buttons.
  useEffect(() => {
    const alias = takeAliasDraft();
    if (alias) setAliasForm(alias);
    const chipset = takeChipsetDraft();
    if (chipset?.chipset) setDrafts((d) => [{ id: `d${Date.now()}`, chipset: chipset.chipset, socket: "" }, ...d]);
  }, [takeAliasDraft, takeChipsetDraft]);

  // Aliases need a field picked once the field list arrives.
  useEffect(() => {
    if (options && !aliasForm.field_code && options.alias_fields[0]) {
      setAliasForm((f) => ({ ...f, field_code: options.alias_fields.find((x) => x.code === "socket")?.code ?? options.alias_fields[0].code }));
    }
  }, [options, aliasForm.field_code]);

  // Every dropdown here offers the values of the attribute feeding that field (Field Sources) and nothing else:
  // no starter lists, no guessed values. A value that is not in the attribute yet is added with "+ নতুন মান".
  const chipsetOptions = options?.chipsets ?? [];
  const socketOptions = options?.sockets ?? [];
  const allChipsets = chipsetOptions;
  const allSockets = socketOptions;
  const allGenerations = options?.generations ?? [];
  const ADD = "__add__";
  const sortedRows = useMemo(() => {
    const order = ["LGA1200", "LGA1700", "LGA1851", "AM4", "AM5"];
    const rank = (s: string) => {
      const i = order.findIndex((o) => sameValue(o, s));
      return i < 0 ? order.length : i;
    };
    return [...rows].sort((a, b) => rank(a.socket) - rank(b.socket) || a.chipset.localeCompare(b.chipset));
  }, [rows]);

  // Motherboard chipsets that exist on real products but aren't in the table yet.
  const missing = (options?.chipsets_in_use ?? chipsetOptions).filter(
    (c) => !rows.some((r) => sameValue(r.chipset, c)) && !drafts.some((d) => sameValue(d.chipset, c)),
  );

  const saveRow = async (row: ChipsetLookupRow, patch: Partial<ChipsetLookupRow>) => {
    const next = { ...row, ...patch };
    try {
      await updateChipsetLookup(row.id, {
        chipset: next.chipset,
        socket: next.socket,
        supported_generations: next.supported_generations,
        bios_update_generations: next.bios_update_generations,
      });
      toast.success("সেভ হয়েছে");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "সেভ হয়নি");
    }
  };

  const patchDraft = async (draft: Draft, patch: Partial<Draft>) => {
    // Use the latest typed values, not the (possibly stale) row captured by the handler.
    const latest = drafts.find((x) => x.id === draft.id) ?? draft;
    const next = { ...latest, ...patch, chipset: (patch.chipset ?? latest.chipset).trim() };
    if (!next.chipset || !next.socket) {
      setDrafts((d) => d.map((x) => (x.id === draft.id ? next : x)));
      return;
    }
    try {
      await createChipsetLookup({ chipset: next.chipset, socket: next.socket, supported_generations: "", bios_update_generations: "" });
      setDrafts((d) => d.filter((x) => x.id !== draft.id));
      toast.success("সেভ হয়েছে, এখন Gen বাছুন");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "সেভ হয়নি");
    }
  };

  const removeRow = async (row: ChipsetLookupRow) => {
    try {
      await deleteChipsetLookup(row.id);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "মোছা যায়নি");
    }
  };

  const addAlias = async () => {
    const f = aliasForm;
    if (!f.field_code || !f.raw_pattern.trim() || !f.normalized_value.trim()) {
      toast.error("দুটো ঘরই পূরণ করুন");
      return;
    }
    try {
      await createAttributeAlias({ field_code: f.field_code, raw_pattern: f.raw_pattern.trim(), normalized_value: f.normalized_value.trim() });
      setAliasForm((x) => ({ ...x, raw_pattern: "", normalized_value: "" }));
      toast.success("Alias যোগ হয়েছে");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "যোগ হয়নি");
    }
  };

  const fieldName = (code: string) => options?.alias_fields.find((f) => f.code === code)?.name ?? code;
  const dynamicChip = TYPE_CHIP.dropdown;
  // Column headers name the attribute that really feeds the field (Field Sources), e.g. "Motherboard › Chipset".
  const sourceLabel = (fieldKey: string, fallback: string) => {
    const src = sources.find((x) => x.key === fieldKey);
    return src?.attribute ? `${src.component} › ${src.attribute.name}` : fallback;
  };
  const sel = "h-8 w-full min-w-[96px] text-xs";

  const oneOf = (current: string, values: string[]) => [...new Set([...values, current].filter(Boolean))];
  const inList = (list: string[], value: string) => list.some((x) => sameValue(x, value));
  /** A current value that is not in the attribute is still shown (never silently dropped), but flagged. */
  const optionText = (value: string, list: string[]) => (inList(list, value) ? value : `${value} — অ্যাট্রিবিউটে নেই`);
  const submitAdd = async (value: string) => {
    if (!adding) return;
    try {
      const saved = await addFieldSourceValue(adding.field, value);
      await load();
      await adding.then(saved.value);
      setAdding(null);
      toast.success(`"${saved.value}" অ্যাট্রিবিউটে যোগ হয়েছে`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "যোগ হয়নি");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <SmartPcBuilderFieldSources sources={sources} onChanged={load} />
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <section className="rounded-none border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-[15px] font-semibold">Chipset Lookup</h2>
          <Button size="sm" onClick={() => setDrafts((d) => [{ id: `d${Date.now()}`, chipset: "", socket: "" }, ...d])}>
            + Chipset
          </Button>
        </div>
        <div className="grid gap-2 px-4 pt-3">
          <p className="text-xs text-muted-foreground">
            মাদারবোর্ডে শুধু Chipset থাকলেই চলবে। সব ঘর ফিল্টারের মান থেকে বাছাই হয়, তাই বানান ভুলের সুযোগ নেই।
          </p>
          {missing.length > 0 && (
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border border-border bg-muted/20 px-3 py-2 text-xs">
              <Chip cls="bg-amber-500/15 text-amber-600 dark:text-amber-400">Lookup-এ নেই</Chip>
              <div className="flex flex-wrap items-center gap-1.5">
                মাদারবোর্ডে আছে কিন্তু টেবিলে নেই: {missing.map((c) => <Tok key={c}>{c}</Tok>)}
              </div>
              <Button
                size="sm"
                className="h-7 rounded-none px-2 text-xs"
                onClick={() => {
                  setDrafts((d) => [...missing.map((c, i) => ({ id: `m${Date.now()}${i}`, chipset: c, socket: "" })), ...d]);
                  toast.success("যোগ হয়েছে, এখন Socket আর Gen বাছুন");
                }}
              >
                সবগুলো যোগ করুন
              </Button>
            </div>
          )}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">
                  Chipset <Chip cls={dynamicChip.cls}>{sourceLabel("chipset", "MB › Chipset")}</Chip>
                </th>
                <th className="px-3 py-2">
                  Socket <Chip cls={dynamicChip.cls}>{sourceLabel("socket", "CPU › Socket")}</Chip>
                </th>
                <th className="px-3 py-2">Supported Gen</th>
                <th className="px-3 py-2">BIOS আপডেট লাগবে</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="px-3 py-6 text-center text-xs text-muted-foreground">Loading…</td></tr>}
              {drafts.map((d) => (
                <tr key={d.id} className="border-b border-border/60 align-top bg-primary/5">
                  <td className="px-3 py-2.5">
                    {/* A pick-list, not a text box: the values of the Chipset attribute (Field Sources) first, then the
                        chipsets the lookup already knows, minus the ones already in the table. */}
                    {(() => {
                      const free = (c: string) =>
                        !rows.some((r) => sameValue(r.chipset, c)) && !drafts.some((x) => x.id !== d.id && sameValue(x.chipset, c));
                      const choices = chipsetOptions.filter(free);
                      const current = d.chipset && !inList(choices, d.chipset) ? [d.chipset] : [];
                      return (
                        <Select
                          value={d.chipset}
                          onChange={(e) =>
                            e.target.value === ADD
                              ? setAdding({ field: "chipset", then: (v) => patchDraft(d, { chipset: v }) })
                              : void patchDraft(d, { chipset: e.target.value })
                          }
                          className={sel}
                          aria-label="Chipset"
                        >
                          <option value="">— বাছুন —</option>
                          {[...current, ...choices].map((o) => (
                            <option key={o} value={o}>{optionText(o, chipsetOptions)}</option>
                          ))}
                          <option value={ADD}>+ নতুন মান যোগ করুন…</option>
                        </Select>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2.5">
                    <Select
                      value={d.socket}
                      onChange={(e) =>
                        e.target.value === ADD
                          ? setAdding({ field: "socket", then: (v) => patchDraft(d, { socket: v }) })
                          : void patchDraft(d, { socket: e.target.value })
                      }
                      className={sel}
                      aria-label="Socket"
                    >
                      <option value="">— বাছুন —</option>
                      {oneOf(d.socket, allSockets).map((o) => (
                        <option key={o} value={o}>{optionText(o, socketOptions)}</option>
                      ))}
                      <option value={ADD}>+ নতুন মান যোগ করুন…</option>
                    </Select>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground" colSpan={2}>
                    Chipset আর Socket বাছুন, দুটো হলে সেভ হবে। তালিকায় না থাকলে অ্যাট্রিবিউট প্রোফাইলে Chipset-এর মানে যোগ করুন
                  </td>
                  <td className="px-3 py-2.5">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => setDrafts((x) => x.filter((y) => y.id !== d.id))} aria-label="Delete">
                      ✕
                    </Button>
                  </td>
                </tr>
              ))}
              {sortedRows.map((r) => {
                const socketUnknown = !!r.socket && !inList(socketOptions, r.socket);
                const chipsetUnknown = !!r.chipset && !inList(chipsetOptions, r.chipset);
                return (
                  <tr key={r.id} className="border-b border-border/60 align-top">
                    <td className="px-3 py-2.5">
                      <Select
                        value={r.chipset}
                        onChange={(e) =>
                          e.target.value === ADD
                            ? setAdding({ field: "chipset", then: (v) => saveRow(r, { chipset: v }) })
                            : void saveRow(r, { chipset: e.target.value })
                        }
                        className={`${sel} ${chipsetUnknown ? "border-amber-500" : ""}`}
                        aria-label="Chipset"
                      >
                        {oneOf(r.chipset, allChipsets.filter((c) => !rows.some((x) => x.id !== r.id && sameValue(x.chipset, c)))).map((o) => (
                          <option key={o} value={o}>{optionText(o, chipsetOptions)}</option>
                        ))}
                        <option value={ADD}>+ নতুন মান যোগ করুন…</option>
                      </Select>
                      {chipsetUnknown && <div className="mt-1 text-[11.5px] text-amber-600">এই Chipset অ্যাট্রিবিউটে নেই, মান যোগ করুন বা অন্যটা বাছুন</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <Select
                        value={r.socket}
                        onChange={(e) =>
                          e.target.value === ADD
                            ? setAdding({ field: "socket", then: (v) => saveRow(r, { socket: v }) })
                            : void saveRow(r, { socket: e.target.value })
                        }
                        className={`${sel} ${socketUnknown ? "border-amber-500" : ""}`}
                        aria-label="Socket"
                      >
                        {oneOf(r.socket, allSockets).map((o) => (
                          <option key={o} value={o}>{optionText(o, socketOptions)}</option>
                        ))}
                        <option value={ADD}>+ নতুন মান যোগ করুন…</option>
                      </Select>
                      {socketUnknown && <div className="mt-1 text-[11.5px] text-amber-600">এই Socket অ্যাট্রিবিউটে নেই, মান যোগ করুন বা অন্যটা বাছুন</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {list(r.supported_generations).length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          list(r.supported_generations).map((g) => (
                            <Chip key={g} cls="bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">{g}</Chip>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {list(r.bios_update_generations).length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          list(r.bios_update_generations).map((g) => (
                            <Chip key={g} cls="bg-amber-500/15 text-amber-600 dark:text-amber-400">{g}</Chip>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <Button size="sm" variant="outline" className="h-7 rounded-none px-2 text-xs" onClick={() => setGenRow(r)}>
                        Gen এডিট
                      </Button>{" "}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => void removeRow(r)} aria-label="Delete">
                        ✕
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-none border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-[15px] font-semibold">Value Alias</h2>
        </div>
        <div className="grid gap-3 p-4">
          <p className="text-xs text-muted-foreground">
            পুরনো প্রোডাক্টে একই মান ভিন্নভাবে লেখা থাকতে পারে। Alias দিয়ে বিল্ডার সেগুলোকে এক মান হিসেবে ধরে, প্রোডাক্ট বদলায় না।
          </p>
          <div className="flex flex-wrap items-center gap-1.5 border border-border bg-muted/20 p-2.5">
            <Select
              value={aliasForm.field_code}
              onChange={(e) => setAliasForm((f) => ({ ...f, field_code: e.target.value, normalized_value: "" }))}
              className="h-8 w-60 text-xs"
              aria-label="Filter"
            >
              {(options?.alias_fields ?? []).map((f) => (
                <option key={f.code} value={f.code}>{f.name}</option>
              ))}
            </Select>
            <Input
              value={aliasForm.raw_pattern}
              onChange={(e) => setAliasForm((f) => ({ ...f, raw_pattern: e.target.value }))}
              placeholder="প্রোডাক্টে যা লেখা"
              className="h-8 w-40 text-xs"
            />
            <span className="font-mono font-semibold text-primary">→</span>
            {/* The correct value is picked from the values of this field's attribute (not typed). */}
            <Select
              value={aliasForm.normalized_value}
              onChange={(e) =>
                e.target.value === ADD
                  ? setAdding({ field: aliasForm.field_code, then: (v) => setAliasForm((f) => ({ ...f, normalized_value: v })) })
                  : setAliasForm((f) => ({ ...f, normalized_value: e.target.value }))
              }
              className="h-8 w-40 text-xs"
              aria-label="সঠিক মান"
            >
              <option value="">সঠিক মান বাছুন</option>
              {(options?.field_values[aliasForm.field_code] ?? []).map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
              <option value={ADD}>+ নতুন মান যোগ করুন…</option>
            </Select>
            <Button size="sm" className="h-8 rounded-none text-xs" onClick={() => void addAlias()}>যোগ</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2">Filter</th>
                  <th className="px-2 py-2">প্রোডাক্টে লেখা</th>
                  <th className="px-2 py-2">বিল্ডার ধরবে</th>
                  <th className="px-2 py-2">কয়টা প্রোডাক্ট</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {aliases.length === 0 && !loading && (
                  <tr><td colSpan={5} className="px-2 py-5 text-center text-xs text-muted-foreground">কোনো Alias নেই</td></tr>
                )}
                {aliases.map((a) => (
                  <tr key={a.id} className="border-b border-border/60">
                    <td className="px-2 py-2.5">{fieldName(a.field_code)}</td>
                    <td className="px-2 py-2.5"><Tok>{a.raw_pattern}</Tok></td>
                    <td className="px-2 py-2.5"><Tok>{a.normalized_value}</Tok></td>
                    <td className="px-2 py-2.5">{a.product_count ?? 0}</td>
                    <td className="px-2 py-2.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive"
                        aria-label="Delete"
                        onClick={() => void deleteAttributeAlias(a.id).then(load).catch((e) => toast.error(e instanceof Error ? e.message : "মোছা যায়নি"))}
                      >
                        ✕
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {genRow && (
        <GenSheet
          row={genRow}
          knownGens={allGenerations}
          onAddValue={(done) => setAdding({ field: "generation", then: done })}
          onClose={() => setGenRow(null)}
          onSave={async (supported, bios) => {
            await saveRow(genRow, { supported_generations: supported, bios_update_generations: bios });
            setGenRow(null);
          }}
        />
      )}
      </div>
      {adding && (
        <AddValueSheet
          label={sources.find((x) => x.key === adding.field)?.label ?? options?.alias_fields.find((f) => f.code === adding.field)?.name ?? adding.field}
          attributeName={(() => {
            const a = sources.find((x) => x.key === adding.field)?.attribute;
            return a ? `${a.profile_name} › ${a.name}` : "";
          })()}
          onClose={() => setAdding(null)}
          onAdd={submitAdd}
        />
      )}
    </div>
  );
}

/** A value the attribute does not have yet: it is added to the attribute's own value list, so the value lives in one place. */
function AddValueSheet({
  label,
  attributeName,
  onClose,
  onAdd,
}: {
  label: string;
  attributeName: string;
  onClose: () => void;
  onAdd: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      await onAdd(value.trim());
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-4 sm:max-w-sm">
        <div className="border-b border-input pb-3">
          <h2 className="text-base font-semibold">{label}: নতুন মান</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          মানটা {attributeName ? <b>{attributeName}</b> : "অ্যাট্রিবিউট"}-এর নিজের মানের তালিকায় যোগ হবে, এরপর সব জায়গায় (প্রোডাক্ট ফর্ম, ফিল্টার, এই Lookup) এটা পাওয়া যাবে।
        </p>
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          placeholder={`যেমন ${label === "Chipset" ? "B840" : label.includes("Socket") ? "LGA1200" : "Ryzen 9000"}`}
          aria-label="New value"
        />
        <div className="mt-auto flex justify-end gap-2 border-t border-input pt-3">
          <Button variant="outline" size="sm" onClick={onClose}>বাতিল</Button>
          <Button size="sm" disabled={!value.trim() || busy} onClick={() => void submit()}>
            {busy ? "যোগ হচ্ছে…" : "যোগ করুন"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** "Gen এডিট": which CPU generations a chipset runs, and which of those need a BIOS update. */
function GenSheet({
  row,
  knownGens,
  onAddValue,
  onClose,
  onSave,
}: {
  row: ChipsetLookupRow;
  knownGens: string[];
  onAddValue: (done: (value: string) => void) => void;
  onClose: () => void;
  onSave: (supported: string, bios: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>(list(row.supported_generations));
  const [bios, setBios] = useState<string[]>(list(row.bios_update_generations));
  // The attribute's values, plus anything this chipset already lists (kept visible, flagged when the attribute lacks it).
  const gens = [...new Set([...knownGens, ...selected])];
  const inAttribute = (g: string) => knownGens.some((x) => sameValue(x, g));

  const toggleGen = (g: string, on: boolean) => {
    setSelected((s) => (on ? [...s, g] : s.filter((x) => x !== g)));
    if (!on) setBios((b) => b.filter((x) => x !== g));
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-[620px]">
        <div className="border-b border-input pb-3">
          <h2 className="text-base font-semibold">{row.chipset || "নতুন চিপসেট"}: Generation</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          অপশনগুলো <Chip cls={TYPE_CHIP.dropdown.cls}>CPU Generation</Chip> অ্যাট্রিবিউটের মান থেকে আসছে।
        </p>
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">এই চিপসেট যে Generation চালায়</span>
          <div className="flex flex-wrap gap-1.5">
            {gens.map((g) => (
              <label key={g} className={`flex cursor-pointer items-center gap-1.5 px-2.5 py-1 text-[11.5px] font-semibold ${selected.includes(g) ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300" : "bg-muted text-muted-foreground"}`}>
                <input type="checkbox" checked={selected.includes(g)} onChange={(e) => toggleGen(g, e.target.checked)} />
                {inAttribute(g) ? g : `${g} — অ্যাট্রিবিউটে নেই`}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-none text-xs"
              onClick={() => onAddValue((g) => setSelected((x) => (x.includes(g) ? x : [...x, g])))}
            >
              + নতুন মান
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">এর মধ্যে যেগুলোতে BIOS আপডেট লাগবে</span>
          <div className="flex flex-wrap gap-1.5">
            {selected.length === 0 ? (
              <span className="text-xs text-muted-foreground">আগে উপরে Generation বাছুন</span>
            ) : (
              selected.map((g) => (
                <label key={g} className={`flex cursor-pointer items-center gap-1.5 px-2.5 py-1 text-[11.5px] font-semibold ${bios.includes(g) ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground"}`}>
                  <input type="checkbox" checked={bios.includes(g)} onChange={(e) => setBios((b) => (e.target.checked ? [...b, g] : b.filter((x) => x !== g)))} />
                  {g}
                </label>
              ))
            )}
          </div>
        </div>
        <div className="mt-auto flex justify-end gap-2 border-t border-input pt-3">
          <Button variant="outline" size="sm" onClick={onClose}>বাতিল</Button>
          <Button size="sm" onClick={() => void onSave(selected.join(", "), bios.join(", "))}>সেভ করুন</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
