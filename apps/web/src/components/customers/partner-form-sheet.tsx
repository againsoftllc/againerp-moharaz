"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Building2, Camera, Crown, Loader2, Plus, Trash2, User, X } from "lucide-react";
import { CUSTOMER_STATUS_LABELS, type Customer } from "@/lib/mock-data/customers";
import { resolveCustomerGroupLabel, type CustomerGroupOption } from "@/lib/customers/customer-group-options";
import {
  fetchCustomerCases,
  type CreateCustomerInput,
  type UpdateCustomerInput,
  fetchCustomerCreditPosition,
  type CustomerCreditPosition,
} from "@/lib/api/commerce-customers";
import { useCustomerFeatureFlags } from "@/lib/customers/use-customer-settings";
import { normalizeBdPhone, phonesMatch } from "@/lib/customers/phone";
import { cn, formatCurrency, formatQuantity } from "@/lib/utils";
import {
  AgainFormField,
  AgainFormGroupTitle,
  AgainFormRecordTitle,
} from "@/components/again/again-form-sheet";
import {
  AgainFormNotebook,
  AgainFormSheet,
  AgainFormSheetBg,
  type AgainNotebookTab,
} from "@/components/again/again-form-sheet-layout";
import {
  PartnerHistoryRows,
  PartnerKpiGrid,
  PartnerOverviewPanel,
  PartnerRewardRows,
  PartnerSectionTitle,
  PartnerStatButton,
  PartnerStatusPill,
  PartnerTabEmpty,
} from "@/components/customers/partner-customer-sections";
import { SupplierOverviewPanel } from "@/components/suppliers/supplier-overview-panel";
import { useCommerceSupplierDetail } from "@/lib/api/use-commerce-supplier-detail";
import { PartnerCustomerOrdersPanel } from "@/components/customers/partner-customer-orders-panel";
import { CustomerLedgerPanel } from "@/components/customers/customer-ledger-panel";
import { PartnerPaymentsPanel } from "@/components/customers/partner-payments-panel";
import { PartnerCasesPanel } from "@/components/customers/partner-cases-panel";
import {
  ensurePartyCommerceKind,
  fetchPartyCommerceLinks,
  type PartnerCommerceKind,
  type PartyCommerceRole,
} from "@/lib/api/party-commerce";
import { WhatsAppIcon } from "@/components/customers/whatsapp-icon";
import { whatsappChatUrl } from "@/lib/customers/whatsapp";
import { PartyExpenseTab } from "@/components/shared/party-expense-tab";
import { PartnerPurchasesPanel } from "@/components/customers/partner-purchases-panel";
import { PartnerCatalogPanel } from "@/components/customers/partner-catalog-panel";
import { PartnerDocumentsPanel } from "@/components/customers/partner-documents-panel";
import { FieldHelpTip } from "@/components/sales/field-help-tip";
import { AgainDrawerSwitch } from "@/components/again/again-drawer";
import { useMentionableUsers } from "@/lib/api/use-mentionable-users";
import { toast } from "sonner";

export type PartnerNotebookTab =
  | "overview"
  | "profile"
  | "ledger"
  | "purchases"
  | "catalog"
  | "sales"
  | "documents"
  | "finance"
  | "expense"
  | "cases"
  | "loyalty"
  | "history";

export type PartnerFormState = {
  name: string;
  companyType: "company" | "individual";
  parentCompany: string;
  parentContactName: string;
  email: string;
  phone: string;
  additionalPhone: string;
  addressTitle: string;
  street: string;
  street2: string;
  city: string;
  region: string;
  zip: string;
  country: string;
  stateCode: string;
  taxId: string;
  jobPosition: string;
  website: string;
  tags: string[];
  group: string;
  status: string;
  loyaltyTier: string;
  assignedStaff: string;
  paymentTerms: string;
  fiscalPosition: string;
  openingBalance: string;
  creditLimit: string;
  rmaLocked: boolean;
  rmaLockReason: string;
  salesLocked: boolean;
  salesLockReason: string;
  tradeMode: string;
  creditDays: string;
  conditionalLimit: string;
  conditionalValidTill: string;
  securityMoney: string;
  openingDate: string;
  defaultPaymentTerms: string;
  paymentSchedule: string;
  notes: string;
};

export type PartnerRelatedContact = {
  id: string;
  name: string;
  email: string;
  phone: string;
  jobPosition: string;
  addressLabel: string;
  city: string;
  country: string;
};

export type PartnerExtraAddress = {
  id: string;
  label: string;
  street: string;
  city: string;
  region: string;
  zip: string;
  country: string;
};

/** Odoo-style address type presets — "Other" reveals a free-text title. */
export const ADDRESS_TITLE_PRESETS = ["Home", "Office", "Billing", "Delivery", "Other"] as const;

const NOTEBOOK_TABS: { id: PartnerNotebookTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "profile", label: "Profile" },
  { id: "ledger", label: "Ledger" },
  { id: "purchases", label: "Purchases" },
  { id: "catalog", label: "Catalog" },
  { id: "sales", label: "Sales" },
  { id: "documents", label: "Documents & Note" },
  { id: "finance", label: "Payments" },
  { id: "history", label: "Activities" },
  { id: "expense", label: "Expense" },
  { id: "cases", label: "Support" },
  { id: "loyalty", label: "Loyalty" },
];

const SUPPLIER_TAB_ORDER: PartnerNotebookTab[] = [
  "overview",
  "profile",
  "purchases",
  "catalog",
  "ledger",
  "finance",
  "documents",
  "expense",
  "history",
  "sales",
  "cases",
  "loyalty",
];

/** Pay term is stored as a plain string ("30 days") so no backend/schema change
 * is needed for the structured number + Days/Months picker (AgainPOS-style). */
export function parsePayTerm(raw: string): { number: string; unit: "days" | "months" } {
  const match = (raw || "").trim().match(/^(\d+)\s*(day|days|month|months)?$/i);
  if (!match) return { number: "", unit: "days" };
  return { number: match[1], unit: /month/i.test(match[2] ?? "") ? "months" : "days" };
}

export function formatPayTerm(number: string, unit: "days" | "months"): string {
  const n = number.trim();
  return n ? `${n} ${unit}` : "";
}

function kindFromRoles(roles: { customer: boolean; supplier: boolean }, origin: PartyCommerceRole): PartnerCommerceKind {
  if (roles.customer && roles.supplier) return "both";
  if (roles.supplier && !roles.customer) return "supplier";
  if (roles.customer && !roles.supplier) return "customer";
  return origin === "supplier" ? "supplier" : "customer";
}

function contactsMatch(a: string, b: string, kind: "phone" | "email"): boolean {
  const left = (a ?? "").trim();
  const right = (b ?? "").trim();
  if (!left || !right) return false;
  if (kind === "email") {
    return left.toLowerCase() === right.toLowerCase();
  }
  return phonesMatch(left, right);
}

export const EMPTY_FORM: PartnerFormState = {
  name: "",
  companyType: "individual",
  parentCompany: "",
  parentContactName: "",
  email: "",
  phone: "",
  additionalPhone: "",
  addressTitle: "Home",
  street: "",
  street2: "",
  // New-customer defaults only; an existing record keeps whatever it has (even blank).
  city: "Dhaka",
  region: "Dhaka",
  zip: "",
  country: "Bangladesh",
  stateCode: "",
  taxId: "",
  jobPosition: "",
  website: "",
  tags: [],
  group: "retail",
  status: "active",
  loyaltyTier: "silver",
  assignedStaff: "",
  paymentTerms: "Immediate",
  fiscalPosition: "National",
  openingBalance: "0",
  creditLimit: "",
  rmaLocked: false,
  rmaLockReason: "",
  salesLocked: false,
  salesLockReason: "",
  tradeMode: "both",
  creditDays: "",
  conditionalLimit: "",
  conditionalValidTill: "",
  securityMoney: "",
  openingDate: "",
  defaultPaymentTerms: "",
  paymentSchedule: "",
  notes: "",
};

