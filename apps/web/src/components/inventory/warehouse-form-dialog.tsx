"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  AGAIN_DRAWER_ACTION_BTN,
  AGAIN_DRAWER_FIELD_SHEET_CLASS,
  AGAIN_DRAWER_PRIMARY_BTN,
  AGAIN_DRAWER_PRIMARY_COLOR,
  AgainDrawerControlBar,
} from "@/components/again/again-drawer";
import { WarehouseTypeCombobox } from "@/components/inventory/warehouse-type-combobox";
import { WarehouseTypePickDrawer } from "@/components/inventory/warehouse-type-pick-drawer";
import { CountryCombobox } from "@/components/localisation/country-combobox";
import { CountryPickDrawer } from "@/components/localisation/country-pick-drawer";
import { FilterSelect } from "@/components/shared/filter-select";
import { cn } from "@/lib/utils";
import { createWarehouse, updateWarehouse, type WarehouseInput } from "@/lib/api/inventory";
import { listHrmBranchRecords, type ApiHrmBranch } from "@/lib/api/hrm-branches";
import {
  addCustomCountry,
  buildCountryOptions,
  removeCustomCountry,
  renameCustomCountry,
} from "@/lib/customers/country-options";
import {
  WAREHOUSE_INVOICE_LAYOUTS,
  WAREHOUSE_PAYMENT_OPTIONS,
} from "@/lib/inventory/warehouse-constants";
import {
  addWarehouseType,
  buildWarehouseTypeOptions,
  removeWarehouseType,
  renameWarehouseType,
  syncWarehouseTypes,
} from "@/lib/inventory/warehouse-type-options";
import type { Warehouse } from "@/lib/mock-data/inventory";

const EMPTY: WarehouseInput = {
  code: "",
  name: "",
  type: "Main warehouse",
  branchId: "",
  address: "",
  city: "",
  state: "",
  zipCode: "",
  country: "Bangladesh",
  mobile: "",
  alternateContact: "",
  email: "",
  website: "",
  invoiceLayout: "",
  paymentOption: "",
  locationsCount: 0,
  isActive: true,
  isDefault: false,
  sortOrder: 0,
};

const INVOICE_LAYOUT_OPTIONS = WAREHOUSE_INVOICE_LAYOUTS.map((label) => ({
  value: label,
  label,
}));

const PAYMENT_OPTION_OPTIONS = WAREHOUSE_PAYMENT_OPTIONS.map((label) => ({
  value: label,
  label,
}));

function slugifyWarehouseCode(name: string): string {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "LOC";
}

