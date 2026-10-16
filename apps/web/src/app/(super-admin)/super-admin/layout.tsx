import { SuperAdminAuthGate } from "@/components/auth/super-admin-auth-gate";
import { SuperAdminShell } from "@/components/super-admin/super-admin-shell";

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SuperAdminAuthGate>
      <SuperAdminShell>{children}</SuperAdminShell>
    </SuperAdminAuthGate>
  );
}
