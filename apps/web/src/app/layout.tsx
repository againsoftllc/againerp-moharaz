import type { Metadata } from "next";
import localFont from "next/font/local";
import { AppProviders } from "@/components/providers/app-providers";
import { THEME_INIT_SCRIPT } from "@/lib/theme/apply-theme";
import "./globals.css";

// The fonts ship with the app (latin subset, variable weight, from Google Fonts) instead of being downloaded from Google when the
// dev server compiles: Turbopack failed to resolve its Google-font loader in Docker ("Can't resolve
// @vercel/turbopack-next/internal/font/google/font"), which showed a Build Error on every page.
const geistSans = localFont({
  src: "./fonts/geist-latin.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});

/** Odoo backend font — used by every Again List Datatable (see globals.css `--font-list`). */
const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/geist-mono-latin.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

import { BRAND_PAGE_TITLE } from "@/lib/brand";

export const metadata: Metadata = {
  title: BRAND_PAGE_TITLE,
  description: "AgainERP admin",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} h-full`}>
      <head>
        <script
          id="theme-init"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body className="min-h-full font-sans antialiased" suppressHydrationWarning>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
