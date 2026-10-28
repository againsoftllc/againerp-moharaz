import type { SettingCategoryDef, SettingItemDef, SettingsLayer } from "@/lib/settings/types";

export const BUSINESS_SETTINGS_CATEGORIES: SettingCategoryDef[] = [
  {
    id: "store",
    title: "Store",
    description: "Store identity and business information",
    sections: [
      {
        id: "identity",
        title: "Store Identity",
        groups: [
          {
            id: "general",
            title: "General",
            items: [
              { key: "store.name", label: "Store Name", type: "text", defaultValue: "AgainERP" },
              { key: "store.email", label: "Email", type: "text", defaultValue: "sales@again.com.bd" },
              { key: "store.phone", label: "Phone", type: "text", defaultValue: "+880 9612-345678" },
              { key: "store.address", label: "Address", type: "textarea", defaultValue: "House 12, Road 5, Dhanmondi, Dhaka" },
              { key: "store.hours", label: "Business Hours", type: "text", defaultValue: "Sat–Thu 10:00–20:00" },
            ],
          },
          {
            id: "branding",
            title: "Branding",
            items: [
              { key: "store.logo", label: "Logo URL", type: "text", defaultValue: "/brand/logo.svg" },
              { key: "store.favicon", label: "Favicon URL", type: "text", defaultValue: "/favicon.ico" },
            ],
          },
          {
            id: "social",
            title: "Social Profiles",
            items: [
              { key: "social.facebook", label: "Facebook URL", type: "text", defaultValue: "" },
              { key: "social.instagram", label: "Instagram URL", type: "text", defaultValue: "" },
              { key: "social.youtube", label: "YouTube URL", type: "text", defaultValue: "" },
            ],
          },
          {
            id: "numbering",
            title: "Document Numbering",
            items: [
              { key: "store.invoice_prefix", label: "Invoice Prefix", type: "text", defaultValue: "INV" },
              { key: "store.order_prefix", label: "Order Prefix", type: "text", defaultValue: "ORD" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "catalog",
    title: "Catalog",
    description: "Catalog and product behavior",
    sections: [
      {
        id: "general",
        title: "General",
        groups: [
          {
            id: "products",
            title: "Products",
            items: [
              { key: "catalog.approval_required", label: "Product Approval Required", type: "toggle", defaultValue: false },
              {
                key: "catalog.default_status",
                label: "Default Product Status",
                type: "select",
                defaultValue: "draft",
                options: [
                  { label: "Draft", value: "draft" },
                  { label: "Published", value: "published" },
                ],
              },
              { key: "catalog.sku_auto", label: "SKU Generation", type: "toggle", defaultValue: true },
              { key: "catalog.barcode_auto", label: "Barcode Generation", type: "toggle", defaultValue: true },
            ],
          },
        ],
      },
      {
        id: "reviews",
        title: "Reviews",
        groups: [
          {
            id: "review_rules",
            title: "Review Rules",
            items: [
              { key: "catalog.reviews_enabled", label: "Enable Reviews", type: "toggle", defaultValue: true },
              { key: "catalog.review_approval", label: "Review Approval", type: "toggle", defaultValue: true },
              { key: "catalog.verified_only", label: "Verified Purchase Reviews", type: "toggle", defaultValue: false },
            ],
          },
        ],
      },
      {
        id: "inventory",
        title: "Inventory Rules",
        groups: [
          {
            id: "stock",
            title: "Stock Control",
            items: [
              { key: "catalog.allow_backorders", label: "Allow Backorders", type: "toggle", defaultValue: false },
              { key: "catalog.show_oos", label: "Show Out of Stock Products", type: "toggle", defaultValue: true },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "customers",
    title: "Customers",
    description: "Customer registration, profile options, and engagement",
    sections: [
      {
        id: "registration",
        title: "Registration",
        groups: [
          {
            id: "signup",
            title: "Sign Up",
            items: [
              { key: "customers.registration", label: "Customer Registration", type: "toggle", defaultValue: true },
              { key: "customers.guest_checkout", label: "Guest Checkout", type: "toggle", defaultValue: true },
              { key: "customers.email_verify", label: "Email Verification", type: "toggle", defaultValue: false },
              { key: "customers.phone_verify", label: "Phone Verification", type: "toggle", defaultValue: true },
            ],
          },
        ],
      },
      {
        id: "account_menu",
        title: "Customer Panel",
        groups: [
          {
            id: "account_menu_sections",
            title: "Storefront Account Menu",
            items: [
              {
                key: "account_menu.wishlist",
                label: "Wishlist",
                description: "Dashboard, Orders and Profile always show and cannot be hidden.",
                type: "toggle",
                defaultValue: true,
              },
              { key: "account_menu.payments", label: "Payments", type: "toggle", defaultValue: true },
              {
                key: "account_menu.returns",
                label: "Return & Refund",
                description: "Customer's product/order returns and their refunds.",
                type: "toggle",
                defaultValue: true,
              },
              { key: "account_menu.qc", label: "QC", type: "toggle", defaultValue: false },
              { key: "account_menu.complain", label: "Complain", type: "toggle", defaultValue: false },
              { key: "account_menu.support", label: "Support", type: "toggle", defaultValue: false },
              { key: "account_menu.points", label: "Points", type: "toggle", defaultValue: false },
              { key: "account_menu.delivery", label: "Delivery", type: "toggle", defaultValue: false },
            ],
          },
        ],
      },
      {
        id: "profile_options",
        title: "Customer Profile",
        groups: [
          {
            id: "drawer_tabs",
            title: "Profile Tabs",
            items: [
              { key: "customers.tab_overview", label: "Overview Tab", type: "toggle", defaultValue: true },
              { key: "customers.tab_orders", label: "Orders Tab", type: "toggle", defaultValue: true },
              { key: "customers.tab_payment", label: "Payment Tab", type: "toggle", defaultValue: true },
              { key: "customers.tab_support", label: "Support Tab", type: "toggle", defaultValue: false },
              { key: "customers.tab_loyalty", label: "Loyalty Tab", type: "toggle", defaultValue: false },
              { key: "customers.tab_history", label: "History Tab", type: "toggle", defaultValue: false },
            ],
          },
          {
            id: "profile_fields",
            title: "Profile Fields",
            items: [
              { key: "customers.field_photo", label: "Profile Photo", type: "toggle", defaultValue: true },
              { key: "customers.field_company", label: "Company", type: "toggle", defaultValue: true },
              { key: "customers.field_email", label: "Email", type: "toggle", defaultValue: true },
              { key: "customers.field_phone", label: "Phone", type: "toggle", defaultValue: true },
              { key: "customers.field_additional_phone", label: "Additional Phone", type: "toggle", defaultValue: true },
              { key: "customers.field_group", label: "Customer Group", type: "toggle", defaultValue: true },
              { key: "customers.field_status", label: "Status", type: "toggle", defaultValue: true },
              { key: "customers.field_tags", label: "Tags", type: "toggle", defaultValue: true },
              { key: "customers.field_addresses", label: "Addresses", type: "toggle", defaultValue: true },
            ],
          },
          {
            id: "finance_fields",
            title: "Payment Fields",
            items: [
              { key: "customers.opening_balance", label: "Opening Balance", type: "toggle", defaultValue: true },
              { key: "customers.credit_limit", label: "Credit Limit", type: "toggle", defaultValue: true },
              { key: "customers.payment_history", label: "Payment History", type: "toggle", defaultValue: true },
            ],
          },
        ],
      },
      {
        id: "engagement",
        title: "Engagement",
        groups: [
          {
            id: "loyalty_wallet",
            title: "Loyalty & Wallet",
            items: [
              { key: "customers.reward_points", label: "Reward Points", type: "toggle", defaultValue: true },
              { key: "customers.wallet", label: "Wallet System", type: "toggle", defaultValue: true },
              { key: "customers.wishlist", label: "Wishlist", type: "toggle", defaultValue: true },
              { key: "customers.whatsapp", label: "WhatsApp", type: "toggle", defaultValue: true },
            ],
          },
        ],
      },
      {
        id: "module_nav",
        title: "Customers Menu",
        groups: [
          {
            id: "menu_items",
            title: "Visible Menu Items",
            items: [
              { key: "customers.nav_groups", label: "Customer Groups", type: "toggle", defaultValue: true },
              { key: "customers.nav_segments", label: "Segments", type: "toggle", defaultValue: true },
              { key: "customers.nav_loyalty", label: "Loyalty Program", type: "toggle", defaultValue: false },
              { key: "customers.nav_rewards", label: "Rewards", type: "toggle", defaultValue: true },
              { key: "customers.nav_wallet", label: "Wallet", type: "toggle", defaultValue: true },
              { key: "customers.nav_wishlists", label: "Wishlists", type: "toggle", defaultValue: true },
              { key: "customers.nav_activities", label: "Activities", type: "toggle", defaultValue: true },
              { key: "customers.nav_support", label: "Support", type: "toggle", defaultValue: false },
              { key: "customers.nav_marketing", label: "Marketing", type: "toggle", defaultValue: true },
              { key: "customers.nav_reports", label: "Reports", type: "toggle", defaultValue: true },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "sales",
    title: "Sales",
    description: "Sales order drawer tabs, actions, options, and menu",
    sections: [
      {
        id: "order_drawer",
        title: "Order Drawer",
        groups: [
          {
            id: "drawer_tabs",
            title: "Tabs",
            items: [
              { key: "sales.tab_shipping", label: "Shipping Tab", type: "toggle", defaultValue: true },
              { key: "sales.tab_payment", label: "Payment Tab", type: "toggle", defaultValue: true },
              { key: "sales.tab_others", label: "Others Tab", type: "toggle", defaultValue: true },
              { key: "sales.tab_history", label: "History Tab", type: "toggle", defaultValue: true },
            ],
          },
          {
            id: "drawer_actions",
            title: "Actions",
            items: [
              { key: "sales.action_confirm", label: "Confirm", type: "toggle", defaultValue: true },
              { key: "sales.action_preview", label: "Preview", type: "toggle", defaultValue: true },
              { key: "sales.action_print", label: "Print", type: "toggle", defaultValue: true },
              { key: "sales.action_new", label: "New", type: "toggle", defaultValue: true },
            ],
          },
          {
            id: "drawer_options",
            title: "Options",
            items: [
              { key: "sales.option_discounts", label: "Discounts", type: "toggle", defaultValue: true },
              { key: "sales.option_taxes", label: "Taxes", type: "toggle", defaultValue: false },
              { key: "sales.option_shipping_charge", label: "Shipping Charge", type: "toggle", defaultValue: true },
              { key: "sales.option_register_payment", label: "Register Payment", type: "toggle", defaultValue: true },
              { key: "sales.option_line_sections", label: "Sections & Notes", type: "toggle", defaultValue: true },
              { key: "sales.option_customer_reference", label: "Customer Reference", type: "toggle", defaultValue: true },
              { key: "sales.option_campaign", label: "Campaign", type: "toggle", defaultValue: true },
              { key: "sales.option_tracking_source", label: "Source", type: "toggle", defaultValue: true },
            ],
          },
        ],
      },
      {
        id: "sales_menu",
        title: "Sales Menu",
        groups: [
          {
            id: "menu_items",
            title: "Visible Menu Items",
            items: [
              { key: "sales.nav_quotations", label: "Quotations", type: "toggle", defaultValue: true },
              { key: "sales.nav_dropship", label: "1688 Dropship", type: "toggle", defaultValue: true },
              { key: "sales.nav_sales_teams", label: "Sales Teams", type: "toggle", defaultValue: true },
              { key: "sales.nav_to_invoice", label: "To Invoice", type: "toggle", defaultValue: true },
              { key: "sales.nav_products", label: "Products Menu", type: "toggle", defaultValue: true },
              { key: "sales.nav_reporting", label: "Reporting", type: "toggle", defaultValue: true },
              { key: "sales.nav_delivery_methods", label: "Delivery Methods", type: "toggle", defaultValue: true },
              { key: "sales.nav_payment_methods", label: "Payment Methods", type: "toggle", defaultValue: true },
              { key: "sales.nav_activities", label: "Activities", type: "toggle", defaultValue: true },
              { key: "sales.nav_config_extra", label: "Extra Config Pages", type: "toggle", defaultValue: true },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "orders",
    title: "Orders",
    description: "Order workflow and fulfillment rules",
    sections: [
      {
        id: "workflow",
        title: "Order Workflow",
        groups: [
          {
            id: "automation",
            title: "Automation",
            items: [
              {
                key: "orders.workflow",
                label: "Order Workflow",
                type: "select",
                defaultValue: "standard",
                options: [
                  { label: "Standard", value: "standard" },
                  { label: "Express", value: "express" },
                  { label: "B2B Approval", value: "b2b" },
                ],
              },
              { key: "orders.auto_confirm", label: "Auto Confirmation", type: "toggle", defaultValue: false },
              { key: "orders.auto_complete", label: "Auto Completion", type: "toggle", defaultValue: false },
            ],
          },
          {
            id: "returns",
            title: "Returns & Refunds",
            items: [
              { key: "orders.return_days", label: "Return Window (days)", type: "number", defaultValue: 7 },
              { key: "orders.refund_auto", label: "Auto Refund on Return", type: "toggle", defaultValue: false },
              { key: "orders.invoice_auto", label: "Auto Generate Invoice", type: "toggle", defaultValue: true },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "checkout",
    title: "Checkout",
    description: "Checkout experience and rules",
    sections: [
      {
        id: "experience",
        title: "Checkout Experience",
        groups: [
          {
            id: "flow",
            title: "Flow",
            items: [
              { key: "checkout.one_page", label: "One Page Checkout", type: "toggle", defaultValue: true },
              { key: "checkout.guest", label: "Guest Checkout", type: "toggle", defaultValue: true },
              { key: "checkout.coupon", label: "Coupon Support", type: "toggle", defaultValue: true },
              { key: "checkout.terms", label: "Terms Agreement Required", type: "toggle", defaultValue: true },
            ],
          },
          {
            id: "limits",
            title: "Order Limits",
            items: [
              { key: "checkout.min_amount", label: "Minimum Order Amount", type: "number", defaultValue: 500 },
              { key: "checkout.max_amount", label: "Maximum Order Amount", type: "number", defaultValue: 500000 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "pcbuilder",
    title: "Smart PC Builder",
    description: "Compatibility messages and storefront behavior",
    sections: [
      {
        id: "language",
        title: "Language",
        groups: [
          {
            id: "messages",
            title: "Message Templates",
            items: [
              {
                key: "pcbuilder.msg.incompatible",
                label: "Incompatible Rule Message",
                description: "Shown when a rule without its own message fails as an error. Use {rule} for the rule's name.",
                type: "textarea",
                defaultValue: "{rule} — these parts are not compatible.",
              },
              {
                key: "pcbuilder.msg.warning",
                label: "Warning Rule Message",
                description: "Shown when a rule without its own message fails as a warning. Use {rule} for the rule's name.",
                type: "textarea",
                defaultValue: "{rule} — please double-check before ordering.",
              },
            ],
          },
        ],
      },
      {
        id: "general",
        title: "General",
        groups: [
          {
            id: "behavior",
            title: "Storefront Behavior",
            items: [
              {
                key: "pcbuilder.language",
                label: "Language / ভাষা",
                description: "Language of this admin panel. English is the default; Bangla shows the texts as they were written.",
                type: "select",
                defaultValue: "en",
                options: [
                  { label: "English", value: "en" },
                  { label: "বাংলা", value: "bn" },
                ],
              },
              {
                key: "pcbuilder.show_incompatible",
                label: "অমিল প্রোডাক্ট লুকাও",
                description: "বিল্ডে আগে বাছা পার্টের সাথে না মেলা প্রোডাক্ট স্লটের লিস্টে ও সার্চে আসবে না। টিক না দিলে ধূসর করে কারণসহ দেখাবে।",
                type: "toggle",
                defaultValue: false,
              },
              {
                key: "pcbuilder.show_coming_soon",
                label: "Coming soon প্রোডাক্ট দেখাও",
                description: "স্টক স্ট্যাটাস Coming Soon থাকলে প্রোডাক্ট দেখাবে (কেনা যাবে না), বন্ধ থাকলে লুকাবে।",
                type: "toggle",
                defaultValue: true,
              },
              {
                key: "pcbuilder.hide_oos",
                label: "স্টক শেষ প্রোডাক্ট লুকাও",
                description: "কাস্টম বিল্ডারের স্লট লিস্ট থেকে Out of stock প্রোডাক্ট সরিয়ে দেবে।",
                type: "toggle",
                defaultValue: false,
              },
              {
                key: "pcbuilder.show_autofilter_notice",
                label: "অটো-ফিল্টারের নোটিশ দেখাও",
                description: "“আপনার বাছাই অনুযায়ী মানানসই প্রোডাক্ট দেখানো হচ্ছে” লেখাটা স্লটের উপরে।",
                type: "toggle",
                defaultValue: true,
              },
              {
                key: "pcbuilder.share_link",
                label: "বিল্ড শেয়ার লিংক",
                description: "কাস্টমার তার বিল্ডের লিংক কপি করে শেয়ার করতে পারবে।",
                type: "toggle",
                defaultValue: true,
              },
              {
                key: "pcbuilder.default_sort",
                label: "ডিফল্ট সর্ট",
                type: "select",
                defaultValue: "popular",
                options: [
                  { label: "Most popular", value: "popular" },
                  { label: "Price: low to high", value: "low" },
                  { label: "Price: high to low", value: "high" },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "payments",
    title: "Payments",
    description: "Payment methods and verification",
    sections: [
      {
        id: "methods",
        title: "Payment Methods",
        groups: [
          {
            id: "enabled",
            title: "Enabled Methods",
            items: [
              { key: "payments.cod", label: "Cash On Delivery", type: "toggle", defaultValue: true },
              { key: "payments.online", label: "Online Payment", type: "toggle", defaultValue: true },
              { key: "payments.bank", label: "Bank Transfer", type: "toggle", defaultValue: true },
              { key: "payments.partial", label: "Partial Payment", type: "toggle", defaultValue: false },
            ],
          },
          {
            id: "verification",
            title: "Verification",
            items: [
              { key: "payments.verify_cod", label: "COD Phone Verification", type: "toggle", defaultValue: true },
              { key: "payments.verify_online", label: "Online Payment Auto-Verify", type: "toggle", defaultValue: true },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "shipping",
    title: "Shipping",
    description: "Shipping zones and delivery",
    sections: [
      {
        id: "delivery",
        title: "Delivery",
        groups: [
          {
            id: "rules",
            title: "Shipping Rules",
            items: [
              {
                key: "shipping.free_threshold",
                label: "Free Shipping Above (BDT)",
                description: "Set 0 to disable free shipping. Orders at/above this amount get free Home Delivery.",
                type: "number",
                defaultValue: 0,
              },
              { key: "shipping.default_method", label: "Default Method", type: "select", defaultValue: "standard", options: [
                { label: "Standard", value: "standard" },
                { label: "Express", value: "express" },
                { label: "Same Day", value: "same_day" },
                { label: "Store Pickup", value: "pickup" },
              ]},
              { key: "shipping.time_slots", label: "Delivery Time Slots", type: "toggle", defaultValue: true },
            ],
          },
          {
            id: "methods",
            title: "Checkout Methods",
            items: [
              { key: "shipping.method_standard", label: "Home Delivery (Standard)", type: "toggle", defaultValue: true },
              { key: "shipping.method_express", label: "Express Delivery", type: "toggle", defaultValue: true },
              { key: "shipping.method_same_day", label: "Same Day Delivery", type: "toggle", defaultValue: false },
              { key: "shipping.method_pickup", label: "Store Pickup", type: "toggle", defaultValue: true },
            ],
          },
          {
            id: "flat_rates",
            title: "Flat Rates (BDT)",
            items: [
              {
                key: "shipping.rate_default",
                label: "Default District Rate",
                description: "Used when a district has no specific rate",
                type: "number",
                defaultValue: 120,
              },
              { key: "shipping.rate_express", label: "Express Flat Rate", type: "number", defaultValue: 150 },
              { key: "shipping.rate_same_day", label: "Same Day Flat Rate", type: "number", defaultValue: 200 },
            ],
          },
          {
            id: "zones",
            title: "Districts",
            items: [
              {
                key: "shipping.zones",
                label: "Checkout Districts",
                description: "Comma-separated. Each district gets its own delivery price below after save/reload.",
                type: "textarea",
                defaultValue: "Dhaka,Chattogram,Khulna,Rajshahi,Sylhet,Barishal,Rangpur,Mymensingh",
              },
              {
                key: "shipping.district_rates",
                label: "District Rates (JSON)",
                description: 'Auto-managed by the district price grid. Format: {"Dhaka":60,"Chattogram":120}',
                type: "textarea",
                defaultValue:
                  '{"Dhaka":60,"Chattogram":120,"Khulna":120,"Rajshahi":120,"Sylhet":120,"Barishal":120,"Rangpur":120,"Mymensingh":120}',
              },
            ],
          },
        ],
      },
      {
        id: "tax",
        title: "Tax",
        groups: [
          {
            id: "tax_rules",
            title: "Storefront Tax",
            items: [
              {
                key: "tax.rate_percent",
                label: "Tax Rate (%)",
                description: "Applied to the order total at checkout. Set 0 to charge no tax.",
                type: "number",
                defaultValue: 0,
              },
              {
                key: "tax.label",
                label: "Tax Label",
                description: "Shown next to the tax line on cart, checkout and invoices.",
                type: "text",
                defaultValue: "VAT",
              },
              {
                key: "tax.included_in_price",
                label: "Prices Include Tax",
                description: "Product prices already contain tax, so nothing is added on top.",
                type: "toggle",
                defaultValue: false,
              },
              {
                key: "tax.shipping_taxable",
                label: "Tax Delivery Charge",
                description: "Apply the tax rate to the delivery charge as well as the products.",
                type: "toggle",
                defaultValue: false,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "marketing",
    title: "Marketing",
    description: "Coupons, loyalty, and recovery",
    sections: [
      {
        id: "programs",
        title: "Programs",
        groups: [
          {
            id: "promo",
            title: "Promotions",
            items: [
              { key: "marketing.coupons", label: "Coupons", type: "toggle", defaultValue: true },
              { key: "marketing.referral", label: "Referral Program", type: "toggle", defaultValue: false },
              {
                key: "marketing.loyalty",
                label: "Loyalty / Star Points",
                description: "When enabled, checkout shows Star Points / reward points. Keep off until the points system is ready.",
                type: "toggle",
                defaultValue: false,
              },
              { key: "marketing.abandoned_cart", label: "Abandoned Cart Recovery", type: "toggle", defaultValue: true },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "seo",
    title: "SEO",
    description: "Search engine optimization",
    sections: [
      {
        id: "technical",
        title: "Technical SEO",
        groups: [
          {
            id: "urls",
            title: "URLs & Meta",
            items: [
              { key: "seo.clean_urls", label: "SEO URLs", type: "toggle", defaultValue: true },
              { key: "seo.meta_templates", label: "Meta Templates", type: "toggle", defaultValue: true },
              { key: "seo.sitemap", label: "Sitemap Auto-Generate", type: "toggle", defaultValue: true },
              { key: "seo.schema", label: "Schema Markup", type: "toggle", defaultValue: true },
              { key: "seo.robots", label: "Robots.txt Management", type: "toggle", defaultValue: true },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "notifications",
    title: "Notifications",
    description: "Email, SMS, and in-app alerts",
    sections: [
      {
        id: "alerts",
        title: "Alert Rules",
        groups: [
          {
            id: "channels",
            title: "Notification Channels",
            items: [
              { key: "notify.order", label: "Order Notifications", type: "toggle", defaultValue: true },
              { key: "notify.customer", label: "Customer Notifications", type: "toggle", defaultValue: true },
              { key: "notify.review", label: "Review Notifications", type: "toggle", defaultValue: true },
              { key: "notify.low_stock", label: "Low Stock Notifications", type: "toggle", defaultValue: true },
            ],
          },
        ],
      },
    ],
  },
];

export const WORKSPACE_SETTINGS_CATEGORIES: SettingCategoryDef[] = [
  { id: "users", title: "Users", description: "User management, invitations, status control", sections: [{ id: "main", title: "Users", groups: [{ id: "g", title: "General", items: [
    { key: "workspace.users.invite", label: "Allow User Invitations", type: "toggle", defaultValue: true },
    { key: "workspace.users.sso", label: "SSO Enabled", type: "toggle", defaultValue: false },
  ]}]}]},
  { id: "roles", title: "Roles", description: "Role creation and permission assignment", sections: [{ id: "main", title: "Roles", groups: [{ id: "g", title: "General", items: [
    { key: "workspace.roles.custom", label: "Custom Roles Allowed", type: "toggle", defaultValue: true },
  ]}]}]},
  { id: "teams", title: "Teams", description: "Team structure and assignment", sections: [{ id: "main", title: "Teams", groups: [{ id: "g", title: "General", items: [
    { key: "workspace.teams.enabled", label: "Enable Teams", type: "toggle", defaultValue: true },
  ]}]}]},
  { id: "branches", title: "Branches", description: "Multi-branch management", sections: [{ id: "main", title: "Branches", groups: [{ id: "g", title: "General", items: [
    { key: "workspace.branches.multi", label: "Multi-Branch Mode", type: "toggle", defaultValue: true },
  ]}]}]},
  { id: "warehouses", title: "Warehouses", description: "Warehouse configuration and transfers", sections: [{ id: "main", title: "Warehouses", groups: [{ id: "g", title: "General", items: [
    { key: "workspace.wh.auto_transfer", label: "Auto Transfer Rules", type: "toggle", defaultValue: false },
  ]}]}]},
  { id: "integrations", title: "Integrations", description: "Payment, shipping, and external services", sections: [{ id: "main", title: "Integrations", groups: [{ id: "g", title: "General", items: [
    { key: "workspace.int.webhooks", label: "Outbound Webhooks", type: "toggle", defaultValue: true },
  ]}]}]},
  { id: "workflows", title: "Workflows", description: "Workflow definitions and triggers", sections: [{ id: "main", title: "Workflows", groups: [{ id: "g", title: "General", items: [
    { key: "workspace.wf.engine", label: "Workflow Engine", type: "toggle", defaultValue: true },
  ]}]}]},
  { id: "approvals", title: "Approvals", description: "Approval policies and delegation", sections: [{ id: "main", title: "Approvals", groups: [{ id: "g", title: "General", items: [
    { key: "workspace.approval.multi", label: "Multi-Level Approvals", type: "toggle", defaultValue: true },
  ]}]}]},
];

export const PLATFORM_SETTINGS_CATEGORIES: SettingCategoryDef[] = [
  { id: "licensing", title: "Licensing", description: "License status, domain binding, subscriptions", sections: [{ id: "main", title: "Licensing", groups: [{ id: "g", title: "License", items: [
    { key: "platform.license.domain_bind", label: "Domain Binding", type: "toggle", defaultValue: true },
  ]}]}]},
  { id: "feature-manager", title: "Feature Manager", description: "Module enable/disable, plan features", sections: [{ id: "main", title: "Features", groups: [{ id: "g", title: "Modules", items: [
    { key: "platform.features.inventory", label: "Inventory Module", type: "toggle", defaultValue: true },
    { key: "platform.features.marketplace", label: "Marketplace Module", type: "toggle", defaultValue: false },
  ]}]}]},
  { id: "ai-center", title: "AI Center", description: "AI providers, budget, usage, prompts", sections: [{ id: "main", title: "AI", groups: [{ id: "g", title: "Providers", items: [
    { key: "platform.ai.budget_monthly", label: "Monthly AI Budget (USD)", type: "number", defaultValue: 500 },
  ]}]}]},
  { id: "monitoring", title: "Monitoring", description: "Database, cache, queue, search health", sections: [{ id: "main", title: "Health", groups: [{ id: "g", title: "Monitoring", items: [
    { key: "platform.monitor.alerts", label: "Health Alert Emails", type: "toggle", defaultValue: true },
  ]}]}]},
  { id: "security", title: "Security", description: "Security policies, API, tokens, logs", sections: [{ id: "main", title: "Security", groups: [{ id: "g", title: "Policies", items: [
    { key: "platform.security.mfa", label: "Enforce MFA (Platform Admin)", type: "toggle", defaultValue: true },
  ]}]}]},
  { id: "updates", title: "Updates", description: "Update channels and release management", sections: [{ id: "main", title: "Updates", groups: [{ id: "g", title: "Channels", items: [
    { key: "platform.updates.channel", label: "Update Channel", type: "select", defaultValue: "stable", options: [
      { label: "Stable", value: "stable" },
      { label: "Beta", value: "beta" },
    ]},
  ]}]}]},
  { id: "analytics", title: "Analytics", description: "Platform usage and growth metrics", sections: [{ id: "main", title: "Analytics", groups: [{ id: "g", title: "Telemetry", items: [
    { key: "platform.analytics.usage", label: "Usage Statistics", type: "toggle", defaultValue: true },
  ]}]}]},
  { id: "marketplace", title: "Marketplace", description: "Module distribution and partners", sections: [{ id: "main", title: "Marketplace", groups: [{ id: "g", title: "Distribution", items: [
    { key: "platform.marketplace.public", label: "Public Marketplace", type: "toggle", defaultValue: false },
  ]}]}]},
];

export function getCategoriesForLayer(layer: SettingsLayer) {
  switch (layer) {
    case "business":
      return BUSINESS_SETTINGS_CATEGORIES;
    case "workspace":
      return WORKSPACE_SETTINGS_CATEGORIES;
    case "platform":
      return PLATFORM_SETTINGS_CATEGORIES;
  }
}

export function findCategory(layer: SettingsLayer, categoryId: string) {
  return getCategoriesForLayer(layer).find((c) => c.id === categoryId);
}

export function allSettingKeys(categories: SettingCategoryDef[]) {
  const keys: SettingItemDef[] = [];
  for (const cat of categories) {
    for (const sec of cat.sections) {
      for (const grp of sec.groups) {
        keys.push(...grp.items);
      }
    }
  }
  return keys;
}

export function buildDefaultValues(categories: SettingCategoryDef[]) {
  const values: Record<string, string | boolean | number> = {};
  for (const item of allSettingKeys(categories)) {
    values[item.key] = item.defaultValue;
  }
  return values;
}

export const SETTINGS_LAYER_META: Record<
  SettingsLayer,
  { title: string; subtitle: string; basePath: string; badge?: string }
> = {
  business: {
    title: "Business Settings",
    subtitle: "Daily store configuration for owners and staff",
    basePath: "/website/settings/checkout",
  },
  workspace: {
    title: "Workspace Settings",
    subtitle: "Organization, users, branches, and workflows",
    basePath: "/workspace",
  },
  platform: {
    title: "Control Center",
    subtitle: "Platform intelligence — AgainERP internal only",
    basePath: "/control-center",
    badge: "Internal",
  },
};
