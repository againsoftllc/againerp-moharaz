"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Globe,
  HardDrive,
  ImagePlus,
  Link2,
  Mail,
  Package,
  Palette,
  Server,
  Settings2,
  SlidersHorizontal,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchSiteCorsOrigins,
  getWorkspaceSite,
  refreshSiteCorsOrigins,
  updateWorkspaceSite,
  type WorkspaceSite,
} from "@/lib/api/workspace-sites";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { MediaLibraryModal } from "@/components/media/media-library-modal";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { getStorefrontPublicUrl, hydrateStorefrontUrlsFromSite, resolveBrandAssetPreviewUrl } from "@/lib/website/live-edit";
import { publicMediaUrl } from "@/lib/media/public-media-url";
import {
  mergeSiteOptions,
  NONE_OPTION,
  STOREFRONT_HEADER_ACTIONS,
  type SiteStoreOptions,
  type StorefrontSiteOptions,
} from "@/lib/website/site-store-options";

const SECTIONS = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "store", label: "Store", icon: Store },
  { id: "local", label: "Local", icon: Globe },
  { id: "option", label: "Option", icon: SlidersHorizontal },
  { id: "storefront", label: "Storefront", icon: Palette },
  { id: "image", label: "Image", icon: ImagePlus },
  { id: "ftp", label: "FTP", icon: HardDrive },
  { id: "mail", label: "Mail / SMS", icon: Mail },
  { id: "server", label: "Server", icon: Server },
  { id: "connections", label: "Connection", icon: Link2 },
  { id: "deploy", label: "Git / Vercel", icon: Globe },
] as const;

const ORDER_STATUSES = [
  "Canceled",
  "Canceled Reversal",
  "Chargeback",
  "Complete",
  "Denied",
  "Expired",
  "Failed",
  "Pending",
  "Processed",
  "Processing",
  "Refunded",
  "Reversed",
  "Shipped",
  "Voided",
] as const;

const CUSTOMER_GROUPS = ["Default", "Retail", "Wholesale", "VIP"] as const;
const TAX_ADDRESS_OPTIONS = ["Shipping Address", "Payment Address", "Store Address"] as const;

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  setup: "Setup",
};

type SectionId = (typeof SECTIONS)[number]["id"];

type StoreSettingsValues = {
  storeName: string;
  storeOwner: string;
  storeAddress: string;
  storeEmail: string;
  storePhone: string;
  storeWhatsapp: string;
  storeTagline: string;
  storeBusinessHours: string;
  storeImage: string;
  storeImageMobile: string;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
  template: string;
  defaultLayout: string;
  country: string;
  region: string;
  entryRegion: string;
  language: string;
  adminLanguage: string;
  currency: string;
  timezone: string;
  autoUpdateCurrency: boolean;
  lengthClass: string;
  weightClass: string;
  categoryProductCount: boolean;
  catalogItemsPerPage: string;
  listDescriptionLimit: string;
  adminItemsPerPage: string;
  allowReviews: boolean;
  allowGuestReviews: boolean;
  newReviewAlertMail: boolean;
  voucherMin: string;
  voucherMax: string;
  displayPricesWithTax: boolean;
  useStoreTaxAddress: string;
  useCustomerTaxAddress: string;
  customersOnline: boolean;
  otpVerification: boolean;
  defaultCustomerGroup: string;
  loginDisplayPrices: boolean;
  maxLoginAttempts: string;
  accountTerms: string;
  newAccountAlertMail: boolean;
  invoicePrefix: string;
  apiUser: string;
  displayWeightOnCart: boolean;
  guestCheckout: boolean;
  checkoutTerms: string;
  orderStatus: string;
  orderPrintStatus: string;
  processingOrderStatuses: string[];
  completeOrderStatuses: string[];
  newOrderAlertMessage: boolean;
  displayStock: boolean;
  showOutOfStockWarning: boolean;
  stockCheckout: boolean;
  affiliateRequiresApproval: boolean;
  automaticCommission: boolean;
  affiliateCommission: string;
  affiliateTerms: string;
  newAffiliateAlertMail: boolean;
  returnTerms: string;
  returnStatus: string;
  faviconUrl: string;
  watermarkText: string;
  ftpHost: string;
  ftpPort: string;
  ftpUser: string;
  ftpPassword: string;
  ftpRoot: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassword: string;
  smsGateway: string;
  smsApiKey: string;
  maintenanceMode: boolean;
  seoUrls: boolean;
  compression: boolean;
  primaryDomain: string;
  domainAliases: string;
  storefrontUrlLocal: string;
  storefrontUrlPreview: string;
  storefrontUrlProduction: string;
  gitRepoUrl: string;
  gitDefaultBranch: string;
  vercelProjectId: string;
  vercelProjectName: string;
  vercelTeamSlug: string;
  plan: string;
  status: string;
  code: string;
  isPrimary: boolean;
  notes: string;
  copyrightText: string;
  storefront: StorefrontSiteOptions;
};

