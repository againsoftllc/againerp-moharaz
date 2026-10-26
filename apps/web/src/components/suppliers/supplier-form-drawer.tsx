"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
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
import {
  AgainFormField,
  AgainFormGroupTitle,
  AgainFormRecordTitle,
} from "@/components/again/again-form-sheet";
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
import { useDrawerDraft } from "@/lib/hooks/use-drawer-draft";

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

/** Everything the user types into the drawer: what is kept as a draft and compared with the loaded supplier. */
type SupplierValues = {
  form: FormState;
  contacts: ContactDraft[];
  roles: PartyCommerceRole[];
};

/** Contact keys are random per load, so they stay out of the "anything to save?" comparison. */
function supplierSignature({ form, contacts, roles }: SupplierValues): string {
  return JSON.stringify({
    form,
    contacts: contacts.map((c) => ({ name: c.name, role: c.role, email: c.email, phone: c.phone })),
    roles: [...roles].sort(),
  });
}

/** Label column wide enough that "Payment schedule" and "Opening balance" stay on one line. */
const ROW = "grid-cols-[8.5rem_minmax(0,1fr)]";
/** The plain control inside an Odoo form row: `.again-odoo-form` turns it into an underline, teal on focus. */
const FIELD_INPUT = "h-8 w-full bg-transparent px-1 text-[13px] outline-none";
const LINK = "text-[13px] font-normal text-[#00a09d] hover:text-[#00c4bf] hover:underline";

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

