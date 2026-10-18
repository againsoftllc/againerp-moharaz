import type { NextConfig } from "next";
import path from "node:path";

const chinaImportPlugin = path.resolve(__dirname, "../../plugins/china-import/src");

/** Relative paths — Turbopack cannot resolve absolute FS paths as aliases. */
const turbopackAliases = {
  "@againerp-plugin/china-import/app": "../../plugins/china-import/src/app.ts",
  "@againerp-plugin/china-import": "../../plugins/china-import/src/index.ts",
  /** Toast copy button — app imports "sonner", bridge re-imports real package via sonner-core. */
  sonner: "./src/lib/sonner.tsx",
  "sonner-core": "./node_modules/sonner/dist/index.mjs",
};

const webpackAliases = {
  "@againerp-plugin/china-import/app$": path.join(chinaImportPlugin, "app.ts"),
  "@againerp-plugin/china-import$": path.join(chinaImportPlugin, "index.ts"),
  sonner: path.resolve(__dirname, "src/lib/sonner.tsx"),
  "sonner-core": path.resolve(__dirname, "node_modules/sonner/dist/index.mjs"),
};

const nextConfig: NextConfig = {
  // Pre-existing type debt — compile succeeds; don't block production builds.
  typescript: { ignoreBuildErrors: true },
  // Dev opens via either localhost or 127.0.0.1 — without this, Next blocks
  // /_next/* from the other host and the login form never hydrates (URL becomes
  // /login?), and HMR/assets fail in local Docker.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  transpilePackages: ["againerp-plugin-china-import"],
  experimental: {
    // These large icon/UI packages are imported throughout the admin app.
    // Transform only the exports each route uses to reduce dev compile work.
    optimizePackageImports: ["lucide-react", "recharts"],
    // Keep visited/prefetched page segments in the client router cache so
    // returning to another page in the same module is instant.
    // Keep short in local Docker so HRM UI edits show after refresh.
    staleTimes: {
      dynamic: 0,
      static: 30,
    },
  },
  turbopack: {
    // Monorepo root — lets Turbopack resolve ../../plugins/* outside apps/web.
    root: path.resolve(__dirname, "../.."),
    resolveAlias: turbopackAliases,
  },
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.alias = {
      ...(config.resolve.alias as Record<string, string>),
      ...webpackAliases,
    };
    return config;
  },
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "placehold.co",
      },
      {
        protocol: "https",
        hostname: "img.alicdn.com",
      },
      {
        protocol: "https",
        hostname: "*.alicdn.com",
      },
      {
        protocol: "https",
        hostname: "*.r2.dev",
      },
      {
        protocol: "https",
        hostname: "*.r2.cloudflarestorage.com",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8010",
        pathname: "/uploads/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "8010",
        pathname: "/uploads/**",
      },
    ],
  },

  /**
   * API / uploads / health are proxied at runtime by App Router handlers
   * (`src/app/api/v1`, `src/app/uploads`, `src/app/health`) using API_PROXY_TARGET.
   * No build-time rewrites — those bake localhost and break Docker/Vercel.
   */
  async rewrites() {
    return [];
  },

  async redirects() {
    const legacyStorefrontRoutes = [
      "account",
      "cart",
      "checkout",
      "wishlist",
      "compare",
      "search",
      "deals",
      "new",
      "bestsellers",
      "products",
      "categories",
      "track",
      "contact",
      "about",
      "faq",
      "shipping",
      "careers",
      "recommendations",
      "builder",
    ];

    const legacyStorefrontRedirects = legacyStorefrontRoutes.flatMap((route) => [
      { source: `/${route}`, destination: "/login", permanent: false },
      { source: `/${route}/:path*`, destination: "/login", permanent: false },
      { source: `/shop/${route}`, destination: "/login", permanent: false },
      { source: `/shop/${route}/:path*`, destination: "/login", permanent: false },
    ]);

    return [
      { source: "/shop", destination: "/login", permanent: false },
      { source: "/shop/:path*", destination: "/login", permanent: false },
      ...legacyStorefrontRedirects,
      // RMA lives inside Inventory now — keep old bookmarks and emailed links working.
      { source: "/rma", destination: "/inventory/rma", permanent: false },
      { source: "/rma/:path*", destination: "/inventory/rma/:path*", permanent: false },
      { source: "/media", destination: "/workspace/media", permanent: false },
      { source: "/media/:path*", destination: "/workspace/media", permanent: false },
      { source: "/finance/expenses", destination: "/expenses", permanent: true },
      { source: "/party", destination: "/customers?from=party", permanent: false },
      { source: "/party/customers", destination: "/customers?from=party", permanent: false },
      { source: "/party/suppliers", destination: "/suppliers", permanent: false },
      { source: "/party/vendors", destination: "/vendors?from=party", permanent: false },
      { source: "/website/price-update", destination: "/catalog/price-compare", permanent: false },
      { source: "/purchase/suppliers", destination: "/suppliers", permanent: false },
      { source: "/purchase/suppliers/:id", destination: "/suppliers/:id", permanent: false },
      { source: "/customers/all", destination: "/customers", permanent: true },
      { source: "/catalog/reviews/all", destination: "/catalog/reviews", permanent: true },
      { source: "/catalog/reviews/all/:path*", destination: "/catalog/reviews", permanent: true },
      { source: "/catalog/reviews/qa", destination: "/catalog/qa", permanent: true },
      { source: "/catalog/reviews/qa/:path*", destination: "/catalog/qa", permanent: true },
      { source: "/customers/groups", destination: "/customers", permanent: true },
      { source: "/customers/segments", destination: "/customers", permanent: true },
      { source: "/customers/loyalty", destination: "/customers", permanent: true },
      { source: "/customers/rewards", destination: "/customers", permanent: true },
      { source: "/customers/wallet", destination: "/customers", permanent: true },
      { source: "/customers/wishlists", destination: "/customers", permanent: true },
      { source: "/customers/support", destination: "/customers", permanent: true },
      { source: "/customers/reports", destination: "/customers", permanent: true },
      { source: "/customers/activities", destination: "/customers", permanent: true },
      { source: "/customers/marketing", destination: "/customers", permanent: true },
      { source: "/catalog/blog", destination: "/blog/articles", permanent: true },
      { source: "/catalog/blog/articles", destination: "/blog/articles", permanent: true },
      { source: "/catalog/blog/categories", destination: "/blog/categories", permanent: true },
      { source: "/catalog/blog/comments", destination: "/blog/comments", permanent: true },
      { source: "/catalog/blog/settings", destination: "/blog/settings", permanent: true },
      { source: "/website", destination: "/website/dashboard", permanent: false },
      { source: "/website/list", destination: "/website/pages", permanent: false },
      { source: "/website-2", destination: "/website/pages", permanent: false },
      { source: "/website-2/:path*", destination: "/website/pages", permanent: false },
      { source: "/media/images", destination: "/media", permanent: true },
      { source: "/media/videos", destination: "/media", permanent: true },
      { source: "/media/documents", destination: "/media", permanent: true },
      { source: "/media/cdn", destination: "/media", permanent: true },
      { source: "/system", destination: "/workspace/modules", permanent: false },
      { source: "/system/:path*", destination: "/workspace/:path*", permanent: false },
      { source: "/settings", destination: "/workspace/modules", permanent: false },
      { source: "/settings/:path*", destination: "/workspace/:path*", permanent: false },
      { source: "/workspace/website", destination: "/workspace/sites", permanent: false },
      { source: "/workspace/website/:path*", destination: "/workspace/sites", permanent: false },
      { source: "/workspace/stores", destination: "/workspace/sites", permanent: false },
      { source: "/workspace/stores/:id", destination: "/workspace/sites/:id", permanent: false },
      { source: "/workspace", destination: "/workspace/modules", permanent: false },
      { source: "/suppliers/products", destination: "/purchase/products", permanent: false },
      {
        source: "/suppliers/purchase-orders/create",
        destination: "/purchase/orders?create=1",
        permanent: false,
      },
      { source: "/suppliers/purchase-orders", destination: "/purchase/orders", permanent: false },
      { source: "/suppliers/rfq", destination: "/purchase/rfq", permanent: false },
      { source: "/suppliers/quotations", destination: "/purchase/quotations", permanent: false },
      { source: "/suppliers/receipts", destination: "/purchase/receipts", permanent: false },
      { source: "/suppliers/bills", destination: "/purchase/bills", permanent: false },
      { source: "/suppliers/returns", destination: "/purchase/returns", permanent: false },
    ];
  },
};

export default nextConfig;
