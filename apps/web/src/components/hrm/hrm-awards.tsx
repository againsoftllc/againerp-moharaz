"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Award as AwardIcon, Eye, Filter, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { awardAvatar, type Award } from "@/lib/mock-data/hrm-awards";
import {
  apiAwardToAward,
  createHrmAward,
  deleteHrmAward,
  listHrmAwards,
  updateHrmAward,
  type AwardLookups,
} from "@/lib/api/hrm-awards";
import { listHrmAwardTypes } from "@/lib/api/hrm-award-types";
import { listHrmDepartments } from "@/lib/api/hrm-departments";
import { listHrmDesignations } from "@/lib/api/hrm-designations";
import { listHrmEmployees, type ApiHrmEmployee } from "@/lib/api/hrm-employees";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const GREEN_BTN =
  "rounded-none bg-[#4caf50] text-white hover:bg-[#43a047] border-transparent";

type SortKey = "employeeName" | "awardType" | "date" | "gift";
type SortDir = "asc" | "desc";

type EmpOption = {
  id: string;
  name: string;
  department: string;
  designation: string;
};

type AwardTypeOption = { id: string; name: string };

type FormState = {
  employeeId: string;
  awardTypeId: string;
  date: string;
  gift: string;
  description: string;
  certificate: string;
};

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function emptyForm(employees: EmpOption[], awardTypes: AwardTypeOption[]): FormState {
  return {
    employeeId: employees[0]?.id ?? "",
    awardTypeId: awardTypes[0]?.id ?? "",
    date: todayYmd(),
    gift: "",
    description: "",
    certificate: "",
  };
}

function formFromRow(row: Award): FormState {
  return {
    employeeId: row.employeeId,
    awardTypeId: row.awardTypeId ?? "",
    date: row.date,
    gift: row.gift,
    description: row.description,
    certificate: row.certificate,
  };
}

function buildLookups(
  employees: ApiHrmEmployee[],
  departments: Map<string, string>,
  designations: Map<string, string>,
  awardTypes: AwardTypeOption[],
): AwardLookups {
  const empById = new Map(employees.map((e) => [e.id, e]));
  const typeById = new Map(awardTypes.map((t) => [t.id, t.name]));
  return {
    employeeName: (id) => (id ? empById.get(id)?.name ?? "—" : "—"),
    employeeDepartment: (id) => {
      if (!id) return "—";
      const emp = empById.get(id);
      if (!emp?.department_id) return "—";
      return departments.get(emp.department_id) ?? "—";
    },
    employeeDesignation: (id) => {
      if (!id) return "—";
      const emp = empById.get(id);
      if (!emp?.designation_id) return "—";
      return designations.get(emp.designation_id) ?? "—";
    },
    awardTypeName: (id) => (id ? typeById.get(id) ?? "—" : "—"),
  };
}

