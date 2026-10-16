"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { CUSTOMER_GROUP_LABELS, type Customer } from "@/lib/mock-data/customers";
import {
  appendCustomerGroupOrder,
  buildCustomerGroupOptions,
  deleteCustomerGroup,
  readCustomCustomerGroupLabels,
  readCustomerGroupOrder,
  readHiddenCustomerGroups,
  renameCustomerGroupLabel,
  slugCustomerGroupLabel,
  writeCustomCustomerGroupLabels,
  writeCustomerGroupOrder,
  type CustomerGroupOption,
} from "@/lib/customers/customer-group-options";
import {
  addCustomCountry,
  buildCountryOptions,
  isBuiltInCountry,
  removeCustomCountry,
  renameCustomCountry,
} from "@/lib/customers/country-options";
import { partnerDrawerSeed } from "@/lib/mock-data/partner-drawer-seed";
import {
  createCommerceCustomer,
  getCommerceCustomer,
  rechargeCommerceCustomerWallet,
  updateCommerceCustomer,
  verifyCommerceCustomerContact,
  verifyCommerceCustomerWhatsApp,
} from "@/lib/api/commerce-customers";
import { uploadCatalogMediaFiles } from "@/lib/api/use-catalog-media";
import {
  AgainFormRow,
  AgainUnderlineField,
  AgainUnderlineInput,
} from "@/components/again/again-form-sheet";
import { Select } from "@/components/ui/native-select";
import {
  PartnerFormSheet,
  customerToPartnerForm,
  newPartnerExtraAddress,
  parsePartnerExtraAddresses,
  parsePartnerRelatedContacts,
  partnerFormToPayload,
  EMPTY_FORM,
  type PartnerExtraAddress,
  type PartnerFormState,
  type PartnerNotebookTab,
  type PartnerRelatedContact,
} from "@/components/customers/partner-form-sheet";
import { normalizeBdPhone } from "@/lib/customers/phone";
import { clearDraft, draftAgeLabel, readDraft, writeDraft } from "@/lib/hooks/use-drawer-draft";

const DRAFT_KEY = "customer";

type CustomerDraftPayload = {
  form: PartnerFormState;
  relatedContacts: PartnerRelatedContact[];
  extraAddresses: PartnerExtraAddress[];
};
import {
  AgainDrawerControlBar,
  AgainDrawerLayout,
  AgainDrawerPanel,
  AgainDrawerScrollBody,
  AGAIN_DRAWER_ACTION_BTN,
  AGAIN_DRAWER_FIELD_SHEET_CLASS,
  AGAIN_DRAWER_PRIMARY_BTN,
  AGAIN_DRAWER_PRIMARY_COLOR,
} from "@/components/again/again-drawer";
import { cn, formatCurrency } from "@/lib/utils";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useCommerceCustomers } from "@/lib/api/use-commerce-customers";
import {
  enablePartyCommerceRole,
  fetchPartyCommerceLinks,
  type PartyCommerceRole,
} from "@/lib/api/party-commerce";
import { PartyRolePicker } from "@/components/shared/party-role-picker";
import { Button } from "@/components/ui/button";

/** Default Again demo contact (Riyad / againsoft) */
export const AGAIN_DEMO_PARTNER: Customer = partnerDrawerSeed[0];

/** @deprecated Use AGAIN_DEMO_PARTNER */
export const ODOO_DEMO_PARTNER = AGAIN_DEMO_PARTNER;

export type PartnerFormMode = "create" | "edit";

/** Load full customer (order history, wallet, …) — list endpoints omit nested feeds. */
function useLivePartnerCustomer(
  customer: Customer | null | undefined,
  opts: { open?: boolean; mode: PartnerFormMode },
) {
  const open = opts.open ?? true;
  const [liveCustomer, setLiveCustomer] = useState<Customer | null>(customer ?? null);

  useEffect(() => {
    if (!open) return;

    if (opts.mode === "create" || !customer?.id) {
      setLiveCustomer(customer ?? null);
      return;
    }

    setLiveCustomer(customer);
    let cancelled = false;
    void getCommerceCustomer(customer.id)
      .then((full) => {
        if (!cancelled) setLiveCustomer(full);
      })
      .catch(() => {
        /* keep list/snapshot customer */
      });

    return () => {
      cancelled = true;
    };
  }, [open, opts.mode, customer?.id]);

  return [liveCustomer, setLiveCustomer] as const;
}

type UsePartnerFormOptions = {
  customer: Customer | null;
  mode: PartnerFormMode;
  open?: boolean;
  initialName?: string;
  initialEmail?: string;
  initialPhone?: string;
  initialTab?: PartnerNotebookTab;
};

function applyCreateDraft(
  base: PartnerFormState,
  draft: { name?: string; email?: string; phone?: string },
): PartnerFormState {
  const next = { ...base };
  if (draft.name?.trim()) next.name = draft.name.trim();
  if (draft.email?.trim()) next.email = draft.email.trim();
  if (draft.phone?.trim()) next.phone = draft.phone.trim();
  return next;
}

/** Normalize BD phones before save; toast warning and return null if invalid. */
function normalizePartnerPhonesForSave(
  form: PartnerFormState,
  patch: (key: keyof PartnerFormState, value: PartnerFormState[keyof PartnerFormState]) => void,
): PartnerFormState | null {
  if (form.phone.trim()) {
    const phone = normalizeBdPhone(form.phone);
    if (!phone.ok) {
      toast.warning(phone.reason);
      return null;
    }
    if (phone.phone !== form.phone) patch("phone", phone.phone);
    form = { ...form, phone: phone.phone };
  }
  if (form.additionalPhone.trim()) {
    const additional = normalizeBdPhone(form.additionalPhone);
    if (!additional.ok) {
      toast.warning(`Additional phone: ${additional.reason}`);
      return null;
    }
    if (additional.phone !== form.additionalPhone) patch("additionalPhone", additional.phone);
    form = { ...form, additionalPhone: additional.phone };
  }
  return form;
}

function ensurePartnerNameForSave(
  form: PartnerFormState,
  patch: (key: keyof PartnerFormState, value: PartnerFormState[keyof PartnerFormState]) => void,
): PartnerFormState | null {
  if (form.name.trim()) return form;
  const digits = (form.phone || "").replace(/\D/g, "");
  if (!digits) {
    toast.error("Name or phone is required");
    return null;
  }
  const fallbackName = `Customer ${digits.slice(-4)}`;
  patch("name", fallbackName);
  return { ...form, name: fallbackName };
}