export function customerToPartnerForm(customer: Customer | null): PartnerFormState {
  if (!customer) return { ...EMPTY_FORM };

  const meta =
    customer.addresses?.find(
      (a) => a.contactType !== "related" && (a.isDefault || a.contactType === "primary"),
    ) ?? customer.addresses?.find((a) => a.contactType !== "related");

  const parentCompany = customer.parentCompany ?? meta?.parentCompany ?? "";

  const isCompany =
    !parentCompany &&
    (customer.group === "corporate" ||
      (customer.tags ?? []).some((t) => t.toLowerCase().includes("company")) ||
      meta?.title === "Company");

  return {
    name: customer.name ?? "",
    companyType: isCompany ? "company" : "individual",
    parentCompany,
    parentContactName: customer.parentContactName ?? meta?.parentContactName ?? "",
    email: customer.email ?? "",
    phone: customer.phone || meta?.mobile || "",
    additionalPhone:
      customer.phone && meta?.mobile && meta.mobile !== customer.phone ? meta.mobile : "",
    addressTitle: meta?.label || "Home",
    street: meta?.address ?? "",
    street2: meta?.street2 ?? "",
    city: customer.city || meta?.city || "",
    region: meta?.region || customer.region || "",
    zip: meta?.zip ?? "",
    country: customer.country || meta?.country || "Bangladesh",
    stateCode:
      customer.region?.includes("(") ? customer.region : meta?.region ?? customer.region ?? "",
    taxId: meta?.taxId ?? "",
    jobPosition: meta?.jobPosition ?? "",
    website: meta?.website ?? "",
    tags: [...(customer.tags ?? [])],
    group: customer.group ?? "retail",
    status: customer.status ?? "active",
    loyaltyTier: customer.loyaltyTier ?? "silver",
    assignedStaff: customer.assignedStaff ?? "",
    paymentTerms: meta?.paymentTerms || "Immediate",
    fiscalPosition: meta?.fiscalPosition || "National",
    openingBalance: String(customer.openingBalance ?? 0),
    creditLimit: String(customer.creditLimit ?? 0),
    rmaLocked: Boolean(customer.rmaLocked),
    rmaLockReason: customer.rmaLockReason ?? "",
    salesLocked: Boolean(customer.salesLocked),
    salesLockReason: customer.salesLockReason ?? "",
    tradeMode: customer.tradeMode ?? "both",
    creditDays: customer.creditDays != null ? String(customer.creditDays) : "",
    conditionalLimit: customer.conditionalLimit ? String(customer.conditionalLimit) : "",
    conditionalValidTill: customer.conditionalValidTill ?? "",
    securityMoney: customer.securityMoney ? String(customer.securityMoney) : "",
    openingDate: customer.openingDate ?? "",
    defaultPaymentTerms: customer.paymentTerms ?? "",
    paymentSchedule: customer.paymentSchedule ?? "",
    notes: customer.notes ?? "",
  };
}

export function parsePartnerRelatedContacts(customer: Customer | null): PartnerRelatedContact[] {
  if (!customer?.addresses?.length) return [];
  return customer.addresses
    .filter((a) => a.contactType === "related")
    .map((a) => ({
      id: a.id,
      name: a.name ?? a.label ?? "",
      email: a.email ?? "",
      phone: a.phone ?? "",
      jobPosition: a.jobPosition ?? "",
      addressLabel: a.label || "Other address",
      city: a.city ?? customer.city ?? "",
      country: a.country ?? customer.country ?? "",
    }));
}

export function newPartnerRelatedContact(): PartnerRelatedContact {
  return {
    id: `rc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    email: "",
    phone: "",
    jobPosition: "",
    addressLabel: "Other address",
    city: "",
    country: "",
  };
}

function partnerPrimaryAddressId(customer: Customer): string | undefined {
  return (
    customer.addresses?.find(
      (a) => a.contactType !== "related" && (a.isDefault || a.contactType === "primary"),
    ) ?? customer.addresses?.find((a) => a.contactType !== "related")
  )?.id;
}

export function parsePartnerExtraAddresses(customer: Customer | null): PartnerExtraAddress[] {
  if (!customer?.addresses?.length) return [];
  const primaryId = partnerPrimaryAddressId(customer);
  return customer.addresses
    .filter((a) => a.contactType !== "related" && a.id !== primaryId)
    .map((a) => ({
      id: a.id,
      label: a.label || "Home",
      street: a.address ?? "",
      city: a.city ?? "",
      region: a.region ?? "",
      zip: a.zip ?? "",
      country: a.country ?? "",
    }));
}

export function newPartnerExtraAddress(
  defaults?: Pick<PartnerFormState, "city" | "region" | "country">,
): PartnerExtraAddress {
  return {
    id: `addr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: "Home",
    street: "",
    city: defaults?.city ?? "",
    region: defaults?.region ?? "",
    zip: "",
    country: defaults?.country || "Bangladesh",
  };
}

export function partnerFormToPayload(
  form: PartnerFormState,
  relatedContacts: PartnerRelatedContact[],
  profileImage?: string | null,
  extraAddresses: PartnerExtraAddress[] = [],
): CreateCustomerInput & UpdateCustomerInput {
  const phoneNorm = normalizeBdPhone(form.phone);
  const additionalNorm = normalizeBdPhone(form.additionalPhone);
  const phone = phoneNorm.ok ? phoneNorm.phone : form.phone.trim();
  const additionalPhone = additionalNorm.ok ? additionalNorm.phone : form.additionalPhone.trim();
  return {
    name: form.name.trim(),
    phone,
    email: form.email.trim(),
    profileImage: profileImage ?? undefined,
    group: form.group as CreateCustomerInput["group"],
    status: form.status as UpdateCustomerInput["status"],
    loyaltyTier: form.loyaltyTier as UpdateCustomerInput["loyaltyTier"],
    city: form.city.trim(),
    region: form.region.trim(),
    country: form.country.trim(),
    // Explicit null so a cleared field is cleared server-side (PATCH ignores undefined).
    assignedStaff: form.assignedStaff.trim() || null,
    notes: form.notes.trim() || null,
    tags: form.tags,
    openingBalance: Number(form.openingBalance.replace(/,/g, "")) || 0,
    creditLimit: Math.max(0, Number(form.creditLimit.replace(/,/g, "")) || 0),
    rmaLocked: form.rmaLocked,
    rmaLockReason: form.rmaLocked ? form.rmaLockReason.trim() || null : null,
    ...creditControlPayload(form),
    paymentTerms: form.defaultPaymentTerms.trim() || null,
    paymentSchedule: form.paymentSchedule.trim() || null,
    addresses: [
      {
        id: "addr_primary",
        contactType: "primary",
        label: form.addressTitle || "Home",
        title: form.companyType === "company" ? "Company" : "Other",
        address: form.street,
        street2: form.street2,
        city: form.city,
        region: form.region,
        country: form.country,
        zip: form.zip,
        isDefault: true,
        taxId: form.taxId,
        jobPosition: form.jobPosition,
        website: form.website,
        mobile: additionalPhone || phone,
        parentCompany: form.parentCompany.trim() || undefined,
        parentContactName: form.parentContactName.trim() || undefined,
        paymentTerms: form.paymentTerms.trim() || undefined,
        fiscalPosition: form.fiscalPosition.trim() || undefined,
      },
      ...extraAddresses
        .filter((a) => a.street.trim() || a.city.trim() || a.label.trim())
        .map((a) => ({
          id: a.id,
          label: a.label.trim() || "Home",
          address: a.street.trim(),
          city: a.city.trim(),
          region: a.region.trim(),
          country: a.country.trim() || form.country.trim() || "Bangladesh",
          zip: a.zip.trim(),
          isDefault: false,
        })),
      ...relatedContacts
        .filter((rc) => rc.name.trim() || rc.email.trim() || rc.phone.trim())
        .map((rc) => {
          const rcPhone = normalizeBdPhone(rc.phone);
          return {
          id: rc.id,
          contactType: "related" as const,
          label: rc.addressLabel || "Other address",
          name: rc.name.trim(),
          email: rc.email.trim(),
          phone: rcPhone.ok ? rcPhone.phone : rc.phone.trim(),
          address: "",
          city: rc.city || form.city,
          region: form.region,
          country: rc.country || form.country,
          isDefault: false,
        };
        }),
    ],
  };
}

