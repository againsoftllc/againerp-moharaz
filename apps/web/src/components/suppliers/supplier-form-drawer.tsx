"use client";

import { useEffect, useState } from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  AGAIN_DRAWER_ACTION_BTN,
  AGAIN_DRAWER_PRIMARY_BTN,
  AGAIN_DRAWER_PRIMARY_COLOR,
  AgainDrawerControlBar,
} from "@/components/again/again-drawer";
import { cn } from "@/lib/utils";
import {
  createCommerceSupplier,
  updateCommerceSupplier,
} from "@/lib/api/use-commerce-suppliers";
import { apiFetch } from "@/lib/api/client";
import {
  apiSupplierToSupplierDetail,
  type ApiSupplierResponse,
} from "@/lib/api/commerce-suppliers";
import type { Supplier, SupplierDetail, SupplierStatus } from "@/lib/mock-data/suppliers";
import {
  addCustomCountry,
  buildCountryOptions,
  removeCustomCountry,
  renameCustomCountry,
} from "@/lib/customers/country-options";
import { CountryCombobox } from "@/components/localisation/country-combobox";
import { CountryPickDrawer } from "@/components/localisation/country-pick-drawer";
import { CurrencyCombobox } from "@/components/localisation/currency-combobox";
import { CurrencyPickDrawer } from "@/components/localisation/currency-pick-drawer";
import { PaymentTermsCombobox } from "@/components/suppliers/payment-terms-combobox";
import { PaymentTermsPickDrawer } from "@/components/suppliers/payment-terms-pick-drawer";
import { enablePartyCommerceRole, type PartyCommerceRole } from "@/lib/api/party-commerce";
import { PartyRolePicker } from "@/components/shared/party-role-picker";
import {
  addCustomPaymentTerm,
  buildPaymentTermOptions,
  removeCustomPaymentTerm,
  renameCustomPaymentTerm,
} from "@/lib/suppliers/payment-terms-options";
import {
  addCustomCurrency,
  buildCurrencyOptions,
  parseCurrencyInput,
  patchCurrency,
  removeCustomCurrency,
  renameCustomCurrency,
} from "@/lib/localisation/currency-options";
import { clearDraft, draftAgeLabel, readDraft, writeDraft } from "@/lib/hooks/use-drawer-draft";

const DRAFT_KEY = "supplier";

type SupplierDraftPayload = {
  form: FormState;
  contacts: ContactDraft[];
  roles: PartyCommerceRole[];
};

type ContactDraft = {
  key: string;
  name: string;
  role: string;
  email: string;
  phone: string;
};

type FormState = {
  name: string;
  address: string;
  email: string;
  phone: string;
  country: string;
  paymentTerms: string;
  leadTimeDays: string;
  status: SupplierStatus;
  taxId: string;
  website: string;
  openingBalance: string;
  creditLimit: string;
  paymentSchedule: string;
  currency: string;
  buyerName: string;
  notes: string;
};

function newContact(): ContactDraft {
  return {
    key: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: "",
    role: "",
    email: "",
    phone: "",
  };
}

function firstAddressLine(detail?: { addresses?: { line1?: string; city?: string }[] } | null): string {
  const first = detail?.addresses?.[0];
  if (!first) return "";
  return [first.line1, first.city].filter(Boolean).join(", ");
}

