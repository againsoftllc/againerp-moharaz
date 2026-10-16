"use client";

import "@/components/providers/ag-grid-provider";
import { forwardRef, useCallback, useImperativeHandle, useMemo, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { Check, Power } from "lucide-react";
import { toast } from "sonner";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { AgainListGrid } from "@/components/shared/again-list-grid";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type SubscriptionPlan, createPlan, updatePlan } from "@/lib/api/super-admin";

const emptyForm = {
  slug: "",
  name: "",
  price_amount: "0",
  price_interval: "monthly",
  max_users: "",
  is_trial_default: false,
};

export type SubscriptionPlanGridHandle = {
  openCreate: () => void;
};

export const SubscriptionPlanGrid = forwardRef<
  SubscriptionPlanGridHandle,
  {
    plans: SubscriptionPlan[];
    loading?: boolean;
    onChanged?: () => void;
    headerLeftActions?: ReactNode;
    footerLeftActions?: ReactNode;
    className?: string;
  }
>(function SubscriptionPlanGrid(
  { plans, loading = false, onChanged, headerLeftActions, footerLeftActions, className },
  ref,
) {
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useImperativeHandle(ref, () => ({
    openCreate: () => {
      setForm(emptyForm);
      setCreateOpen(true);
    },
  }));

  const toggleActive = useCallback(
    async (plan: SubscriptionPlan) => {
      try {
        await updatePlan(plan.id, { is_active: !plan.is_active });
        toast.success(`${plan.name} ${plan.is_active ? "deactivated" : "activated"}`);
        onChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not update plan");
      }
    },
    [onChanged],
  );

  const handleCreate = useCallback(async () => {
    setSaving(true);
    try {
      await createPlan({
        slug: form.slug.trim(),
        name: form.name.trim(),
        price_amount: Number(form.price_amount) || 0,
        price_interval: form.price_interval,
        max_users: form.max_users ? Number(form.max_users) : null,
        is_trial_default: form.is_trial_default,
      });
      toast.success(`${form.name} created`);
      setCreateOpen(false);
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create plan");
    } finally {
      setSaving(false);
    }
  }, [form, onChanged]);

  const PlanRowMenu = useCallback(
    ({ data }: { data: SubscriptionPlan }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowActionsTrigger />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => void toggleActive(data)}>
            <Power className="mr-1.5 h-3 w-3" /> {data.is_active ? "Deactivate" : "Activate"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [toggleActive],
  );

  const columnDefs = useMemo<ColDef<SubscriptionPlan>[]>(
    () => [
      {
        colId: "actions",
        headerName: "",
        width: 26,
        maxWidth: 26,
        minWidth: 26,
        pinned: "left",
        resizable: false,
        suppressMovable: true,
        suppressHeaderMenuButton: true,
        suppressSizeToFit: true,
        sortable: false,
        headerComponent: GridFullscreenHeader,
        cellRenderer: (p: ICellRendererParams<SubscriptionPlan>) =>
          p.data ? <PlanRowMenu data={p.data} /> : null,
      },
      {
        colId: "name",
        field: "name",
        headerName: "Plan",
        flex: 2,
        minWidth: 160,
        cellRenderer: (p: ICellRendererParams<SubscriptionPlan>) =>
          p.data ? (
            <span className="truncate font-semibold text-foreground">
              {p.data.name}
              <span className="ml-1.5 font-mono text-[10px] font-normal text-muted-foreground">
                {p.data.slug}
              </span>
            </span>
          ) : null,
      },
      {
        colId: "price",
        headerName: "Price",
        width: 130,
        minWidth: 110,
        valueGetter: (p) => (p.data ? `${p.data.price_amount} / ${p.data.price_interval}` : ""),
      },
      {
        colId: "max_users",
        field: "max_users",
        headerName: "Max users",
        width: 110,
        minWidth: 90,
        valueFormatter: (p) => (p.value ? String(p.value) : "Unlimited"),
      },
      {
        colId: "is_trial_default",
        field: "is_trial_default",
        headerName: "Trial default",
        width: 110,
        minWidth: 90,
        cellRenderer: (p: ICellRendererParams<SubscriptionPlan>) =>
          p.data?.is_trial_default ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-foreground">
              <Check className="h-3 w-3 text-emerald-500" aria-hidden /> Default
            </span>
          ) : null,
      },
      {
        colId: "is_active",
        field: "is_active",
        headerName: "Status",
        width: 100,
        minWidth: 90,
        cellRenderer: (p: ICellRendererParams<SubscriptionPlan>) =>
          p.data?.is_active ? (
            <GridChipBadge variant="success">Active</GridChipBadge>
          ) : (
            <GridChipBadge variant="muted">Inactive</GridChipBadge>
          ),
      },
    ],
    [PlanRowMenu],
  );

  return (
    <AgainListGrid<SubscriptionPlan>
      className={className}
      rowData={plans}
      columnDefs={columnDefs}
      loading={loading}
      headerLeftActions={headerLeftActions}
      footerLeftActions={footerLeftActions}
      emptyTitle="No plans yet"
      emptyHint="Create a plan to assign to companies"
    >
      <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(420px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-none border border-input bg-background p-6 shadow-xl">
            <Dialog.Title className="text-base font-semibold">New plan</Dialog.Title>
            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pg-slug">Slug</Label>
                <Input
                  id="pg-slug"
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  placeholder="starter"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pg-name">Name</Label>
                <Input
                  id="pg-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Starter"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pg-price">Price</Label>
                  <Input
                    id="pg-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price_amount}
                    onChange={(e) => setForm((f) => ({ ...f, price_amount: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pg-interval">Interval</Label>
                  <select
                    id="pg-interval"
                    value={form.price_interval}
                    onChange={(e) => setForm((f) => ({ ...f, price_interval: e.target.value }))}
                    className="h-8 w-full border border-input bg-background px-2 text-xs"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pg-max-users">Max users (blank = unlimited)</Label>
                <Input
                  id="pg-max-users"
                  type="number"
                  min="1"
                  value={form.max_users}
                  onChange={(e) => setForm((f) => ({ ...f, max_users: e.target.value }))}
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={form.is_trial_default}
                  onChange={(e) => setForm((f) => ({ ...f, is_trial_default: e.target.checked }))}
                />
                Default plan for new trial sign-ups
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void handleCreate()} disabled={saving}>
                {saving ? "Creating…" : "Create plan"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </AgainListGrid>
  );
});
