"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useCustomerFeatureFlags } from "@/lib/customers/use-customer-settings";

const NAV_TABS = [
  { label: "Dashboard", href: "/customers", flag: null },
  { label: "All Customers", href: "/customers/all", flag: null },
  { label: "Customer Groups", href: "/customers/groups", flag: "navGroups" },
  { label: "Segments", href: "/customers/segments", flag: "navSegments" },
  { label: "Loyalty Program", href: "/customers/loyalty", flag: "navLoyalty" },
  { label: "Rewards", href: "/customers/rewards", flag: "navRewards" },
  { label: "Wallet", href: "/customers/wallet", flag: "navWallet" },
  { label: "Wishlists", href: "/customers/wishlists", flag: "navWishlists" },
  { label: "Activities", href: "/customers/activities", flag: "navActivities" },
  { label: "Support", href: "/customers/support", flag: "navSupport" },
  { label: "Marketing", href: "/customers/marketing", flag: "navMarketing" },
  { label: "Reports", href: "/customers/reports", flag: "navReports" },
] as const;

export function CustomersNav({ compact }: { compact?: boolean }) {
  const pathname = usePathname();
  const flags = useCustomerFeatureFlags();

  const isActive = (href: string) => {
    if (href === "/customers") return pathname === "/customers";
    if (href === "/customers/all")
      return pathname === "/customers/all" || pathname.startsWith("/customers/all");
    return pathname === href || pathname.startsWith(href + "/");
  };

  const visible = NAV_TABS.filter((tab) => {
    if (!tab.flag) return true;
    return Boolean(flags[tab.flag]);
  });
  const tabs = compact ? visible.filter((t) => t.href === "/customers" || t.href === "/customers/all") : visible;

  return (
    <nav className="flex flex-wrap gap-1 rounded-none border border-input bg-muted/30 p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "rounded-none px-3 py-1.5 text-xs font-medium transition-colors",
            isActive(tab.href)
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
