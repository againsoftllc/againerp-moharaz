"use client";

import { usePathname, useRouter } from "next/navigation";
import { House, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { logoutSuperAdmin } from "@/lib/api/super-admin";
import { useSuperAdminAuth } from "@/lib/store/super-admin-auth-store";

const SUPER_ADMIN_NAV = {
  bg: "#1e1b4b",
  border: "#141233",
} as const;

const NAV_LINK =
  "inline-flex h-[32px] shrink-0 items-center whitespace-nowrap px-2.5 text-[12px] font-normal leading-none text-white/90 outline-none hover:bg-white/10 hover:text-white";

const NAV_MENUS = [
  { id: "companies", label: "Companies", href: "/super-admin/companies" },
  { id: "plans", label: "Plans", href: "/super-admin/plans" },
] as const;

export function SuperAdminModuleNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  const user = useSuperAdminAuth((s) => s.user);
  const clearSession = useSuperAdminAuth((s) => s.clearSession);

  const handleLogout = async () => {
    try {
      await logoutSuperAdmin();
    } catch {
      // ignore — clearing local session is enough
    }
    clearSession();
    router.replace("/super-admin/login");
  };

  return (
    <header className="shrink-0 bg-background" data-component="super-admin-module-heading">
      <nav
        className="relative z-50 flex h-[32px] shrink-0 items-center overflow-visible border-b text-white"
        style={{ backgroundColor: SUPER_ADMIN_NAV.bg, borderColor: SUPER_ADMIN_NAV.border }}
        aria-label="Super admin module"
        data-component="again_main_navbar"
      >
        <button
          type="button"
          className="inline-flex h-[32px] w-8 shrink-0 items-center justify-center text-white/90 hover:bg-white/10 hover:text-white"
          aria-label="Home"
          onClick={() => router.push("/super-admin/companies")}
        >
          <House className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
        <span className="mr-1 shrink-0 whitespace-nowrap px-1 text-[12px] font-semibold text-white/90">
          AgainERP · Super Admin
        </span>

        <div className="flex min-w-0 flex-1 items-center overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV_MENUS.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <button
                key={item.id}
                type="button"
                className={cn(NAV_LINK, active && "bg-white/15 font-medium text-white")}
                onClick={() => router.push(item.href)}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {user ? (
          <span className="hidden shrink-0 whitespace-nowrap px-2 text-[11px] text-white/60 sm:inline">
            {user.name}
          </span>
        ) : null}
        <button
          type="button"
          className="inline-flex h-[32px] shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 text-[12px] text-white/90 outline-none hover:bg-white/10 hover:text-white"
          onClick={() => void handleLogout()}
        >
          <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
          Sign out
        </button>
      </nav>
    </header>
  );
}
