"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import * as Dialog from "@radix-ui/react-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { GRID_CHIP_CLASS } from "@/components/shared/grid-chip-badge";
import {
  createHrmBranch,
  deleteHrmBranch,
  listHrmBranchRecords,
  updateHrmBranch,
  type ApiHrmBranch,
} from "@/lib/api/hrm-branches";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useWorkspaceScope, invalidateWorkspaceBranchCache } from "@/lib/workspace/use-workspace-scope";
import { cn } from "@/lib/utils";
import type { MasterRow } from "@/lib/mock-data/hrm-recruitment-setup";

type FormState = {
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  zip_code: string;
  phone: string;
  email: string;
  status: "active" | "inactive";
};

const EMPTY_FORM: FormState = {
  name: "",
  address: "",
  city: "",
  state: "",
  country: "",
  zip_code: "",
  phone: "",
  email: "",
  status: "active",
};

function rowToForm(row: ApiHrmBranch): FormState {
  return {
    name: row.name ?? "",
    address: row.address ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    country: row.country ?? "",
    zip_code: row.zip_code ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    status: row.status === "inactive" ? "inactive" : "active",
  };
}

function formToPayload(form: FormState): Omit<MasterRow, "id"> {
  return {
    name: form.name.trim(),
    address: form.address.trim(),
    city: form.city.trim(),
    state: form.state.trim(),
    country: form.country.trim(),
    zip_code: form.zip_code.trim(),
    phone: form.phone.trim(),
    email: form.email.trim(),
    status: form.status,
  };
}

export function WorkspaceBranchesPanel() {
  const canWrite = useAdminCanWrite();
  const { companyName } = useWorkspaceScope();

  const [rows, setRows] = useState<ApiHrmBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editRow, setEditRow] = useState<ApiHrmBranch | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiHrmBranch | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listHrmBranchRecords());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load branches");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      `${row.name} ${row.city ?? ""} ${row.phone ?? ""} ${row.email ?? ""}`.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const openCreate = () => {
    setEditRow(null);
    setForm(EMPTY_FORM);
    setSheetOpen(true);
  };

  const openEdit = (row: ApiHrmBranch) => {
    setEditRow(row);
    setForm(rowToForm(row));
    setSheetOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Branch name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = formToPayload(form);
      if (editRow) {
        await updateHrmBranch(editRow.id, payload);
        toast.success("Branch updated");
      } else {
        await createHrmBranch(payload);
        toast.success("Branch added");
      }
      setSheetOpen(false);
      invalidateWorkspaceBranchCache();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save branch");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteHrmBranch(deleteTarget.id);
      toast.success(`${deleteTarget.name} deleted`);
      setDeleteTarget(null);
      invalidateWorkspaceBranchCache();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  return (
    <div className="-m-3 flex min-h-0 w-[calc(100%+1.5rem)] max-w-none flex-1 flex-col overflow-hidden lg:-m-4 lg:w-[calc(100%+2rem)]">
      <div className="flex min-w-0 shrink-0 items-center gap-1.5 border-b border-border py-1 pl-2 pr-2">
        <ListGridHeaderStart title="Branches">
          {canWrite ? (
            <Button size="sm" className="h-7 rounded-none" onClick={openCreate}>
              New
            </Button>
          ) : null}
        </ListGridHeaderStart>
        <Input
          placeholder="Search name, city, phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-2 h-7 w-[220px] rounded-none"
        />
        <p className="ml-auto hidden text-xs text-muted-foreground sm:block">
          Offices for {companyName}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-background">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead className="sticky top-0 z-[1] border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Branch</th>
              <th className="px-3 py-2 font-medium">City</th>
              <th className="px-3 py-2 font-medium">Phone</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Status</th>
              {canWrite ? <th className="px-3 py-2 font-medium">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                  No branches yet. Add a city office or warehouse location for {companyName}.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="border-b border-border/60 last:border-b-0 hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <p className="font-medium">{row.name}</p>
                    {row.address ? (
                      <p className="truncate text-[11px] text-muted-foreground">{row.address}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{row.city || "—"}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.phone || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.email || "—"}</td>
                  <td className="px-3 py-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        GRID_CHIP_CLASS,
                        row.status === "active"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "text-muted-foreground",
                      )}
                    >
                      {row.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  {canWrite ? (
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-none"
                          aria-label={`Edit ${row.name}`}
                          onClick={() => openEdit(row)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-none text-destructive"
                          aria-label={`Delete ${row.name}`}
                          onClick={() => setDeleteTarget(row)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          title={editRow ? "Edit branch" : "New branch"}
          resizable
          closeButton="inside"
          className="w-[360px] min-w-[160px] max-w-[720px] gap-0 rounded-none p-0"
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 pr-10">
            <Button
              size="sm"
              className="h-7 rounded-none"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
            <h2 className="text-sm font-semibold">{editRow ? "Edit branch" : "New branch"}</h2>
          </div>
          <div className="space-y-3 overflow-y-auto p-3">
            <p className="text-[11px] text-muted-foreground">
              Location under {companyName}. Used in HRM, stock, and documents.
            </p>
            <label className="block space-y-1">
              <span className="text-xs font-medium">Branch name</span>
              <Input
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                className="h-8 rounded-none"
                placeholder="Dhaka HQ"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">Address</span>
              <Input
                value={form.address}
                onChange={(e) => setField("address", e.target.value)}
                className="h-8 rounded-none"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-xs font-medium">City</span>
                <Input
                  value={form.city}
                  onChange={(e) => setField("city", e.target.value)}
                  className="h-8 rounded-none"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium">State</span>
                <Input
                  value={form.state}
                  onChange={(e) => setField("state", e.target.value)}
                  className="h-8 rounded-none"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-xs font-medium">Country</span>
                <Input
                  value={form.country}
                  onChange={(e) => setField("country", e.target.value)}
                  className="h-8 rounded-none"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium">Zip</span>
                <Input
                  value={form.zip_code}
                  onChange={(e) => setField("zip_code", e.target.value)}
                  className="h-8 rounded-none"
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-medium">Phone</span>
              <Input
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
                className="h-8 rounded-none"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">Email</span>
              <Input
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                className="h-8 rounded-none"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">Status</span>
              <Select
                value={form.status}
                onChange={(e) => setField("status", e.target.value as FormState["status"])}
                className="w-full rounded-none"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </label>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog.Root open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(400px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-none border border-border bg-background p-6 shadow-xl">
            <Dialog.Title className="text-base font-semibold">Delete branch?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              {`"${deleteTarget?.name}" will be removed. Departments linked to this branch may block delete.`}
            </Dialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" size="sm" className="rounded-none" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button size="sm" variant="destructive" className="rounded-none" onClick={() => void confirmDelete()}>
                Delete
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