function usePartnerForm({
  customer,
  mode,
  open = true,
  initialName = "",
  initialEmail = "",
  initialPhone = "",
  initialTab,
}: UsePartnerFormOptions) {
  const createDraft = {
    name: initialName,
    email: initialEmail,
    phone: initialPhone,
  };
  const resolveDefaultTab = (): PartnerNotebookTab =>
    initialTab ?? (mode === "create" ? "profile" : "overview");
  const [form, setForm] = useState<PartnerFormState>(() => {
    const base = customerToPartnerForm(mode === "create" ? null : customer);
    return mode === "create" ? applyCreateDraft(base, createDraft) : base;
  });
  const [relatedContacts, setRelatedContacts] = useState<PartnerRelatedContact[]>(() =>
    mode === "create" ? [] : parsePartnerRelatedContacts(customer),
  );
  const [extraAddresses, setExtraAddresses] = useState<PartnerExtraAddress[]>(() =>
    mode === "create" ? [] : parsePartnerExtraAddresses(customer),
  );
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    mode === "create" ? null : (customer?.profileImage ?? null),
  );
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [tab, setTab] = useState<PartnerNotebookTab>(resolveDefaultTab);
  const [customGroupLabels, setCustomGroupLabels] = useState<Record<string, string>>({});
  const [groupOrder, setGroupOrder] = useState<string[]>([]);
  const [hiddenGroups, setHiddenGroups] = useState<string[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoObjectUrlRef = useRef<string | null>(null);
  const [restoredDraftAt, setRestoredDraftAt] = useState<string | null>(null);

  const clearPhotoObjectUrl = useCallback(() => {
    if (photoObjectUrlRef.current) {
      URL.revokeObjectURL(photoObjectUrlRef.current);
      photoObjectUrlRef.current = null;
    }
  }, []);

  // List rows carry no `addresses` (deferred server-side for grid performance —
  // see commerce_customers.py's _LIST_DEFERRED/profile=False). The drawer opens
  // instantly against that light row, then the list screen swaps in the full
  // profile once it loads. Track whether the form was last hydrated from a full
  // profile so the effect below can catch up exactly once per record — company
  // name, street, and notes all live on that deferred data and would otherwise
  // stay stuck blank for the whole edit (and a save would silently wipe them).
  const profileHydratedForRef = useRef<string | null>(null);
  // Edit mode: what the form was last hydrated from, so an accidental close can
  // ask before throwing away unsaved edits (create mode autosaves a draft instead).
  const baselineRef = useRef<{
    form: PartnerFormState;
    relatedContacts: PartnerRelatedContact[];
    extraAddresses: PartnerExtraAddress[];
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab(resolveDefaultTab());
    let storedGroups = readCustomCustomerGroupLabels();
    if (mode === "create") {
      const base = customerToPartnerForm(null);
      const savedDraft =
        !initialName && !initialEmail && !initialPhone
          ? readDraft<CustomerDraftPayload>(DRAFT_KEY)
          : null;
      if (savedDraft) {
        setForm(savedDraft.values.form);
        setRelatedContacts(savedDraft.values.relatedContacts);
        setExtraAddresses(savedDraft.values.extraAddresses);
        setRestoredDraftAt(savedDraft.savedAt);
      } else {
        setForm(
          applyCreateDraft(base, {
            name: initialName,
            email: initialEmail,
            phone: initialPhone,
          }),
        );
        setRelatedContacts([]);
        setExtraAddresses([]);
        setRestoredDraftAt(null);
      }
      clearPhotoObjectUrl();
      setPhotoPreview(null);
      setPhotoFile(null);
      setCustomGroupLabels(storedGroups);
      setGroupOrder(readCustomerGroupOrder());
      setHiddenGroups(readHiddenCustomerGroups());
      setCountryOptions(buildCountryOptions("Bangladesh"));
      profileHydratedForRef.current = null;
      return;
    }
    const source = customer ?? AGAIN_DEMO_PARTNER;
    if (source.group && !(source.group in CUSTOMER_GROUP_LABELS) && !storedGroups[source.group]) {
      storedGroups = {
        ...storedGroups,
        [source.group]: source.group
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase()),
      };
      writeCustomCustomerGroupLabels(storedGroups);
    }
    setCustomGroupLabels(storedGroups);
    setGroupOrder(readCustomerGroupOrder());
    setHiddenGroups(readHiddenCustomerGroups());
    const hydrated = {
      form: customerToPartnerForm(source),
      relatedContacts: parsePartnerRelatedContacts(source),
      extraAddresses: parsePartnerExtraAddresses(source),
    };
    setForm(hydrated.form);
    setRelatedContacts(hydrated.relatedContacts);
    setExtraAddresses(hydrated.extraAddresses);
    baselineRef.current = hydrated;
    clearPhotoObjectUrl();
    setPhotoPreview(source.profileImage ?? null);
    setPhotoFile(null);
    setCountryOptions(buildCountryOptions(source.country ?? "Bangladesh"));
    // Only rehydrate when switching records / drawer open — not on every liveCustomer patch
    // (wallet recharge, verify-contact, etc.). The catch-up effect below handles the one
    // case that does need a second pass: the light row growing into a full profile.
    profileHydratedForRef.current = source.addresses?.length ? (source.id ?? null) : null;
  }, [open, customer?.id, mode, initialName, initialEmail, initialPhone, initialTab, clearPhotoObjectUrl]);

  useEffect(() => {
    if (!open || mode === "create" || !customer) return;
    if (profileHydratedForRef.current === customer.id) return;
    if (!customer.addresses?.length) return;
    const hydrated = {
      form: customerToPartnerForm(customer),
      relatedContacts: parsePartnerRelatedContacts(customer),
      extraAddresses: parsePartnerExtraAddresses(customer),
    };
    setForm(hydrated.form);
    setRelatedContacts(hydrated.relatedContacts);
    setExtraAddresses(hydrated.extraAddresses);
    baselineRef.current = hydrated;
    profileHydratedForRef.current = customer.id;
  }, [customer, open, mode]);

  const isDirty = useCallback(() => {
    if (mode === "create") return false;
    const base = baselineRef.current;
    if (!base) return false;
    return (
      photoFile !== null ||
      JSON.stringify(form) !== JSON.stringify(base.form) ||
      JSON.stringify(relatedContacts) !== JSON.stringify(base.relatedContacts) ||
      JSON.stringify(extraAddresses) !== JSON.stringify(base.extraAddresses)
    );
  }, [mode, form, relatedContacts, extraAddresses, photoFile]);

  /** Fields persisted outside Save (verify-contact etc.) no longer count as unsaved. */
  const markFormSaved = useCallback((saved: Partial<PartnerFormState>) => {
    const base = baselineRef.current;
    if (base) baselineRef.current = { ...base, form: { ...base.form, ...saved } };
  }, []);

  useEffect(() => () => clearPhotoObjectUrl(), [clearPhotoObjectUrl]);

  const groupOptions = useMemo(
    () => buildCustomerGroupOptions(customGroupLabels, groupOrder, hiddenGroups),
    [customGroupLabels, groupOrder, hiddenGroups],
  );

  const [groupDrawerOpen, setGroupDrawerOpen] = useState(false);
  const [countryDrawerOpen, setCountryDrawerOpen] = useState(false);
  const [countryOptions, setCountryOptions] = useState<string[]>(() =>
    buildCountryOptions(mode === "create" ? "Bangladesh" : customer?.country),
  );

  const refreshCountryOptions = useCallback((current?: string | null) => {
    setCountryOptions(buildCountryOptions(current));
  }, []);

  const addGroup = useCallback(() => {
    setGroupDrawerOpen(true);
  }, []);

  const openCountryDrawer = useCallback(() => {
    setCountryDrawerOpen(true);
  }, []);

  const createCountry = useCallback(
    (name: string) => {
      if (!name.trim()) return;
      addCustomCountry(name);
      const next = name.trim();
      setForm((f) => ({ ...f, country: next }));
      refreshCountryOptions(next);
      toast.success("Country added");
    },
    [refreshCountryOptions],
  );

  const renameCountry = useCallback(
    (from: string, to: string) => {
      if (!to.trim()) {
        toast.error("Country name is required");
        return;
      }
      if (isBuiltInCountry(from)) {
        toast.error("Built-in countries cannot be renamed");
        return;
      }
      renameCustomCountry(from, to);
      const next = to.trim();
      setForm((f) => (f.country === from ? { ...f, country: next } : f));
      setExtraAddresses((rows) =>
        rows.map((row) => (row.country === from ? { ...row, country: next } : row)),
      );
      refreshCountryOptions(next);
      toast.success("Country updated");
    },
    [refreshCountryOptions],
  );

  const deleteCountry = useCallback(
    (name: string) => {
      if (isBuiltInCountry(name)) {
        toast.error("Built-in countries cannot be deleted");
        return;
      }
      removeCustomCountry(name);
      setForm((f) => (f.country === name ? { ...f, country: "Bangladesh" } : f));
      setExtraAddresses((rows) =>
        rows.map((row) =>
          row.country === name ? { ...row, country: "Bangladesh" } : row,
        ),
      );
      refreshCountryOptions("Bangladesh");
      toast.success("Country removed");
    },
    [refreshCountryOptions],
  );

  const createGroup = useCallback((label: string) => {
    if (!label.trim()) return;
    const id = slugCustomerGroupLabel(label);
    setCustomGroupLabels((prev) => {
      const next = { ...prev, [id]: label.trim() };
      writeCustomCustomerGroupLabels(next);
      return next;
    });
    appendCustomerGroupOrder(id);
    setGroupOrder(readCustomerGroupOrder());
    setHiddenGroups(readHiddenCustomerGroups());
    setForm((f) => ({ ...f, group: id }));
    toast.success("Customer group added");
  }, []);

  const reorderGroups = useCallback((orderedIds: string[]) => {
    writeCustomerGroupOrder(orderedIds);
    setGroupOrder(orderedIds);
  }, []);

  const renameGroup = useCallback((id: string, label: string) => {
    if (!label.trim()) {
      toast.error("Group name is required");
      return;
    }
    const next = renameCustomerGroupLabel(id, label);
    setCustomGroupLabels(next);
    toast.success("Group updated");
  }, []);

  const removeGroup = useCallback(
    (id: string) => {
      const nextLabels = deleteCustomerGroup(id);
      setCustomGroupLabels(nextLabels);
      setGroupOrder(readCustomerGroupOrder());
      setHiddenGroups(readHiddenCustomerGroups());
      setForm((f) => {
        if (f.group !== id) return f;
        const remaining = buildCustomerGroupOptions(
          nextLabels,
          readCustomerGroupOrder(),
          readHiddenCustomerGroups(),
        );
        return { ...f, group: remaining[0]?.id ?? "retail" };
      });
      toast.success("Group removed");
    },
    [],
  );

  const patch = useCallback(<K extends keyof PartnerFormState>(key: K, value: PartnerFormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  const showLogoPlaceholder = useMemo(
    () => form.name.toLowerCase().includes("againsoft") || form.parentCompany.toLowerCase().includes("againsoft"),
    [form.name, form.parentCompany],
  );

  const handlePhotoSelect = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be 5MB or smaller");
      return;
    }
    clearPhotoObjectUrl();
    const objectUrl = URL.createObjectURL(file);
    photoObjectUrlRef.current = objectUrl;
    setPhotoPreview(objectUrl);
    setPhotoFile(file);
  };

  return {
    form,
    setForm,
    restoredDraftAt,
    relatedContacts,
    extraAddresses,
    photoPreview,
    photoFile,
    tab,
    photoInputRef,
    patch,
    showLogoPlaceholder,
    setTab,
    setRelatedContacts,
    setExtraAddresses,
    handlePhotoSelect,
    isDirty,
    markFormSaved,
    groupOptions,
    addGroup,
    groupDrawerOpen,
    setGroupDrawerOpen,
    createGroup,
    reorderGroups,
    renameGroup,
    removeGroup,
    countryOptions,
    countryDrawerOpen,
    setCountryDrawerOpen,
    openCountryDrawer,
    createCountry,
    renameCountry,
    deleteCountry,
  };
}