function valuesFromSite(site: WorkspaceSite): StoreSettingsValues {
  const opt = mergeSiteOptions(site.options as Partial<SiteStoreOptions> | undefined);
  return {
    storeName: site.name || "",
    storeOwner: site.owner || "",
    storeAddress: site.address || "",
    storeEmail: site.contact_email || "",
    storePhone: site.contact_phone || "",
    storeWhatsapp: site.whatsapp_number || "",
    storeTagline: site.tagline || "",
    storeBusinessHours: site.business_hours || "",
    storeImage: site.logo_url || "",
    storeImageMobile: site.logo_mobile_url || "",
    metaTitle: site.meta_title || "",
    metaDescription: site.meta_description || "",
    metaKeywords: site.meta_keywords || "",
    template: opt.template,
    defaultLayout: opt.default_layout,
    country: opt.country,
    region: opt.region,
    entryRegion: opt.entry_region,
    language: opt.language,
    adminLanguage: opt.admin_language,
    currency: site.currency || "BDT",
    timezone: site.timezone || "Asia/Dhaka",
    autoUpdateCurrency: opt.auto_update_currency,
    lengthClass: opt.length_class,
    weightClass: opt.weight_class,
    categoryProductCount: opt.category_product_count,
    catalogItemsPerPage: opt.catalog_items_per_page,
    listDescriptionLimit: opt.list_description_limit,
    adminItemsPerPage: opt.admin_items_per_page,
    allowReviews: opt.allow_reviews,
    allowGuestReviews: opt.allow_guest_reviews,
    newReviewAlertMail: opt.new_review_alert_mail,
    voucherMin: opt.voucher_min,
    voucherMax: opt.voucher_max,
    displayPricesWithTax: opt.display_prices_with_tax,
    useStoreTaxAddress: opt.use_store_tax_address,
    useCustomerTaxAddress: opt.use_customer_tax_address,
    customersOnline: opt.customers_online,
    otpVerification: opt.otp_verification,
    defaultCustomerGroup: opt.default_customer_group,
    loginDisplayPrices: opt.login_display_prices,
    maxLoginAttempts: opt.max_login_attempts,
    accountTerms: opt.account_terms,
    newAccountAlertMail: opt.new_account_alert_mail,
    invoicePrefix: opt.invoice_prefix,
    apiUser: opt.api_user,
    displayWeightOnCart: opt.display_weight_on_cart,
    guestCheckout: opt.guest_checkout,
    checkoutTerms: opt.checkout_terms,
    orderStatus: opt.order_status,
    orderPrintStatus: opt.order_print_status,
    processingOrderStatuses: [...opt.processing_order_statuses],
    completeOrderStatuses: [...opt.complete_order_statuses],
    newOrderAlertMessage: opt.new_order_alert_message,
    displayStock: opt.display_stock,
    showOutOfStockWarning: opt.show_out_of_stock_warning,
    stockCheckout: opt.stock_checkout,
    affiliateRequiresApproval: opt.affiliate_requires_approval,
    automaticCommission: opt.automatic_commission,
    affiliateCommission: opt.affiliate_commission,
    affiliateTerms: opt.affiliate_terms,
    newAffiliateAlertMail: opt.new_affiliate_alert_mail,
    returnTerms: opt.return_terms,
    returnStatus: opt.return_status,
    faviconUrl: site.favicon_url || "",
    watermarkText: opt.watermark_text,
    ftpHost: opt.ftp_host,
    ftpPort: opt.ftp_port,
    ftpUser: opt.ftp_user,
    ftpPassword: opt.ftp_password,
    ftpRoot: opt.ftp_root,
    smtpHost: opt.smtp_host,
    smtpPort: opt.smtp_port,
    smtpUser: opt.smtp_user,
    smtpPassword: opt.smtp_password,
    smsGateway: opt.sms_gateway,
    smsApiKey: opt.sms_api_key,
    maintenanceMode: opt.maintenance_mode,
    seoUrls: opt.seo_urls,
    compression: opt.compression,
    primaryDomain: site.primary_domain || "",
    domainAliases: site.domain_aliases || "",
    storefrontUrlLocal: site.storefront_url_local || "",
    storefrontUrlPreview: site.storefront_url_preview || "",
    storefrontUrlProduction: site.storefront_url_production || "",
    gitRepoUrl: site.git_repo_url || "",
    gitDefaultBranch: site.git_default_branch || "main",
    vercelProjectId: site.vercel_project_id || "",
    vercelProjectName: site.vercel_project_name || "",
    vercelTeamSlug: site.vercel_team_slug || "",
    plan: site.plan || "",
    status: String(site.status || "active"),
    code: site.code || "",
    isPrimary: Boolean(site.is_primary),
    notes: site.notes || "",
    copyrightText: site.copyright_text || "",
    storefront: opt.storefront,
  };
}

function optionsFromValues(v: StoreSettingsValues): SiteStoreOptions {
  return {
    template: v.template,
    default_layout: v.defaultLayout,
    country: v.country,
    region: v.region,
    entry_region: v.entryRegion,
    language: v.language,
    admin_language: v.adminLanguage,
    auto_update_currency: v.autoUpdateCurrency,
    length_class: v.lengthClass,
    weight_class: v.weightClass,
    category_product_count: v.categoryProductCount,
    catalog_items_per_page: v.catalogItemsPerPage,
    list_description_limit: v.listDescriptionLimit,
    admin_items_per_page: v.adminItemsPerPage,
    allow_reviews: v.allowReviews,
    allow_guest_reviews: v.allowGuestReviews,
    new_review_alert_mail: v.newReviewAlertMail,
    voucher_min: v.voucherMin,
    voucher_max: v.voucherMax,
    display_prices_with_tax: v.displayPricesWithTax,
    use_store_tax_address: v.useStoreTaxAddress,
    use_customer_tax_address: v.useCustomerTaxAddress,
    customers_online: v.customersOnline,
    otp_verification: v.otpVerification,
    default_customer_group: v.defaultCustomerGroup,
    login_display_prices: v.loginDisplayPrices,
    max_login_attempts: v.maxLoginAttempts,
    account_terms: v.accountTerms,
    new_account_alert_mail: v.newAccountAlertMail,
    invoice_prefix: v.invoicePrefix,
    api_user: v.apiUser,
    display_weight_on_cart: v.displayWeightOnCart,
    guest_checkout: v.guestCheckout,
    checkout_terms: v.checkoutTerms,
    order_status: v.orderStatus,
    order_print_status: v.orderPrintStatus,
    processing_order_statuses: v.processingOrderStatuses,
    complete_order_statuses: v.completeOrderStatuses,
    new_order_alert_message: v.newOrderAlertMessage,
    display_stock: v.displayStock,
    show_out_of_stock_warning: v.showOutOfStockWarning,
    stock_checkout: v.stockCheckout,
    affiliate_requires_approval: v.affiliateRequiresApproval,
    automatic_commission: v.automaticCommission,
    affiliate_commission: v.affiliateCommission,
    affiliate_terms: v.affiliateTerms,
    new_affiliate_alert_mail: v.newAffiliateAlertMail,
    return_terms: v.returnTerms,
    return_status: v.returnStatus,
    watermark_text: v.watermarkText,
    ftp_host: v.ftpHost,
    ftp_port: v.ftpPort,
    ftp_user: v.ftpUser,
    ftp_password: v.ftpPassword,
    ftp_root: v.ftpRoot,
    smtp_host: v.smtpHost,
    smtp_port: v.smtpPort,
    smtp_user: v.smtpUser,
    smtp_password: v.smtpPassword,
    sms_gateway: v.smsGateway,
    sms_api_key: v.smsApiKey,
    maintenance_mode: v.maintenanceMode,
    seo_urls: v.seoUrls,
    compression: v.compression,
    storefront: v.storefront,
  };
}

type Props = { siteId: string };

