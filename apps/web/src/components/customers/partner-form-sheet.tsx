"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Building2,
  Camera,
  Crown,
  Mail,
  MapPin,
  Phone,
  Plus,
  Smartphone,
  Star,
  Calendar,
  CreditCard,
  Receipt,
  Tag,
  User,
  UserCog,
  Users,
  Wallet,
  X,
  Loader2,
} from "lucide-react";
import { CUSTOMER_STATUS_LABELS, type Customer } from "@/lib/mock-data/customers";
import {
  buildCustomerGroupOptions,
  resolveCustomerGroupLabel,
  type CustomerGroupOption,
} from "@/lib/customers/customer-group-options";
import {
  fetchCustomerCases,
  type CreateCustomerInput,
  type UpdateCustomerInput,
} from "@/lib/api/commerce-customers";
import { useCustomerFeatureFlags } from "@/lib/customers/use-customer-settings";
import { normalizeBdPhone, phonesMatch } from "@/lib/customers/phone";
import { cn, formatCurrency, formatQuantity } from "@/lib/utils";
import {
  AgainUnderlineField,
  AgainUnderlineInput,
} from "@/components/again/again-form-sheet";
import {
  AgainFormNotebook,
  AgainFormSheet,
  AgainFormSheetBg,
  AgainFormTitle,
  type AgainNotebookTab,
} from "@/components/again/again-form-sheet-layout";
import { Select } from "@/components/ui/native-select";
import {
  PartnerHistoryRows,
  PartnerKpiGrid,
  PartnerOverviewPanel,
  PartnerRewardRows,
  PartnerSectionTitle,
  PartnerStatusPill,
  PartnerTabEmpty,
} from "@/components/customers/partner-customer-sections";
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
import { PartnerStockReportPanel } from "@/components/customers/partner-stock-report-panel";
import { PartnerDocumentsPanel } from "@/components/customers/partner-documents-panel";
import { FieldHelpTip } from "@/components/sales/field-help-tip";
import { useMentionableUsers } from "@/lib/api/use-mentionable-users";
import { toast } from "sonner";

