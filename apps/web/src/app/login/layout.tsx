import { AdminThemeShell } from "@/components/providers/admin-theme-shell";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <AdminThemeShell>{children}</AdminThemeShell>;
}
