"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import { FinanceGridSettingsMenu } from "@/components/finance/finance-grid-settings";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useApiHealth } from "@/lib/api/use-api-health";
import {
  createFinanceAccount,
  fetchFinanceAccounts,
  updateFinanceAccount,
  type ApiFinanceAccount,
} from "@/lib/api/finance";
import type { AccountGridHandle } from "@/components/finance/account-grid";

const AccountGrid = dynamic(
  () => import("@/components/finance/account-grid").then((module) => module.AccountGrid),
  {
    ssr: false,
    loading: () => <ListGridOpenFallback label="Opening chart of accounts…" />,
  },
);

const ACCOUNT_TYPES = [
  { value: "asset", label: "Asset" },
  { value: "liability", label: "Liability" },
  { value: "equity", label: "Equity" },
  { value: "revenue", label: "Revenue" },
  { value: "expense", label: "Expense" },
];

export default function FinanceAccountsPage() {
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const router = useRouter();
  const gridRef = useRef<AccountGridHandle>(null);
  const [accounts, setAccounts] = useState<ApiFinanceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCount, setFilterCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ApiFinanceAccount | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState("asset");
  const [parentId, setParentId] = useState("");
  const [postable, setPostable] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchFinanceAccounts(true);
      setAccounts(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "finance-accounts-api" });
  }, [error]);

  const parentOptions = useMemo(() => {
    const exclude = new Set<string>();
    if (editing) {
      exclude.add(editing.id);
      const children = new Map<string, string[]>();
      for (const row of accounts) {
        if (!row.parent_id) continue;
        const list = children.get(row.parent_id) ?? [];
        list.push(row.id);
        children.set(row.parent_id, list);
      }
      const stack = [...(children.get(editing.id) ?? [])];
      while (stack.length) {
        const id = stack.pop()!;
        if (exclude.has(id)) continue;
        exclude.add(id);
        stack.push(...(children.get(id) ?? []));
      }
    }
    return [
      { value: "", label: "No parent" },
      ...accounts
        .filter((row) => row.account_type === accountType && row.is_active && !exclude.has(row.id))
        .map((row) => ({
          value: row.id,
          label: `${row.code} ${row.name}`,
        })),
    ];
  }, [accounts, accountType, editing]);

  function openCreate() {
    setEditing(null);
    setCode("");
    setName("");
    setAccountType("asset");
    setParentId("");
    setPostable(true);
    setOpen(true);
  }

  function openEdit(row: ApiFinanceAccount) {
    setEditing(row);
    setCode(row.code);
    setName(row.name);
    setAccountType(row.account_type);
    setParentId(row.parent_id ?? "");
    setPostable(row.is_postable !== false);
    setOpen(true);
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await updateFinanceAccount(editing.id, {
          name: name.trim(),
          account_type: editing.is_system ? undefined : accountType,
          parent_id: parentId || null,
          is_postable: editing.is_system ? undefined : postable,
        });
        toast.success("Account updated");
      } else {
        if (!code.trim()) return;
        await createFinanceAccount({
          code: code.trim(),
          name: name.trim(),
          account_type: accountType,
          parent_id: parentId || null,
          is_postable: postable,
        });
        toast.success("Account created");
      }
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: ApiFinanceAccount) {
    try {
      await updateFinanceAccount(row.id, { is_active: !row.is_active });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
  }

  const headerLeftActions = (
    <ListGridHeaderStart title="Chart of accounts">
      <FinanceGridSettingsMenu
        apiHealth={apiHealth}
        loading={loading}
        filterCount={filterCount}
        onRefresh={() => {
          void load();
          apiHealth.recheck();
        }}
        onFilters={() => gridRef.current?.openFilters()}
        onColumns={() => gridRef.current?.openColumns()}
        onExport={() => gridRef.current?.exportCsv()}
        onResetFilters={() => gridRef.current?.resetFilters()}
      />
      {canWrite ? (
        <Button size="sm" className="h-[26px] rounded-none" onClick={openCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New
        </Button>
      ) : null}
    </ListGridHeaderStart>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <AccountGrid
        ref={gridRef}
        rows={accounts}
        loading={loading && accounts.length === 0}
        canWrite={canWrite}
        onFilterCountChange={setFilterCount}
        headerLeftActions={headerLeftActions}
        footerLeftActions={
          <span className="px-2 text-[10px] text-muted-foreground">
            {loading ? "Loading…" : `${accounts.length} accounts`}
          </span>
        }
        onEdit={openEdit}
        onToggleActive={(row) => void toggleActive(row)}
        onOpenLedger={(row) => router.push(`/finance/reports/general-ledger?account_id=${encodeURIComponent(row.id)}`)}
      />

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          title={editing ? "Edit account" : "New account"}
          resizable
          closeButton="inside"
          className="min-w-[160px] w-[420px] max-w-[720px] rounded-none"
        >
          <h2 className="pr-8 text-base font-semibold">{editing ? "Edit account" : "New account"}</h2>
          <div className="mt-4 space-y-3.5">
            <div className="flex flex-col gap-1.5">
              <Label>Code</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="1300"
                disabled={Boolean(editing) || saving}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Prepaid Expenses" disabled={saving} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              {editing?.is_system ? (
                <Input value={accountType} disabled className="capitalize" />
              ) : (
                <FilterSelect
                  value={accountType}
                  onChange={(next) => {
                    setAccountType(next);
                    setParentId("");
                  }}
                  width="w-full"
                  ariaLabel="Account type"
                  options={ACCOUNT_TYPES}
                />
              )}
              {editing?.is_system ? (
                <p className="text-[10px] text-muted-foreground">System posting accounts keep their type.</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Parent</Label>
              <FilterSelect
                value={parentId}
                onChange={setParentId}
                width="w-full"
                ariaLabel="Parent account"
                options={parentOptions}
                searchThreshold={6}
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 h-3.5 w-3.5 accent-[#00a09d]"
                checked={!postable}
                disabled={Boolean(editing?.is_system)}
                onChange={(e) => setPostable(!e.target.checked)}
              />
              <span>
                <span className="block font-medium">Group account (no direct postings)</span>
                <span className="block text-[11px] text-muted-foreground">
                  {editing?.is_system
                    ? "System accounts stay postable: the ERP posts to them."
                    : "Like OnerERP's control and subsidiary levels: journals and vouchers must use one of its accounts."}
                </span>
              </span>
            </label>
          </div>
          <div className="mt-5 flex justify-end gap-2 border-t border-input pt-4">
            <Button variant="outline" size="sm" className="rounded-none" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="rounded-none"
              onClick={() => void handleSave()}
              disabled={saving || !name.trim() || (!editing && !code.trim())}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