async function createWarehouseWithCode(input: WarehouseInput): Promise<void> {
  const base = slugifyWarehouseCode(input.name);
  let lastErr: unknown;
  for (let n = 1; n <= 20; n += 1) {
    const code = n === 1 ? base : `${base}-${n}`.slice(0, 50);
    try {
      await createWarehouse({ ...input, code });
      return;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : "";
      if (!/already exists/i.test(msg)) throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Save failed");
}

function Field({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-xs font-medium text-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </label>
      {children}
    </div>
  );
}

export function WarehouseFormDialog({
  open,
  onOpenChange,
  warehouse,
  onSaved,
  noun = "warehouse",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create mode */
  warehouse: Warehouse | null;
  onSaved?: () => void;
  /** Shown in the drawer title — settings uses "location". */
  noun?: "warehouse" | "location";
}) {
  const [form, setForm] = useState<WarehouseInput>(() =>
    warehouse
      ? {
          code: warehouse.code,
          name: warehouse.name,
          type: warehouse.type,
          branchId: warehouse.branchId ?? "",
          address: warehouse.address,
          city: warehouse.city ?? "",
          state: warehouse.state ?? "",
          zipCode: warehouse.zipCode ?? "",
          country: warehouse.country || "Bangladesh",
          mobile: warehouse.mobile ?? "",
          alternateContact: warehouse.alternateContact ?? "",
          email: warehouse.email ?? "",
          website: warehouse.website ?? "",
          invoiceLayout: warehouse.invoiceLayout ?? "",
          paymentOption: warehouse.paymentOption ?? "",
          locationsCount: warehouse.locations,
          isActive: warehouse.active,
          isDefault: warehouse.isDefault ?? false,
          sortOrder: warehouse.sortOrder ?? 0,
        }
      : { ...EMPTY, type: noun === "location" ? "Location" : EMPTY.type },
  );
  const [saving, setSaving] = useState(false);
  const [listTypeOpen, setListTypeOpen] = useState(false);
  // warehouse types are a company list on the server: refresh the local copy when the form opens
  useEffect(() => {
    let cancelled = false;
    void syncWarehouseTypes().then(() => {
      if (!cancelled) setTypeOptions(buildWarehouseTypeOptions(warehouse?.type ?? (noun === "location" ? "Location" : EMPTY.type)));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [listCountryOpen, setListCountryOpen] = useState(false);
  const [typeOptions, setTypeOptions] = useState<string[]>(() =>
    buildWarehouseTypeOptions(warehouse?.type ?? (noun === "location" ? "Location" : EMPTY.type)),
  );
  const [countryOptions, setCountryOptions] = useState(() =>
    buildCountryOptions(warehouse?.country || "Bangladesh"),
  );
  const [branches, setBranches] = useState<ApiHrmBranch[]>([]);
  const editing = Boolean(warehouse);
  const title = editing ? `Edit ${noun}` : `New ${noun}`;
  const blocked = !form.name.trim();
  const nestedOpen = listTypeOpen || listCountryOpen;
  const sameType = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const patch = (partial: Partial<WarehouseInput>) => setForm((f) => ({ ...f, ...partial }));

  useEffect(() => {
    if (!open) return;
    void listHrmBranchRecords()
      .then((rows) => {
        setBranches(rows);
        if (warehouse?.branchId) return;
        const first = rows.find((row) => row.status === "active") ?? rows[0];
        if (first) {
          setForm((current) => (current.branchId ? current : { ...current, branchId: first.id }));
        }
      })
      .catch(() => setBranches([]));
  }, [open, warehouse?.branchId]);

  const applyBranch = (branchId: string) => {
    const branch = branches.find((row) => row.id === branchId);
    patch({
      branchId,
      ...(!form.address && branch
        ? {
            address: branch.address ?? "",
            city: branch.city ?? form.city,
            state: branch.state ?? form.state,
            zipCode: branch.zip_code ?? form.zipCode,
            country: branch.country || form.country,
            mobile: form.mobile || branch.phone || "",
            email: form.email || branch.email || "",
          }
        : {}),
    });
  };

  const submit = async () => {
    if (blocked) return;
    setSaving(true);
    try {
      if (warehouse) {
        await updateWarehouse(warehouse.id, form);
        toast.success(`${form.name} updated`);
      } else {
        await createWarehouseWithCode(form);
        toast.success(`${form.name} created`);
      }
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setListTypeOpen(false);
          setListCountryOpen(false);
        }
        onOpenChange(next);
      }}
    >
      <SheetContent
        side="right"
        resizable
        resizeMaxWidth={2400}
        className="flex min-w-[160px] w-[480px] max-w-[90vw] flex-col gap-0 p-0"
        title={title}
        onPointerDownOutside={(event) => {
          if (nestedOpen) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (nestedOpen) event.preventDefault();
        }}
        onFocusOutside={(event) => {
          if (nestedOpen) event.preventDefault();
        }}
      >
        <AgainDrawerControlBar>
          <button
            type="button"
            className={cn(AGAIN_DRAWER_PRIMARY_BTN, "h-6 px-2 text-[11px]")}
            style={{ backgroundColor: AGAIN_DRAWER_PRIMARY_COLOR }}
            disabled={blocked || saving}
            onClick={() => void submit()}
          >
            {saving ? "Saving…" : editing ? "Save" : "Create"}
          </button>
          <button
            type="button"
            className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
            onClick={() => onOpenChange(false)}
          >
            Close
          </button>
          <span className="ml-1 text-[13px] font-medium text-foreground">{title}</span>
        </AgainDrawerControlBar>

        <div className={cn("min-h-0 flex-1 space-y-3 overflow-y-auto", AGAIN_DRAWER_FIELD_SHEET_CLASS)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" required>
              <Input
                value={form.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="Dhaka HQ"
                className="rounded-none"
              />
            </Field>
            <Field label="Branch">
              <FilterSelect
                value={form.branchId ?? ""}
                onChange={applyBranch}
                options={branches.map((row) => ({ value: row.id, label: row.name }))}
                placeholder="Select branch"
                searchPlaceholder="Search branch…"
                width="w-full"
                className="h-8 w-full"
                ariaLabel="Branch"
              />
            </Field>
            <Field label="Type">
              <WarehouseTypeCombobox
                options={typeOptions}
                value={form.type}
                onChange={(type) => patch({ type })}
                onList={() => setListTypeOpen(true)}
                placeholder={noun === "location" ? "Location" : "Main warehouse"}
                className="w-full"
              />
            </Field>
            <Field label="Address" className="col-span-2">
              <Input
                value={form.address ?? ""}
                onChange={(e) => patch({ address: e.target.value })}
                placeholder="Street, landmark"
                className="rounded-none"
              />
            </Field>
            <Field label="City">
              <Input
                value={form.city ?? ""}
                onChange={(e) => patch({ city: e.target.value })}
                placeholder="Dhaka"
                className="rounded-none"
              />
            </Field>
            <Field label="State">
              <Input
                value={form.state ?? ""}
                onChange={(e) => patch({ state: e.target.value })}
                placeholder="Dhaka Division"
                className="rounded-none"
              />
            </Field>
            <Field label="Zip Code">
              <Input
                value={form.zipCode ?? ""}
                onChange={(e) => patch({ zipCode: e.target.value })}
                placeholder="1212"
                className="rounded-none"
              />
            </Field>
            <Field label="Country">
              <CountryCombobox
                options={countryOptions}
                value={form.country ?? ""}
                onChange={(country) => patch({ country })}
                onList={() => setListCountryOpen(true)}
                className="w-full"
              />
            </Field>
            <Field label="Mobile">
              <Input
                value={form.mobile ?? ""}
                onChange={(e) => patch({ mobile: e.target.value })}
                placeholder="01XXXXXXXXX"
                className="rounded-none"
              />
            </Field>
            <Field label="Alternate Contact">
              <Input
                value={form.alternateContact ?? ""}
                onChange={(e) => patch({ alternateContact: e.target.value })}
                placeholder="Optional"
                className="rounded-none"
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => patch({ email: e.target.value })}
                placeholder="location@example.com"
                className="rounded-none"
              />
            </Field>
            <Field label="Website">
              <Input
                value={form.website ?? ""}
                onChange={(e) => patch({ website: e.target.value })}
                placeholder="https://"
                className="rounded-none"
              />
            </Field>
            <Field label="Invoice Layout">
              <FilterSelect
                value={form.invoiceLayout ?? ""}
                onChange={(invoiceLayout) => patch({ invoiceLayout })}
                options={INVOICE_LAYOUT_OPTIONS}
                placeholder="Select…"
                width="w-full"
                ariaLabel="Invoice layout"
                className="h-8"
              />
            </Field>
            <Field label="Payment Option">
              <FilterSelect
                value={form.paymentOption ?? ""}
                onChange={(paymentOption) => patch({ paymentOption })}
                options={PAYMENT_OPTION_OPTIONS}
                placeholder="Select…"
                width="w-full"
                ariaLabel="Payment option"
                className="h-8"
              />
            </Field>
          </div>

          <div className="flex items-center justify-between border border-border bg-background px-3 py-2">
            <div>
              <p className="text-xs font-medium">Active</p>
              <p className="text-[11px] text-muted-foreground">Available for stock operations.</p>
            </div>
            <Switch
              checked={form.isActive ?? true}
              onCheckedChange={(isActive) => patch({ isActive })}
            />
          </div>

          <div className="flex items-center justify-between border border-border bg-background px-3 py-2">
            <div>
              <p className="text-xs font-medium">{noun === "location" ? "Default location" : "Default warehouse"}</p>
              <p className="text-[11px] text-muted-foreground">
                New stock lines land here. Setting this unsets the current default.
              </p>
            </div>
            <Switch
              checked={form.isDefault ?? false}
              onCheckedChange={(isDefault) => patch({ isDefault })}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
    <WarehouseTypePickDrawer
      open={listTypeOpen}
      onOpenChange={setListTypeOpen}
      types={typeOptions}
      selectedType={form.type}
      title={noun === "location" ? "Location types" : "Warehouse types"}
      onSelect={(type) => {
        patch({ type });
        setListTypeOpen(false);
      }}
      onCreate={(name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        addWarehouseType(trimmed);
        setTypeOptions(buildWarehouseTypeOptions(trimmed));
        patch({ type: trimmed });
        toast.success("Type added");
      }}
      onRename={(from, to) => {
        const next = to.trim();
        if (!next) return;
        renameWarehouseType(from, next);
        setTypeOptions(buildWarehouseTypeOptions(sameType(form.type, from) ? next : form.type));
        if (sameType(form.type, from)) patch({ type: next });
      }}
      onDelete={(name) => {
        const next = removeWarehouseType(name);
        const resolved = sameType(form.type, name) ? (next[0] ?? "") : form.type;
        setTypeOptions(next);
        if (sameType(form.type, name)) patch({ type: resolved });
        toast.success("Type deleted");
      }}
    />
    <CountryPickDrawer
      open={listCountryOpen}
      onOpenChange={setListCountryOpen}
      countries={countryOptions}
      selectedCountry={form.country}
      onSelect={(country) => {
        patch({ country });
        setListCountryOpen(false);
      }}
      onCreate={(name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        addCustomCountry(trimmed);
        patch({ country: trimmed });
        setCountryOptions(buildCountryOptions(trimmed));
        toast.success("Country added");
      }}
      onRename={(from, to) => {
        const next = to.trim();
        if (!next) return;
        renameCustomCountry(from, next);
        if (form.country === from) patch({ country: next });
        setCountryOptions(buildCountryOptions(form.country === from ? next : form.country));
      }}
      onDelete={(name) => {
        const remaining = removeCustomCountry(name);
        const fallback = form.country === name ? (remaining[0] ?? "") : form.country;
        if (form.country === name) patch({ country: fallback });
        setCountryOptions(buildCountryOptions(fallback));
        toast.success("Country removed");
      }}
    />
    </>
  );
}