export function SiteSettingsForm({ siteId }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<SectionId>("general");
  const [site, setSite] = useState<WorkspaceSite | null>(null);
  const [values, setValues] = useState<StoreSettingsValues | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [logoLibraryOpen, setLogoLibraryOpen] = useState(false);
  const [logoMobileLibraryOpen, setLogoMobileLibraryOpen] = useState(false);
  const [faviconLibraryOpen, setFaviconLibraryOpen] = useState(false);
  const [corsOrigins, setCorsOrigins] = useState<string[]>([]);
  const [corsBusy, setCorsBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await getWorkspaceSite(siteId);
        if (cancelled) return;
        setSite(data);
        setValues(valuesFromSite(data));
        hydrateStorefrontUrlsFromSite(data);
        try {
          setCorsOrigins(await fetchSiteCorsOrigins());
        } catch {
          /* optional */
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Site not found");
          setSite(null);
          setValues(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  const set = useCallback(<K extends keyof StoreSettingsValues>(key: K, value: StoreSettingsValues[K]) => {
    setValues((v) => (v ? { ...v, [key]: value } : v));
  }, []);

  const setStorefront = useCallback(
    <K extends keyof StorefrontSiteOptions>(key: K, value: StorefrontSiteOptions[K]) => {
      setValues((v) => (v ? { ...v, storefront: { ...v.storefront, [key]: value } } : v));
    },
    [],
  );

  const toggleStatus = useCallback((key: "processingOrderStatuses" | "completeOrderStatuses", status: string) => {
    setValues((v) => {
      if (!v) return v;
      const list = v[key];
      const next = list.includes(status) ? list.filter((s) => s !== status) : [...list, status];
      return { ...v, [key]: next };
    });
  }, []);

  const selectSection = (id: SectionId) => {
    setSection(id);
    contentRef.current?.scrollTo({ top: 0 });
  };

  const handleSave = async () => {
    if (!site || !values) return;
    setSaving(true);
    try {
      const updated = await updateWorkspaceSite(site.id, {
        code: values.code,
        name: values.storeName,
        owner: values.storeOwner,
        status: values.status as WorkspaceSite["status"],
        plan: values.plan,
        address: values.storeAddress,
        contact_email: values.storeEmail,
        contact_phone: values.storePhone,
        whatsapp_number: values.storeWhatsapp,
        tagline: values.storeTagline,
        business_hours: values.storeBusinessHours,
        logo_url: publicMediaUrl(values.storeImage) || values.storeImage,
        logo_mobile_url: publicMediaUrl(values.storeImageMobile) || values.storeImageMobile,
        favicon_url: publicMediaUrl(values.faviconUrl) || values.faviconUrl,
        meta_title: values.metaTitle,
        meta_description: values.metaDescription,
        meta_keywords: values.metaKeywords,
        copyright_text: values.copyrightText,
        currency: values.currency,
        timezone: values.timezone,
        notes: values.notes,
        is_primary: values.isPrimary,
        primary_domain: values.primaryDomain,
        domain_aliases: values.domainAliases,
        storefront_url_local: values.storefrontUrlLocal,
        storefront_url_preview: values.storefrontUrlPreview,
        storefront_url_production: values.storefrontUrlProduction,
        git_repo_url: values.gitRepoUrl,
        git_default_branch: values.gitDefaultBranch,
        vercel_project_id: values.vercelProjectId,
        vercel_project_name: values.vercelProjectName,
        vercel_team_slug: values.vercelTeamSlug,
        options: optionsFromValues(values),
      });
      setSite(updated);
      setValues(valuesFromSite(updated));
      hydrateStorefrontUrlsFromSite(updated);
      try {
        setCorsOrigins(await refreshSiteCorsOrigins());
      } catch {
        /* optional */
      }
      toast.success("Site settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <ContentDataSkeleton rows={10} />
      </div>
    );
  }

  if (error || !site || !values) {
    return (
      <div className="rounded-none border border-dashed border-border p-10 text-center">
        <p className="text-sm font-medium">{error || "Site not found"}</p>
        <Button variant="ghost" size="sm" asChild className="mt-2 rounded-none">
          <Link href="/workspace/sites">Back to Sites</Link>
        </Button>
      </div>
    );
  }

  const openHref = getStorefrontPublicUrl();

  return (
    <>
    <div className="flex min-h-0 flex-col pb-20 sm:min-h-[calc(100vh-2.75rem-1.5rem)] sm:pb-0 lg:min-h-[calc(100vh-2.75rem-2rem)] [&_button]:rounded-none [&_input]:rounded-none [&_select]:rounded-none [&_textarea]:rounded-none [&_img]:rounded-none">
      <div className="shrink-0 border-b border-input pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 rounded-none"
              asChild
            >
              <Link href="/workspace/sites">
                <ArrowLeft className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <h1 className="truncate text-sm font-semibold">Site Settings</h1>
            <Badge
              variant={values.status === "active" ? "success" : "secondary"}
              className="rounded-none px-1.5 py-0 text-[10px]"
            >
              {STATUS_LABELS[values.status] || values.status}
            </Badge>
          </div>
          <div className="hidden shrink-0 gap-1.5 sm:flex">
            {openHref ? (
              <Button variant="outline" size="sm" className="rounded-none" asChild>
                <a href={openHref} target="_blank" rel="noreferrer">Open website</a>
              </Button>
            ) : null}
            <Button variant="outline" size="sm" className="rounded-none" asChild>
              <Link href="/workspace/sites">Back to list</Link>
            </Button>
            <Button size="sm" className="rounded-none" onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-10 shrink-0 border-b border-input bg-background py-1.5 md:hidden">
        <div className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => selectSection(id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-none border px-2 py-1 text-[10px] transition-colors ${
                section === id
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-input text-muted-foreground"
              }`}
            >
              <Icon className="h-2.5 w-2.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 pt-2 md:flex-row md:pt-4">
        <nav className="hidden w-40 shrink-0 border-r border-input pr-2 md:block">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => selectSection(id)}
              className={`mb-0.5 flex w-full items-center gap-1.5 rounded-none px-2 py-1 text-left text-[11px] transition-colors ${
                section === id
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/50"
              }`}
            >
              <Icon className="h-3 w-3 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </nav>

        <div ref={contentRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto pb-4 md:pb-8">
          {section === "general" && (
            <Section title="General">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Store Name" required>
                  <Input value={values.storeName} onChange={(e) => set("storeName", e.target.value)} />
                </Field>
                <Field label="Store Owner">
                  <Input value={values.storeOwner} onChange={(e) => set("storeOwner", e.target.value)} />
                </Field>
                <Field label="Address" className="sm:col-span-2">
                  <Textarea value={values.storeAddress} onChange={(e) => set("storeAddress", e.target.value)} rows={3} />
                </Field>
                <Field label="E-Mail">
                  <Input type="email" value={values.storeEmail} onChange={(e) => set("storeEmail", e.target.value)} />
                </Field>
                <Field label="Telephone">
                  <Input value={values.storePhone} onChange={(e) => set("storePhone", e.target.value)} />
                </Field>
                <Field label="WhatsApp">
                  <Input value={values.storeWhatsapp} onChange={(e) => set("storeWhatsapp", e.target.value)} />
                </Field>
                <Field label="Tagline">
                  <Input value={values.storeTagline} onChange={(e) => set("storeTagline", e.target.value)} />
                </Field>
                <Field label="Business hours" className="sm:col-span-2">
                  <Input value={values.storeBusinessHours} onChange={(e) => set("storeBusinessHours", e.target.value)} />
                </Field>
                <Field label="Code">
                  <Input className="font-mono uppercase" value={values.code} onChange={(e) => set("code", e.target.value)} />
                </Field>
                <Field label="Status">
                  <Select value={values.status} onChange={(e) => set("status", e.target.value)}>
                    <option value="active">Active</option>
                    <option value="setup">Setup</option>
                    <option value="inactive">Inactive</option>
                  </Select>
                </Field>
                <Field label="Plan">
                  <Input value={values.plan} onChange={(e) => set("plan", e.target.value)} />
                </Field>
                <Field label="Copyright" className="sm:col-span-2">
                  <Input value={values.copyrightText} onChange={(e) => set("copyrightText", e.target.value)} />
                </Field>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={values.isPrimary} onChange={(e) => set("isPrimary", e.target.checked)} />
                  Primary site (feeds storefront settings)
                </label>
              </div>
            </Section>
          )}

          {section === "store" && (
            <Section title="Store">
              <div className="grid gap-4">
                <Field label="Meta Title">
                  <Input value={values.metaTitle} onChange={(e) => set("metaTitle", e.target.value)} />
                </Field>
                <Field label="Meta Description">
                  <Textarea
                    value={values.metaDescription}
                    onChange={(e) => set("metaDescription", e.target.value)}
                    rows={3}
                  />
                </Field>
                <Field label="Meta Keywords" hint="Comma separated">
                  <Textarea
                    value={values.metaKeywords}
                    onChange={(e) => set("metaKeywords", e.target.value)}
                    rows={2}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Template">
                    <Select value={values.template} onChange={(e) => set("template", e.target.value)}>
                      <option value="default">Default</option>
                      <option value="minimal">Minimal</option>
                      <option value="bold">Bold Commerce</option>
                      <option value="classic">Classic</option>
                    </Select>
                  </Field>
                  <Field label="Default Layout">
                    <Select value={values.defaultLayout} onChange={(e) => set("defaultLayout", e.target.value)}>
                      <option value="common/home">common/home</option>
                      <option value="common/home_fullwidth">common/home_fullwidth</option>
                      <option value="common/landing">common/landing</option>
                    </Select>
                  </Field>
                </div>
              </div>
            </Section>
          )}

          {section === "local" && (
            <Section title="Local">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Country">
                  <Select value={values.country} onChange={(e) => set("country", e.target.value)}>
                    <option value="Bangladesh">Bangladesh</option>
                    <option value="India">India</option>
                    <option value="United States">United States</option>
                  </Select>
                </Field>
                <Field label="Region / State">
                  <Select value={values.region} onChange={(e) => set("region", e.target.value)}>
                    <option value="Dhaka Division">Dhaka Division</option>
                    <option value="Chittagong Division">Chittagong Division</option>
                    <option value="Rajshahi Division">Rajshahi Division</option>
                    <option value="Khulna Division">Khulna Division</option>
                  </Select>
                </Field>
                <Field label="entry_region" hint="How customers select region on checkout">
                  <Select value={values.entryRegion} onChange={(e) => set("entryRegion", e.target.value)}>
                    <option value="dropdown">Dropdown</option>
                    <option value="text">Text input</option>
                    <option value="hidden">Hidden</option>
                  </Select>
                </Field>
                <Field label="Language">
                  <Select value={values.language} onChange={(e) => set("language", e.target.value)}>
                    <option value="English">English</option>
                    <option value="Bengali">Bengali</option>
                    <option value="Arabic">Arabic</option>
                  </Select>
                </Field>
                <Field label="Administration Language">
                  <Select value={values.adminLanguage} onChange={(e) => set("adminLanguage", e.target.value)}>
                    <option value="English">English</option>
                    <option value="Bengali">Bengali</option>
                  </Select>
                </Field>
                <Field label="Currency">
                  <Select value={values.currency} onChange={(e) => set("currency", e.target.value)}>
                    <option value="BDT">BDT — ৳</option>
                    <option value="USD">USD — $</option>
                    <option value="EUR">EUR — €</option>
                  </Select>
                </Field>
                <Field label="Timezone">
                  <Input value={values.timezone} onChange={(e) => set("timezone", e.target.value)} />
                </Field>
                <Field label="Auto Update Currency" className="sm:col-span-2">
                  <YesNoField
                    value={values.autoUpdateCurrency}
                    onChange={(v) => set("autoUpdateCurrency", v)}
                  />
                </Field>
                <Field label="Length Class">
                  <Select value={values.lengthClass} onChange={(e) => set("lengthClass", e.target.value)}>
                    <option value="Centimeter">Centimeter</option>
                    <option value="Inch">Inch</option>
                    <option value="Millimeter">Millimeter</option>
                  </Select>
                </Field>
                <Field label="Weight Class">
                  <Select value={values.weightClass} onChange={(e) => set("weightClass", e.target.value)}>
                    <option value="Kilogram">Kilogram</option>
                    <option value="Gram">Gram</option>
                    <option value="Pound">Pound</option>
                  </Select>
                </Field>
              </div>
            </Section>
          )}

          {section === "option" && (
            <Section title="Option" wide>
              <div className="max-w-4xl space-y-6">
                <OptionGroup title="Products">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Category Product Count">
                      <YesNoField value={values.categoryProductCount} onChange={(v) => set("categoryProductCount", v)} />
                    </Field>
                    <Field label="Default Items Per Page (Catalog)">
                      <Input value={values.catalogItemsPerPage} onChange={(e) => set("catalogItemsPerPage", e.target.value)} />
                    </Field>
                    <Field label="List Description Limit (Catalog)">
                      <Input value={values.listDescriptionLimit} onChange={(e) => set("listDescriptionLimit", e.target.value)} />
                    </Field>
                    <Field label="Default Items Per Page (Admin)">
                      <Input value={values.adminItemsPerPage} onChange={(e) => set("adminItemsPerPage", e.target.value)} />
                    </Field>
                  </div>
                </OptionGroup>

                <OptionGroup title="Reviews">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Allow Reviews">
                      <YesNoField value={values.allowReviews} onChange={(v) => set("allowReviews", v)} />
                    </Field>
                    <Field label="Allow Guest Reviews">
                      <YesNoField value={values.allowGuestReviews} onChange={(v) => set("allowGuestReviews", v)} />
                    </Field>
                    <Field label="New Review Alert Mail" className="sm:col-span-2">
                      <YesNoField value={values.newReviewAlertMail} onChange={(v) => set("newReviewAlertMail", v)} />
                    </Field>
                  </div>
                </OptionGroup>

                <OptionGroup title="Vouchers">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Voucher Min">
                      <Input type="number" value={values.voucherMin} onChange={(e) => set("voucherMin", e.target.value)} />
                    </Field>
                    <Field label="Voucher Max">
                      <Input type="number" value={values.voucherMax} onChange={(e) => set("voucherMax", e.target.value)} />
                    </Field>
                  </div>
                </OptionGroup>

                <OptionGroup title="Taxes">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Display Prices With Tax">
                      <YesNoField value={values.displayPricesWithTax} onChange={(v) => set("displayPricesWithTax", v)} />
                    </Field>
                    <Field label="Use Store Tax Address">
                      <Select value={values.useStoreTaxAddress} onChange={(e) => set("useStoreTaxAddress", e.target.value)}>
                        {TAX_ADDRESS_OPTIONS.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Use Customer Tax Address" className="sm:col-span-2">
                      <Select value={values.useCustomerTaxAddress} onChange={(e) => set("useCustomerTaxAddress", e.target.value)}>
                        {TAX_ADDRESS_OPTIONS.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                </OptionGroup>

                <OptionGroup title="Account">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Customers Online">
                      <YesNoField value={values.customersOnline} onChange={(v) => set("customersOnline", v)} />
                    </Field>
                    <Field label="OTP Verification">
                      <YesNoField value={values.otpVerification} onChange={(v) => set("otpVerification", v)} />
                    </Field>
                    <Field label="Customer Group">
                      <Select value={values.defaultCustomerGroup} onChange={(e) => set("defaultCustomerGroup", e.target.value)}>
                        {CUSTOMER_GROUPS.map((g) => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Login Display Prices">
                      <YesNoField value={values.loginDisplayPrices} onChange={(v) => set("loginDisplayPrices", v)} />
                    </Field>
                    <Field label="Max Login Attempts">
                      <Input type="number" value={values.maxLoginAttempts} onChange={(e) => set("maxLoginAttempts", e.target.value)} />
                    </Field>
                    <Field label="Account Terms">
                      <TermsSelect value={values.accountTerms} onChange={(v) => set("accountTerms", v)} />
                    </Field>
                    <Field label="New Account Alert Mail" className="sm:col-span-2">
                      <YesNoField value={values.newAccountAlertMail} onChange={(v) => set("newAccountAlertMail", v)} />
                    </Field>
                  </div>
                </OptionGroup>

                <OptionGroup title="Checkout">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Invoice Prefix">
                      <Input value={values.invoicePrefix} onChange={(e) => set("invoicePrefix", e.target.value)} />
                    </Field>
                    <Field label="API User">
                      <TermsSelect value={values.apiUser} onChange={(v) => set("apiUser", v)} />
                    </Field>
                    <Field label="Display Weight on Cart Page">
                      <YesNoField value={values.displayWeightOnCart} onChange={(v) => set("displayWeightOnCart", v)} />
                    </Field>
                    <Field label="Guest Checkout">
                      <YesNoField value={values.guestCheckout} onChange={(v) => set("guestCheckout", v)} />
                    </Field>
                    <Field label="Checkout Terms">
                      <TermsSelect value={values.checkoutTerms} onChange={(v) => set("checkoutTerms", v)} />
                    </Field>
                    <Field label="Order Status">
                      <OrderStatusSelect value={values.orderStatus} onChange={(v) => set("orderStatus", v)} />
                    </Field>
                    <Field label="Order Print Status">
                      <OrderStatusSelect value={values.orderPrintStatus} allowNone onChange={(v) => set("orderPrintStatus", v)} />
                    </Field>
                    <Field label="New Order Alert Message" className="sm:col-span-2">
                      <YesNoField value={values.newOrderAlertMessage} onChange={(v) => set("newOrderAlertMessage", v)} />
                    </Field>
                    <Field label="Processing Order Status" className="sm:col-span-2">
                      <StatusCheckboxList
                        statuses={ORDER_STATUSES}
                        selected={values.processingOrderStatuses}
                        onToggle={(s) => toggleStatus("processingOrderStatuses", s)}
                      />
                    </Field>
                    <Field label="Complete Order Status" className="sm:col-span-2">
                      <StatusCheckboxList
                        statuses={ORDER_STATUSES}
                        selected={values.completeOrderStatuses}
                        onToggle={(s) => toggleStatus("completeOrderStatuses", s)}
                      />
                    </Field>
                  </div>
                </OptionGroup>

                <OptionGroup title="Stock">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Display Stock">
                      <YesNoField value={values.displayStock} onChange={(v) => set("displayStock", v)} />
                    </Field>
                    <Field label="Show Out Of Stock Warning">
                      <YesNoField value={values.showOutOfStockWarning} onChange={(v) => set("showOutOfStockWarning", v)} />
                    </Field>
                    <Field label="Stock Checkout" className="sm:col-span-2">
                      <YesNoField value={values.stockCheckout} onChange={(v) => set("stockCheckout", v)} />
                    </Field>
                  </div>
                </OptionGroup>

                <OptionGroup title="Affiliates">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Affiliate Requires Approval">
                      <YesNoField value={values.affiliateRequiresApproval} onChange={(v) => set("affiliateRequiresApproval", v)} />
                    </Field>
                    <Field label="Automatic Commission">
                      <YesNoField value={values.automaticCommission} onChange={(v) => set("automaticCommission", v)} />
                    </Field>
                    <Field label="Affiliate Commission (%)">
                      <Input value={values.affiliateCommission} onChange={(e) => set("affiliateCommission", e.target.value)} />
                    </Field>
                    <Field label="Affiliate Terms">
                      <TermsSelect value={values.affiliateTerms} onChange={(v) => set("affiliateTerms", v)} />
                    </Field>
                    <Field label="New Affiliate Alert Mail" className="sm:col-span-2">
                      <YesNoField value={values.newAffiliateAlertMail} onChange={(v) => set("newAffiliateAlertMail", v)} />
                    </Field>
                  </div>
                </OptionGroup>

                <OptionGroup title="Returns">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Return Terms">
                      <TermsSelect value={values.returnTerms} onChange={(v) => set("returnTerms", v)} />
                    </Field>
                    <Field label="Return Status">
                      <OrderStatusSelect value={values.returnStatus} onChange={(v) => set("returnStatus", v)} />
                    </Field>
                  </div>
                </OptionGroup>
              </div>
            </Section>
          )}

          {section === "storefront" && (
            <Section title="Storefront" wide>
              <p className="mb-3 text-xs text-muted-foreground">
                Applies to the storefront served on this site&apos;s domains. Leave a field empty to keep
                the storefront&apos;s built-in default.
              </p>
              <div className="max-w-4xl space-y-6">
                <OptionGroup title="Department emails">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {(
                      [
                        ["support", "Support"],
                        ["sales", "Sales"],
                        ["payments", "Payments"],
                        ["delivery", "Delivery"],
                        ["returns", "Returns"],
                      ] as const
                    ).map(([key, label]) => (
                      <Field key={key} label={label}>
                        <Input
                          type="email"
                          value={values.storefront.emails[key]}
                          onChange={(e) =>
                            setStorefront("emails", {
                              ...values.storefront.emails,
                              [key]: e.target.value,
                            })
                          }
                        />
                      </Field>
                    ))}
                  </div>
                </OptionGroup>

                <OptionGroup title="Header">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Logo alt text">
                      <Input
                        value={values.storefront.header.logo_alt}
                        onChange={(e) =>
                          setStorefront("header", {
                            ...values.storefront.header,
                            logo_alt: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="Search placeholder">
                      <Input
                        value={values.storefront.header.search_placeholder}
                        onChange={(e) =>
                          setStorefront("header", {
                            ...values.storefront.header,
                            search_placeholder: e.target.value,
                          })
                        }
                      />
                    </Field>
                  </div>
                  <div className="mt-4 space-y-2">
                    <Label className="text-[10px] font-medium text-muted-foreground">
                      Navigation actions
                    </Label>
                    {STOREFRONT_HEADER_ACTIONS.map(({ id, label }, index) => {
                      const action = values.storefront.header.actions[index];
                      const updateAction = (patch: Partial<typeof action>) =>
                        setStorefront("header", {
                          ...values.storefront.header,
                          actions: values.storefront.header.actions.map((a, i) =>
                            i === index ? { ...a, ...patch } : a,
                          ),
                        });
                      return (
                        <div
                          key={id}
                          className="grid items-center gap-2 border border-input p-2 sm:grid-cols-[10rem_1fr_1fr_auto]"
                        >
                          <span className="truncate text-xs text-muted-foreground">{label}</span>
                          <Input
                            value={action.label}
                            placeholder="Label"
                            onChange={(e) => updateAction({ label: e.target.value })}
                          />
                          <Input
                            className="font-mono text-xs"
                            value={action.href}
                            placeholder="Link"
                            onChange={(e) => updateAction({ href: e.target.value })}
                          />
                          <label className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={action.enabled}
                              onChange={(e) => updateAction({ enabled: e.target.checked })}
                            />
                            Show
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </OptionGroup>

                <OptionGroup title="Footer">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Support hours">
                      <Input
                        value={values.storefront.footer.support_hours}
                        onChange={(e) =>
                          setStorefront("footer", {
                            ...values.storefront.footer,
                            support_hours: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="Payment methods image">
                      <Input
                        className="font-mono text-xs"
                        value={values.storefront.footer.payment_image}
                        onChange={(e) =>
                          setStorefront("footer", {
                            ...values.storefront.footer,
                            payment_image: e.target.value,
                          })
                        }
                      />
                    </Field>
                  </div>
                  <div className="mt-4 space-y-2">
                    <Label className="text-[10px] font-medium text-muted-foreground">
                      Memberships
                    </Label>
                    {values.storefront.footer.memberships.map((membership, index) => (
                      <div
                        key={index}
                        className="grid items-center gap-2 border border-input p-2 sm:grid-cols-[1fr_1fr_auto]"
                      >
                        <Input
                          value={membership.name}
                          placeholder="Name"
                          onChange={(e) =>
                            setStorefront("footer", {
                              ...values.storefront.footer,
                              memberships: values.storefront.footer.memberships.map((m, i) =>
                                i === index ? { ...m, name: e.target.value } : m,
                              ),
                            })
                          }
                        />
                        <Input
                          className="font-mono text-xs"
                          value={membership.image}
                          placeholder="Image URL"
                          onChange={(e) =>
                            setStorefront("footer", {
                              ...values.storefront.footer,
                              memberships: values.storefront.footer.memberships.map((m, i) =>
                                i === index ? { ...m, image: e.target.value } : m,
                              ),
                            })
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setStorefront("footer", {
                              ...values.storefront.footer,
                              memberships: values.storefront.footer.memberships.filter(
                                (_, i) => i !== index,
                              ),
                            })
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setStorefront("footer", {
                          ...values.storefront.footer,
                          memberships: [
                            ...values.storefront.footer.memberships,
                            { name: "", image: "" },
                          ],
                        })
                      }
                    >
                      Add membership
                    </Button>
                  </div>
                </OptionGroup>

                <OptionGroup title="Social profiles">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {(
                      [
                        ["facebook", "Facebook URL"],
                        ["instagram", "Instagram URL"],
                        ["youtube", "YouTube URL"],
                      ] as const
                    ).map(([key, label]) => (
                      <Field key={key} label={label}>
                        <Input
                          className="font-mono text-xs"
                          value={values.storefront.social[key]}
                          onChange={(e) =>
                            setStorefront("social", {
                              ...values.storefront.social,
                              [key]: e.target.value,
                            })
                          }
                        />
                      </Field>
                    ))}
                  </div>
                </OptionGroup>

                <OptionGroup title="Theme">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {(
                      [
                        ["primary_color", "Primary color"],
                        ["secondary_color", "Secondary color"],
                        ["header_background", "Header background"],
                        ["footer_background", "Footer background"],
                      ] as const
                    ).map(([key, label]) => (
                      <Field key={key} label={label} hint="hex">
                        <Input
                          className="font-mono text-xs"
                          value={values.storefront.theme[key]}
                          placeholder="#01132d"
                          onChange={(e) =>
                            setStorefront("theme", {
                              ...values.storefront.theme,
                              [key]: e.target.value,
                            })
                          }
                        />
                      </Field>
                    ))}
                    <Field label="Font family" className="sm:col-span-2">
                      <Input
                        value={values.storefront.theme.font_family}
                        onChange={(e) =>
                          setStorefront("theme", {
                            ...values.storefront.theme,
                            font_family: e.target.value,
                          })
                        }
                      />
                    </Field>
                  </div>
                </OptionGroup>

                <OptionGroup title="Meta & notice">
                  <div className="grid gap-4">
                    <Field label="Title template" hint="%s is the page title">
                      <Input
                        value={values.storefront.meta.title_template}
                        placeholder="%s | Againcart"
                        onChange={(e) =>
                          setStorefront("meta", {
                            ...values.storefront.meta,
                            title_template: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="Default description">
                      <Textarea
                        rows={3}
                        value={values.storefront.meta.description}
                        onChange={(e) =>
                          setStorefront("meta", {
                            ...values.storefront.meta,
                            description: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="Notice bar text">
                      <Input
                        value={values.storefront.meta.notice_text}
                        onChange={(e) =>
                          setStorefront("meta", {
                            ...values.storefront.meta,
                            notice_text: e.target.value,
                          })
                        }
                      />
                    </Field>
                  </div>
                </OptionGroup>
              </div>
            </Section>
          )}

          {section === "image" && (
            <Section title="Image">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Store logo" className="sm:col-span-2">
                  <div className="flex gap-3 rounded-none border border-dashed border-input p-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-none border border-border bg-muted/40">
                      {values.storeImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={resolveBrandAssetPreviewUrl(values.storeImage)}
                          alt="Store logo"
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <Package className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="text-xs text-muted-foreground">Select from Media library</p>
                      <Input
                        value={values.storeImage}
                        onChange={(e) => set("storeImage", e.target.value)}
                        placeholder="Media URL"
                        className="font-mono text-xs"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => setLogoLibraryOpen(true)}>
                        Choose from media
                      </Button>
                    </div>
                  </div>
                </Field>
                <Field label="Mobile logo" className="sm:col-span-2">
                  <div className="flex gap-3 rounded-none border border-dashed border-input p-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-none border border-border bg-muted/40">
                      {values.storeImageMobile ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={resolveBrandAssetPreviewUrl(values.storeImageMobile)}
                          alt="Mobile logo"
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <Package className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="text-xs text-muted-foreground">Select from Media library</p>
                      <Input
                        value={values.storeImageMobile}
                        onChange={(e) => set("storeImageMobile", e.target.value)}
                        placeholder="Media URL"
                        className="font-mono text-xs"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => setLogoMobileLibraryOpen(true)}>
                        Choose from media
                      </Button>
                    </div>
                  </div>
                </Field>
                <Field label="Favicon">
                  <div className="flex gap-3 rounded-none border border-dashed border-input p-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-none border border-border bg-muted/40">
                      {values.faviconUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={resolveBrandAssetPreviewUrl(values.faviconUrl)}
                          alt="Favicon"
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <ImagePlus className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="text-xs text-muted-foreground">Select from Media library</p>
                      <Input
                        value={values.faviconUrl}
                        onChange={(e) => set("faviconUrl", e.target.value)}
                        placeholder="Media URL"
                        className="font-mono text-xs"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => setFaviconLibraryOpen(true)}>
                        Choose from media
                      </Button>
                    </div>
                  </div>
                </Field>
                <Field label="Watermark text">
                  <Input value={values.watermarkText} onChange={(e) => set("watermarkText", e.target.value)} />
                </Field>
              </div>
            </Section>
          )}

          {section === "ftp" && (
            <Section title="FTP">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="FTP host">
                  <Input value={values.ftpHost} onChange={(e) => set("ftpHost", e.target.value)} placeholder="ftp.example.com" />
                </Field>
                <Field label="FTP port">
                  <Input value={values.ftpPort} onChange={(e) => set("ftpPort", e.target.value)} />
                </Field>
                <Field label="Username">
                  <Input value={values.ftpUser} onChange={(e) => set("ftpUser", e.target.value)} />
                </Field>
                <Field label="Password">
                  <Input type="password" value={values.ftpPassword} onChange={(e) => set("ftpPassword", e.target.value)} />
                </Field>
                <Field label="Root path" className="sm:col-span-2">
                  <Input value={values.ftpRoot} onChange={(e) => set("ftpRoot", e.target.value)} />
                </Field>
              </div>
            </Section>
          )}

          {section === "mail" && (
            <Section title="Mail / SMS">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="SMTP host">
                  <Input value={values.smtpHost} onChange={(e) => set("smtpHost", e.target.value)} />
                </Field>
                <Field label="SMTP port">
                  <Input value={values.smtpPort} onChange={(e) => set("smtpPort", e.target.value)} />
                </Field>
                <Field label="SMTP username">
                  <Input value={values.smtpUser} onChange={(e) => set("smtpUser", e.target.value)} />
                </Field>
                <Field label="SMTP password">
                  <Input type="password" value={values.smtpPassword} onChange={(e) => set("smtpPassword", e.target.value)} />
                </Field>
                <Field label="SMS gateway">
                  <Select value={values.smsGateway} onChange={(e) => set("smsGateway", e.target.value)}>
                    <option value="BulkSMS BD">BulkSMS BD</option>
                    <option value="Twilio">Twilio</option>
                    <option value="SSL Wireless">SSL Wireless</option>
                  </Select>
                </Field>
                <Field label="SMS API key">
                  <Input value={values.smsApiKey} onChange={(e) => set("smsApiKey", e.target.value)} />
                </Field>
              </div>
            </Section>
          )}

          {section === "server" && (
            <Section title="Server">
              <div className="space-y-3">
                <ToggleField
                  label="Maintenance mode"
                  hint="Show maintenance page to visitors"
                  checked={values.maintenanceMode}
                  onChange={(v) => set("maintenanceMode", v)}
                />
                <ToggleField
                  label="SEO-friendly URLs"
                  checked={values.seoUrls}
                  onChange={(v) => set("seoUrls", v)}
                />
                <ToggleField
                  label="GZIP compression"
                  checked={values.compression}
                  onChange={(v) => set("compression", v)}
                />
              </div>
            </Section>
          )}

          {section === "connections" && (
            <Section title="Connection" wide>
              <div className="grid max-w-2xl gap-4">
                <Field label="Primary domain">
                  <Input className="font-mono text-xs" value={values.primaryDomain} onChange={(e) => set("primaryDomain", e.target.value)} placeholder="shop.example.com" />
                </Field>
                <Field label="Domain aliases (comma-separated)">
                  <Input className="font-mono text-xs" value={values.domainAliases} onChange={(e) => set("domainAliases", e.target.value)} />
                </Field>
                <Field label="Storefront URL (local)">
                  <Input className="font-mono text-xs" value={values.storefrontUrlLocal} onChange={(e) => set("storefrontUrlLocal", e.target.value)} />
                </Field>
                <Field label="Storefront URL (preview)">
                  <Input className="font-mono text-xs" value={values.storefrontUrlPreview} onChange={(e) => set("storefrontUrlPreview", e.target.value)} />
                </Field>
                <Field label="Storefront URL (production)">
                  <Input className="font-mono text-xs" value={values.storefrontUrlProduction} onChange={(e) => set("storefrontUrlProduction", e.target.value)} />
                </Field>
                <div className="border border-border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold">API CORS from site URLs</p>
                    <Button type="button" variant="outline" size="sm" disabled={corsBusy} onClick={() => void (async () => {
                      setCorsBusy(true);
                      try {
                        setCorsOrigins(await refreshSiteCorsOrigins());
                        toast.success("CORS cache refreshed");
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "CORS refresh failed");
                      } finally {
                        setCorsBusy(false);
                      }
                    })()}>{corsBusy ? "Refreshing…" : "Refresh CORS"}</Button>
                  </div>
                  {corsOrigins.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">No origins loaded.</p>
                  ) : (
                    <ul className="mt-2 space-y-1 font-mono text-[11px]">{corsOrigins.map((o) => <li key={o}>{o}</li>)}</ul>
                  )}
                </div>
              </div>
            </Section>
          )}
          {section === "deploy" && (
            <Section title="Git / Vercel">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Git repository URL" className="sm:col-span-2">
                  <Input className="font-mono text-xs" value={values.gitRepoUrl} onChange={(e) => set("gitRepoUrl", e.target.value)} />
                </Field>
                <Field label="Default branch">
                  <Input value={values.gitDefaultBranch} onChange={(e) => set("gitDefaultBranch", e.target.value)} />
                </Field>
                <Field label="Vercel project name">
                  <Input value={values.vercelProjectName} onChange={(e) => set("vercelProjectName", e.target.value)} />
                </Field>
                <Field label="Vercel project ID">
                  <Input className="font-mono text-xs" value={values.vercelProjectId} onChange={(e) => set("vercelProjectId", e.target.value)} />
                </Field>
                <Field label="Vercel team slug">
                  <Input value={values.vercelTeamSlug} onChange={(e) => set("vercelTeamSlug", e.target.value)} />
                </Field>
              </div>
            </Section>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 flex gap-2 border-t border-input bg-background/95 p-3 backdrop-blur sm:hidden">
        <Button variant="outline" size="sm" className="flex-1 rounded-none" asChild>
          <Link href="/workspace/sites">Back</Link>
        </Button>
        <Button size="sm" className="flex-1 rounded-none" onClick={() => void handleSave()} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>

      <MediaLibraryModal
        open={logoLibraryOpen}
        onOpenChange={setLogoLibraryOpen}
        mode="single"
        title="Select store logo"
        accept={["image"]}
        onSelect={(items) => set("storeImage", publicMediaUrl(items[0]?.url) || values.storeImage)}
      />
      <MediaLibraryModal
        open={logoMobileLibraryOpen}
        onOpenChange={setLogoMobileLibraryOpen}
        mode="single"
        title="Select mobile logo"
        accept={["image"]}
        onSelect={(items) =>
          set("storeImageMobile", publicMediaUrl(items[0]?.url) || values.storeImageMobile)
        }
      />
      <MediaLibraryModal
        open={faviconLibraryOpen}
        onOpenChange={setFaviconLibraryOpen}
        mode="single"
        title="Select favicon"
        accept={["image"]}
        onSelect={(items) => set("faviconUrl", publicMediaUrl(items[0]?.url) || values.faviconUrl)}
      />
    </>
  );
}

function Section({
  title,
  children,
  wide,
}: {
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "w-full max-w-4xl" : "w-full max-w-3xl"}>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function OptionGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-none border border-input bg-card p-4">
      <h3 className="mb-3 border-b border-input pb-2 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function TermsSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value={NONE_OPTION}>{NONE_OPTION}</option>
      <option value="terms_privacy">Privacy Policy</option>
      <option value="terms_account">Account Terms</option>
      <option value="terms_checkout">Checkout Terms</option>
    </Select>
  );
}

function OrderStatusSelect({
  value,
  onChange,
  allowNone,
}: {
  value: string;
  onChange: (v: string) => void;
  allowNone?: boolean;
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {allowNone && <option value={NONE_OPTION}>{NONE_OPTION}</option>}
      {ORDER_STATUSES.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </Select>
  );
}

function StatusCheckboxList({
  statuses,
  selected,
  onToggle,
}: {
  statuses: readonly string[];
  selected: string[];
  onToggle: (status: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {statuses.map((status) => (
        <label key={status} className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={selected.includes(status)}
            onChange={() => onToggle(status)}
            className="rounded border-input"
          />
          <span>{status}</span>
        </label>
      ))}
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="text-[10px] font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
        {hint && <span className="ml-1 font-normal">({hint})</span>}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function YesNoField({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  // Radios need a group name of their own — a shared one makes every Yes/No
  // toggle on the page fight over a single selection.
  const group = useId();

  return (
    <div className="flex gap-4">
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="radio"
          name={group}
          checked={value}
          onChange={() => onChange(true)}
          className="border-input"
        />
        Yes
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="radio"
          name={group}
          checked={!value}
          onChange={() => onChange(false)}
          className="border-input"
        />
        No
      </label>
    </div>
  );
}

function ToggleField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-none border border-input px-3 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 rounded border-input"
      />
      <span>
        <span className="text-sm font-medium">{label}</span>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </span>
    </label>
  );
}