function SortableGroupRow({
  group,
  customerCount,
  selected,
  editing,
  draftLabel,
  onSelect,
  onStartEdit,
  onDraftChange,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: {
  group: CustomerGroupOption;
  customerCount: number;
  selected: boolean;
  editing: boolean;
  draftLabel: string;
  onSelect: () => void;
  onStartEdit: () => void;
  onDraftChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "flex items-center gap-1 rounded-none border-b border-border/50 bg-background/70 px-1 py-1 text-[13px]",
        selected && "bg-[#00a09d]/10",
        isDragging && "z-10 bg-background shadow-md ring-1 ring-[#00a09d]/30",
      )}
    >
      <button
        type="button"
        className="inline-flex h-7 w-7 shrink-0 touch-none items-center justify-center rounded-none text-muted-foreground hover:text-foreground"
        aria-label={`Drag ${group.label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4 cursor-grab active:cursor-grabbing" />
      </button>

      {editing ? (
        <>
          <input
            autoFocus
            value={draftLabel}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSaveEdit();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                onCancelEdit();
              }
            }}
            className="h-7 min-w-0 flex-1 bg-transparent px-1 text-[13px] text-foreground outline-none"
            aria-label="Edit group name"
          />
          <button
            type="button"
            title="Save name"
            aria-label="Save name"
            onClick={onSaveEdit}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-none text-[#00a09d] hover:bg-[#00a09d]/10"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Cancel"
            aria-label="Cancel edit"
            onClick={onCancelEdit}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onSelect}
            className="min-w-0 flex-1 truncate px-1 py-1 text-left text-black hover:text-[#00a09d] dark:text-foreground"
          >
            {group.label}
          </button>
          <span
            className="shrink-0 px-1.5 text-[12px] tabular-nums text-muted-foreground"
            title={`${customerCount} customer${customerCount === 1 ? "" : "s"}`}
          >
            {customerCount}
          </span>
          {selected ? (
            <>
              <button
                type="button"
                title="Edit group"
                aria-label={`Edit ${group.label}`}
                onClick={onStartEdit}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Delete group"
                aria-label={`Delete ${group.label}`}
                onClick={onDelete}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          ) : null}
        </>
      )}
    </li>
  );
}

/** Nested drawer: list / reorder groups and add a new one. */
function CustomerGroupDrawer({
  open,
  onOpenChange,
  groups,
  onCreate,
  onReorder,
  onRename,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: CustomerGroupOption[];
  onCreate: (label: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const { customers } = useCommerceCustomers();

  const customerCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of customers) {
      const key = c.group || "retail";
      map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }, [customers]);

  useEffect(() => {
    if (open) {
      setLabel("");
      setSelectedId(null);
      setEditingId(null);
      setDraftLabel("");
    }
  }, [open]);

  useEffect(() => {
    if (selectedId && !groups.some((g) => g.id === selectedId)) {
      setSelectedId(null);
      setEditingId(null);
    }
  }, [groups, selectedId]);

  const submit = () => {
    if (!label.trim()) {
      onOpenChange(false);
      return;
    }
    onCreate(label);
    setLabel("");
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = groups.findIndex((g) => g.id === active.id);
    const newIndex = groups.findIndex((g) => g.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(groups.map((g) => g.id), oldIndex, newIndex));
  };

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title="Customer groups"
      nested
      resizable
      defaultWidth={380}
      minWidth={280}
      widthStorageKey="again-customer-group-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar>
          <button
            type="button"
            className={cn(AGAIN_DRAWER_PRIMARY_BTN)}
            style={{ backgroundColor: AGAIN_DRAWER_PRIMARY_COLOR }}
            onClick={submit}
          >
            Save
          </button>
          <button
            type="button"
            className={AGAIN_DRAWER_ACTION_BTN}
            onClick={() => onOpenChange(false)}
          >
            Discard
          </button>
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-none"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </AgainDrawerControlBar>

        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
          <div className="overflow-hidden rounded-none border border-border/70 bg-background/50">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={groups.map((g) => g.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul>
                  {groups.map((group) => (
                    <SortableGroupRow
                      key={group.id}
                      group={group}
                      customerCount={customerCounts[group.id] ?? 0}
                      selected={selectedId === group.id}
                      editing={editingId === group.id}
                      draftLabel={editingId === group.id ? draftLabel : group.label}
                      onSelect={() => {
                        setSelectedId(group.id);
                        setEditingId(null);
                      }}
                      onStartEdit={() => {
                        setSelectedId(group.id);
                        setEditingId(group.id);
                        setDraftLabel(group.label);
                      }}
                      onDraftChange={setDraftLabel}
                      onSaveEdit={() => {
                        onRename(group.id, draftLabel);
                        setEditingId(null);
                      }}
                      onCancelEdit={() => {
                        setEditingId(null);
                        setDraftLabel(group.label);
                      }}
                      onDelete={() => {
                        if (
                          !window.confirm(`Remove group "${group.label}" from the list?`)
                        ) {
                          return;
                        }
                        onDelete(group.id);
                        if (selectedId === group.id) setSelectedId(null);
                        if (editingId === group.id) setEditingId(null);
                      }}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>

            <div className="flex items-center gap-1 rounded-none border-b border-border/50 bg-background/70 px-1 py-1 text-[13px] last:border-b-0">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-black dark:text-foreground">
                <Plus className="h-4 w-4" />
              </span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (label.trim()) {
                      onCreate(label);
                      setLabel("");
                    }
                  }
                }}
                placeholder="Add new group"
                className="h-7 min-w-0 flex-1 bg-transparent px-1 text-[13px] text-black outline-none placeholder:text-black/50 dark:text-foreground dark:placeholder:text-muted-foreground"
              />
            </div>
          </div>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}

/** Nested drawer: manage country list and add custom countries. */
function CountryDrawer({
  open,
  onOpenChange,
  countries,
  selectedCountry,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  countries: string[];
  selectedCountry: string;
  onSelect: (country: string) => void;
  onCreate: (name: string) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (name: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");

  useEffect(() => {
    if (open) {
      setLabel("");
      setSelectedId(selectedCountry || null);
      setEditingId(null);
      setDraftLabel("");
    }
  }, [open, selectedCountry]);

  const submit = () => {
    if (!label.trim()) {
      onOpenChange(false);
      return;
    }
    onCreate(label);
    setLabel("");
    onOpenChange(false);
  };

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title="Countries"
      nested
      resizable
      defaultWidth={360}
      minWidth={280}
      widthStorageKey="again-country-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar>
          <button
            type="button"
            className={cn(AGAIN_DRAWER_PRIMARY_BTN)}
            style={{ backgroundColor: AGAIN_DRAWER_PRIMARY_COLOR }}
            onClick={submit}
          >
            Save
          </button>
          <button
            type="button"
            className={AGAIN_DRAWER_ACTION_BTN}
            onClick={() => onOpenChange(false)}
          >
            Discard
          </button>
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-none"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </AgainDrawerControlBar>

        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
          <div className="overflow-hidden rounded-none border border-border/70 bg-background/50">
            <ul>
              {countries.map((country) => {
                const selected = selectedId === country;
                const editing = editingId === country;
                const builtIn = isBuiltInCountry(country);
                return (
                  <li
                    key={country}
                    className={cn(
                      "flex items-center gap-1 rounded-none border-b border-border/50 bg-background/70 px-1 py-1 text-[13px]",
                      selected && "bg-[#00a09d]/10",
                    )}
                  >
                    {editing ? (
                      <>
                        <input
                          autoFocus
                          value={draftLabel}
                          onChange={(e) => setDraftLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              onRename(country, draftLabel);
                              setEditingId(null);
                              setSelectedId(draftLabel.trim() || country);
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              setEditingId(null);
                              setDraftLabel(country);
                            }
                          }}
                          className="h-7 min-w-0 flex-1 bg-transparent px-1 text-[13px] text-foreground outline-none"
                          aria-label="Edit country name"
                        />
                        <button
                          type="button"
                          title="Save name"
                          aria-label="Save name"
                          onClick={() => {
                            onRename(country, draftLabel);
                            setEditingId(null);
                            setSelectedId(draftLabel.trim() || country);
                          }}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-none text-[#00a09d] hover:bg-[#00a09d]/10"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Cancel"
                          aria-label="Cancel edit"
                          onClick={() => {
                            setEditingId(null);
                            setDraftLabel(country);
                          }}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(country);
                            onSelect(country);
                            setEditingId(null);
                          }}
                          className="min-w-0 flex-1 truncate px-2 py-1 text-left text-black hover:text-[#00a09d] dark:text-foreground"
                        >
                          {country}
                        </button>
                        {selected && !builtIn ? (
                          <>
                            <button
                              type="button"
                              title="Edit country"
                              aria-label={`Edit ${country}`}
                              onClick={() => {
                                setEditingId(country);
                                setDraftLabel(country);
                              }}
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Delete country"
                              aria-label={`Delete ${country}`}
                              onClick={() => {
                                if (!window.confirm(`Remove country "${country}"?`)) return;
                                onDelete(country);
                                if (selectedId === country) setSelectedId(null);
                              }}
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : null}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="flex items-center gap-1 rounded-none border-b border-border/50 bg-background/70 px-1 py-1 text-[13px] last:border-b-0">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-black dark:text-foreground">
                <Plus className="h-4 w-4" />
              </span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (label.trim()) {
                      onCreate(label);
                      setLabel("");
                      onOpenChange(false);
                    }
                  }
                }}
                placeholder="Add new country"
                className="h-7 min-w-0 flex-1 bg-transparent px-1 text-[13px] text-black outline-none placeholder:text-black/50 dark:text-foreground dark:placeholder:text-muted-foreground"
              />
            </div>
          </div>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}

/** Nested drawer: recharge customer wallet via payment gateway. */
const WALLET_GATEWAY_OPTIONS = [
  { id: "bkash" as const, label: "bKash" },
  { id: "nagad" as const, label: "Nagad" },
  { id: "sslcommerz" as const, label: "Card / SSLCommerz" },
];

function WalletRechargeDrawer({
  open,
  onOpenChange,
  currentBalance,
  saving,
  onRecharge,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBalance: number;
  saving: boolean;
  onRecharge: (input: {
    amount: number;
    paymentMethod: "bkash" | "nagad" | "sslcommerz";
    paymentReference: string;
    note: string;
  }) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"bkash" | "nagad" | "sslcommerz">("bkash");
  const [paymentReference, setPaymentReference] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setAmount("");
      setPaymentMethod("bkash");
      setPaymentReference("");
      setNote("");
    }
  }, [open]);

  const parsedAmount = Number(amount.replace(/,/g, ""));
  const canSubmit =
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    paymentReference.trim().length >= 3 &&
    !saving;

  const submit = async () => {
    if (!(Number.isFinite(parsedAmount) && parsedAmount > 0)) {
      toast.error("Enter a valid recharge amount");
      return;
    }
    if (paymentReference.trim().length < 3) {
      toast.error("Payment gateway transaction ID is required");
      return;
    }
    await onRecharge({
      amount: parsedAmount,
      paymentMethod,
      paymentReference: paymentReference.trim(),
      note: note.trim(),
    });
  };

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title="Recharge wallet"
      nested
      resizable
      defaultWidth={380}
      minWidth={280}
      widthStorageKey="again-wallet-recharge-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar>
          <button
            type="button"
            className={cn(AGAIN_DRAWER_PRIMARY_BTN)}
            style={{ backgroundColor: AGAIN_DRAWER_PRIMARY_COLOR }}
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Recharging…
              </span>
            ) : (
              "Confirm recharge"
            )}
          </button>
          <button
            type="button"
            className={AGAIN_DRAWER_ACTION_BTN}
            onClick={() => onOpenChange(false)}
          >
            Discard
          </button>
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-none"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </AgainDrawerControlBar>

        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
          <div className="mb-3 rounded-none border border-border/70 bg-background/70 px-3 py-2.5">
            <p className="text-[12px] text-muted-foreground">Current balance</p>
            <p className="text-[18px] font-semibold text-[#714B67]">
              {formatCurrency(currentBalance)}
            </p>
            <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
              Recharge only after payment is completed through a gateway. Free credit is not allowed.
            </p>
          </div>
          <div className="space-y-1">
            <AgainFormRow label="Amount">
              <AgainUnderlineInput
                value={amount}
                onChange={setAmount}
                placeholder="e.g. 500"
              />
            </AgainFormRow>
            <AgainFormRow label="Payment gateway">
              <AgainUnderlineField className="flex min-w-0 items-center gap-0.5">
                <Select
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as "bkash" | "nagad" | "sslcommerz")
                  }
                  className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0 text-[13px] shadow-none outline-none"
                >
                  {WALLET_GATEWAY_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </AgainUnderlineField>
            </AgainFormRow>
            <AgainFormRow label="Gateway Trx ID">
              <AgainUnderlineInput
                value={paymentReference}
                onChange={setPaymentReference}
                placeholder="bKash / Nagad / card transaction ID"
              />
            </AgainFormRow>
            <AgainFormRow label="Note">
              <AgainUnderlineInput
                value={note}
                onChange={setNote}
                placeholder="Optional"
              />
            </AgainFormRow>
          </div>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}

type PartnerDrawerBodyProps = {
  customer: Customer | null;
  mode?: PartnerFormMode;
  readOnly?: boolean;
  variant?: "drawer" | "card";
  open?: boolean;
  initialName?: string;
  initialEmail?: string;
  initialPhone?: string;
  /** Open on this notebook tab (e.g. profile from sales order name click). */
  initialTab?: PartnerNotebookTab;
  /** When set, shows Save / Discard and persists via commerce API on save. */
  onSaved?: (customer: Customer) => void;
  onDiscard?: () => void;
  /** Lets the parent trigger save (e.g. from a drawer control bar). */
  saveRef?: React.MutableRefObject<(() => Promise<void>) | null>;
};

/** Again partner form — embedded in Sales order or standalone scroll area */
export function PartnerDrawerBody({
  customer,
  mode: modeProp,
  readOnly: readOnlyProp,
  variant = "drawer",
  open = true,
  initialName = "",
  initialEmail = "",
  initialPhone = "",
  initialTab,
  onSaved,
  onDiscard,
  saveRef,
}: PartnerDrawerBodyProps) {
  const canWrite = useAdminCanWrite();
  const readOnly = readOnlyProp ?? !canWrite;
  const mode: PartnerFormMode =
    modeProp ?? (customer ? "edit" : "create");
  const [liveCustomer, setLiveCustomer] = useLivePartnerCustomer(customer, {
    open,
    mode,
  });
  const [walletDrawerOpen, setWalletDrawerOpen] = useState(false);
  const [walletSaving, setWalletSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifyingContact, setVerifyingContact] = useState<"phone" | "email" | null>(null);
  const [verifyingWhatsApp, setVerifyingWhatsApp] = useState(false);

  const {
    form,
    relatedContacts,
    extraAddresses,
    photoPreview,
    photoFile,
    tab,
    photoInputRef,
    patch,
    showLogoPlaceholder,
    setTab,
    setRelatedContacts,
    setExtraAddresses,
    handlePhotoSelect,
    groupOptions,
    addGroup,
    groupDrawerOpen,
    setGroupDrawerOpen,
    createGroup,
    reorderGroups,
    renameGroup,
    removeGroup,
    countryOptions,
    countryDrawerOpen,
    setCountryDrawerOpen,
    openCountryDrawer,
    createCountry,
    renameCountry,
    deleteCountry,
    markFormSaved,
  } = usePartnerForm({
    customer: liveCustomer,
    mode,
    open,
    initialName,
    initialEmail,
    initialPhone,
    initialTab,
  });

  const displayCustomer = mode === "create" ? null : (liveCustomer ?? customer);
  const commerceRecordId = liveCustomer?.id ?? customer?.id ?? null;

  const handleSave = async () => {
    if (readOnly || !onSaved) return;
    const normalizedForm = normalizePartnerPhonesForSave(form, patch);
    if (!normalizedForm) return;
    const namedForm = ensurePartnerNameForSave(normalizedForm, patch);
    if (!namedForm) return;
    setSaving(true);
    try {
      let profileImage = liveCustomer?.profileImage ?? customer?.profileImage ?? undefined;
      if (photoFile) {
        const uploaded = await uploadCatalogMediaFiles([photoFile]);
        const url = uploaded[0]?.url?.trim();
        if (!url) throw new Error("Photo upload failed");
        profileImage = url;
      }
      const payload = partnerFormToPayload(
        namedForm,
        relatedContacts,
        profileImage,
        extraAddresses,
      );
      const saved =
        mode === "create"
          ? await createCommerceCustomer(payload)
          : await updateCommerceCustomer((liveCustomer ?? customer)!.id, payload);
      setLiveCustomer(saved);
      toast.success(mode === "create" ? "Customer created" : "Customer saved");
      onSaved(saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  useEffect(() => {
    if (!saveRef) return;
    saveRef.current = () => handleSaveRef.current();
    return () => {
      saveRef.current = null;
    };
  }, [saveRef]);

  const openWalletRecharge = () => {
    if (mode === "create" || !liveCustomer?.id) {
      toast.error("Save the customer first to recharge wallet");
      return;
    }
    setWalletDrawerOpen(true);
  };

  const handleVerifyContact = async (channel: "phone" | "email", value: string) => {
    if (mode === "create" || !liveCustomer?.id) {
      toast.error("Save the customer first to verify contact");
      return;
    }
    setVerifyingContact(channel);
    try {
      const updated = await verifyCommerceCustomerContact(liveCustomer.id, channel, value);
      setLiveCustomer(updated);
      if (channel === "phone") patch("phone", updated.phone);
      else patch("email", updated.email);
      markFormSaved(channel === "phone" ? { phone: updated.phone } : { email: updated.email });
      onSaved?.(updated);
      toast.success(`${channel === "phone" ? "Phone" : "Email"} marked verified`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verify failed");
    } finally {
      setVerifyingContact(null);
    }
  };

  const handleVerifyWhatsApp = async () => {
    if (mode === "create" || !liveCustomer?.id) {
      toast.error("Save the customer first to verify WhatsApp");
      return;
    }
    if (!form.phone.trim()) {
      toast.error("Enter a phone number first");
      return;
    }
    try {
      setVerifyingWhatsApp(true);
      if (form.phone.trim() !== (liveCustomer.phone || "").trim()) {
        const saved = await updateCommerceCustomer(liveCustomer.id, { phone: form.phone.trim() });
        setLiveCustomer(saved);
        markFormSaved({ phone: form.phone.trim() });
      }
      const updated = await verifyCommerceCustomerWhatsApp(liveCustomer.id);
      setLiveCustomer(updated);
      onSaved?.(updated);
      toast.success("WhatsApp available on this number");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "WhatsApp not available on this number");
    } finally {
      setVerifyingWhatsApp(false);
    }
  };

  const handleWalletRecharge = async (input: {
    amount: number;
    paymentMethod: "bkash" | "nagad" | "sslcommerz";
    paymentReference: string;
    note: string;
  }) => {
    if (!liveCustomer?.id) return;
    setWalletSaving(true);
    try {
      const updated = await rechargeCommerceCustomerWallet(liveCustomer.id, {
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference,
        note: input.note || undefined,
      });
      setLiveCustomer(updated);
      setWalletDrawerOpen(false);
      toast.success(`Wallet recharged ${formatCurrency(input.amount)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Recharge failed");
    } finally {
      setWalletSaving(false);
    }
  };

  return (
    <>
      {onSaved && !readOnly ? (
        <div className="mb-0 flex flex-wrap items-center gap-2 border-b border-border/80 py-1">
          <button
            type="button"
            className={cn(AGAIN_DRAWER_PRIMARY_BTN, "h-6 px-2 text-[11px]")}
            style={{ backgroundColor: AGAIN_DRAWER_PRIMARY_COLOR }}
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving…
              </span>
            ) : (
              "Save"
            )}
          </button>
          {onDiscard ? (
            <button
              type="button"
              className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
              onClick={onDiscard}
            >
              Discard
            </button>
          ) : null}
        </div>
      ) : null}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handlePhotoSelect(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      <CustomerGroupDrawer
        open={groupDrawerOpen}
        onOpenChange={setGroupDrawerOpen}
        groups={groupOptions}
        onCreate={createGroup}
        onReorder={reorderGroups}
        onRename={renameGroup}
        onDelete={removeGroup}
      />
      <CountryDrawer
        open={countryDrawerOpen}
        onOpenChange={setCountryDrawerOpen}
        countries={countryOptions}
        selectedCountry={form.country}
        onSelect={(country) => patch("country", country)}
        onCreate={createCountry}
        onRename={renameCountry}
        onDelete={deleteCountry}
      />
      <WalletRechargeDrawer
        open={walletDrawerOpen}
        onOpenChange={setWalletDrawerOpen}
        currentBalance={displayCustomer?.walletBalance ?? 0}
        saving={walletSaving}
        onRecharge={handleWalletRecharge}
      />
      <PartnerFormSheet
        form={form}
        tab={tab}
        extraAddresses={extraAddresses}
        customer={displayCustomer}
        recordId={commerceRecordId}
        readOnly={readOnly}
        photoPreview={photoPreview}
        showLogoPlaceholder={showLogoPlaceholder}
        variant={variant}
        onTabChange={setTab}
        onPatch={patch}
        onPhotoClick={() => photoInputRef.current?.click()}
        onAddAddress={() =>
          setExtraAddresses((rows) => [
            ...rows,
            newPartnerExtraAddress({
              city: form.city,
              region: form.region,
              country: form.country,
            }),
          ])
        }
        onPatchAddress={(id, key, value) =>
          setExtraAddresses((rows) =>
            rows.map((row) => (row.id === id ? { ...row, [key]: value } : row)),
          )
        }
        onRemoveAddress={(id) => setExtraAddresses((rows) => rows.filter((r) => r.id !== id))}
        countryOptions={countryOptions}
        onOpenCountryDrawer={openCountryDrawer}
        onOpenWalletRecharge={readOnly ? undefined : openWalletRecharge}
        onRemoveTag={(tag) => patch("tags", form.tags.filter((t) => t !== tag))}
        onAddTag={(tag) => patch("tags", [...form.tags, tag])}
        groupOptions={groupOptions}
        onAddGroup={addGroup}
        onVerifyContact={readOnly ? undefined : handleVerifyContact}
        verifyingContact={verifyingContact}
        onVerifyWhatsApp={readOnly ? undefined : handleVerifyWhatsApp}
        verifyingWhatsApp={verifyingWhatsApp}
      />
    </>
  );
}

