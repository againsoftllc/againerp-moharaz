"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FileText, LogOut, Package, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clearPortalSession,
  getPortalSession,
  loadPortalCompanyFormat,
  portalLogout,
  type PortalUser,
} from "@/lib/api/portal";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/portal/catalog", label: "My catalog", icon: Package },
  { href: "/portal/orders", label: "Purchase orders", icon: ShoppingCart },
  { href: "/portal/rfqs", label: "RFQs", icon: FileText },
];

/** Guards every portal page and renders the supplier-facing header. */
export function PortalChrome({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<PortalUser | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const session = getPortalSession();
    if (!session) {
      router.replace("/portal/login");
      return;
    }
    setUser(session.user);
    setChecked(true);
    void loadPortalCompanyFormat().catch(() => undefined);
  }, [router]);

  if (!checked || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const signOut = async () => {
    try {
      await portalLogout();
    } catch {
      clearPortalSession();
    }
    router.replace("/portal/login");
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="shrink-0 border-b border-border bg-[#2f2b3a] text-white">
        <div className="mx-auto flex h-12 w-full max-w-6xl items-center gap-3 px-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-none bg-[#7048E8] text-[11px] font-bold">
              A
            </span>
            <div className="leading-tight">
              <p className="text-[13px] font-semibold">Supplier Portal</p>
              <p className="text-[11px] text-white/60">{user.supplier_name ?? ""}</p>
            </div>
          </div>

          <nav className="ml-4 flex items-center gap-1">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => router.push(item.href)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-none px-2.5 text-[12px]",
                    active
                      ? "bg-white/15 text-white"
                      : "text-white/75 hover:bg-white/[0.08] hover:text-white",
                  )}
                >
                  <item.icon className="h-3.5 w-3.5" aria-hidden />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-[11px] text-white/60 sm:inline">{user.email}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 rounded-none text-white/80 hover:bg-white/10 hover:text-white"
              onClick={() => void signOut()}
            >
              <LogOut className="mr-1.5 h-3.5 w-3.5" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-4">{children}</main>
    </div>
  );
}
