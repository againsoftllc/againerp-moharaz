"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  AGAIN_DRAWER_FIELD_SHEET_CLASS,
  AgainDrawerButton,
  AgainDrawerCloseButton,
  AgainDrawerControlBar,
  AgainDrawerLayout,
  AgainDrawerPanel,
  AgainDrawerScrollBody,
  AgainDrawerSwitch,
} from "@/components/again/again-drawer";
import { AGAIN_FORM_RECORD_TITLE_CLASS, AgainFormRow, AgainUnderlineInput } from "@/components/again/again-form-sheet";
import {
  createBank,
  createBankBranch,
  updateBank,
  updateBankBranch,
  type ApiBank,
  type ApiBankBranch,
} from "@/lib/api/finance-masters";

type BranchDraft = { id: string | null; name: string; routing: string; address: string; phone: string; active: boolean };

const toDraft = (b: ApiBankBranch): BranchDraft => ({
  id: b.id,
  name: b.name,
  routing: b.routing_number ?? "",
  address: b.address ?? "",
  phone: b.phone ?? "",
  active: b.is_active,
});

const NEW_BRANCH: BranchDraft = { id: null, name: "", routing: "", address: "", phone: "", active: true };

/** One bank and its branches (common drawer). Branches carry the routing number cheques and transfers need. */
export function BankDrawer({
  open,
  bank,
  canWrite,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  bank: ApiBank | null;
  canWrite: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: (bank: ApiBank) => void;
}) {
  const [name, setName] = React.useState("");
  const [shortName, setShortName] = React.useState("");
  const [swift, setSwift] = React.useState("");
  const [active, setActive] = React.useState(true);
  const [branches, setBranches] = React.useState<BranchDraft[]>([]);
  const [current, setCurrent] = React.useState<ApiBank | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setCurrent(bank);
    setName(bank?.name ?? "");
    setShortName(bank?.short_name ?? "");
    setSwift(bank?.swift_code ?? "");
    setActive(bank?.is_active ?? true);
    setBranches((bank?.branches ?? []).map(toDraft));
  }, [open, bank]);

  function apply(saved: ApiBank) {
    setCurrent(saved);
    setBranches(saved.branches.map(toDraft));
    onChanged(saved);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const saveBank = () =>
    run(async () => {
      const input = { name: name.trim(), short_name: shortName.trim() || null, swift_code: swift.trim() || null, is_active: active };
      const res = current ? await updateBank(current.id, input) : await createBank(input);
      apply(res.data);
      toast.success(`${res.data.name} saved`);
    });

  const saveBranch = (index: number) =>
    run(async () => {
      if (!current) return;
      const draft = branches[index];
      const input = {
        name: draft.name.trim(),
        routing_number: draft.routing.trim() || null,
        address: draft.address.trim() || null,
        phone: draft.phone.trim() || null,
        is_active: draft.active,
      };
      const res = draft.id ? await updateBankBranch(draft.id, input) : await createBankBranch(current.id, input);
      apply(res.data);
      toast.success(`Branch ${input.name} saved`);
    });

  const patchBranch = (index: number, changes: Partial<BranchDraft>) =>
    setBranches((rows) => rows.map((row, i) => (i === index ? { ...row, ...changes } : row)));

  const title = current ? current.name : "New bank";
  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      resizable
      defaultWidthRatio={0.6}
      minWidth={420}
      widthStorageKey="again-bank-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar trailing={<AgainDrawerCloseButton onClick={() => onOpenChange(false)} />}>
          {canWrite ? (
            <AgainDrawerButton variant="primary" onClick={() => void saveBank()} disabled={busy || !name.trim()}>
              {current ? "Save" : "Create"}
            </AgainDrawerButton>
          ) : null}
          {canWrite && current ? (
            <AgainDrawerButton onClick={() => setBranches((rows) => [...rows, { ...NEW_BRANCH }])} disabled={busy}>
              Add branch
            </AgainDrawerButton>
          ) : null}
          <AgainDrawerSwitch
            label="Status"
            value={active ? "active" : "inactive"}
            onChange={canWrite ? (v) => setActive(v === "active") : undefined}
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
        </AgainDrawerControlBar>
        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
          <div className="@container space-y-4">
            <div>
              <h2 className={AGAIN_FORM_RECORD_TITLE_CLASS}>{title}</h2>
              <p className="text-xs text-muted-foreground">
                {current
                  ? `${current.branches.length} branch(es) · ${current.account_count} of your bank account(s) at this bank`
                  : "Add the bank, then its branches."}
              </p>
            </div>
            <section>
              <h3 className="mb-1 border-b border-border/80 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bank</h3>
              <div className="grid gap-x-8 @xl:grid-cols-2">
                <AgainFormRow label="Name">
                  <AgainUnderlineInput value={name} onChange={setName} readOnly={!canWrite} placeholder="e.g. City Bank" />
                </AgainFormRow>
                <AgainFormRow label="Short name">
                  <AgainUnderlineInput value={shortName} onChange={setShortName} readOnly={!canWrite} placeholder="e.g. CBL" />
                </AgainFormRow>
                <AgainFormRow label="SWIFT">
                  <AgainUnderlineInput value={swift} onChange={setSwift} readOnly={!canWrite} placeholder="e.g. CIBLBDDH" />
                </AgainFormRow>
              </div>
            </section>
            {current ? (
              <section>
                <h3 className="mb-1 border-b border-border/80 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Branches</h3>
                {branches.length === 0 ? (
                  <p className="py-2 text-[13px] text-muted-foreground">No branches yet. Click Add branch.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-xs">
                      <thead>
                        <tr className="border-b border-border/70 text-left text-[11px] text-muted-foreground">
                          <th className="py-1.5 pr-2 font-semibold">Branch</th>
                          <th className="w-[120px] py-1.5 pr-2 font-semibold">Routing no.</th>
                          <th className="py-1.5 pr-2 font-semibold">Address</th>
                          <th className="w-[110px] py-1.5 pr-2 font-semibold">Phone</th>
                          <th className="w-[60px] py-1.5 pr-2 font-semibold">Active</th>
                          <th className="w-[60px]" />
                        </tr>
                      </thead>
                      <tbody>
                        {branches.map((row, index) => (
                          <tr key={row.id ?? `new-${index}`} className="border-b border-border/40">
                            <td className="py-1 pr-2">
                              <AgainUnderlineInput value={row.name} onChange={(v) => patchBranch(index, { name: v })} readOnly={!canWrite} placeholder="e.g. Gulshan" />
                            </td>
                            <td className="py-1 pr-2">
                              <AgainUnderlineInput value={row.routing} onChange={(v) => patchBranch(index, { routing: v.replace(/\D/g, "") })} readOnly={!canWrite} placeholder="9 digits" />
                            </td>
                            <td className="py-1 pr-2">
                              <AgainUnderlineInput value={row.address} onChange={(v) => patchBranch(index, { address: v })} readOnly={!canWrite} />
                            </td>
                            <td className="py-1 pr-2">
                              <AgainUnderlineInput value={row.phone} onChange={(v) => patchBranch(index, { phone: v })} readOnly={!canWrite} />
                            </td>
                            <td className="py-1 pr-2 text-center">
                              <input type="checkbox" className="h-3.5 w-3.5 accent-[#00a09d]" checked={row.active} disabled={!canWrite} onChange={(e) => patchBranch(index, { active: e.target.checked })} />
                            </td>
                            <td className="py-1 text-right">
                              {canWrite ? (
                                <button type="button" className="text-[11px] font-medium text-primary hover:underline disabled:opacity-50" disabled={busy || !row.name.trim()} onClick={() => void saveBranch(index)}>
                                  Save
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ) : null}
          </div>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}