type AgainPartnerDrawerProps = {
  open: boolean;
  customer?: Customer | null;
  mode?: PartnerFormMode;
  initialName?: string;
  initialEmail?: string;
  initialPhone?: string;
  onOpenChange: (open: boolean) => void;
  onSaved?: (customer: Customer) => void;
  moduleLabel?: string;
  nested?: boolean;
  originRole?: PartyCommerceRole;
};

export function AgainPartnerDrawer({
  open,
  customer = null,
  mode: modeProp,
  initialName = "",
  initialEmail = "",
  initialPhone = "",
  onOpenChange,
  onSaved,
  moduleLabel: _moduleLabel = "Contacts",
  nested = false,
  originRole = "customer",
}: AgainPartnerDrawerProps) {
  const canWrite = useAdminCanWrite();
  const readOnly = !canWrite;
  const mode: PartnerFormMode = modeProp ?? (customer ? "edit" : "create");
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState<PartyCommerceRole[]>(["customer"]);
  /** Roles already active when the drawer opened — locked in the picker since
   * there's no "disable role" API, only `enablePartyCommerceRole` (additive). */
  const [existingRoles, setExistingRoles] = useState<PartyCommerceRole[]>(["customer"]);
  const [liveCustomer, setLiveCustomer] = useLivePartnerCustomer(customer, {
    open,
    mode,
  });
  const [walletDrawerOpen, setWalletDrawerOpen] = useState(false);
  const [walletSaving, setWalletSaving] = useState(false);
  const [verifyingContact, setVerifyingContact] = useState<"phone" | "email" | null>(null);
  const [verifyingWhatsApp, setVerifyingWhatsApp] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === "create") {
      setRoles([originRole]);
      // Nothing is persisted yet — only "customer" is a free side effect of
      // createCommerceCustomer(), so every other checked role (including
      // originRole itself, e.g. "supplier") still needs its enable call on save.
      setExistingRoles([]);
      return;
    }
    const partyId = customer?.partyId;
    if (!partyId) return;
    let cancelled = false;
    fetchPartyCommerceLinks(partyId)
      .then((links) => {
        if (cancelled) return;
        const active = (links.roles as PartyCommerceRole[]) ?? [originRole];
        setRoles(active);
        setExistingRoles(active);
      })
      .catch(() => {
        if (!cancelled) {
          setRoles([originRole]);
          setExistingRoles([originRole]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode, customer?.partyId, originRole]);

  const {
    form,
    setForm,
    restoredDraftAt,
    relatedContacts,
    extraAddresses,
    photoPreview,
    photoFile,
    tab,
    photoInputRef,
    patch,
    showLogoPlaceholder,
    setTab,
    setRelatedContacts,
    setExtraAddresses,
    handlePhotoSelect,
    groupOptions,
    addGroup,
    groupDrawerOpen,
    setGroupDrawerOpen,
    createGroup,
    reorderGroups,
    renameGroup,
    removeGroup,
    countryOptions,
    countryDrawerOpen,
    setCountryDrawerOpen,
    openCountryDrawer,
    createCountry,
    renameCountry,
    deleteCountry,
    isDirty,
    markFormSaved,
  } = usePartnerForm({
    customer: liveCustomer,
    mode,
    open,
    initialName,
    initialEmail,
    initialPhone,
  });

  const displayCustomer = mode === "create" ? null : (liveCustomer ?? customer);
  const commerceRecordId = liveCustomer?.id ?? customer?.id ?? null;
  const drawerTitle =
    mode === "create"
      ? originRole === "supplier"
        ? "New supplier"
        : originRole === "vendor"
          ? "New vendor"
          : "New contact"
      : "Edit contact";

  const openWalletRecharge = () => {
    if (mode === "create" || !liveCustomer?.id) {
      toast.error("Save the customer first to recharge wallet");
      return;
    }
    setWalletDrawerOpen(true);
  };

  const handleVerifyContact = async (channel: "phone" | "email", value: string) => {
    if (mode === "create" || !liveCustomer?.id) {
      toast.error("Save the customer first to verify contact");
      return;
    }
    setVerifyingContact(channel);
    try {
      const updated = await verifyCommerceCustomerContact(liveCustomer.id, channel, value);
      setLiveCustomer(updated);
      if (channel === "phone") patch("phone", updated.phone);
      else patch("email", updated.email);
      markFormSaved(channel === "phone" ? { phone: updated.phone } : { email: updated.email });
      onSaved?.(updated);
      toast.success(`${channel === "phone" ? "Phone" : "Email"} marked verified`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verify failed");
    } finally {
      setVerifyingContact(null);
    }
  };

  const handleVerifyWhatsApp = async () => {
    if (mode === "create" || !liveCustomer?.id) {
      toast.error("Save the customer first to verify WhatsApp");
      return;
    }
    if (!form.phone.trim()) {
      toast.error("Enter a phone number first");
      return;
    }
    try {
      setVerifyingWhatsApp(true);
      if (form.phone.trim() !== (liveCustomer.phone || "").trim()) {
        const saved = await updateCommerceCustomer(liveCustomer.id, { phone: form.phone.trim() });
        setLiveCustomer(saved);
        markFormSaved({ phone: form.phone.trim() });
      }
      const updated = await verifyCommerceCustomerWhatsApp(liveCustomer.id);
      setLiveCustomer(updated);
      onSaved?.(updated);
      toast.success("WhatsApp available on this number");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "WhatsApp not available on this number");
    } finally {
      setVerifyingWhatsApp(false);
    }
  };

  const handleWalletRecharge = async (input: {
    amount: number;
    paymentMethod: "bkash" | "nagad" | "sslcommerz";
    paymentReference: string;
    note: string;
  }) => {
    if (!liveCustomer?.id) return;
    setWalletSaving(true);
    try {
      const updated = await rechargeCommerceCustomerWallet(liveCustomer.id, {
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference,
        note: input.note || undefined,
      });
      setLiveCustomer(updated);
      onSaved?.(updated);
      setWalletDrawerOpen(false);
      toast.success(`Wallet recharged ${formatCurrency(input.amount)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Recharge failed");
    } finally {
      setWalletSaving(false);
    }
  };

  const handleSave = async () => {
    if (readOnly) return;
    const normalizedForm = normalizePartnerPhonesForSave(form, patch);
    if (!normalizedForm) return;
    const namedForm = ensurePartnerNameForSave(normalizedForm, patch);
    if (!namedForm) return;
    setSaving(true);
    try {
      let profileImage = liveCustomer?.profileImage ?? customer?.profileImage ?? undefined;
      if (photoFile) {
        const uploaded = await uploadCatalogMediaFiles([photoFile]);
        const url = uploaded[0]?.url?.trim();
        if (!url) throw new Error("Photo upload failed");
        profileImage = url;
      }
      const payload = partnerFormToPayload(
        namedForm,
        relatedContacts,
        profileImage,
        extraAddresses,
      );
      const saved =
        mode === "create"
          ? await createCommerceCustomer(payload)
          : await updateCommerceCustomer((liveCustomer ?? customer)!.id, payload);
      if (saved.partyId) {
        for (const role of roles) {
          if (role !== "customer" && !existingRoles.includes(role)) {
            await enablePartyCommerceRole(saved.partyId, role);
          }
        }
      }
      setLiveCustomer(saved);
      if (mode === "create") clearDraft(DRAFT_KEY);
      const kindLabel =
        originRole === "supplier" ? "Supplier" : originRole === "vendor" ? "Vendor" : "Customer";
      toast.success(mode === "create" ? `${kindLabel} created` : `${kindLabel} saved`);
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const saveDraftIfDirty = () => {
    if (mode !== "create") return;
    const dirty =
      JSON.stringify(form) !== JSON.stringify(EMPTY_FORM) ||
      relatedContacts.length > 0 ||
      extraAddresses.length > 0;
    if (!dirty) return;
    writeDraft<CustomerDraftPayload>(DRAFT_KEY, { form, relatedContacts, extraAddresses });
  };

  // Edit mode has no draft store, so an outside click / Esc / Discard asks
  // before unsaved edits are thrown away. Radix can raise pointer-down and
  // focus-outside for one click; a fresh decline answers the second one.
  const declinedAtRef = useRef(0);
  const confirmDiscard = () => {
    if (mode === "create" || readOnly || !isDirty()) return true;
    if (Date.now() - declinedAtRef.current < 500) return false;
    const ok = window.confirm("Discard unsaved changes?");
    if (!ok) declinedAtRef.current = Date.now();
    return ok;
  };
  const requestClose = () => {
    if (confirmDiscard()) onOpenChange(false);
  };
  const handleDismiss = (event: Event) => {
    if (mode === "create") {
      saveDraftIfDirty();
      return;
    }
    if (!confirmDiscard()) event.preventDefault();
  };

  const toastedDraftRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !restoredDraftAt || toastedDraftRef.current === restoredDraftAt) return;
    toastedDraftRef.current = restoredDraftAt;
    toast.info(`Restored unsaved customer draft from ${draftAgeLabel(restoredDraftAt)}`, {
      action: {
        label: "Discard",
        onClick: () => {
          clearDraft(DRAFT_KEY);
          setForm(EMPTY_FORM);
          setRelatedContacts([]);
          setExtraAddresses([]);
        },
      },
    });
  }, [open, restoredDraftAt, setForm, setRelatedContacts, setExtraAddresses]);

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title={drawerTitle}
      nested={nested}
      resizable
      defaultWidth={720}
      minWidth={420}
      widthStorageKey="again-partner-drawer-width"
      onPointerDownOutside={() => saveDraftIfDirty()}
      onInteractOutside={handleDismiss}
      onEscapeKeyDown={handleDismiss}
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar>
          {!readOnly ? (
            <button
              type="button"
              className={cn(AGAIN_DRAWER_PRIMARY_BTN, "h-6 px-2 text-[11px]")}
              style={{ backgroundColor: AGAIN_DRAWER_PRIMARY_COLOR }}
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving…
                </span>
              ) : (
                "Save"
              )}
            </button>
          ) : null}
          <button
            type="button"
            className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
            onClick={requestClose}
          >
            {readOnly ? "Close" : "Discard"}
          </button>
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-none"
              aria-label="Close"
              onClick={requestClose}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </AgainDrawerControlBar>

        <AgainDrawerScrollBody
          className={cn(
            AGAIN_DRAWER_FIELD_SHEET_CLASS,
            "pt-0",
            (tab === "sales" || tab === "ledger") && "flex flex-col overflow-hidden",
          )}
        >
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              handlePhotoSelect(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <PartnerFormSheet
            form={form}
            tab={tab}
            extraAddresses={extraAddresses}
            customer={displayCustomer}
            recordId={commerceRecordId}
            readOnly={readOnly}
            photoPreview={photoPreview}
            showLogoPlaceholder={showLogoPlaceholder}
            rolePicker={
              <PartyRolePicker
                currentRole={originRole}
                roles={roles}
                onChange={setRoles}
                lockedRoles={existingRoles}
                readOnly={readOnly}
              />
            }
            variant="drawer"
            onTabChange={setTab}
            onPatch={patch}
            onPhotoClick={() => photoInputRef.current?.click()}
            onAddAddress={() =>
              setExtraAddresses((rows) => [
                ...rows,
                newPartnerExtraAddress({
                  city: form.city,
                  region: form.region,
                  country: form.country,
                }),
              ])
            }
            onPatchAddress={(id, key, value) =>
              setExtraAddresses((rows) =>
                rows.map((row) => (row.id === id ? { ...row, [key]: value } : row)),
              )
            }
            onRemoveAddress={(id) => setExtraAddresses((rows) => rows.filter((r) => r.id !== id))}
            countryOptions={countryOptions}
            onOpenCountryDrawer={openCountryDrawer}
            onOpenWalletRecharge={readOnly ? undefined : openWalletRecharge}
            onRemoveTag={(tag) => patch("tags", form.tags.filter((t) => t !== tag))}
            onAddTag={(tag) => patch("tags", [...form.tags, tag])}
            groupOptions={groupOptions}
            onAddGroup={addGroup}
            onVerifyContact={readOnly ? undefined : handleVerifyContact}
            verifyingContact={verifyingContact}
            onVerifyWhatsApp={readOnly ? undefined : handleVerifyWhatsApp}
            verifyingWhatsApp={verifyingWhatsApp}
            originRole={originRole}
          />
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
      <CustomerGroupDrawer
        open={groupDrawerOpen}
        onOpenChange={setGroupDrawerOpen}
        groups={groupOptions}
        onCreate={createGroup}
        onReorder={reorderGroups}
        onRename={renameGroup}
        onDelete={removeGroup}
      />
      <CountryDrawer
        open={countryDrawerOpen}
        onOpenChange={setCountryDrawerOpen}
        countries={countryOptions}
        selectedCountry={form.country}
        onSelect={(country) => patch("country", country)}
        onCreate={createCountry}
        onRename={renameCountry}
        onDelete={deleteCountry}
      />
      <WalletRechargeDrawer
        open={walletDrawerOpen}
        onOpenChange={setWalletDrawerOpen}
        currentBalance={displayCustomer?.walletBalance ?? 0}
        saving={walletSaving}
        onRecharge={handleWalletRecharge}
      />
    </AgainDrawerPanel>
  );
}