export function partnerFormToMockCustomer(
  base: Customer | null,
  form: PartnerFormState,
  relatedContacts: PartnerRelatedContact[],
  profileImage?: string | null,
  extraAddresses: PartnerExtraAddress[] = [],
): Customer {
  const payload = partnerFormToPayload(form, relatedContacts, profileImage, extraAddresses);
  return {
    id: base?.id ?? "partner_new",
    customerId: base?.customerId ?? "P-NEW",
    name: payload.name ?? "",
    parentCompany:
      form.companyType === "individual" ? form.parentCompany.trim() || undefined : undefined,
    phone: payload.phone ?? "",
    email: payload.email ?? "",
    profileImage: payload.profileImage ?? base?.profileImage,
    group: payload.group ?? base?.group ?? "retail",
    status: (payload.status as Customer["status"]) ?? base?.status ?? "active",
    loyaltyTier: base?.loyaltyTier ?? "silver",
    city: payload.city ?? "",
    region: payload.region ?? "",
    country: payload.country ?? "",
    customerSince: base?.customerSince ?? new Date().toISOString().slice(0, 10),
    assignedStaff: payload.assignedStaff ?? undefined,
    notes: payload.notes ?? undefined,
    tags: payload.tags ?? [],
    totalOrders: base?.totalOrders ?? 0,
    totalSpend: base?.totalSpend ?? 0,
    avgOrderValue: base?.avgOrderValue ?? 0,
    returnRate: base?.returnRate ?? 0,
    rewardPoints: base?.rewardPoints ?? 0,
    walletBalance: base?.walletBalance ?? 0,
    openingBalance: Number(form.openingBalance.replace(/,/g, "")) || 0,
    creditLimit: Math.max(0, Number(form.creditLimit.replace(/,/g, "")) || 0),
    rmaLocked: form.rmaLocked,
    rmaLockReason: form.rmaLocked ? form.rmaLockReason.trim() || undefined : undefined,
    ...creditControlPayload(form),
    salesLockReason: form.salesLocked ? form.salesLockReason.trim() || undefined : undefined,
    riskScore: base?.riskScore ?? 20,
    riskLevel: base?.riskLevel ?? "low",
    addresses: payload.addresses ?? [],
    recentOrders: base?.recentOrders ?? [],
    walletTransactions: base?.walletTransactions ?? [],
    rewardEvents: base?.rewardEvents ?? [],
    timeline: base?.timeline ?? [],
    comments: base?.comments ?? [],
    activities: base?.activities ?? [],
    attachments: base?.attachments ?? [],
    aiInsights: base?.aiInsights ?? {
      summary: "",
      purchaseSummary: "",
      churnRisk: "low",
      churnScore: 20,
      churnReasons: [],
      retentionProbability: 70,
      predictedLtv: 0,
      favoriteCategories: [],
      favoriteBrands: [],
      recommendedProducts: [],
      marketingSuggestions: [],
    },
  };
}

type Props = {
  form: PartnerFormState;
  tab: PartnerNotebookTab;
  extraAddresses: PartnerExtraAddress[];
  /** Saved customer record used for history/KPI tabs (null in create mode). */
  customer?: Customer | null;
  /**
   * Stable commerce customer primary key for nested API panels.
   * Prefer this over `customer.id` so demo/fallback objects cannot send `undefined`.
   */
  recordId?: string | null;
  readOnly?: boolean;
  photoPreview?: string | null;
  showLogoPlaceholder?: boolean;
  /** `drawer` = flat field sheet (blog-style); `card` = inner sheet card */
  variant?: "drawer" | "card";
  onTabChange: (tab: PartnerNotebookTab) => void;
  onPatch: <K extends keyof PartnerFormState>(key: K, value: PartnerFormState[K]) => void;
  onPhotoClick?: () => void;
  onAddAddress: () => void;
  onPatchAddress: <K extends keyof PartnerExtraAddress>(
    id: string,
    key: K,
    value: PartnerExtraAddress[K],
  ) => void;
  onRemoveAddress: (id: string) => void;
  countryOptions: string[];
  onOpenCountryDrawer: () => void;
  onOpenWalletRecharge?: () => void;
  onRemoveTag: (tag: string) => void;
  onAddTag: (tag: string) => void;
  groupOptions: CustomerGroupOption[];
  onAddGroup: () => void;
  /** Admin marks phone/email verified without OTP. */
  onVerifyContact?: (channel: "phone" | "email", value: string) => void | Promise<void>;
  verifyingContact?: "phone" | "email" | null;
  /** Open wa.me then mark WhatsApp verified for the saved phone. */
  onVerifyWhatsApp?: () => void | Promise<void>;
  verifyingWhatsApp?: boolean;
  originRole?: PartyCommerceRole;
  /** Shown above the Name field — lets a new record also register as another role. */
  rolePicker?: React.ReactNode;
};