export type PartnerNotebookTab =
  | "overview"
  | "profile"
  | "ledger"
  | "purchases"
  | "stockReport"
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
  { id: "stockReport", label: "Stock Report" },
  { id: "sales", label: "Sales" },
  { id: "documents", label: "Documents & Note" },
  { id: "finance", label: "Payments" },
  { id: "history", label: "Activities" },
  { id: "expense", label: "Expense" },
  { id: "cases", label: "Support" },
  { id: "loyalty", label: "Loyalty" },
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
  country: "",
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
      // AgainPOS: Purchases/Stock Report only apply to parties also registered as a supplier.
      purchases: linkedRoles.supplier,
      stockReport: linkedRoles.supplier,
      sales: featureFlags.tabOrders,
      documents: true,
      finance: featureFlags.tabPayment,
      expense: true,
      cases: featureFlags.tabSupport,
      loyalty: featureFlags.tabLoyalty,
      history: featureFlags.tabHistory,
    };
    return NOTEBOOK_TABS.filter((t) => tabEnabled[t.id]).map((t) =>
      t.id === "cases" && pendingCustomerReplies > 0
        ? { ...t, badge: pendingCustomerReplies, badgeTone: "warning" as const }
        : t,
    );
  }, [featureFlags, pendingCustomerReplies, linkedRoles.supplier]);

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

  const companyLine =
    form.companyType === "company"
      ? "Company"
      : form.parentCompany.trim() || "Company Employer";
  const isNewRecord = !commerceCustomerId;
  const fillNotebook =
    variant === "drawer" &&
    (tab === "sales" ||
      tab === "ledger" ||
      tab === "purchases" ||
      tab === "stockReport" ||
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

  const sheet = (
    <>
      <div
        className={cn(
          variant === "drawer" && "-mx-4 sm:-mx-6",
          variant === "drawer" && fillNotebook && "flex min-h-0 flex-1 flex-col",
        )}
      >
        <div className="shrink-0 border-b border-border bg-background px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onTabChange("profile")}
              className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-none border border-border/80 bg-[#00a09d] text-[18px] font-bold text-white"
              aria-label="Open profile"
            >
              {photoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoPreview} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                initial
              )}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <p className="min-w-0 truncate text-[15px] font-semibold text-foreground">
                  {displayName}
                </p>
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
                {(form.status === "vip" || customer?.status === "vip") ? (
                  <Crown
                    className="h-4 w-4 shrink-0 text-yellow-500"
                    aria-label="VIP"
                    title="VIP"
                  />
                ) : null}
              </div>
              {featureFlags.fieldPhone && displayPhone ? (
                <p className="flex min-w-0 items-center gap-1 truncate text-[12px] text-muted-foreground">
                  <span className="truncate">{displayPhone}</span>
                  {phoneVerified ? (
                    <BadgeCheck
                      className="h-3.5 w-3.5 shrink-0 text-[#00a09d]"
                      aria-label="Phone verified"
                    />
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
                    <BadgeCheck
                      className="h-3.5 w-3.5 shrink-0 text-[#00a09d]"
                      aria-label="Email verified"
                    />
                  ) : null}
                </p>
              ) : null}
              {!(featureFlags.fieldPhone && displayPhone) &&
              !(featureFlags.fieldEmail && displayEmail) ? (
                <p className="truncate text-[12px] text-muted-foreground">—</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {featureFlags.rewardPoints ? (
                <button
                  type="button"
                  onClick={() => onTabChange(featureFlags.tabLoyalty ? "loyalty" : "overview")}
                  className="inline-flex h-6 items-center gap-1 rounded-none border border-[#00a09d]/25 bg-[#00a09d]/10 px-2 text-[11px] font-semibold text-[#00a09d] transition-colors hover:bg-[#00a09d]/15"
                >
                  <Star className="h-3 w-3" />
                  {formatQuantity(points)} Points
                </button>
              ) : null}
              {featureFlags.wallet ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!readOnly && onOpenWalletRecharge) {
                      onOpenWalletRecharge();
                      return;
                    }
                    onTabChange(featureFlags.tabPayment ? "finance" : "overview");
                  }}
                  title={readOnly ? "Wallet balance" : "Recharge wallet"}
                  className="inline-flex h-6 items-center gap-1 rounded-none border border-[#714B67]/25 bg-[#714B67]/10 px-2 text-[11px] font-semibold text-[#714B67] transition-colors hover:bg-[#714B67]/15"
                >
                  <Wallet className="h-3 w-3" />
                  {formatCurrency(walletBalance)}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onTabChange("profile")}
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-none border px-2 text-[11px] font-semibold transition-colors",
                  tab === "profile"
                    ? "border-[#714B67] bg-[#714B67] text-white"
                    : "border-border bg-background text-foreground hover:border-[#00a09d] hover:text-[#00a09d]",
                )}
              >
                <User className="h-3 w-3" />
                Profile
              </button>
            </div>
          </div>
        </div>

      <AgainFormNotebook
        tabs={notebookTabs}
        active={tab}
        onChange={onTabChange}
        className={cn("border-t-0", fillNotebook && "min-h-0 flex-1")}
        contentClassName={cn(
          variant === "drawer" && "bg-transparent dark:bg-transparent",
          fillNotebook && "flex min-h-0 flex-1 flex-col overflow-y-auto py-3",
          tab === "stockReport" && "px-0 py-0 sm:px-0 overflow-y-hidden",
        )}
      >
          {tab === "overview" ? (
            isNewRecord || !customer ? (
              <PartnerTabEmpty
                title="Save this contact to unlock overview"
                description="Order metrics, wallet, points, and recent activity appear after the customer is created."
              />
            ) : (
              <PartnerOverviewPanel customer={customer} />
            )
          ) : null}

          {tab === "profile" ? (
      <>
      {rolePicker}
      <AgainFormTitle className="mb-0">
        {featureFlags.fieldPhoto ? (
        <button
          type="button"
          onClick={onPhotoClick}
          disabled={readOnly || !onPhotoClick}
          title={readOnly ? undefined : "Update profile photo"}
          aria-label={readOnly ? "Profile photo" : "Update profile photo"}
          className="group relative flex h-[90px] w-[90px] shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-none border border-border/80 bg-muted/20 text-muted-foreground hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-100"
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
              <User className="h-10 w-10 fill-[#f7cbb4] text-[#e8926a] dark:fill-[#5c4a42] dark:text-[#c98a6a]" strokeWidth={1.25} />
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

        <div className="min-w-0 flex-1 space-y-1 pt-0.5">
          <div className="flex items-center gap-2 text-[13px] text-foreground">
            <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <AgainUnderlineInput
              value={form.name}
              onChange={(v) => onPatch("name", v)}
              readOnly={readOnly}
              placeholder="Name"
              className="min-w-0 flex-1"
            />
          </div>
          {featureFlags.fieldPhone ? (
            <div className="flex items-center gap-2 text-[13px] text-foreground">
              <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {readOnly ? (
                <AgainUnderlineField className="flex min-w-0 flex-1 items-center gap-0.5">
                  <p className="min-h-[28px] min-w-0 flex-1 py-1 text-[13px] leading-[1.3]">
                    {form.phone || "—"}
                  </p>
                  {phoneVerified ? (
                    <BadgeCheck
                      className="h-4 w-4 shrink-0 text-[#00a09d]"
                      aria-label="Phone verified"
                    />
                  ) : null}
                  {showWhatsAppVerify ? (
                    <button
                      type="button"
                      title="Check if this number has WhatsApp"
                      aria-label="Verify WhatsApp"
                      disabled={verifyingWhatsApp || readOnly}
                      onClick={handleWhatsAppVerify}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-none border border-[#25D366]/30 bg-[#25D366]/10 text-[#128C7E] transition-colors hover:bg-[#25D366] hover:text-white disabled:opacity-60"
                    >
                      {verifyingWhatsApp ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <WhatsAppIcon />
                      )}
                    </button>
                  ) : null}
                </AgainUnderlineField>
              ) : (
                <AgainUnderlineField className="flex min-w-0 flex-1 items-center gap-0.5">
                  <input
                    value={form.phone ?? ""}
                    onChange={(e) => onPatch("phone", e.target.value)}
                    placeholder="Phone"
                    className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/70"
                  />
                  {phoneVerified ? (
                    <BadgeCheck
                      className="h-4 w-4 shrink-0 text-[#00a09d]"
                      aria-label="Phone verified"
                    />
                  ) : canVerifyPhone ? (
                    <button
                      type="button"
                      title="Mark phone verified"
                      aria-label="Mark phone verified"
                      disabled={verifyingContact === "phone"}
                      onClick={() => void onVerifyContact?.("phone", form.phone.trim())}
                      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-none border border-[#00a09d]/30 bg-[#00a09d]/10 px-1.5 text-[11px] font-medium text-[#00a09d] transition-colors hover:bg-[#00a09d] hover:text-white disabled:opacity-60"
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
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-none border border-[#25D366]/30 bg-[#25D366]/10 text-[#128C7E] transition-colors hover:bg-[#25D366] hover:text-white disabled:opacity-60"
                    >
                      {verifyingWhatsApp ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <WhatsAppIcon />
                      )}
                    </button>
                  ) : null}
                  {featureFlags.fieldAdditionalPhone && !showAdditionalPhone ? (
                    <button
                      type="button"
                      onClick={() => setShowAdditionalPhone(true)}
                      title="Add additional number"
                      aria-label="Add additional number"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-none bg-[#00a09d]/10 text-[#00a09d] transition-colors hover:bg-[#00a09d] hover:text-white"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  ) : null}
                </AgainUnderlineField>
              )}
            </div>
          ) : null}
          {featureFlags.fieldAdditionalPhone &&
          (showAdditionalPhone || (readOnly && form.additionalPhone)) ? (
            <div className="flex items-center gap-2 text-[13px] text-foreground">
              <Smartphone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {readOnly ? (
                <AgainUnderlineInput
                  value={form.additionalPhone}
                  readOnly
                  placeholder="Additional number"
                  className="min-w-0 flex-1"
                />
              ) : (
                <AgainUnderlineField className="flex min-w-0 flex-1 items-center gap-0.5">
                  <input
                    value={form.additionalPhone ?? ""}
                    onChange={(e) => onPatch("additionalPhone", e.target.value)}
                    placeholder="Additional number"
                    className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/70"
                  />
                  <button
                    type="button"
                    title="Remove additional number"
                    aria-label="Remove additional number"
                    onClick={() => {
                      onPatch("additionalPhone", "");
                      setShowAdditionalPhone(false);
                    }}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-none text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </AgainUnderlineField>
              )}
            </div>
          ) : null}
          {featureFlags.fieldEmail ? (
            <div className="flex items-center gap-2 text-[13px] text-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {readOnly ? (
                <AgainUnderlineField className="flex min-w-0 flex-1 items-center gap-0.5">
                  <p className="min-h-[28px] min-w-0 flex-1 py-1 text-[13px] leading-[1.3]">
                    {form.email || "—"}
                  </p>
                  {emailVerified ? (
                    <BadgeCheck
                      className="h-4 w-4 shrink-0 text-[#00a09d]"
                      aria-label="Email verified"
                    />
                  ) : null}
                </AgainUnderlineField>
              ) : (
                <AgainUnderlineField className="flex min-w-0 flex-1 items-center gap-0.5">
                  <input
                    value={form.email ?? ""}
                    onChange={(e) => onPatch("email", e.target.value)}
                    placeholder="Email"
                    className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/70"
                  />
                  {emailVerified ? (
                    <BadgeCheck
                      className="h-4 w-4 shrink-0 text-[#00a09d]"
                      aria-label="Email verified"
                    />
                  ) : canVerifyEmail ? (
                    <button
                      type="button"
                      title="Mark email verified"
                      aria-label="Mark email verified"
                      disabled={verifyingContact === "email"}
                      onClick={() => void onVerifyContact?.("email", form.email.trim())}
                      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-none border border-[#00a09d]/30 bg-[#00a09d]/10 px-1.5 text-[11px] font-medium text-[#00a09d] transition-colors hover:bg-[#00a09d] hover:text-white disabled:opacity-60"
                    >
                      <BadgeCheck className="h-3.5 w-3.5" />
                      {verifyingContact === "email" ? "…" : "Verify"}
                    </button>
                  ) : null}
                </AgainUnderlineField>
              )}
            </div>
          ) : null}
          {featureFlags.fieldCompany ? (
          <div className="flex items-center gap-2 text-[13px] text-foreground">
              <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {readOnly ? (
                <span>{companyLine}</span>
              ) : (
                <AgainUnderlineInput
                  value={form.parentCompany}
                  onChange={(v) => onPatch("parentCompany", v)}
                  placeholder="Company name..."
                  className="min-w-0 flex-1"
                />
              )}
            </div>
          ) : null}
          <div className="flex items-center gap-2 text-[13px] text-foreground">
            <UserCog className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {readOnly ? (
              <span className="py-1">{form.assignedStaff || "—"}</span>
            ) : (
              <AgainUnderlineField className="flex min-w-0 flex-1 items-center">
                <Select
                  value={form.assignedStaff}
                  onChange={(e) => onPatch("assignedStaff", e.target.value)}
                  className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0 text-[13px] shadow-none outline-none"
                >
                  <option value="">Assigned to…</option>
                  {form.assignedStaff &&
                  !mentionableUsers.some((u) => u.name === form.assignedStaff) ? (
                    <option value={form.assignedStaff}>{form.assignedStaff}</option>
                  ) : null}
                  {mentionableUsers.map((u) => (
                    <option key={u.id} value={u.name}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </AgainUnderlineField>
            )}
          </div>

          {featureFlags.fieldGroup ? (
            <div className="flex items-center gap-2 text-[13px] text-foreground">
              <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {readOnly ? (
                <span className="py-1">
                  {resolveCustomerGroupLabel(
                    form.group,
                    Object.fromEntries(groupOptions.map((o) => [o.id, o.label])),
                  )}
                </span>
              ) : (
                <AgainUnderlineField className="flex min-w-0 flex-1 items-center gap-0.5">
                  <Select
                    value={form.group}
                    onChange={(e) => onPatch("group", e.target.value)}
                    className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0 text-[13px] shadow-none outline-none"
                  >
                    {groupOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                  <button
                    type="button"
                    title="Clear group"
                    aria-label="Clear group"
                    onClick={() => onPatch("group", "retail")}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-none text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={onAddGroup}
                    title="Add customer group"
                    aria-label="Add customer group"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-none bg-[#00a09d]/10 text-[#00a09d] transition-colors hover:bg-[#00a09d] hover:text-white"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </AgainUnderlineField>
              )}
            </div>
          ) : null}

          {featureFlags.fieldStatus ? (
            <div className="flex items-center gap-2 text-[13px] text-foreground">
              <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {readOnly ? (
                <span className="py-1">
                  {CUSTOMER_STATUS_LABELS[form.status as keyof typeof CUSTOMER_STATUS_LABELS] ??
                    form.status}
                </span>
              ) : (
                <AgainUnderlineField className="flex min-w-0 flex-1 items-center">
                  <Select
                    value={form.status}
                    onChange={(e) => onPatch("status", e.target.value)}
                    className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0 text-[13px] shadow-none outline-none"
                  >
                    {Object.entries(CUSTOMER_STATUS_LABELS).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </AgainUnderlineField>
              )}
            </div>
          ) : null}

          <div className="flex items-center gap-2 text-[13px] text-foreground">
            <Receipt className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {readOnly ? (
              <span className="py-1">{form.taxId || "—"}</span>
            ) : (
              <AgainUnderlineInput
                value={form.taxId}
                onChange={(v) => onPatch("taxId", v)}
                placeholder="Tax number..."
                className="min-w-0 flex-1"
              />
            )}
          </div>

          <div className="flex items-center gap-2 text-[13px] text-foreground">
            <Wallet className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {readOnly ? (
              <span className="py-1">{form.openingBalance || "0"}</span>
            ) : (
              <AgainUnderlineInput
                value={form.openingBalance}
                onChange={(v) => onPatch("openingBalance", v.replace(/[^\d.-]/g, ""))}
                placeholder="Opening balance"
                className="min-w-0 flex-1"
                inputClassName="tabular-nums"
              />
            )}
          </div>

          <div className="flex items-center gap-2 text-[13px] text-foreground">
            <CreditCard className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {readOnly ? (
              <span className="py-1">{form.creditLimit || "—"}</span>
            ) : (
              <AgainUnderlineInput
                value={form.creditLimit}
                onChange={(v) => onPatch("creditLimit", v.replace(/[^\d.]/g, ""))}
                placeholder="Credit limit (blank = no limit)"
                className="min-w-0 flex-1"
                inputClassName="tabular-nums"
              />
            )}
          </div>

          <div className="flex items-center gap-2 text-[13px] text-foreground">
            <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {(() => {
              const payTerm = parsePayTerm(form.defaultPaymentTerms);
              return readOnly ? (
                <span className="py-1">
                  {payTerm.number ? `${payTerm.number} ${payTerm.unit}` : "—"}
                </span>
              ) : (
                <AgainUnderlineField className="flex min-w-0 flex-1 items-center gap-0.5">
                  <input
                    value={payTerm.number}
                    onChange={(e) =>
                      onPatch(
                        "defaultPaymentTerms",
                        formatPayTerm(e.target.value.replace(/[^\d]/g, ""), payTerm.unit),
                      )
                    }
                    placeholder="Pay term"
                    className="h-8 w-16 shrink-0 bg-transparent text-[13px] tabular-nums text-foreground outline-none placeholder:text-muted-foreground/70"
                  />
                  <Select
                    value={payTerm.unit}
                    onChange={(e) =>
                      onPatch(
                        "defaultPaymentTerms",
                        formatPayTerm(payTerm.number, e.target.value as "days" | "months"),
                      )
                    }
                    className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0 text-[13px] shadow-none outline-none"
                  >
                    <option value="days">Days</option>
                    <option value="months">Months</option>
                  </Select>
                  <FieldHelpTip label="Payments to be paid for purchases/sales within the given time period. Upcoming or due payments show on the dashboard's Payment Due section." />
                </AgainUnderlineField>
              );
            })()}
          </div>

          <div className="flex items-center gap-2 text-[13px] text-foreground">
            <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {readOnly ? (
              <span className="py-1">{form.paymentSchedule || "—"}</span>
            ) : (
              <AgainUnderlineInput
                value={form.paymentSchedule}
                onChange={(v) => onPatch("paymentSchedule", v)}
                placeholder="Payment schedule..."
                className="min-w-0 flex-1"
              />
            )}
          </div>

          {featureFlags.fieldTags ? (
            <div className="flex items-start gap-2 text-[13px] text-foreground">
              <Tag className="mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 border-b border-border/50 pb-1 focus-within:border-[#00a09d]">
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
                    placeholder={form.tags.length ? "" : "Tags…"}
                    className="h-7 min-w-[80px] flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/70"
                  />
                ) : form.tags.length === 0 ? (
                  <span className="py-1 text-muted-foreground">—</span>
                ) : null}
              </div>
            </div>
          ) : null}

          {featureFlags.fieldAddresses ? (
            <div className="rounded-none border border-border/80 bg-background/70 p-2.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  Addresses
                </div>
                {!readOnly ? (
                  <button
                    type="button"
                    onClick={onAddAddress}
                    title="Add address"
                    aria-label="Add address"
                    className="inline-flex h-7 items-center gap-1 rounded-none bg-[#00a09d]/10 px-2 text-[12px] font-medium text-[#00a09d] transition-colors hover:bg-[#00a09d] hover:text-white"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </button>
                ) : null}
              </div>

              <div className="space-y-2">
                <div className="space-y-0">
                  {readOnly ? (
                    <p className="min-h-[28px] py-1 text-[13px] font-medium text-foreground">
                      {form.addressTitle || "Home"}
                    </p>
                  ) : (
                    <div className="flex min-w-0 items-center gap-1">
                      <Select
                        value={
                          (ADDRESS_TITLE_PRESETS as readonly string[]).includes(form.addressTitle)
                            ? form.addressTitle
                            : "Other"
                        }
                        onChange={(e) => {
                          const next = e.target.value;
                          onPatch("addressTitle", next === "Other" ? "" : next);
                        }}
                        className="h-7 w-[104px] shrink-0 border-0 bg-transparent px-0 text-[13px] shadow-none outline-none"
                      >
                        {ADDRESS_TITLE_PRESETS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </Select>
                      {!(ADDRESS_TITLE_PRESETS as readonly string[]).includes(form.addressTitle) ? (
                        <AgainUnderlineInput
                          value={form.addressTitle}
                          onChange={(v) => onPatch("addressTitle", v)}
                          placeholder="Custom title…"
                          className="min-w-0 flex-1"
                        />
                      ) : null}
                    </div>
                  )}
                  <AgainUnderlineInput
                    value={form.street}
                    onChange={(v) => onPatch("street", v)}
                    readOnly={readOnly}
                    placeholder="Street..."
                  />
                  <div className="flex flex-wrap gap-x-2">
                    <AgainUnderlineInput
                      value={form.city}
                      onChange={(v) => onPatch("city", v)}
                      readOnly={readOnly}
                      placeholder="City"
                      className="min-w-[56px] flex-1"
                    />
                    <AgainUnderlineInput
                      value={form.region}
                      onChange={(v) => onPatch("region", v)}
                      readOnly={readOnly}
                      placeholder="State"
                      className="min-w-[56px] flex-1"
                    />
                    <AgainUnderlineInput
                      value={form.zip}
                      onChange={(v) => onPatch("zip", v)}
                      readOnly={readOnly}
                      placeholder="ZIP"
                      className="w-14 shrink-0"
                    />
                  </div>
                </div>

                {extraAddresses.map((addr) => (
                  <div
                    key={addr.id}
                    className="space-y-0 border-t border-border/60 pt-2"
                  >
                    <div className="flex items-center gap-0.5">
                      {readOnly ? (
                        <span className="min-w-0 flex-1 py-1 text-[13px] font-medium text-foreground">
                          {addr.label || "Other"}
                        </span>
                      ) : (
                        <div className="flex min-w-0 flex-1 items-center gap-1">
                          <Select
                            value={
                              (ADDRESS_TITLE_PRESETS as readonly string[]).includes(addr.label)
                                ? addr.label
                                : "Other"
                            }
                            onChange={(e) => {
                              const next = e.target.value;
                              onPatchAddress(addr.id, "label", next === "Other" ? "" : next);
                            }}
                            className="h-7 w-[104px] shrink-0 border-0 bg-transparent px-0 text-[13px] shadow-none outline-none"
                          >
                            {ADDRESS_TITLE_PRESETS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </Select>
                          {!(ADDRESS_TITLE_PRESETS as readonly string[]).includes(addr.label) ? (
                            <AgainUnderlineInput
                              value={addr.label}
                              onChange={(v) => onPatchAddress(addr.id, "label", v)}
                              placeholder="Custom title…"
                              className="min-w-0 flex-1"
                            />
                          ) : null}
                        </div>
                      )}
                      {!readOnly ? (
                        <button
                          type="button"
                          title="Remove address"
                          aria-label="Remove address"
                          onClick={() => onRemoveAddress(addr.id)}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-none text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                    <AgainUnderlineInput
                      value={addr.street}
                      onChange={(v) => onPatchAddress(addr.id, "street", v)}
                      readOnly={readOnly}
                      placeholder="Street..."
                    />
                    <div className="flex flex-wrap gap-x-2">
                      <AgainUnderlineInput
                        value={addr.city}
                        onChange={(v) => onPatchAddress(addr.id, "city", v)}
                        readOnly={readOnly}
                        placeholder="City"
                        className="min-w-[56px] flex-1"
                      />
                      <AgainUnderlineInput
                        value={addr.region}
                        onChange={(v) => onPatchAddress(addr.id, "region", v)}
                        readOnly={readOnly}
                        placeholder="State"
                        className="min-w-[56px] flex-1"
                      />
                      <AgainUnderlineInput
                        value={addr.zip}
                        onChange={(v) => onPatchAddress(addr.id, "zip", v)}
                        readOnly={readOnly}
                        placeholder="ZIP"
                        className="w-14 shrink-0"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

        </div>
      </AgainFormTitle>
      </>
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

          {tab === "stockReport" ? (
            <div className={cn(variant === "drawer" ? "flex min-h-0 flex-1 flex-col" : "space-y-4")}>
              {customer?.linkedSupplierId ? (
                <PartnerStockReportPanel
                  supplierId={customer.linkedSupplierId}
                  fillHeight={variant === "drawer"}
                />
              ) : (
                <PartnerTabEmpty
                  title="No stock report yet"
                  description="Save this contact as a supplier to see what's been purchased from them."
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