function initialState(supplier: Supplier | null, draftName = "", extras?: { address?: string; notes?: string }): FormState {
  return {
    name: supplier?.name ?? draftName,
    address: extras?.address ?? "",
    email: supplier?.email ?? "",
    phone: supplier?.phone ?? "",
    country: supplier?.country ?? "Bangladesh",
    paymentTerms: supplier?.paymentTerms ?? "Net 30",
    leadTimeDays: String(supplier?.leadTimeDays ?? 7),
    status: supplier?.status ?? "active",
    taxId: supplier?.taxId ?? "",
    website: supplier?.website ?? "",
    openingBalance: String(supplier?.openingBalance ?? 0),
    creditLimit: String(supplier?.creditLimit ?? 0),
    paymentSchedule: supplier?.paymentSchedule ?? "",
    currency: supplier?.currency ?? "BDT",
    buyerName: supplier?.buyerName ?? "",
    notes: extras?.notes ?? "",
  };
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SupplierFormDrawer({
  open,
  onOpenChange,
  supplier,
  draftName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create mode */
  supplier: Supplier | null;
  draftName?: string;
  onSaved?: (saved: SupplierDetail) => void;
}) {
  const [form, setForm] = useState<FormState>(() => initialState(supplier, draftName));
  const [contacts, setContacts] = useState<ContactDraft[]>([newContact()]);
  const [saving, setSaving] = useState(false);
  const [listCountryOpen, setListCountryOpen] = useState(false);
  const [countryOptions, setCountryOptions] = useState(() =>
    buildCountryOptions(supplier?.country ?? "Bangladesh"),
  );
  const [listCurrencyOpen, setListCurrencyOpen] = useState(false);
  const [currencyOptions, setCurrencyOptions] = useState(() =>
    buildCurrencyOptions(supplier?.currency ?? "BDT"),
  );
  const [listTermsOpen, setListTermsOpen] = useState(false);
  const [termOptions, setTermOptions] = useState(() =>
    buildPaymentTermOptions(supplier?.paymentTerms ?? "Net 30"),
  );
  const [roles, setRoles] = useState<PartyCommerceRole[]>(["supplier"]);
  const editing = Boolean(supplier);
  const blocked = !form.name.trim();
  const isActive = form.status !== "blocked";

  useEffect(() => {
    if (!open) {
      setListCountryOpen(false);
      setListCurrencyOpen(false);
      setListTermsOpen(false);
      return;
    }
    setForm(initialState(supplier, draftName));
    setContacts([newContact()]);
    setRoles(["supplier"]);
    setCountryOptions(buildCountryOptions(supplier?.country ?? "Bangladesh"));
    setCurrencyOptions(buildCurrencyOptions(supplier?.currency ?? "BDT"));
    setTermOptions(buildPaymentTermOptions(supplier?.paymentTerms ?? "Net 30"));

    // Create mode only — resume an unsaved draft left behind by an accidental
    // outside-click/Escape, unless the caller just prefilled a name explicitly.
    if (!supplier && !draftName) {
      const draft = readDraft<SupplierDraftPayload>(DRAFT_KEY);
      if (draft) {
        setForm(draft.values.form);
        setContacts(draft.values.contacts.length ? draft.values.contacts : [newContact()]);
        setRoles(draft.values.roles.length ? draft.values.roles : ["supplier"]);
        setCountryOptions(buildCountryOptions(draft.values.form.country));
        setCurrencyOptions(buildCurrencyOptions(draft.values.form.currency));
        setTermOptions(buildPaymentTermOptions(draft.values.form.paymentTerms));
        toast.info(`Restored unsaved supplier draft from ${draftAgeLabel(draft.savedAt)}`, {
          action: {
            label: "Discard",
            onClick: () => {
              clearDraft(DRAFT_KEY);
              setForm(initialState(null));
              setContacts([newContact()]);
              setRoles(["supplier"]);
            },
          },
        });
      }
    }

    if (!supplier?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch<ApiSupplierResponse>(`/api/v1/commerce/suppliers/${supplier.id}`);
        if (cancelled) return;
        const detail = apiSupplierToSupplierDetail(res.data);
        setForm(
          initialState(detail, draftName, {
            address: firstAddressLine(detail),
            notes: res.data.notes ?? "",
          }),
        );
        setCountryOptions(buildCountryOptions(detail.country));
        setCurrencyOptions(buildCurrencyOptions(detail.currency));
        setTermOptions(buildPaymentTermOptions(detail.paymentTerms));
        setContacts(
          detail.contacts.length
            ? detail.contacts.map((row) => ({
                key: row.id,
                name: row.name,
                role: row.role,
                email: row.email,
                phone: row.phone,
              }))
            : [newContact()],
        );
      } catch {
        /* keep the list snapshot already in the form */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, supplier, draftName]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const renameCountry = (from: string, to: string) => {
    const next = to.trim();
    if (!next) return;
    renameCustomCountry(from, next);
    if (form.country === from) set("country", next);
    setCountryOptions(buildCountryOptions(form.country === from ? next : form.country));
  };
  const deleteCountry = (name: string) => {
    const remaining = removeCustomCountry(name);
    const fallback = form.country === name ? (remaining[0] ?? "") : form.country;
    if (form.country === name) set("country", fallback);
    setCountryOptions(buildCountryOptions(fallback));
    toast.success("Country removed");
  };
  const renameTerm = (from: string, to: string) => {
    const next = to.trim();
    if (!next) return;
    renameCustomPaymentTerm(from, next);
    if (form.paymentTerms === from) set("paymentTerms", next);
    setTermOptions(buildPaymentTermOptions(form.paymentTerms === from ? next : form.paymentTerms));
  };
  const deleteTerm = (name: string) => {
    const remaining = removeCustomPaymentTerm(name);
    const fallback = form.paymentTerms === name ? (remaining[0] ?? "") : form.paymentTerms;
    if (form.paymentTerms === name) set("paymentTerms", fallback);
    setTermOptions(buildPaymentTermOptions(fallback));
    toast.success("Payment terms removed");
  };
  const renameCurrency = (code: string, to: string) => {
    const next = to.trim();
    if (!next) return;
    renameCustomCurrency(code, next);
    setCurrencyOptions(buildCurrencyOptions(form.currency));
  };
  const deleteCurrency = (code: string) => {
    const remaining = removeCustomCurrency(code);
    const fallback = form.currency === code ? (remaining[0]?.code ?? "") : form.currency;
    if (form.currency === code) set("currency", fallback);
    setCurrencyOptions(buildCurrencyOptions(fallback));
    toast.success("Currency removed");
  };

  const saveDraftIfDirty = () => {
    if (editing) return;
    const blank = initialState(null);
    const dirty =
      JSON.stringify(form) !== JSON.stringify(blank) ||
      contacts.some((c) => c.name || c.role || c.email || c.phone) ||
      roles.length !== 1 ||
      roles[0] !== "supplier";
    if (!dirty) return;
    writeDraft<SupplierDraftPayload>(DRAFT_KEY, { form, contacts, roles });
  };

  const submit = async () => {
    if (blocked) return;
    setSaving(true);
    try {
      const leadTime = Number.parseInt(form.leadTimeDays, 10);
      const openingBalance = Number.parseFloat(form.openingBalance.replace(/,/g, ""));
      const creditLimit = Number.parseFloat(form.creditLimit.replace(/,/g, ""));
      if (supplier) {
        const saved = await updateCommerceSupplier(supplier.id, {
          name: form.name.trim(),
          email: form.email,
          phone: form.phone,
          status: form.status,
          paymentTerms: form.paymentTerms,
          leadTimeDays: Number.isFinite(leadTime) ? leadTime : undefined,
          country: form.country || undefined,
          taxId: form.taxId || undefined,
          website: form.website || undefined,
          currency: form.currency || "BDT",
          openingBalance: Number.isFinite(openingBalance) ? openingBalance : 0,
          creditLimit: Number.isFinite(creditLimit) ? creditLimit : 0,
          paymentSchedule: form.paymentSchedule || undefined,
          buyerName: form.buyerName || undefined,
          notes: form.notes || undefined,
          address: form.address.trim(),
          contacts: contacts
            .map((row) => ({
              name: row.name.trim(),
              role: row.role.trim() || undefined,
              email: row.email.trim() || undefined,
              phone: row.phone.trim() || undefined,
            }))
            .filter((row) => row.name),
        });
        toast.success(`${form.name} updated`);
        onOpenChange(false);
        onSaved?.(saved);
      } else {
        const saved = await createCommerceSupplier({
          name: form.name.trim(),
          email: form.email || undefined,
          phone: form.phone || undefined,
          paymentTerms: form.paymentTerms,
          leadTimeDays: Number.isFinite(leadTime) ? leadTime : undefined,
          status: form.status,
          country: form.country || undefined,
          taxId: form.taxId || undefined,
          website: form.website || undefined,
          currency: form.currency || "BDT",
          openingBalance: Number.isFinite(openingBalance) ? openingBalance : 0,
          creditLimit: Number.isFinite(creditLimit) ? creditLimit : 0,
          paymentSchedule: form.paymentSchedule || undefined,
          buyerName: form.buyerName || undefined,
          notes: form.notes || undefined,
          address: form.address.trim() || undefined,
          contacts: contacts
            .map((row) => ({
              name: row.name.trim(),
              role: row.role.trim() || undefined,
              email: row.email.trim() || undefined,
              phone: row.phone.trim() || undefined,
            }))
            .filter((row) => row.name),
        });
        if (saved.partyId) {
          for (const role of roles) {
            if (role !== "supplier") await enablePartyCommerceRole(saved.partyId, role);
          }
        }
        toast.success(`${form.name.trim()} created`);
        clearDraft(DRAFT_KEY);
        onOpenChange(false);
        onSaved?.(saved);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title={editing ? "Edit supplier" : "New supplier"}
        closeButton="inside"
        onPointerDownOutside={() => saveDraftIfDirty()}
        onInteractOutside={() => saveDraftIfDirty()}
        onEscapeKeyDown={() => saveDraftIfDirty()}
        className="z-[260] flex w-[440px] max-w-[92vw] flex-col gap-0 p-0"
      >
        <AgainDrawerControlBar
          trailing={
            <div className="mr-6 flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">
                {isActive ? "Active" : "Inactive"}
              </span>
              <SwitchPrimitive.Root
                checked={isActive}
                onCheckedChange={(next) => set("status", next ? "active" : "blocked")}
                aria-label={isActive ? "Active" : "Inactive"}
                className="inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-none border-2 border-transparent bg-input transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-primary"
              >
                <SwitchPrimitive.Thumb className="pointer-events-none block h-3 w-3 rounded-none bg-background shadow-sm transition-transform data-[state=checked]:translate-x-3 data-[state=unchecked]:translate-x-0" />
              </SwitchPrimitive.Root>
            </div>
          }
        >
          <button
            type="button"
            className={cn(AGAIN_DRAWER_PRIMARY_BTN, "h-6 px-2 text-[11px]")}
            style={{ backgroundColor: AGAIN_DRAWER_PRIMARY_COLOR }}
            disabled={blocked || saving}
            onClick={() => void submit()}
          >
            {saving ? "Saving…" : editing ? "Save changes" : "Create supplier"}
          </button>
          <button
            type="button"
            className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <span className="ml-1 text-[13px] font-medium text-foreground">
            {editing ? "Edit supplier" : "New supplier"}
          </span>
        </AgainDrawerControlBar>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {editing ? null : (
            <PartyRolePicker currentRole="supplier" roles={roles} onChange={setRoles} className="mb-0" />
          )}

          <Field label="Supplier name">
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="TechPro Distributors Ltd"
              className="rounded-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+8801…"
                className="rounded-none"
              />
            </Field>
            <Field label="Email">
              <Input
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="sales@vendor.com"
                className="rounded-none"
              />
            </Field>
          </div>

          <Field label="Website">
            <Input
              value={form.website}
              onChange={(e) => set("website", e.target.value)}
              placeholder="https://"
              className="rounded-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Payment terms">
              <PaymentTermsCombobox
                options={termOptions}
                value={form.paymentTerms}
                onChange={(next) => set("paymentTerms", next)}
                onList={() => setListTermsOpen(true)}
                onRename={renameTerm}
                onDelete={deleteTerm}
              />
            </Field>
            <Field label="Lead time (days)">
              <Input
                type="number"
                min={0}
                value={form.leadTimeDays}
                onChange={(e) => set("leadTimeDays", e.target.value)}
                className="rounded-none"
              />
            </Field>
          </div>

          <Field label="Address">
            <Input
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="Street, city"
              className="rounded-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Country">
              <CountryCombobox
                options={countryOptions}
                value={form.country}
                onChange={(next) => set("country", next)}
                onList={() => setListCountryOpen(true)}
                onRename={renameCountry}
                onDelete={deleteCountry}
              />
            </Field>
            <Field label="Tax ID">
              <Input
                value={form.taxId}
                onChange={(e) => set("taxId", e.target.value)}
                placeholder="Optional"
                className="rounded-none"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Opening balance">
              <Input
                value={form.openingBalance}
                onChange={(e) => set("openingBalance", e.target.value.replace(/[^\d.-]/g, ""))}
                placeholder="0"
                inputMode="decimal"
                className="rounded-none tabular-nums"
              />
            </Field>
            <Field label="Credit limit">
              <Input
                value={form.creditLimit}
                onChange={(e) => set("creditLimit", e.target.value.replace(/[^\d.-]/g, ""))}
                placeholder="0"
                inputMode="decimal"
                className="rounded-none tabular-nums"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Payment schedule">
              <Input
                value={form.paymentSchedule}
                onChange={(e) => set("paymentSchedule", e.target.value)}
                placeholder="e.g. Monthly"
                className="rounded-none"
              />
            </Field>
            <Field label="Currency">
              <CurrencyCombobox
                options={currencyOptions}
                value={form.currency}
                onChange={(next) => set("currency", next)}
                onList={() => setListCurrencyOpen(true)}
                onRename={renameCurrency}
                onDelete={deleteCurrency}
              />
            </Field>
          </div>

          <Field label="Buyer">
            <Input
              value={form.buyerName}
              onChange={(e) => set("buyerName", e.target.value)}
              placeholder="Who owns this relationship"
              className="rounded-none"
            />
          </Field>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-foreground">Contacts</label>
              <button
                type="button"
                className="inline-flex h-6 items-center gap-1 rounded-none px-1.5 text-[11px] font-medium text-[#00a09d] hover:bg-[#00a09d]/10"
                onClick={() => setContacts((rows) => [...rows, newContact()])}
              >
                <Plus className="h-3 w-3" />
                Add contact
              </button>
            </div>
            <div className="space-y-2">
              {contacts.map((row, index) => (
                <div key={row.key} className="space-y-1.5 border border-border p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      Contact {index + 1}
                    </span>
                    <button
                      type="button"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-destructive"
                      aria-label={`Remove contact ${index + 1}`}
                      onClick={() =>
                        setContacts((rows) =>
                          rows.length === 1
                            ? [newContact()]
                            : rows.filter((item) => item.key !== row.key),
                        )
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={row.name}
                      onChange={(e) =>
                        setContacts((rows) =>
                          rows.map((item) =>
                            item.key === row.key ? { ...item, name: e.target.value } : item,
                          ),
                        )
                      }
                      placeholder="Name"
                      className="rounded-none"
                    />
                    <Input
                      value={row.role}
                      onChange={(e) =>
                        setContacts((rows) =>
                          rows.map((item) =>
                            item.key === row.key ? { ...item, role: e.target.value } : item,
                          ),
                        )
                      }
                      placeholder="Role"
                      className="rounded-none"
                    />
                    <Input
                      value={row.email}
                      onChange={(e) =>
                        setContacts((rows) =>
                          rows.map((item) =>
                            item.key === row.key ? { ...item, email: e.target.value } : item,
                          ),
                        )
                      }
                      placeholder="Email"
                      className="rounded-none"
                    />
                    <Input
                      value={row.phone}
                      onChange={(e) =>
                        setContacts((rows) =>
                          rows.map((item) =>
                            item.key === row.key ? { ...item, phone: e.target.value } : item,
                          ),
                        )
                      }
                      placeholder="Phone"
                      className="rounded-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Field label="Notes">
            <Input
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Optional"
              className="rounded-none"
            />
          </Field>
        </div>
      </SheetContent>
    </Sheet>
    <CountryPickDrawer
      open={listCountryOpen}
      onOpenChange={setListCountryOpen}
      countries={countryOptions}
      selectedCountry={form.country}
      onSelect={(country) => set("country", country)}
      onCreate={(name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        addCustomCountry(trimmed);
        set("country", trimmed);
        setCountryOptions(buildCountryOptions(trimmed));
        toast.success("Country added");
      }}
      onRename={renameCountry}
      onDelete={deleteCountry}
    />
    <PaymentTermsPickDrawer
      open={listTermsOpen}
      onOpenChange={setListTermsOpen}
      terms={termOptions}
      selectedTerm={form.paymentTerms}
      onSelect={(term) => set("paymentTerms", term)}
      onCreate={(name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        addCustomPaymentTerm(trimmed);
        set("paymentTerms", trimmed);
        setTermOptions(buildPaymentTermOptions(trimmed));
        toast.success("Payment terms added");
      }}
      onRename={renameTerm}
      onDelete={deleteTerm}
    />
    <CurrencyPickDrawer
      open={listCurrencyOpen}
      onOpenChange={setListCurrencyOpen}
      currencies={currencyOptions}
      selectedCode={form.currency}
      onSelect={(code) => set("currency", code)}
      onCreate={(name) => {
        const parsed = parseCurrencyInput(name);
        if (!parsed) return;
        addCustomCurrency(name);
        set("currency", parsed.code);
        setCurrencyOptions(buildCurrencyOptions(parsed.code));
        toast.success("Currency added");
      }}
      onRename={renameCurrency}
      onDelete={deleteCurrency}
      onSetSymbol={(code, symbol) => {
        patchCurrency(code, { symbol });
        setCurrencyOptions(buildCurrencyOptions(form.currency));
      }}
      onSetPosition={(code, position) => {
        patchCurrency(code, { position });
        setCurrencyOptions(buildCurrencyOptions(form.currency));
      }}
    />
    </>
  );
}
