import { AdminAuthGate } from "@/components/auth/admin-auth-gate";
import { AdminThemeShell } from "@/components/providers/admin-theme-shell";
import { StorefrontUrlHydrator } from "@/components/providers/storefront-url-hydrator";

/** Minimal shell for print / live-edit pages — no sidebar or workspace chrome. */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminThemeShell>
      <AdminAuthGate>
        <StorefrontUrlHydrator />
        <div className="min-h-screen bg-background text-foreground">{children}</div>
      </AdminAuthGate>
    </AdminThemeShell>
  );
}
