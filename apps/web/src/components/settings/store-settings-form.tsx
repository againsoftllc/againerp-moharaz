"use client";

import { useCallback, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Globe,
  HardDrive,
  ImagePlus,
  Link2,
  Mail,
  Package,
  Server,
  Settings2,
  SlidersHorizontal,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import type { StoreRecord } from "@/lib/mock-data/stores";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { MediaLibraryModal } from "@/components/media/media-library-modal";
import { SiteConnectionSettings } from "@/components/workspace/connected-websites/site-connection-settings";
import { STORE_STATUS_LABELS } from "@/lib/mock-data/stores";

const SECTIONS = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "store", label: "Store", icon: Store },
  { id: "local", label: "Local", icon: Globe },
  { id: "option", label: "Option", icon: SlidersHorizontal },
  { id: "image", label: "Image", icon: ImagePlus },
  { id: "ftp", label: "FTP", icon: HardDrive },
  { id: "mail", label: "Mail / SMS", icon: Mail },
  { id: "server", label: "Server", icon: Server },
  { id: "connections", label: "Connection", icon: Link2 },
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
const NONE_OPTION = "--- None ---";

type SectionId = (typeof SECTIONS)[number]["id"];

type StoreSettingsValues = {
  storeName: string;
  storeOwner: string;
  storeAddress: string;
  storeEmail: string;
  storePhone: string;
  storeImage: string;
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
};

function valuesFromStore(store: StoreRecord): StoreSettingsValues {
  return {
    storeName: store.name,
    storeOwner: store.owner,
    storeAddress: "House 12, Road 5, Dhanmondi, Dhaka 1209",
    storeEmail: `hello@${store.domain}`,
    storePhone: "+880 9612-345678",
    storeImage: "/brand/logo.svg",
    metaTitle: `${store.name} — Online Shopping`,
    metaDescription: `Shop quality products at ${store.name}. Fast delivery across Bangladesh.`,
    metaKeywords: "online shopping, ecommerce, bangladesh, fashion, electronics",
    template: "default",
    defaultLayout: "common/home",
    country: "Bangladesh",
    region: "Dhaka Division",
    entryRegion: "dropdown",
    language: "English",
    adminLanguage: "English",
    currency: store.currency,
    autoUpdateCurrency: true,
    weightClass: "Kilogram",
    lengthClass: "Centimeter",
    categoryProductCount: true,
    catalogItemsPerPage: "16",
    listDescriptionLimit: "100",
    adminItemsPerPage: "100",
    allowReviews: true,
    allowGuestReviews: false,
    newReviewAlertMail: true,
    voucherMin: "1",
    voucherMax: "1000",
    displayPricesWithTax: true,
    useStoreTaxAddress: "Shipping Address",
    useCustomerTaxAddress: "Shipping Address",
    customersOnline: true,
    otpVerification: true,
    defaultCustomerGroup: "Default",
    loginDisplayPrices: false,
    maxLoginAttempts: "5",
    accountTerms: NONE_OPTION,
    newAccountAlertMail: true,
    invoicePrefix: "HPEX-2022-00",
    apiUser: NONE_OPTION,
    displayWeightOnCart: true,
    guestCheckout: true,
    checkoutTerms: NONE_OPTION,
    orderStatus: "Pending",
    orderPrintStatus: NONE_OPTION,
    processingOrderStatuses: ["Processing", "Pending"],
    completeOrderStatuses: ["Complete", "Shipped"],
    newOrderAlertMessage: true,
    displayStock: true,
    showOutOfStockWarning: true,
    stockCheckout: false,
    affiliateRequiresApproval: true,
    automaticCommission: true,
    affiliateCommission: "5.00",
    affiliateTerms: NONE_OPTION,
    newAffiliateAlertMail: true,
    returnTerms: NONE_OPTION,
    returnStatus: "Pending",
    faviconUrl: "/favicon.ico",
    watermarkText: store.code,
    ftpHost: "",
    ftpPort: "21",
    ftpUser: "",
    ftpPassword: "",
    ftpRoot: "/public_html/image/",
    smtpHost: "smtp.mailgun.org",
    smtpPort: "587",
    smtpUser: "postmaster@again.com.bd",
    smtpPassword: "",
    smsGateway: "BulkSMS BD",
    smsApiKey: "",
    maintenanceMode: false,
    seoUrls: true,
    compression: true,
  };
}

type Props = {
  store: StoreRecord;
};

export function StoreSettingsForm({ store }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<SectionId>("general");
  const [values, setValues] = useState<StoreSettingsValues>(() => valuesFromStore(store));
  const [logoLibraryOpen, setLogoLibraryOpen] = useState(false);

  const set = useCallback(<K extends keyof StoreSettingsValues>(key: K, value: StoreSettingsValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
  }, []);

  const toggleStatus = useCallback((key: "processingOrderStatuses" | "completeOrderStatuses", status: string) => {
    setValues((v) => {
      const list = v[key];
      const next = list.includes(status) ? list.filter((s) => s !== status) : [...list, status];
      return { ...v, [key]: next };
    });
  }, []);

  const selectSection = (id: SectionId) => {
    setSection(id);
    contentRef.current?.scrollTo({ top: 0 });
  };

  const handleSave = () => {
    toast.success(`${store.name} settings saved (mock)`);
  };

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
              variant={store.status === "active" ? "success" : "secondary"}
              className="rounded-none px-1.5 py-0 text-[10px]"
            >
              {STORE_STATUS_LABELS[store.status]}
            </Badge>
          </div>
          <div className="hidden shrink-0 gap-1.5 sm:flex">
            <Button variant="outline" size="sm" className="rounded-none" asChild>
              <Link href="/workspace/sites">Back to list</Link>
            </Button>
            <Button size="sm" className="rounded-none" onClick={handleSave}>
              Save settings
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
                <Field label="Image" className="sm:col-span-2">
                  <Input value={values.storeImage} onChange={(e) => set("storeImage", e.target.value)} placeholder="/path/to/logo.png" />
                  <div className="mt-3 flex gap-3 rounded-none border border-dashed border-input p-4">
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-none border bg-muted/40">
                      {values.storeImage ? (
                        <img src={values.storeImage} alt="Store" className="h-full w-full object-contain" />
                      ) : (
                        <Package className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">Store logo</p>
                      <p className="text-xs text-muted-foreground">Upload from Media library (prototype)</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => setLogoLibraryOpen(true)}
                      >
                        Choose image
                      </Button>
                    </div>
                  </div>
                </Field>
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

          {section === "image" && (
            <Section title="Image">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Favicon URL">
                  <Input value={values.faviconUrl} onChange={(e) => set("faviconUrl", e.target.value)} />
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
            <Section title="Website connection" wide>
              <SiteConnectionSettings
                siteId={store.id}
                siteName={store.name}
                siteDomain={store.domain}
              />
            </Section>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 flex gap-2 border-t border-input bg-background/95 p-3 backdrop-blur sm:hidden">
        <Button variant="outline" size="sm" className="flex-1 rounded-none" asChild>
          <Link href="/workspace/sites">Back</Link>
        </Button>
        <Button size="sm" className="flex-1 rounded-none" onClick={handleSave}>
          Save
        </Button>
      </div>
    </div>

      <MediaLibraryModal
        open={logoLibraryOpen}
        onOpenChange={setLogoLibraryOpen}
        mode="single"
        title="Select store logo"
        accept={["image"]}
        onSelect={(items) => set("storeImage", items[0]?.url ?? values.storeImage)}
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