export function HrmAwards() {
  const canWrite = useAdminCanWrite();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Award[]>([]);
  const [employees, setEmployees] = useState<EmpOption[]>([]);
  const [awardTypes, setAwardTypes] = useState<AwardTypeOption[]>([]);
  const [lookups, setLookups] = useState<AwardLookups | null>(null);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftType, setDraftType] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [viewRow, setViewRow] = useState<Award | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm([], []));

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [deptRows, desigRows, typeRows, empRes, awardRows] = await Promise.all([
        listHrmDepartments(),
        listHrmDesignations(),
        listHrmAwardTypes(),
        listHrmEmployees({ page: 1, per_page: 200 }),
        listHrmAwards(),
      ]);

      const deptMap = new Map(deptRows.map((d) => [String(d.id), String(d.name ?? "")]));
      const desigMap = new Map(desigRows.map((d) => [String(d.id), String(d.name ?? "")]));
      const types: AwardTypeOption[] = typeRows.map((t) => ({
        id: String(t.id),
        name: String(t.name ?? ""),
      }));
      const nextLookups = buildLookups(empRes.rows, deptMap, desigMap, types);
      const empOptions: EmpOption[] = empRes.rows.map((e) => ({
        id: e.id,
        name: e.name,
        department: e.department_id ? deptMap.get(e.department_id) ?? "—" : "—",
        designation: e.designation_id ? desigMap.get(e.designation_id) ?? "—" : "—",
      }));

      setAwardTypes(types);
      setEmployees(empOptions);
      setLookups(nextLookups);
      setRows(awardRows.map((r) => apiAwardToAward(r, nextLookups)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load awards");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filtered = useMemo(() => {
    let list = rows;
    if (typeFilter !== "all") {
      list = list.filter((r) => (r.awardTypeId ?? "") === typeFilter || r.awardType === typeFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.employeeName.toLowerCase().includes(q) ||
          r.awardType.toLowerCase().includes(q) ||
          r.gift.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.department.toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => String(a[sortKey]).localeCompare(String(b[sortKey])) * dir);
  }, [rows, typeFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "date" ? "desc" : "asc");
    }
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(employees, awardTypes));
    setFormOpen(true);
  }

  function openEdit(row: Award) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setFormOpen(true);
  }

  async function saveForm() {
    if (!form.employeeId) {
      toast.error("Select an employee");
      return;
    }
    if (!form.awardTypeId || !form.date) {
      toast.error("Award type and date are required");
      return;
    }
    if (!lookups) {
      toast.error("Still loading — try again");
      return;
    }

    const input = {
      employeeId: form.employeeId,
      awardTypeId: form.awardTypeId,
      date: form.date,
      gift: form.gift.trim(),
      description: form.description.trim(),
      certificate: form.certificate.trim(),
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const row = await updateHrmAward(editId, input);
        const mapped = apiAwardToAward(row, lookups);
        setRows((prev) => prev.map((r) => (r.id === editId ? mapped : r)));
        setViewRow((v) => (v?.id === editId ? mapped : v));
        toast.success("Award updated");
      } else {
        const row = await createHrmAward(input);
        const mapped = apiAwardToAward(row, lookups);
        setRows((prev) => [mapped, ...prev]);
        toast.success("Award created");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: Award) {
    if (!window.confirm(`Delete award for “${row.employeeName}”?`)) return;
    try {
      await deleteHrmAward(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      toast.success("Award deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const SortHeader = ({ label, col }: { label: string; col: SortKey }) => (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      onClick={() => toggleSort(col)}
    >
      {label}
      <span className="text-[10px] opacity-60">
        {sortKey === col ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </button>
  );

  if (loading) {
    return <ContentDataSkeleton label="Loading awards…" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Awards</h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Create Award
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search..."
            className="h-9 rounded-none pl-8"
          />
        </div>
        <Button type="button" size="sm" className={cn("h-9", GREEN_BTN)} onClick={() => setPage(1)}>
          <Search className="size-3.5" />
          Search
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 rounded-none"
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <Filter className="size-3.5" />
          Filters
        </Button>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          Per Page:
          <select
            value={perPage}
            onChange={(e) => {
              setPerPage(Number(e.target.value));
              setPage(1);
            }}
            className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
          >
            {[50, 100, 500, 1000].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filtersOpen ? (
        <div className="rounded-none border border-border bg-card p-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[180px] flex-col gap-1 text-xs text-muted-foreground">
              Award Type
              <select
                value={draftType}
                onChange={(e) => setDraftType(e.target.value)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {awardTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className={cn("h-9", GREEN_BTN)}
                onClick={() => {
                  setTypeFilter(draftType);
                  setPage(1);
                }}
              >
                Apply Filters
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-none"
                onClick={() => {
                  setDraftType("all");
                  setTypeFilter("all");
                  setSearch("");
                  setPage(1);
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto rounded-none border border-border bg-card">
        <table className="w-full min-w-[960px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr className="border-b border-border text-left">
              <th className="w-12 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                #
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Employee" col="employeeName" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Award Type" col="awardType" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Date" col="date" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Gift" col="gift" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Description
              </th>
              <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No awards found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, i) => (
                <tr key={row.id} className="border-b border-border hover:bg-muted/40">
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {(pageSafe - 1) * perPage + i + 1}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={awardAvatar(row.employeeId)}
                        alt=""
                        className="size-8 rounded-none border border-border object-cover"
                      />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{row.employeeName}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {row.designation} · {row.department}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className="rounded-none font-normal">
                      {row.awardType}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-foreground">{row.date || "—"}</td>
                  <td className="px-3 py-2.5 text-foreground">{row.gift || "—"}</td>
                  <td className="max-w-[280px] truncate px-3 py-2.5 text-muted-foreground">
                    {row.description || "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-none"
                        onClick={() => setViewRow(row)}
                        aria-label="View"
                      >
                        <Eye className="size-3.5" />
                      </Button>
                      {canWrite ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-none"
                            onClick={() => openEdit(row)}
                            aria-label="Edit"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-none text-destructive"
                            onClick={() => void remove(row)}
                            aria-label="Delete"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Showing {filtered.length === 0 ? 0 : (pageSafe - 1) * perPage + 1}–
          {Math.min(pageSafe * perPage, filtered.length)} of {filtered.length}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-none"
            disabled={pageSafe <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <span className="px-2">
            {pageSafe} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-none"
            disabled={pageSafe >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>

      {/* View */}
      <Sheet open={!!viewRow} onOpenChange={(open) => !open && setViewRow(null)}>
        <SheetContent
          side="right"
          title="Award details"
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          {viewRow ? (
            <div className="flex h-full min-h-0 flex-col">
              <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
                <SheetTitle className="text-base">Award details</SheetTitle>
                <SheetDescription className="text-xs">
                  {viewRow.awardType} · {viewRow.date || "—"}
                </SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={awardAvatar(viewRow.employeeId)}
                    alt=""
                    className="size-12 rounded-none border border-border object-cover"
                  />
                  <div>
                    <div className="font-medium text-foreground">{viewRow.employeeName}</div>
                    <div className="text-xs text-muted-foreground">
                      {viewRow.designation} · {viewRow.department}
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Award type</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-foreground">
                      <AwardIcon className="size-3.5 text-muted-foreground" />
                      {viewRow.awardType}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Date</div>
                    <div className="text-foreground">{viewRow.date || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Gift</div>
                    <div className="text-foreground">{viewRow.gift || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Certificate</div>
                    <div className="text-foreground">{viewRow.certificate || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Description</div>
                    <p className="text-sm leading-relaxed text-foreground">
                      {viewRow.description || "—"}
                    </p>
                  </div>
                </div>
              </div>

              {canWrite ? (
                <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-none"
                    onClick={() => {
                      setViewRow(null);
                      openEdit(viewRow);
                    }}
                  >
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Create / Edit */}
      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          title={formMode === "add" ? "Create Award" : "Edit Award"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">
                {formMode === "add" ? "Create Award" : "Edit Award"}
              </SheetTitle>
              <SheetDescription className="text-xs">
                Employee, Award Type, Date, Gift, Description.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Employee *
                <select
                  value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                >
                  {employees.length === 0 ? (
                    <option value="">No employees</option>
                  ) : (
                    employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} — {e.designation}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Award Type *
                <select
                  value={form.awardTypeId}
                  onChange={(e) => setForm({ ...form, awardTypeId: e.target.value })}
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                >
                  {awardTypes.length === 0 ? (
                    <option value="">No award types</option>
                  ) : (
                    awardTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Date *
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Gift
                  <Input
                    value={form.gift}
                    onChange={(e) => setForm({ ...form, gift: e.target.value })}
                    className="h-9 rounded-none"
                    placeholder="Trophy, voucher…"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Description
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="min-h-[100px] rounded-none"
                  placeholder="Reason / citation for the award"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Certificate
                <Input
                  value={form.certificate}
                  onChange={(e) => setForm({ ...form, certificate: e.target.value })}
                  className="h-9 rounded-none"
                  placeholder="Filename or URL"
                />
              </label>
            </div>
            <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 rounded-none"
                onClick={() => setFormOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className={cn("flex-1", GREEN_BTN)}
                onClick={() => void saveForm()}
                disabled={saving || employees.length === 0 || awardTypes.length === 0}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