export function PartnerFormSheet({
  form,
  tab,
  extraAddresses,
  customer = null,
  recordId = null,
  readOnly,
  photoPreview,
  showLogoPlaceholder,
  variant = "drawer",
  onTabChange,
  onPatch,
  onPhotoClick,
  onAddAddress,
  onPatchAddress,
  onRemoveAddress,
  countryOptions,
  onOpenCountryDrawer,
  onOpenWalletRecharge,
  onRemoveTag,
  onAddTag,
  groupOptions,
  onAddGroup,
  onVerifyContact,
  verifyingContact = null,
  onVerifyWhatsApp,
  verifyingWhatsApp = false,
  originRole = "customer",
  rolePicker,
}: Props) {
  const [tagInput, setTagInput] = useState("");
  const [showAdditionalPhone, setShowAdditionalPhone] = useState(
    () => Boolean(form.additionalPhone.trim()),
  );
  const [paymentTotals, setPaymentTotals] = useState({ totalPaid: 0, totalRefunded: 0 });
  const [pendingCustomerReplies, setPendingCustomerReplies] = useState(0);
  const featureFlags = useCustomerFeatureFlags();
  const { users: mentionableUsers } = useMentionableUsers();
  const commerceCustomerId = (recordId || customer?.id || "").trim();
  const [linkedRoles, setLinkedRoles] = useState<{ customer: boolean; supplier: boolean }>({
    customer: originRole === "customer",
    supplier: originRole === "supplier",
  });
  // opened from the Suppliers list: the Overview, the header boxes and the tab order speak supplier
  const supplierView = originRole === "supplier";
  const supplierId = customer?.linkedSupplierId?.trim() || null;
  const { detail: supplierDetail, loading: supplierLoading } = useCommerceSupplierDetail(
    linkedRoles.supplier ? supplierId : null,
  );

  useEffect(() => {
    setShowAdditionalPhone(Boolean(form.additionalPhone.trim()));
  }, [commerceCustomerId]);

  useEffect(() => {
    const roles = customer?.roles ?? [];
    setLinkedRoles({
      customer: originRole === "customer" || roles.includes("customer"),
      supplier:
        originRole === "supplier" ||
        roles.includes("supplier") ||
        Boolean(customer?.linkedSupplierId),
    });
    const partyId = customer?.partyId?.trim();
    if (!partyId) return;
    let cancelled = false;
    void fetchPartyCommerceLinks(partyId)
      .then((links) => {
        if (cancelled) return;
        setLinkedRoles({
          customer: Boolean(links.customer),
          supplier: Boolean(links.supplier),
        });
      })
      .catch(() => {
        /* keep inferred roles */
      });
    return () => {
      cancelled = true;
    };
  }, [
    customer?.partyId,
    customer?.roles,
    customer?.linkedSupplierId,
    commerceCustomerId,
    originRole,
  ]);

  useEffect(() => {
    setPaymentTotals({ totalPaid: 0, totalRefunded: 0 });
  }, [commerceCustomerId]);

  useEffect(() => {
    if (!commerceCustomerId) {
      setPendingCustomerReplies(0);
      return;
    }
    let cancelled = false;
    void fetchCustomerCases(commerceCustomerId)
      .then((rows) => {
        if (cancelled) return;
        const pending = rows.filter((row) => {
          if (row.status.toLowerCase() !== "open") return false;
          if (!row.replies.length) return false;
          return (row.replies[row.replies.length - 1]?.role || "").toLowerCase() === "customer";
        }).length;
        setPendingCustomerReplies(pending);
      })
      .catch(() => {
        if (!cancelled) setPendingCustomerReplies(0);
      });
    return () => {
      cancelled = true;
    };
  }, [commerceCustomerId]);

  const notebookTabs = useMemo<AgainNotebookTab<PartnerNotebookTab>[]>(() => {
    const tabEnabled: Record<PartnerNotebookTab, boolean> = {
      overview: featureFlags.tabOverview,
      profile: true,
      ledger: true,
      // Purchases and the Catalog of what a supplier has only apply to parties also registered as a supplier.
      purchases: linkedRoles.supplier,
      catalog: linkedRoles.supplier,
      sales: featureFlags.tabOrders,
      documents: true,
      finance: featureFlags.tabPayment,
      expense: true,
      cases: featureFlags.tabSupport,
      loyalty: featureFlags.tabLoyalty,
      history: featureFlags.tabHistory,
    };
    // a supplier's drawer puts what is bought from them first; the customer tabs follow
    const ordered = supplierView
      ? SUPPLIER_TAB_ORDER.map((id) => NOTEBOOK_TABS.find((t) => t.id === id)).filter(
          (t): t is (typeof NOTEBOOK_TABS)[number] => Boolean(t),
        )
      : NOTEBOOK_TABS;
    return ordered.filter((t) => tabEnabled[t.id]).map((t) =>
      t.id === "cases" && pendingCustomerReplies > 0
        ? { ...t, badge: pendingCustomerReplies, badgeTone: "warning" as const }
        : t,
    );
  }, [featureFlags, pendingCustomerReplies, linkedRoles.supplier, supplierView]);

  useEffect(() => {
    if (!notebookTabs.some((t) => t.id === tab) && notebookTabs[0]) {
      onTabChange(notebookTabs[0].id);
    }
  }, [notebookTabs, onTabChange, tab]);

  const commitTag = () => {
    const value = tagInput.trim();
    if (!value) return;
    if (!form.tags.some((t) => t.toLowerCase() === value.toLowerCase())) {
      onAddTag(value);
    }
    setTagInput("");
  };

  const isNewRecord = !commerceCustomerId;
  const fillNotebook =
    variant === "drawer" &&
    (tab === "sales" ||
      tab === "ledger" ||
      tab === "purchases" ||
      tab === "catalog" ||
      tab === "documents");
  const newRecordLabel =
    originRole === "supplier" ? "New supplier" : originRole === "vendor" ? "New vendor" : "New contact";
  const displayName = form.name.trim() || (isNewRecord ? newRecordLabel : "—");
  const displayPhone = form.phone.trim();
  const displayEmail = form.email.trim();
  const phoneMatchesSaved =
    Boolean(customer?.phone) && contactsMatch(form.phone, customer!.phone, "phone");
  const emailMatchesSaved =
    Boolean(customer?.email) && contactsMatch(form.email, customer!.email, "email");
  const phoneVerified = Boolean(customer?.phoneVerified) && phoneMatchesSaved;
  const emailVerified = Boolean(customer?.emailVerified) && emailMatchesSaved;
  const whatsappVerified =
    featureFlags.whatsapp && Boolean(customer?.whatsappVerified) && phoneMatchesSaved;
  const whatsappUrl = whatsappChatUrl(form.phone);
  const canVerifyPhone =
    featureFlags.phoneVerify &&
    !readOnly &&
    Boolean(onVerifyContact) &&
    Boolean(form.phone.trim()) &&
    !phoneVerified;
  const canVerifyEmail =
    featureFlags.emailVerify &&
    !readOnly &&
    Boolean(onVerifyContact) &&
    Boolean(form.email.trim()) &&
    !emailVerified;
  const showWhatsAppVerify =
    featureFlags.whatsapp && !whatsappVerified && Boolean(form.phone.trim()) && Boolean(onVerifyWhatsApp);

  const handleWhatsAppVerify = () => {
    if (!featureFlags.whatsapp) return;
    if (!form.phone.trim()) {
      toast.error("Enter a phone number first");
      return;
    }
    if (!whatsappUrl) {
      toast.error("Enter a valid mobile number for WhatsApp");
      return;
    }
    if (!onVerifyWhatsApp) {
      toast.error("Save the customer first to verify WhatsApp");
      return;
    }
    void onVerifyWhatsApp();
  };

  const handleWhatsAppChat = () => {
    if (!featureFlags.whatsapp || !whatsappVerified) return;
    if (!whatsappUrl) {
      toast.error("Enter a valid mobile number for WhatsApp");
      return;
    }
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };
  const initial = (form.name.trim() || "C").charAt(0).toUpperCase();
  const points = customer?.rewardPoints ?? 0;
  const walletBalance = customer?.walletBalance ?? 0;
  // a supplier who is also a customer keeps the wallet / points boxes only when there is something on them
  const showCustomerStats = !supplierView || (linkedRoles.customer && (points > 0 || walletBalance > 0));
  const titlePlaceholder =
    originRole === "supplier" ? "Supplier name" : originRole === "vendor" ? "Vendor name" : "Name";
  const primaryAddress: PartnerAddressValue = {
    label: form.addressTitle,
    street: form.street,
    city: form.city,
    region: form.region,
    zip: form.zip,
    country: form.country,
  };
  const payTerm = parsePayTerm(form.defaultPaymentTerms);

  const sheet = (
    <>
      <div
        className={cn(
          variant === "drawer" && "-mx-4 sm:-mx-6",
          variant === "drawer" && fillNotebook && "flex min-h-0 flex-1 flex-col",
        )}
      >
        {/* record header: avatar, big title, one line of contact, smart stat boxes on the right (docs/common/formcommon.md) */}
        <div className="shrink-0 border-b border-border bg-background px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-start gap-3">
            <button
              type="button"
              onClick={() => onTabChange("profile")}
              className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-none border border-border/80 bg-[#00a09d] text-[20px] font-bold text-white"
              aria-label="Open profile"
            >
              {photoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoPreview} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : form.name.trim() ? (
                initial
              ) : (
                <User className="h-7 w-7" strokeWidth={1.5} />
              )}
            </button>
            <div className="min-w-0 flex-1 basis-56">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <h2 className="min-w-0 max-w-full truncate text-[20px] font-bold leading-tight tracking-tight text-foreground">
                  {displayName}
                </h2>
                {linkedRoles.customer ? (
                  <PartnerStatusPill tone="info" className="shrink-0 uppercase tracking-wide">
                    Customer
                  </PartnerStatusPill>
                ) : null}
                {linkedRoles.supplier ? (
                  <PartnerStatusPill tone="warning" className="shrink-0 uppercase tracking-wide">
                    Supplier
                  </PartnerStatusPill>
                ) : null}
                {form.status === "vip" || customer?.status === "vip" ? (
                  <Crown className="h-4 w-4 shrink-0 text-yellow-500" aria-label="VIP" />
                ) : null}
              </div>
              {featureFlags.fieldPhone && displayPhone ? (
                <p className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-[12px] text-muted-foreground">
                  <span className="truncate">{displayPhone}</span>
                  {phoneVerified ? (
                    <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-[#00a09d]" aria-label="Phone verified" />
                  ) : null}
                  {whatsappVerified ? (
                    <button
                      type="button"
                      title="Open WhatsApp chat"
                      aria-label="Open WhatsApp chat"
                      onClick={handleWhatsAppChat}
                      className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[#128C7E] transition-opacity hover:opacity-80"
                    >
                      <WhatsAppIcon className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </p>
              ) : null}
              {featureFlags.fieldEmail && displayEmail ? (
                <p className="flex min-w-0 items-center gap-1 truncate text-[12px] text-muted-foreground">
                  <span className="truncate">{displayEmail}</span>
                  {emailVerified ? (
                    <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-[#00a09d]" aria-label="Email verified" />
                  ) : null}
                </p>
              ) : null}
              {!(featureFlags.fieldPhone && displayPhone) && !(featureFlags.fieldEmail && displayEmail) ? (
                <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                  {isNewRecord ? "Fill in the profile, then save." : "No phone or email on file"}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-stretch gap-1.5">
              {supplierView && !isNewRecord ? (
                <>
                  <PartnerStatButton
                    value={supplierDetail ? supplierDetail.totalPos : "—"}
                    label="Purchase orders"
                    onClick={() => onTabChange("purchases")}
                  />
                  <PartnerStatButton
                    value={supplierDetail ? supplierDetail.openPos : "—"}
                    label="Open orders"
                    onClick={() => onTabChange("purchases")}
                  />
                  <PartnerStatButton
                    value={supplierDetail ? formatCurrency(supplierDetail.spendYtd) : "—"}
                    label="Spend YTD"
                    tone="brand"
                    onClick={() => onTabChange("ledger")}
                  />
                </>
              ) : null}
              {showCustomerStats && featureFlags.rewardPoints ? (
                <PartnerStatButton
                  value={formatQuantity(points)}
                  label="Points"
                  tone="brand"
                  onClick={() => onTabChange(featureFlags.tabLoyalty ? "loyalty" : "overview")}
                />
              ) : null}
              {showCustomerStats && featureFlags.wallet ? (
                <PartnerStatButton
                  value={formatCurrency(walletBalance)}
                  label={readOnly ? "Wallet" : "Wallet · recharge"}
                  tone="purple"
                  title={readOnly ? "Wallet balance" : "Recharge wallet"}
                  onClick={() => {
                    if (!readOnly && onOpenWalletRecharge) {
                      onOpenWalletRecharge();
                      return;
                    }
                    onTabChange(featureFlags.tabPayment ? "finance" : "overview");
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>

        <AgainFormNotebook
          tabs={notebookTabs}
          active={tab}
          onChange={onTabChange}
          className={cn("border-t-0", fillNotebook && "min-h-0 flex-1")}
          tabsClassName="px-2 sm:px-4"
          contentClassName={cn(
            "@container",
            variant === "drawer" && "bg-transparent dark:bg-transparent",
            fillNotebook && "flex min-h-0 flex-1 flex-col overflow-y-auto py-3",
          )}
        >
          {tab === "overview" ? (
            isNewRecord || !customer ? (
              <PartnerTabEmpty
                title={supplierView ? "Save this supplier to unlock the overview" : "Save this contact to unlock overview"}
                description={
                  supplierView
                    ? "Open orders, spend, lead time and the delivery record appear after the supplier is created."
                    : "Order metrics, wallet, points, and recent activity appear after the customer is created."
                }
              />
            ) : supplierView && supplierId ? (
              <SupplierOverviewPanel supplier={supplierDetail} supplierId={supplierId} loading={supplierLoading} />
            ) : (
              <PartnerOverviewPanel customer={customer} />
            )
          ) : null}

          {tab === "profile" ? (
            <div className="space-y-5">
              {rolePicker}

              <div className="flex items-start gap-4">
                {featureFlags.fieldPhoto ? (
                  <button
                    type="button"
                    onClick={onPhotoClick}
                    disabled={readOnly || !onPhotoClick}
                    title={readOnly ? undefined : "Update profile photo"}
                    aria-label={readOnly ? "Profile photo" : "Update profile photo"}
                    className="group relative flex h-[84px] w-[84px] shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-none border border-border/80 bg-muted/20 text-muted-foreground hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-100"
                  >
                    {photoPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoPreview} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    ) : showLogoPlaceholder ? (
                      <div className="flex h-full w-full flex-col items-center justify-center bg-[#1a3a5c] px-1">
                        <span className="text-[11px] font-bold leading-tight text-white">again</span>
                        <span className="text-[9px] text-white/80">soft</span>
                      </div>
                    ) : form.companyType === "company" ? (
                      <div className="flex h-full w-full items-center justify-center bg-[#e8ecf3] dark:bg-[#2a3040]">
                        <Building2 className="h-9 w-9 text-[#8fa3c7]" strokeWidth={1.5} />
                      </div>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[#fbe3d8] dark:bg-[#3a2e2a]">
                        <User
                          className="h-10 w-10 fill-[#f7cbb4] text-[#e8926a] dark:fill-[#5c4a42] dark:text-[#c98a6a]"
                          strokeWidth={1.25}
                        />
                      </div>
                    )}
                    {!readOnly && onPhotoClick ? (
                      <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/55 py-1 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                        <Camera className="h-3 w-3" strokeWidth={2} />
                        Edit
                      </span>
                    ) : null}
                  </button>
                ) : null}
                <div className="min-w-0 flex-1 pt-1">
                  <AgainFormRecordTitle
                    value={form.name}
                    onChange={(v) => onPatch("name", v.replace(/\n/g, " "))}
                    readOnly={readOnly}
                    placeholder={titlePlaceholder}
                  />
                </div>
              </div>

              {/* Odoo form: label left, underline control right, titled groups, two columns by the drawer's own width */}
              <div className="again-odoo-form space-y-5">
                <div className="grid gap-x-8 gap-y-0 @xl:grid-cols-2">
                  <AgainFormGroupTitle className="@xl:col-span-2">Contact</AgainFormGroupTitle>

                  {featureFlags.fieldPhone ? (
                    <AgainFormField label="Phone" className={ROW}>
                      {readOnly ? (
                        <ReadValue>
                          {form.phone || "—"}
                          {phoneVerified ? (
                            <BadgeCheck className="h-4 w-4 shrink-0 text-[#00a09d]" aria-label="Phone verified" />
                          ) : null}
                        </ReadValue>
                      ) : (
                        <div className={ENTRY_WRAP}>
                          <input
                            value={form.phone ?? ""}
                            onChange={(e) => onPatch("phone", e.target.value)}
                            placeholder="+8801…"
                            className={FIELD_INPUT}
                          />
                          {phoneVerified ? (
                            <BadgeCheck className="mx-1 h-4 w-4 shrink-0 text-[#00a09d]" aria-label="Phone verified" />
                          ) : canVerifyPhone ? (
                            <button
                              type="button"
                              title="Mark phone verified"
                              aria-label="Mark phone verified"
                              disabled={verifyingContact === "phone"}
                              onClick={() => void onVerifyContact?.("phone", form.phone.trim())}
                              className={VERIFY_BTN}
                            >
                              <BadgeCheck className="h-3.5 w-3.5" />
                              {verifyingContact === "phone" ? "…" : "Verify"}
                            </button>
                          ) : null}
                          {showWhatsAppVerify ? (
                            <button
                              type="button"
                              title="Check if this number has WhatsApp"
                              aria-label="Verify WhatsApp"
                              disabled={verifyingWhatsApp}
                              onClick={handleWhatsAppVerify}
                              className={WHATSAPP_BTN}
                            >
                              {verifyingWhatsApp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WhatsAppIcon />}
                            </button>
                          ) : null}
                          {featureFlags.fieldAdditionalPhone && !showAdditionalPhone ? (
                            <button
                              type="button"
                              onClick={() => setShowAdditionalPhone(true)}
                              title="Add additional number"
                              aria-label="Add additional number"
                              className={ICON_BTN}
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      )}
                    </AgainFormField>
                  ) : null}

                  {featureFlags.fieldEmail ? (
                    <AgainFormField label="Email" className={ROW}>
                      {readOnly ? (
                        <ReadValue>
                          {form.email || "—"}
                          {emailVerified ? (
                            <BadgeCheck className="h-4 w-4 shrink-0 text-[#00a09d]" aria-label="Email verified" />
                          ) : null}
                        </ReadValue>
                      ) : (
                        <div className={ENTRY_WRAP}>
                          <input
                            value={form.email ?? ""}
                            onChange={(e) => onPatch("email", e.target.value)}
                            placeholder="name@company.com"
                            className={FIELD_INPUT}
                          />
                          {emailVerified ? (
                            <BadgeCheck className="mx-1 h-4 w-4 shrink-0 text-[#00a09d]" aria-label="Email verified" />
                          ) : canVerifyEmail ? (
                            <button
                              type="button"
                              title="Mark email verified"
                              aria-label="Mark email verified"
                              disabled={verifyingContact === "email"}
                              onClick={() => void onVerifyContact?.("email", form.email.trim())}
                              className={VERIFY_BTN}
                            >
                              <BadgeCheck className="h-3.5 w-3.5" />
                              {verifyingContact === "email" ? "…" : "Verify"}
                            </button>
                          ) : null}
                        </div>
                      )}
                    </AgainFormField>
                  ) : null}

                  {featureFlags.fieldAdditionalPhone && (showAdditionalPhone || (readOnly && form.additionalPhone)) ? (
                    <AgainFormField label="Additional phone" className={ROW}>
                      {readOnly ? (
                        <ReadValue>{form.additionalPhone || "—"}</ReadValue>
                      ) : (
                        <div className={ENTRY_WRAP}>
                          <input
                            value={form.additionalPhone ?? ""}
                            onChange={(e) => onPatch("additionalPhone", e.target.value)}
                            placeholder="Additional number"
                            className={FIELD_INPUT}
                          />
                          <button
                            type="button"
                            title="Remove additional number"
                            aria-label="Remove additional number"
                            onClick={() => {
                              onPatch("additionalPhone", "");
                              setShowAdditionalPhone(false);
                            }}
                            className={REMOVE_BTN}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </AgainFormField>
                  ) : null}

                  <TextRow
                    label="Website"
                    value={form.website}
                    onChange={(v) => onPatch("website", v)}
                    readOnly={readOnly}
                    placeholder="https://"
                  />
                  {featureFlags.fieldCompany ? (
                    <TextRow
                      label="Company"
                      value={form.parentCompany}
                      onChange={(v) => onPatch("parentCompany", v)}
                      readOnly={readOnly}
                      placeholder="Company name"
                    />
                  ) : null}
                  <TextRow
                    label="Job position"
                    value={form.jobPosition}
                    onChange={(v) => onPatch("jobPosition", v)}
                    readOnly={readOnly}
                    placeholder="e.g. Procurement manager"
                  />
                  <AgainFormField label={supplierView ? "Buyer" : "Assigned to"} className={ROW}>
                    {readOnly ? (
                      <ReadValue>{form.assignedStaff || "—"}</ReadValue>
                    ) : (
                      <select
                        value={form.assignedStaff}
                        onChange={(e) => onPatch("assignedStaff", e.target.value)}
                        className={FIELD_INPUT}
                      >
                        <option value="">{supplierView ? "Who owns this relationship…" : "Assigned to…"}</option>
                        {form.assignedStaff && !mentionableUsers.some((u) => u.name === form.assignedStaff) ? (
                          <option value={form.assignedStaff}>{form.assignedStaff}</option>
                        ) : null}
                        {mentionableUsers.map((u) => (
                          <option key={u.id} value={u.name}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </AgainFormField>
                </div>

                {featureFlags.fieldAddresses ? (
                  <div className="grid gap-x-8 gap-y-0 @xl:grid-cols-2">
                    <AgainFormGroupTitle className="@xl:col-span-2">Address</AgainFormGroupTitle>
                    <AddressFields
                      value={primaryAddress}
                      onChange={(key, value) => {
                        if (key === "label") onPatch("addressTitle", value);
                        else if (key === "street") onPatch("street", value);
                        else if (key === "city") onPatch("city", value);
                        else if (key === "region") onPatch("region", value);
                        else if (key === "zip") onPatch("zip", value);
                        else onPatch("country", value);
                      }}
                      readOnly={readOnly}
                      countryOptions={countryOptions}
                      onOpenCountryDrawer={onOpenCountryDrawer}
                    />
                    {extraAddresses.map((addr, index) => (
                      <div key={addr.id} className="@xl:col-span-2">
                        <div className="mt-3 flex items-center justify-between border-b border-border/60 pb-0.5">
                          <span className="text-[11px] font-medium text-muted-foreground">Address {index + 2}</span>
                          {!readOnly ? (
                            <button
                              type="button"
                              title="Remove address"
                              aria-label="Remove address"
                              onClick={() => onRemoveAddress(addr.id)}
                              className={REMOVE_BTN}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                        <div className="grid gap-x-8 gap-y-0 @xl:grid-cols-2">
                          <AddressFields
                            value={{
                              label: addr.label,
                              street: addr.street,
                              city: addr.city,
                              region: addr.region,
                              zip: addr.zip,
                              country: addr.country,
                            }}
                            onChange={(key, value) => onPatchAddress(addr.id, key, value)}
                            readOnly={readOnly}
                            countryOptions={countryOptions}
                            onOpenCountryDrawer={onOpenCountryDrawer}
                          />
                        </div>
                      </div>
                    ))}
                    {!readOnly ? (
                      <div className="@xl:col-span-2">
                        <button type="button" className={cn(LINK_BTN, "mt-1.5")} onClick={onAddAddress}>
                          Add an address
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="grid gap-x-8 gap-y-0 @xl:grid-cols-2">
                  <AgainFormGroupTitle className="@xl:col-span-2">Accounting</AgainFormGroupTitle>
                  <AgainFormField label="Payment terms" className={ROW}>
                    {readOnly ? (
                      <ReadValue>{payTerm.number ? `${payTerm.number} ${payTerm.unit}` : "—"}</ReadValue>
                    ) : (
                      <div className="flex min-w-0 items-center gap-1">
                        <input
                          value={payTerm.number}
                          onChange={(e) =>
                            onPatch(
                              "defaultPaymentTerms",
                              formatPayTerm(e.target.value.replace(/[^\d]/g, ""), payTerm.unit),
                            )
                          }
                          inputMode="numeric"
                          placeholder="0"
                          className="h-8 w-16 shrink-0 bg-transparent px-1 text-[13px] tabular-nums outline-none"
                        />
                        <select
                          value={payTerm.unit}
                          onChange={(e) =>
                            onPatch(
                              "defaultPaymentTerms",
                              formatPayTerm(payTerm.number, e.target.value as "days" | "months"),
                            )
                          }
                          className={FIELD_INPUT}
                        >
                          <option value="days">Days</option>
                          <option value="months">Months</option>
                        </select>
                        <FieldHelpTip label="Payments to be paid for purchases/sales within the given time period. Upcoming or due payments show on the dashboard's Payment Due section." />
                      </div>
                    )}
                  </AgainFormField>
                  <TextRow
                    label="Payment schedule"
                    value={form.paymentSchedule}
                    onChange={(v) => onPatch("paymentSchedule", v)}
                    readOnly={readOnly}
                    placeholder="e.g. Monthly"
                  />
                  <TextRow
                    label="Opening balance"
                    value={form.openingBalance}
                    onChange={(v) => onPatch("openingBalance", v)}
                    readOnly={readOnly}
                    placeholder="0"
                    numeric
                    negative
                  />
                  <TextRow
                    label="Credit limit"
                    value={form.creditLimit}
                    onChange={(v) => onPatch("creditLimit", v)}
                    readOnly={readOnly}
                    placeholder="Blank = no limit"
                    numeric
                  />
                  <CustomerCreditFields form={form} onPatch={onPatch} readOnly={readOnly} customerId={commerceCustomerId || null} />
                  <AgainFormField label="RMA" className={ROW}>
                    <div className="flex min-w-0 items-center gap-2">
                      <AgainDrawerSwitch
                        className="ml-0"
                        label="RMA lock"
                        value={form.rmaLocked ? "locked" : "open"}
                        onChange={readOnly ? undefined : (v) => onPatch("rmaLocked", v === "locked")}
                        options={[
                          { value: "open", label: "Open" },
                          { value: "locked", label: "Locked" },
                        ]}
                      />
                      <FieldHelpTip label="Locked: no new RMA / warranty complaint can be taken or approved for this customer." />
                    </div>
                  </AgainFormField>
                  {form.rmaLocked ? (
                    <TextRow
                      label="RMA lock reason"
                      value={form.rmaLockReason}
                      onChange={(v) => onPatch("rmaLockReason", v)}
                      readOnly={readOnly}
                      placeholder="Why RMA is locked"
                    />
                  ) : null}
                  <TextRow
                    label="Tax ID"
                    value={form.taxId}
                    onChange={(v) => onPatch("taxId", v)}
                    readOnly={readOnly}
                    placeholder="Optional"
                  />
                </div>

                {featureFlags.fieldGroup || featureFlags.fieldStatus || featureFlags.fieldTags ? (
                  <div className="grid gap-x-8 gap-y-0 @xl:grid-cols-2">
                    <AgainFormGroupTitle className="@xl:col-span-2">Classification</AgainFormGroupTitle>
                    {featureFlags.fieldGroup ? (
                      <AgainFormField label="Customer group" className={ROW}>
                        {readOnly ? (
                          <ReadValue>
                            {resolveCustomerGroupLabel(
                              form.group,
                              Object.fromEntries(groupOptions.map((o) => [o.id, o.label])),
                            )}
                          </ReadValue>
                        ) : (
                          <div className="flex min-w-0 items-center gap-1">
                            <select
                              value={form.group}
                              onChange={(e) => onPatch("group", e.target.value)}
                              className={FIELD_INPUT}
                            >
                              {groupOptions.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              title="Clear group"
                              aria-label="Clear group"
                              onClick={() => onPatch("group", "retail")}
                              className={REMOVE_BTN}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={onAddGroup}
                              title="Add customer group"
                              aria-label="Add customer group"
                              className={ICON_BTN}
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </AgainFormField>
                    ) : null}
                    {featureFlags.fieldStatus ? (
                      <AgainFormField label="Status" className={ROW}>
                        {readOnly ? (
                          <ReadValue>
                            {CUSTOMER_STATUS_LABELS[form.status as keyof typeof CUSTOMER_STATUS_LABELS] ?? form.status}
                          </ReadValue>
                        ) : (
                          <select
                            value={form.status}
                            onChange={(e) => onPatch("status", e.target.value)}
                            className={FIELD_INPUT}
                          >
                            {Object.entries(CUSTOMER_STATUS_LABELS).map(([id, label]) => (
                              <option key={id} value={id}>
                                {label}
                              </option>
                            ))}
                          </select>
                        )}
                      </AgainFormField>
                    ) : null}
                    {featureFlags.fieldTags ? (
                      <AgainFormField label="Tags" className={cn(ROW, "@xl:col-span-2")}>
                        <div className={cn(ENTRY_WRAP, "min-h-8 flex-wrap gap-1 px-1 py-0.5")}>
                          {form.tags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center gap-1 rounded-none bg-[#00a09d]/10 px-1.5 py-0.5 text-[12px] text-[#00867e]"
                            >
                              {tag}
                              {!readOnly ? (
                                <button
                                  type="button"
                                  aria-label={`Remove tag ${tag}`}
                                  onClick={() => onRemoveTag(tag)}
                                  className="text-[#00867e]/70 transition-colors hover:text-red-500"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              ) : null}
                            </span>
                          ))}
                          {!readOnly ? (
                            <input
                              value={tagInput}
                              onChange={(e) => setTagInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === ",") {
                                  e.preventDefault();
                                  commitTag();
                                } else if (e.key === "Backspace" && !tagInput && form.tags.length) {
                                  onRemoveTag(form.tags[form.tags.length - 1]);
                                }
                              }}
                              onBlur={commitTag}
                              placeholder={form.tags.length ? "" : "Type a tag and press Enter"}
                              className="h-6 min-w-[8rem] flex-1 bg-transparent px-1 text-[13px] outline-none placeholder:text-muted-foreground/70"
                            />
                          ) : form.tags.length === 0 ? (
                            <span className="px-1 py-1 text-[13px] text-muted-foreground">—</span>
                          ) : null}
                        </div>
                      </AgainFormField>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {tab === "sales" ? (
            <div
              className={cn(
                variant === "drawer" ? "flex min-h-0 flex-1 flex-col" : "space-y-4",
              )}
            >
              {isNewRecord ? (
                <PartnerTabEmpty
                  title="No sales history yet"
                  description="Save the customer first. Order history will load from the customer record."
                />
              ) : customer && commerceCustomerId ? (
                <PartnerCustomerOrdersPanel
                  customerId={commerceCustomerId}
                  orders={customer.recentOrders}
                  readOnly={readOnly}
                  fillHeight={variant === "drawer"}
                />
              ) : (
                <>
                  <PartnerSectionTitle title="Order History" />
                  <PartnerTabEmpty
                    title="No orders yet"
                    description="Orders for this customer will appear here once sales activity starts."
                  />
                </>
              )}
            </div>
          ) : null}

          {tab === "ledger" ? (
            <div
              className={cn(
                variant === "drawer" ? "flex min-h-0 flex-1 flex-col" : "space-y-4",
              )}
            >
              {isNewRecord ? (
                <PartnerTabEmpty
                  title="Save this contact to open the ledger"
                  description="Invoices and payments appear after the customer is created."
                />
              ) : commerceCustomerId ? (
                <CustomerLedgerPanel
                  customerId={commerceCustomerId}
                  partyId={customer?.partyId}
                  supplierId={customer?.linkedSupplierId}
                  customerName={displayName}
                  customerPhone={displayPhone}
                  customerEmail={displayEmail}
                  fillHeight={variant === "drawer"}
                  readOnly={readOnly}
                />
              ) : (
                <PartnerTabEmpty
                  title="No ledger yet"
                  description="Invoices and payments will appear here once the customer is saved."
                />
              )}
            </div>
          ) : null}

          {tab === "purchases" ? (
            <div className={cn(variant === "drawer" ? "flex min-h-0 flex-1 flex-col" : "space-y-4")}>
              {customer?.linkedSupplierId ? (
                <PartnerPurchasesPanel
                  supplierId={customer.linkedSupplierId}
                  fillHeight={variant === "drawer"}
                />
              ) : (
                <PartnerTabEmpty
                  title="No purchase orders yet"
                  description="Save this contact as a supplier to see POs placed with them."
                />
              )}
            </div>
          ) : null}

          {tab === "catalog" ? (
            <div className={cn(variant === "drawer" ? "flex min-h-0 flex-1 flex-col" : "space-y-4")}>
              {customer?.linkedSupplierId ? (
                <PartnerCatalogPanel
                  supplierId={customer.linkedSupplierId}
                  fillHeight={variant === "drawer"}
                />
              ) : (
                <PartnerTabEmpty
                  title="No catalog yet"
                  description="Save this contact as a supplier to see the products they have."
                />
              )}
            </div>
          ) : null}

          {tab === "documents" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              {isNewRecord || !commerceCustomerId ? (
                <PartnerTabEmpty
                  title="Save this contact to attach documents"
                  description="Notes and files can be added once the contact is saved."
                />
              ) : (
                <PartnerDocumentsPanel
                  entityType="customer"
                  entityId={commerceCustomerId}
                  readOnly={readOnly}
                />
              )}
            </div>
          ) : null}

          {tab === "finance" ? (
            <div className="space-y-4">
              {isNewRecord || !customer ? (
                <PartnerTabEmpty
                  title="No payment history yet"
                  description="Spend and payment history appear after the customer is saved."
                />
              ) : (
                <>
                  {/* Due / open / credit / collected live in the panel (it owns the
                      ledger); only the sheet-level account settings stay up here. */}
                  {featureFlags.openingBalance || featureFlags.creditLimit ? (
                    <PartnerKpiGrid
                      items={[
                        ...(featureFlags.openingBalance
                          ? [
                              {
                                label: "Opening Balance",
                                value: formatCurrency(customer.openingBalance ?? 0),
                                sub: "On books",
                              },
                            ]
                          : []),
                        ...(featureFlags.creditLimit
                          ? [
                              {
                                label: "Credit Limit",
                                value: formatCurrency(customer.creditLimit ?? 0),
                                sub: "Max due",
                              },
                            ]
                          : []),
                      ]}
                    />
                  ) : null}
                  {featureFlags.paymentHistory ? (
                    <PartnerPaymentsPanel
                      partyId={customer.partyId}
                      customerId={commerceCustomerId}
                      supplierId={customer.linkedSupplierId}
                      readOnly={readOnly}
                      orders={customer.recentOrders}
                      onTotals={setPaymentTotals}
                      onViewLedger={() => onTabChange("ledger")}
                    />
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {tab === "expense" ? (
            isNewRecord || !customer ? (
              <PartnerTabEmpty
                title="Save this contact to link expenses"
                description="Expenses paid to this customer can be linked once it's saved."
              />
            ) : (
              <PartyExpenseTab partyId={customer.partyId} partyName={displayName} />
            )
          ) : null}

          {tab === "cases" ? (
            isNewRecord ? (
              <PartnerTabEmpty
                title="No cases for a new contact"
                description="QC, complaint, and support cases become available after the customer is created."
              />
            ) : (
              <PartnerCasesPanel
                customerId={commerceCustomerId}
                orders={customer?.recentOrders ?? []}
                readOnly={readOnly}
                onPendingCustomerRepliesChange={setPendingCustomerReplies}
              />
            )
          ) : null}

          {tab === "loyalty" ? (
            isNewRecord || !customer ? (
              <PartnerTabEmpty
                title="No loyalty data yet"
                description="Tier, points balance, and earn/redeem history appear after the customer is saved."
              />
            ) : (
              <div className="space-y-4">
                <PartnerKpiGrid
                  items={[
                    {
                      label: "Tier",
                      value: (
                        <span className="capitalize">{customer.loyaltyTier}</span>
                      ),
                      sub: "Loyalty",
                    },
                    {
                      label: "Points Balance",
                      value: formatQuantity(customer.rewardPoints),
                      sub: "Available",
                    },
                    {
                      label: "Events",
                      value: customer.rewardEvents.length,
                      sub: "History rows",
                    },
                  ]}
                />
                <div>
                  <PartnerSectionTitle title="Points History" />
                  <p className="mb-2 text-[12px] leading-relaxed text-muted-foreground">
                    How it works: completing an order adds{" "}
                    <span className="font-medium text-foreground">earned</span> points, using points
                    at checkout creates a{" "}
                    <span className="font-medium text-foreground">redeemed</span> row, and unused
                    points past the validity window show as{" "}
                    <span className="font-medium text-foreground">expired</span>.
                  </p>
                  <PartnerRewardRows rows={customer.rewardEvents} />
                </div>
              </div>
            )
          ) : null}

          {tab === "history" ? (
            isNewRecord || !customer ? (
              <PartnerTabEmpty
                title="No history yet"
                description="Save the customer first. Admin and customer updates will appear here."
              />
            ) : (
              <PartnerHistoryRows rows={customer.timeline ?? []} />
            )
          ) : null}
        </AgainFormNotebook>
      </div>
    </>
  );

  if (variant === "card") {
    return (
      <AgainFormSheetBg>
        <AgainFormSheet>{sheet}</AgainFormSheet>
      </AgainFormSheetBg>
    );
  }

  return sheet;
}

/* ---------------------------------------------------------------------------------------------------------------------
 * Odoo form pieces (docs/common/formcommon.md): label left, underline control right. The `.again-odoo-form` container turns
 * every plain input / select into the underline; a control with a trailing button sits in an `ENTRY_WRAP` so the underline
 * runs under both.
 * ------------------------------------------------------------------------------------------------------------------- */

/** Label column wide enough that "Additional phone" and "Payment schedule" stay on one line. */
const ROW = "grid-cols-[8.5rem_minmax(0,1fr)]";
const FIELD_INPUT = "h-8 w-full min-w-0 bg-transparent px-1 text-[13px] outline-none";
/** A bordered wrapper: `.again-odoo-form` draws the underline on it and strips the border from the input inside. */
const ENTRY_WRAP = "flex min-w-0 items-center gap-0.5 border border-input";
const ICON_BTN =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-none text-[#00a09d] transition-colors hover:bg-[#00a09d]/10 disabled:opacity-60";
const REMOVE_BTN =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-none text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500";
const VERIFY_BTN =
  "inline-flex h-6 shrink-0 items-center gap-1 rounded-none border border-[#00a09d]/30 bg-[#00a09d]/10 px-1.5 text-[11px] font-medium text-[#00a09d] transition-colors hover:bg-[#00a09d] hover:text-white disabled:opacity-60";
const WHATSAPP_BTN =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-none border border-[#25D366]/30 bg-[#25D366]/10 text-[#128C7E] transition-colors hover:bg-[#25D366] hover:text-white disabled:opacity-60";
const LINK_BTN = "text-[13px] font-normal text-[#00a09d] hover:text-[#00c4bf] hover:underline";

/** The value of a field in a read-only drawer: plain text where the input would be. */
const num = (value: string) => Math.max(0, Number(value.replace(/,/g, "")) || 0);

/** The credit-control fields of the form as the customer API takes them (services/customer/credit_control.py). */
function creditControlPayload(form: PartnerFormState) {
  const days = form.creditDays.trim();
  return {
    salesLocked: form.salesLocked,
    salesLockReason: form.salesLocked ? form.salesLockReason.trim() || null : null,
    tradeMode: (form.tradeMode || "both") as "both" | "credit" | "cash",
    creditDays: days ? Math.round(num(days)) : null,
    conditionalLimit: num(form.conditionalLimit),
    conditionalValidTill: form.conditionalValidTill || null,
    securityMoney: num(form.securityMoney),
    openingDate: form.openingDate || null,
  };
}

const TRADE_MODE_LABEL: Record<string, string> = { both: "Cash & credit", credit: "Credit", cash: "Cash only" };

/** Profile → Accounting: sales lock, cash / credit, credit days, conditional limit and the customer's credit position. */
function CustomerCreditFields({
  form,
  onPatch,
  readOnly,
  customerId,
}: {
  form: PartnerFormState;
  onPatch: <K extends keyof PartnerFormState>(key: K, value: PartnerFormState[K]) => void;
  readOnly?: boolean;
  customerId: string | null;
}) {
  const [position, setPosition] = useState<CustomerCreditPosition | null>(null);
  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    fetchCustomerCreditPosition(customerId)
      .then((p) => !cancelled && setPosition(p))
      .catch(() => !cancelled && setPosition(null));
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const limit = Number(position?.effective_limit ?? 0);
  return (
    <>
      {position ? (
        <AgainFormField label="Credit position" className={ROW}>
          <ReadValue>
            <span className="tabular-nums">
              {Number(position.ledger_balance) >= 0
                ? `Owes ${formatCurrency(Number(position.ledger_balance))}`
                : `Advance ${formatCurrency(-Number(position.ledger_balance))}`}
              {Number(position.unsettled_orders) ? ` · open orders ${formatCurrency(Number(position.unsettled_orders))}` : ""}
              {limit > 0
                ? ` · limit ${formatCurrency(limit)} · available ${formatCurrency(Math.max(Number(position.available ?? 0), 0))}`
                : " · no limit"}
            </span>
          </ReadValue>
        </AgainFormField>
      ) : null}
      <AgainFormField label="Sells on" className={ROW}>
        {readOnly ? (
          <ReadValue>{TRADE_MODE_LABEL[form.tradeMode] ?? "Cash & credit"}</ReadValue>
        ) : (
          <div className="flex min-w-0 items-center gap-1">
            <select value={form.tradeMode || "both"} onChange={(e) => onPatch("tradeMode", e.target.value)} className={FIELD_INPUT}>
              <option value="both">Cash &amp; credit</option>
              <option value="credit">Credit</option>
              <option value="cash">Cash only</option>
            </select>
            <FieldHelpTip label="Cash only: an order must be paid in full before it can be confirmed." />
          </div>
        )}
      </AgainFormField>
      <TextRow label="Credit days" value={form.creditDays} onChange={(v) => onPatch("creditDays", v)} readOnly={readOnly} placeholder="e.g. 30" numeric />
      <TextRow
        label="Conditional limit"
        value={form.conditionalLimit}
        onChange={(v) => onPatch("conditionalLimit", v)}
        readOnly={readOnly}
        placeholder="Higher limit for a while"
        numeric
      />
      <AgainFormField label="Valid till" className={ROW}>
        {readOnly ? (
          <ReadValue>{form.conditionalValidTill || "—"}</ReadValue>
        ) : (
          <input
            type="date"
            value={form.conditionalValidTill}
            onChange={(e) => onPatch("conditionalValidTill", e.target.value)}
            className={FIELD_INPUT}
          />
        )}
      </AgainFormField>
      <TextRow label="Security money" value={form.securityMoney} onChange={(v) => onPatch("securityMoney", v)} readOnly={readOnly} placeholder="0" numeric />
      <AgainFormField label="Opening date" className={ROW}>
        {readOnly ? (
          <ReadValue>{form.openingDate || "—"}</ReadValue>
        ) : (
          <input type="date" value={form.openingDate} onChange={(e) => onPatch("openingDate", e.target.value)} className={FIELD_INPUT} />
        )}
      </AgainFormField>
      <AgainFormField label="Sales" className={ROW}>
        <div className="flex min-w-0 items-center gap-2">
          <AgainDrawerSwitch
            className="ml-0"
            label="Sales lock"
            value={form.salesLocked ? "locked" : "open"}
            onChange={readOnly ? undefined : (v) => onPatch("salesLocked", v === "locked")}
            options={[
              { value: "open", label: "Open" },
              { value: "locked", label: "Locked" },
            ]}
          />
          <FieldHelpTip label="Locked: no sales order can be confirmed for this customer, not even a paid counter sale." />
        </div>
      </AgainFormField>
      {form.salesLocked ? (
        <TextRow
          label="Sales lock reason"
          value={form.salesLockReason}
          onChange={(v) => onPatch("salesLockReason", v)}
          readOnly={readOnly}
          placeholder="Why sales are locked"
        />
      ) : null}
    </>
  );
}

function ReadValue({ children }: { children: React.ReactNode }) {
  return <p className="flex min-h-[28px] items-center gap-1 px-1 text-[13px] leading-[1.3]">{children}</p>;
}

/** One text row: label left, underline input right (plain text when the drawer is read-only). */
function TextRow({
  label,
  value,
  onChange,
  readOnly,
  placeholder,
  numeric,
  negative,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  /** Digits (and one dot) only; `negative` also allows a minus sign. */
  numeric?: boolean;
  negative?: boolean;
  className?: string;
}) {
  return (
    <AgainFormField label={label} className={cn(ROW, className)}>
      {readOnly ? (
        <ReadValue>
          <span className={cn(numeric && "tabular-nums")}>{value?.trim() ? value : "—"}</span>
        </ReadValue>
      ) : (
        <input
          value={value ?? ""}
          onChange={(e) =>
            onChange(numeric ? e.target.value.replace(negative ? /[^\d.-]/g : /[^\d.]/g, "") : e.target.value)
          }
          inputMode={numeric ? "decimal" : undefined}
          placeholder={placeholder}
          className={cn(FIELD_INPUT, numeric && "tabular-nums")}
        />
      )}
    </AgainFormField>
  );
}

type PartnerAddressValue = {
  label: string;
  street: string;
  city: string;
  region: string;
  zip: string;
  country: string;
};

/** The fields of one address (the main one and every extra one share it): type, street, city, state, ZIP, country. */
function AddressFields({
  value,
  onChange,
  readOnly,
  countryOptions,
  onOpenCountryDrawer,
}: {
  value: PartnerAddressValue;
  onChange: (key: keyof PartnerAddressValue, value: string) => void;
  readOnly?: boolean;
  countryOptions: string[];
  onOpenCountryDrawer: () => void;
}) {
  const isPreset = (ADDRESS_TITLE_PRESETS as readonly string[]).includes(value.label);
  const countries =
    value.country && !countryOptions.includes(value.country) ? [value.country, ...countryOptions] : countryOptions;

  return (
    <>
      <AgainFormField label="Type" className={ROW}>
        {readOnly ? (
          <ReadValue>{value.label || "Home"}</ReadValue>
        ) : (
          <div className="flex min-w-0 items-center gap-1">
            <select
              value={isPreset ? value.label : "Other"}
              onChange={(e) => onChange("label", e.target.value === "Other" ? "" : e.target.value)}
              className={cn(FIELD_INPUT, !isPreset && "w-28 shrink-0")}
            >
              {ADDRESS_TITLE_PRESETS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            {!isPreset ? (
              <input
                value={value.label}
                onChange={(e) => onChange("label", e.target.value)}
                placeholder="Custom title…"
                className={FIELD_INPUT}
              />
            ) : null}
          </div>
        )}
      </AgainFormField>
      <TextRow
        label="Street"
        value={value.street}
        onChange={(v) => onChange("street", v)}
        readOnly={readOnly}
        placeholder="Street, building"
        className="@xl:col-span-2"
      />
      <TextRow label="City" value={value.city} onChange={(v) => onChange("city", v)} readOnly={readOnly} />
      <TextRow label="State" value={value.region} onChange={(v) => onChange("region", v)} readOnly={readOnly} />
      <TextRow label="ZIP" value={value.zip} onChange={(v) => onChange("zip", v)} readOnly={readOnly} />
      <AgainFormField label="Country" className={ROW}>
        {readOnly ? (
          <ReadValue>{value.country || "—"}</ReadValue>
        ) : (
          <div className="flex min-w-0 items-center gap-1">
            <select
              value={value.country}
              onChange={(e) => onChange("country", e.target.value)}
              className={FIELD_INPUT}
            >
              <option value="">Select a country…</option>
              {countries.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onOpenCountryDrawer}
              title="Manage countries"
              aria-label="Manage countries"
              className={ICON_BTN}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
      </AgainFormField>
    </>
  );
}