/**
 * New / edit supplier in the common drawer (docs/common/drawercommon.md) with the Odoo form look (docs/common/formcommon.md):
 * actions and the Active / Inactive switch in the top bar, a big record title, titled groups of label-left / underline-right
 * fields in two columns by the drawer's own width, and a draft kept (form and scroll position) when it is closed by accident -
 * for a new supplier and for editing an existing one.
 */
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
  // the supplier as loaded: what "Discard" goes back to and what "unsaved" is measured against
  const baseRef = useRef<SupplierValues | null>(null);
  const [baseSignature, setBaseSignature] = useState<string | null>(null);
  /** An existing supplier's full record has come in (a draft is put back only after that, so the load cannot overwrite it). */
  const [loaded, setLoaded] = useState(false);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef<number | null>(null);
  const [restoredTick, setRestoredTick] = useState(0);
  const editing = Boolean(supplier);
  const blocked = !form.name.trim();
  const isActive = form.status !== "blocked";

  const applyValues = (v: SupplierValues) => {
    setForm(v.form);
    setContacts(v.contacts.length ? v.contacts : [newContact()]);
    setRoles(v.roles.length ? v.roles : ["supplier"]);
    setCountryOptions(buildCountryOptions(v.form.country));
    setCurrencyOptions(buildCurrencyOptions(v.form.currency));
    setTermOptions(buildPaymentTermOptions(v.form.paymentTerms));
  };

  const setBase = (v: SupplierValues) => {
    baseRef.current = v;
    setBaseSignature(supplierSignature(v));
  };

  // a fresh form every time it opens - declared before the draft hook so a saved draft is put back after this reset
  useEffect(() => {
    if (!open) {
      setListCountryOpen(false);
      setListCurrencyOpen(false);
      setListTermsOpen(false);
      return;
    }
    const base: SupplierValues = {
      form: initialState(supplier, draftName),
      contacts: [newContact()],
      roles: ["supplier"],
    };
    applyValues(base);
    setBase(base);
    setLoaded(!supplier?.id);

    if (!supplier?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch<ApiSupplierResponse>(`/api/v1/commerce/suppliers/${supplier.id}`);
        if (cancelled) return;
        const detail = apiSupplierToSupplierDetail(res.data);
        const next: SupplierValues = {
          form: initialState(detail, draftName, {
            address: firstAddressLine(detail),
            notes: res.data.notes ?? "",
          }),
          contacts: detail.contacts.length
            ? detail.contacts.map((row) => ({
                key: row.id,
                name: row.name,
                role: row.role,
                email: row.email,
                phone: row.phone,
              }))
            : [newContact()],
          roles: ["supplier"],
        };
        applyValues(next);
        setBase(next);
      } catch {
        /* keep the list snapshot already in the form */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, supplier, draftName]);

  const current: SupplierValues = { form, contacts, roles };
  const dirty = open && loaded && baseSignature !== null && supplierSignature(current) !== baseSignature;
  // one draft per supplier ("supplier:new" for a new one); a name prefilled by the caller ("Create 'x'") keeps none
  const { saveDraftIfDirty, clear: clearDraft } = useDrawerDraft<SupplierValues & { scrollTop: number }>({
    key: supplier ? `supplier:${supplier.id}` : draftName ? null : "supplier:new",
    ready: open && loaded,
    dirty,
    getValues: () => ({ ...current, scrollTop: bodyScrollRef.current?.scrollTop ?? 0 }),
    restore: (v) => {
      applyValues(v);
      pendingScrollRef.current = v.scrollTop;
      setRestoredTick((t) => t + 1);
    },
    onDiscard: () => {
      if (baseRef.current) applyValues(baseRef.current); // back to what was saved
    },
    label: "supplier",
  });

  // a restored draft: go back to where the user was
  useEffect(() => {
    if (!open || pendingScrollRef.current == null) return;
    const top = pendingScrollRef.current;
    pendingScrollRef.current = null;
    const timer = window.setTimeout(() => bodyScrollRef.current?.scrollTo({ top }), 120);
    return () => window.clearTimeout(timer);
  }, [open, restoredTick]);

  // every dismissal (outside click, Esc, the X) goes through here and keeps a draft; Save and Cancel close directly
  const handleOpenChange = (next: boolean) => {
    if (!next) saveDraftIfDirty();
    onOpenChange(next);
  };

  const discard = () => {
    clearDraft();
    onOpenChange(false);
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const patchContact = (key: string, patch: Partial<ContactDraft>) =>
    setContacts((rows) => rows.map((item) => (item.key === key ? { ...item, ...patch } : item)));

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
        clearDraft();
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
        clearDraft();
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
    <AgainDrawerPanel
      open={open}
      onOpenChange={handleOpenChange}
      title={editing ? "Edit supplier" : "New supplier"}
      nested
      resizable
      defaultWidth={720}
      minWidth={420}
      widthStorageKey="again-supplier-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar trailing={<AgainDrawerCloseButton onClick={() => handleOpenChange(false)} />}>
          <AgainDrawerButton variant="primary" disabled={blocked || saving} aria-busy={saving} onClick={() => void submit()}>
            {saving ? "Saving…" : editing ? "Save" : "Create"}
          </AgainDrawerButton>
          <AgainDrawerButton disabled={saving} onClick={discard}>
            {editing ? "Discard" : "Cancel"}
          </AgainDrawerButton>
          <AgainDrawerSwitch
            label="Supplier status"
            value={isActive ? "active" : "blocked"}
            onChange={(next) => set("status", next)}
            options={[
              { value: "active" as const, label: "Active" },
              { value: "blocked" as const, label: "Inactive" },
            ]}
          />
        </AgainDrawerControlBar>

        <AgainDrawerScrollBody scrollRef={bodyScrollRef} className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
          <div className="@container space-y-5">
            {editing ? null : (
              <PartyRolePicker currentRole="supplier" roles={roles} onChange={setRoles} className="mb-0" />
            )}

            <AgainFormRecordTitle
              value={form.name}
              onChange={(next) => set("name", next.replace(/\n/g, " "))}
              placeholder="Supplier name"
            />

            {/* Odoo form: label left, underline control right, titled groups, two columns by the drawer's own width */}
            <div className="again-odoo-form space-y-5">
              <div className="grid gap-x-8 gap-y-0 @xl:grid-cols-2">
                <AgainFormGroupTitle className="@xl:col-span-2">Contact</AgainFormGroupTitle>
                <AgainFormField label="Phone" className={ROW}>
                  <input
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    placeholder="+8801…"
                    className={FIELD_INPUT}
                  />
                </AgainFormField>
                <AgainFormField label="Email" className={ROW}>
                  <input
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="sales@vendor.com"
                    className={FIELD_INPUT}
                  />
                </AgainFormField>
                <AgainFormField label="Website" className={ROW}>
                  <input
                    value={form.website}
                    onChange={(e) => set("website", e.target.value)}
                    placeholder="https://"
                    className={FIELD_INPUT}
                  />
                </AgainFormField>
                <AgainFormField label="Country" className={ROW}>
                  <CountryCombobox
                    options={countryOptions}
                    value={form.country}
                    onChange={(next) => set("country", next)}
                    onList={() => setListCountryOpen(true)}
                    onRename={renameCountry}
                    onDelete={deleteCountry}
                  />
                </AgainFormField>
                <AgainFormField label="Address" className={cn(ROW, "@xl:col-span-2")}>
                  <input
                    value={form.address}
                    onChange={(e) => set("address", e.target.value)}
                    placeholder="Street, city"
                    className={FIELD_INPUT}
                  />
                </AgainFormField>
              </div>

              <div className="grid gap-x-8 gap-y-0 @xl:grid-cols-2">
                <AgainFormGroupTitle className="@xl:col-span-2">Purchasing</AgainFormGroupTitle>
                <AgainFormField label="Payment terms" className={ROW}>
                  <PaymentTermsCombobox
                    options={termOptions}
                    value={form.paymentTerms}
                    onChange={(next) => set("paymentTerms", next)}
                    onList={() => setListTermsOpen(true)}
                    onRename={renameTerm}
                    onDelete={deleteTerm}
                  />
                </AgainFormField>
                <AgainFormField label="Lead time (days)" className={ROW}>
                  <input
                    type="number"
                    min={0}
                    value={form.leadTimeDays}
                    onChange={(e) => set("leadTimeDays", e.target.value)}
                    className={cn(FIELD_INPUT, "tabular-nums")}
                  />
                </AgainFormField>
                <AgainFormField label="Currency" className={ROW}>
                  <CurrencyCombobox
                    options={currencyOptions}
                    value={form.currency}
                    onChange={(next) => set("currency", next)}
                    onList={() => setListCurrencyOpen(true)}
                    onRename={renameCurrency}
                    onDelete={deleteCurrency}
                  />
                </AgainFormField>
                <AgainFormField label="Buyer" className={ROW}>
                  <input
                    value={form.buyerName}
                    onChange={(e) => set("buyerName", e.target.value)}
                    placeholder="Who owns this relationship"
                    className={FIELD_INPUT}
                  />
                </AgainFormField>
                <AgainFormField label="Payment schedule" className={ROW}>
                  <input
                    value={form.paymentSchedule}
                    onChange={(e) => set("paymentSchedule", e.target.value)}
                    placeholder="e.g. Monthly"
                    className={FIELD_INPUT}
                  />
                </AgainFormField>
              </div>

              <div className="grid gap-x-8 gap-y-0 @xl:grid-cols-2">
                <AgainFormGroupTitle className="@xl:col-span-2">Accounting</AgainFormGroupTitle>
                <AgainFormField label="Opening balance" className={ROW}>
                  <input
                    value={form.openingBalance}
                    onChange={(e) => set("openingBalance", e.target.value.replace(/[^\d.-]/g, ""))}
                    placeholder="0"
                    inputMode="decimal"
                    className={cn(FIELD_INPUT, "tabular-nums")}
                  />
                </AgainFormField>
                <AgainFormField label="Credit limit" className={ROW}>
                  <input
                    value={form.creditLimit}
                    onChange={(e) => set("creditLimit", e.target.value.replace(/[^\d.-]/g, ""))}
                    placeholder="0"
                    inputMode="decimal"
                    className={cn(FIELD_INPUT, "tabular-nums")}
                  />
                </AgainFormField>
                <AgainFormField label="Tax ID" className={ROW}>
                  <input
                    value={form.taxId}
                    onChange={(e) => set("taxId", e.target.value)}
                    placeholder="Optional"
                    className={FIELD_INPUT}
                  />
                </AgainFormField>
              </div>

              <div>
                <AgainFormGroupTitle>Contacts</AgainFormGroupTitle>
                {contacts.map((row, index) => (
                  <div key={row.key} className={cn("pb-2", index > 0 && "border-t border-border/60 pt-2")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-muted-foreground">Contact {index + 1}</span>
                      <button
                        type="button"
                        className="inline-flex h-6 w-6 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-destructive"
                        aria-label={`Remove contact ${index + 1}`}
                        onClick={() =>
                          setContacts((rows) =>
                            rows.length === 1 ? [newContact()] : rows.filter((item) => item.key !== row.key),
                          )
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="grid gap-x-8 gap-y-0 @xl:grid-cols-2">
                      <AgainFormField label="Name" className={ROW}>
                        <input
                          value={row.name}
                          onChange={(e) => patchContact(row.key, { name: e.target.value })}
                          className={FIELD_INPUT}
                        />
                      </AgainFormField>
                      <AgainFormField label="Role" className={ROW}>
                        <input
                          value={row.role}
                          onChange={(e) => patchContact(row.key, { role: e.target.value })}
                          placeholder="e.g. Procurement"
                          className={FIELD_INPUT}
                        />
                      </AgainFormField>
                      <AgainFormField label="Email" className={ROW}>
                        <input
                          value={row.email}
                          onChange={(e) => patchContact(row.key, { email: e.target.value })}
                          className={FIELD_INPUT}
                        />
                      </AgainFormField>
                      <AgainFormField label="Phone" className={ROW}>
                        <input
                          value={row.phone}
                          onChange={(e) => patchContact(row.key, { phone: e.target.value })}
                          className={FIELD_INPUT}
                        />
                      </AgainFormField>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className={cn(LINK, "mt-1")}
                  onClick={() => setContacts((rows) => [...rows, newContact()])}
                >
                  Add a contact
                </button>
              </div>

              <div>
                <AgainFormGroupTitle>Note</AgainFormGroupTitle>
                <AgainFormField label="Internal note" className={ROW}>
                  <textarea
                    value={form.notes}
                    onChange={(e) => set("notes", e.target.value)}
                    placeholder="Optional"
                    rows={3}
                    className="w-full resize-y bg-transparent px-1 py-1.5 text-[13px] outline-none"
                  />
                </AgainFormField>
              </div>
            </div>
          </div>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
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
