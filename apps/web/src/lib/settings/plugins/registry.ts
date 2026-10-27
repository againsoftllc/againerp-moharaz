import type { PluginDef } from "./types";

export const PLUGIN_CATEGORIES: Record<
  PluginDef["category"],
  { label: string; description: string }
> = {
  shipping: { label: "Shipping & Delivery", description: "Courier and last-mile delivery" },
  payment: { label: "Payments", description: "Payment gateways and wallets" },
  marketing: { label: "Marketing", description: "SMS, email, and social channels" },
  accounting: { label: "Accounting", description: "Invoicing and bookkeeping" },
  communication: { label: "Communication", description: "WhatsApp, chat, and support" },
  other: { label: "Other", description: "Miscellaneous integrations" },
};

export const PLUGIN_REGISTRY: PluginDef[] = [
  {
    id: "pathao",
    name: "Pathao Courier",
    description: "Automate shipping, tracking, and COD reconciliation with Pathao.",
    longDescription:
      "Connect your store to Pathao Courier for automated shipment creation, live tracking updates, and delivery status sync back to orders.",
    category: "shipping",
    version: "1.0.0",
    author: "Pathao Ltd.",
    website: "https://pathao.com",
    docsUrl: "https://merchant.pathao.com/docs",
    brandColor: "#E52427",
    sections: [
      {
        id: "connection",
        title: "API Connection",
        description: "Credentials from Pathao Merchant Dashboard",
        fields: [],
      },
      {
        id: "pickup",
        title: "Pickup & Delivery",
        fields: [],
      },
      {
        id: "automation",
        title: "Order Automation",
        fields: [],
      },
    ],
  },
  {
    id: "bkash",
    name: "bKash Payment Gateway",
    description: "Accept bKash payments and auto-verify transactions.",
    category: "payment",
    version: "1.0.0",
    author: "bKash Limited",
    website: "https://bkash.com",
    brandColor: "#E2136E",
    sections: [
      {
        id: "credentials",
        title: "Merchant Credentials",
        fields: [
          { key: "username", label: "Username", type: "text", defaultValue: "", required: true },
          { key: "password", label: "Password", type: "password", defaultValue: "", required: true },
          { key: "app_key", label: "App Key", type: "password", defaultValue: "", required: true },
          { key: "app_secret", label: "App Secret", type: "password", defaultValue: "", required: true },
          {
            key: "environment",
            label: "Environment",
            type: "select",
            defaultValue: "sandbox",
            options: [
              { label: "Sandbox", value: "sandbox" },
              { label: "Production", value: "production" },
            ],
          },
        ],
      },
      {
        id: "checkout",
        title: "Checkout",
        fields: [
          { key: "checkout_enabled", label: "Show bKash at Checkout", type: "toggle", defaultValue: true },
          { key: "auto_verify", label: "Auto Verify Payment", type: "toggle", defaultValue: true },
        ],
      },
    ],
  },
  {
    id: "sslcommerz",
    name: "SSLCommerz",
    description: "Card, mobile banking, and wallet payments via SSLCommerz.",
    category: "payment",
    version: "1.0.0",
    author: "SSLCommerz",
    website: "https://sslcommerz.com",
    brandColor: "#1B4F8A",
    sections: [
      {
        id: "credentials",
        title: "Store Credentials",
        fields: [
          { key: "store_id", label: "Store ID", type: "text", defaultValue: "", required: true },
          { key: "store_password", label: "Store Password", type: "password", defaultValue: "", required: true },
          {
            key: "environment",
            label: "Environment",
            type: "select",
            defaultValue: "sandbox",
            options: [
              { label: "Sandbox", value: "sandbox" },
              { label: "Production", value: "production" },
            ],
          },
        ],
      },
      {
        id: "checkout",
        title: "Checkout",
        fields: [
          { key: "checkout_enabled", label: "Show SSLCommerz at Checkout", type: "toggle", defaultValue: true },
        ],
      },
    ],
  },
  {
    id: "paypal",
    name: "PayPal",
    description: "Accept PayPal balance and linked card payments worldwide.",
    category: "payment",
    version: "1.0.0",
    author: "PayPal",
    website: "https://developer.paypal.com",
    brandColor: "#003087",
    sections: [
      {
        id: "credentials",
        title: "API Credentials",
        fields: [
          { key: "client_id", label: "Client ID", type: "password", defaultValue: "", required: true },
          { key: "client_secret", label: "Client Secret", type: "password", defaultValue: "", required: true },
          {
            key: "environment",
            label: "Environment",
            type: "select",
            defaultValue: "sandbox",
            options: [
              { label: "Sandbox", value: "sandbox" },
              { label: "Production", value: "production" },
            ],
          },
          { key: "currency", label: "Charge currency", type: "text", defaultValue: "USD" },
          { key: "bdt_per_usd", label: "BDT per 1 USD", type: "number", defaultValue: 110 },
        ],
      },
      {
        id: "checkout",
        title: "Checkout",
        fields: [
          { key: "checkout_enabled", label: "Show PayPal at Checkout", type: "toggle", defaultValue: true },
        ],
      },
    ],
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Accept cards worldwide via Stripe Checkout.",
    category: "payment",
    version: "1.0.0",
    author: "Stripe",
    website: "https://stripe.com",
    brandColor: "#635BFF",
    sections: [
      {
        id: "credentials",
        title: "API Credentials",
        fields: [
          { key: "publishable_key", label: "Publishable Key", type: "password", defaultValue: "", required: true },
          { key: "secret_key", label: "Secret Key", type: "password", defaultValue: "", required: true },
          {
            key: "environment",
            label: "Environment",
            type: "select",
            defaultValue: "sandbox",
            options: [
              { label: "Sandbox (Test)", value: "sandbox" },
              { label: "Production (Live)", value: "production" },
            ],
          },
          { key: "currency", label: "Charge currency", type: "text", defaultValue: "USD" },
          { key: "bdt_per_usd", label: "BDT per 1 USD", type: "number", defaultValue: 110 },
        ],
      },
      {
        id: "checkout",
        title: "Checkout",
        fields: [
          { key: "checkout_enabled", label: "Show Stripe at Checkout", type: "toggle", defaultValue: true },
        ],
      },
    ],
  },
  {
    id: "ai-search",
    name: "AI Search",
    description: "Shoppers search and ask in Bangla or English — GPT finds the products and answers from your live catalogue.",
    longDescription:
      "Connects OpenAI to the storefront. AI search turns a question like “১ লাখের মধ্যে RTX 4060 ল্যাপটপ” or “asus monitor under 30k” into the right category, brand, price and spec filters; the shopping assistant answers from the live catalogue — real prices, stock and specifications — recommends products as cards and takes follow-up questions. Without this plugin (or without a key) the storefront keeps its plain search.",
    category: "marketing",
    version: "1.0.0",
    author: "AgainERP",
    website: "https://againerp.com",
    brandColor: "#10A37F",
    sections: [
      { id: "connection", title: "OpenAI Connection", description: "The OpenAI API key, verified before it is saved", fields: [] },
      { id: "test", title: "Test", description: "Ask a question and see the filters and the assistant's answer", fields: [] },
    ],
  },
  {
    id: "marketing-tracking",
    name: "Marketing Tracking",
    description: "Google Tag Manager, GA4 and Meta (Facebook) Pixel with Conversions API — set up per storefront site.",
    longDescription:
      "Adds Google Tag Manager, Google Analytics 4 and the Meta Pixel to each storefront site, with its own IDs per site. Choose which shop events reach Meta (page view, product view, add to cart, checkout, purchase, search, sign-up, contact), and send the same events server-side through the Meta Conversions API — deduplicated with the browser Pixel, and the access token never leaves the server.",
    category: "marketing",
    version: "1.0.0",
    author: "AgainERP",
    website: "https://againerp.com",
    brandColor: "#1877F2",
    sections: [
      { id: "sites", title: "Sites & Tags", description: "Google Tag Manager, GA4 and Meta Pixel IDs for each storefront site", fields: [] },
      { id: "events", title: "Pixel Events", description: "Which shop events are sent to Meta", fields: [] },
      { id: "capi", title: "Conversions API", description: "Server-side events with your Meta access token, and a test event", fields: [] },
    ],
  },
  {
    id: "price-update",
    name: "Price Compare",
    description: "Track competitor prices against your catalog — add any website to compare.",
    longDescription:
      "For each catalog product, finds and re-checks the matching price on any competitor website you add (Startech, Ryans, and Techland come pre-added) — via Google Custom Search to locate the page (optional, bring your own API key) plus a live page fetch for the current price. Shows up as extra columns on Catalog → Price Compare. A competitor URL can also be pasted in manually per product without any API key.",
    category: "marketing",
    version: "1.0.0",
    author: "AgainERP",
    appHref: "/website/price-compare",
    brandColor: "#F59E0B",
    sections: [
      {
        id: "settings",
        title: "Settings",
        description: "Google Search API and which competitors to track",
        fields: [],
      },
    ],
  },
  // SMS gateways for storefront sign-in codes — only one is enabled at a time, and it takes over from
  // the SMS key in Site options / platform settings.
  {
    id: "alpha-sms",
    name: "Alpha SMS",
    description: "OTP and transactional SMS via Alpha SMS (sms.net.bd).",
    longDescription:
      "Configure your Alpha SMS API key from sms.net.bd. When enabled, storefront sign-in codes are sent through this gateway. Use Check now to verify delivery.",
    category: "marketing",
    version: "1.0.0",
    author: "Alpha SMS",
    website: "https://sms.net.bd",
    docsUrl: "https://api.sms.net.bd/sendsms",
    brandColor: "#7C3AED",
    sections: [
      { id: "credentials", title: "API Credentials", fields: [] },
      { id: "test", title: "Check now", fields: [] },
    ],
  },
  {
    id: "bulksms-bd",
    name: "BulkSMS BD",
    description: "Send OTP and transactional SMS via BulkSMS Bangladesh.",
    longDescription:
      "Configure BulkSMS BD API key and sender ID. When enabled, storefront sign-in codes are sent through this gateway. Use Check now to send a test SMS.",
    category: "marketing",
    version: "1.0.0",
    author: "BulkSMS BD",
    website: "https://bulksmsbd.net",
    brandColor: "#0EA5E9",
    sections: [
      { id: "credentials", title: "API Credentials", fields: [] },
      { id: "test", title: "Check now", fields: [] },
    ],
  },
  {
    id: "ssl-wireless",
    name: "SSL Wireless SMS",
    description: "OTP and transactional SMS via SSL Wireless.",
    longDescription:
      "Connect SSL Wireless SMSPlus credentials. Enabling this gateway disables the other SMS plugins so only one provider sends codes.",
    category: "marketing",
    version: "1.0.0",
    author: "SSL Wireless",
    website: "https://www.sslwireless.com",
    brandColor: "#1B4F8A",
    sections: [
      { id: "credentials", title: "API Credentials", fields: [] },
      { id: "test", title: "Check now", fields: [] },
    ],
  },
  {
    id: "zaman-it",
    name: "Zaman IT SMS",
    description: "OTP SMS delivery through Zaman IT gateway.",
    longDescription:
      "Store Zaman IT API key/secret and sender. Storefront sign-in codes use the enabled SMS plugin.",
    category: "marketing",
    version: "1.0.0",
    author: "Zaman IT",
    website: "https://zaman-it.com",
    brandColor: "#059669",
    sections: [
      { id: "credentials", title: "API Credentials", fields: [] },
      { id: "test", title: "Check now", fields: [] },
    ],
  },
  {
    id: "zkteco",
    name: "ZKTeco Attendance",
    description: "Receive biometric punches from ZKTeco devices via ADMS PUSH.",
    longDescription:
      "Device connection plugin for attendance. Point the terminal ADMS server to this API (/iclock). Punches are stored and shown in the List section — same protocol as the ZKTeco test project.",
    category: "other",
    version: "1.0.0",
    author: "AgainERP",
    website: "https://www.zkteco.com",
    brandColor: "#0EA5E9",
    sections: [
      {
        id: "connection",
        title: "Connection",
        description: "ADMS receiver settings and device status",
        fields: [],
      },
      {
        id: "list",
        title: "List",
        description: "Real attendance punches from devices",
        fields: [],
      },
    ],
  },
  {
    id: "again-builder",
    name: "Again Builder",
    description: "PC Builder powered by Catalog (more builders later).",
    longDescription:
      "Install Again Builder to enable Catalog → Builders. Start with PC Builder; CCTV, Laptop, and custom builders can be enabled later. Products come from Catalog categories whose slug matches each builder slot.",
    category: "other",
    version: "1.0.0",
    author: "AgainERP",
    website: "https://againerp.com",
    docsUrl: "/website/product-configurator",
    brandColor: "#4F46E5",
    sections: [
      {
        id: "builders",
        title: "Builders",
        description: "Enable storefront builders and open the admin",
        fields: [],
      },
    ],
  },
  {
    id: "smart-pc-builder",
    name: "Smart PC Builder",
    description: "Real compatibility checking for the storefront PC builder — sockets, RAM type, cooler fit, PSU headroom.",
    longDescription:
      "A rule-based PC-part compatibility engine: slots and rules, chipset/alias/override lookups, a live rule tester, Ready Builds, and storefront settings — all in one workspace. Install to make the compatibility-checked /smart-pc-builder page reachable on the storefront.",
    category: "other",
    version: "1.0.0",
    author: "AgainERP",
    website: "https://againerp.com",
    brandColor: "#059669",
    sections: [
      { id: "overview", title: "Overview", description: "Per-slot product count and data-completeness health check", fields: [] },
      { id: "tabs-slots", title: "Tabs & Slots", description: "Component slots — CPU, RAM, GPU, and the rest", fields: [] },
      { id: "rules", title: "Rules", description: "IF/THEN/ELSE compatibility rules", fields: [] },
      { id: "lookup-alias", title: "Lookup & Alias", description: "Chipset→socket lookup, value aliases, slot include/exclude", fields: [] },
      { id: "overrides", title: "Overrides", description: "Per-product spec corrections", fields: [] },
      { id: "test-build", title: "Test Build", description: "Live evaluator against real catalog attributes", fields: [] },
      { id: "ready-builds", title: "Ready Builds", description: "Admin-curated prebuilt PCs with discounts and a publish gate", fields: [] },
      { id: "storefront", title: "Storefront", description: "Live page preview and the customer page link", fields: [] },
      { id: "general", title: "General", description: "What customers see in the builder: hide or grey out parts, sorting, currency", fields: [] },
    ],
  },
  {
    id: "bank-emi",
    name: "Bank EMI Calculator",
    description: "Show bank-wise EMI installment plans on product, cart, and PC builder.",
    longDescription:
      "Apple Gadgets–style EMI modal — customers compare monthly installments across AB Bank, Brac, Bank Asia, and more. Admin configures tenure rates and minimum order amount.",
    category: "payment",
    version: "1.0.0",
    author: "AgainERP",
    website: "https://again.com.bd",
    brandColor: "#D97706",
    sections: [
      {
        id: "general",
        title: "General",
        fields: [
          {
            key: "plugin_enabled",
            label: "Enable EMI on storefront",
            type: "toggle",
            defaultValue: true,
          },
          {
            key: "min_order_amount",
            label: "Minimum order amount (BDT)",
            type: "number",
            defaultValue: 5000,
            required: true,
          },
          {
            key: "label_en",
            label: "PDP label (EN)",
            type: "text",
            defaultValue: "EMI Available for orders above ৳ {min}",
          },
          {
            key: "label_bn",
            label: "PDP label (BN)",
            type: "text",
            defaultValue: "{min} টাকার বেশি অর্ডারে কিস্তি সুবিধা",
          },
        ],
      },
      {
        id: "display",
        title: "Display surfaces",
        fields: [
          { key: "show_on_pdp", label: "Product page", type: "toggle", defaultValue: true },
          { key: "show_on_cart", label: "Shopping cart", type: "toggle", defaultValue: true },
          { key: "show_on_builder", label: "PC Builder summary", type: "toggle", defaultValue: true },
        ],
      },
      {
        id: "banks",
        title: "Banks & Plans",
        description: "Add banks and set EMI charge % per tenure",
        fields: [],
      },
    ],
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    description: "Verify Cloudflare account, connect R2 media storage, Images API, and CDN.",
    longDescription:
      "Install করার পর API token verify করুন। Verify হলে R2 bucket, Cloudflare Images, এবং media storage (local বা R2) configure করতে পারবেন।",
    category: "other",
    version: "1.0.0",
    author: "Cloudflare",
    website: "https://cloudflare.com",
    docsUrl: "https://developers.cloudflare.com/r2/",
    brandColor: "#F38020",
    sections: [
      {
        id: "account",
        title: "Account Verification",
        description: "API token + Account ID",
        fields: [],
      },
      {
        id: "media",
        title: "Media Storage",
        description: "Local disk or Cloudflare R2",
        fields: [],
      },
      {
        id: "r2",
        title: "R2 Storage",
        description: "Bucket, keys, CDN URL",
        fields: [],
      },
      {
        id: "images",
        title: "Cloudflare Images",
        description: "Optional image API",
        fields: [],
      },
    ],
  },
  {
    id: "china-import",
    name: "China Import (Elim)",
    description:
      "Import products from Taobao / 1688 via Elim openapi — search, staging queue, and catalog mapping.",
    longDescription:
      "Dropshipping product source. Connect Elim API (openapi.elim.asia), search Taobao or 1688, review staging items, then map into catalog.",
    category: "other",
    version: "1.0.0",
    author: "AgainERP",
    website: "https://openapi.elim.asia",
    docsUrl: "https://openapi.elim.asia",
    appHref: "/plugins/china-import",
    brandColor: "#E11D48",
    sections: [
      {
        id: "connection",
        title: "Elim API",
        description: "Configure keys inside the China Import app (Settings tab).",
        fields: [
          {
            key: "default_platform",
            label: "Default marketplace",
            type: "select",
            defaultValue: "taobao",
            options: [
              { label: "Taobao", value: "taobao" },
              { label: "1688 / Alibaba", value: "alibaba" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "again-drop-api",
    name: "AgainDropAPI (Dropshipping)",
    description: "Connect AgainDrop API credentials for China dropshipping product imports.",
    longDescription:
      "AgainDropAPI stores the AgainDrop API connection used for Taobao / 1688 dropshipping. Configure base URL, API key, environment, and default marketplace. Catalog import and dropshipping tools read these settings when enabled.",
    category: "other",
    version: "1.0.0",
    author: "AgainSoft",
    website: "https://againsoft.com",
    docsUrl: "/plugins/again-drop-api",
    appHref: "/plugins/again-drop-api",
    brandColor: "#0F766E",
    sections: [
      {
        id: "connection",
        title: "AgainDrop API Connection",
        description: "Credentials and endpoint for AgainDrop API",
        fields: [
          {
            key: "base_url",
            label: "API Base URL",
            type: "url",
            defaultValue: "https://openapi.elim.asia",
            placeholder: "AgainDrop API base URL",
            required: true,
          },
          {
            key: "api_key",
            label: "API Key",
            description:
              "Enter your AgainDrop API key here, then click Save Configuration. Leave empty to use the server key from apps/api/.env",
            type: "password",
            defaultValue: "__server_again_drop_key__",
            placeholder: "Paste API key, then Save",
            required: false,
          },
          {
            key: "use_server_key",
            label: "Use server AgainDrop API key",
            description:
              "On = server key. Off = uses the API Key field above. Typing a custom key turns this off automatically.",
            type: "toggle",
            defaultValue: true,
          },
          {
            key: "environment",
            label: "Environment",
            type: "select",
            defaultValue: "sandbox",
            options: [
              { label: "Sandbox (Testing)", value: "sandbox" },
              { label: "Production (Live)", value: "production" },
            ],
          },
          {
            key: "timeout_ms",
            label: "Timeout (ms)",
            type: "number",
            defaultValue: 30000,
          },
          {
            key: "retry_count",
            label: "Retry count",
            type: "number",
            defaultValue: 1,
          },
        ],
      },
      {
        id: "defaults",
        title: "Import Defaults",
        description: "Default marketplace and language for product search",
        fields: [
          {
            key: "default_platform",
            label: "Default marketplace",
            type: "select",
            defaultValue: "taobao",
            options: [
              { label: "Taobao", value: "taobao" },
              { label: "1688 / Alibaba", value: "alibaba" },
            ],
          },
          {
            key: "default_lang",
            label: "Default language",
            type: "select",
            defaultValue: "en",
            options: [
              { label: "English", value: "en" },
              { label: "Vietnamese", value: "vi" },
              { label: "Chinese", value: "zh" },
            ],
          },
        ],
      },
    ],
  },
];

export function findPlugin(id: string): PluginDef | undefined {
  return PLUGIN_REGISTRY.find((p) => p.id === id);
}

export function buildPluginDefaults(plugin: PluginDef): Record<string, string | boolean | number> {
  const config: Record<string, string | boolean | number> = {};
  for (const section of plugin.sections) {
    for (const field of section.fields) {
      config[field.key] = field.defaultValue;
    }
  }
  return config;
}

export function getAllPluginFieldKeys(plugin: PluginDef): string[] {
  return plugin.sections.flatMap((s) => s.fields.map((f) => f.key));
}
