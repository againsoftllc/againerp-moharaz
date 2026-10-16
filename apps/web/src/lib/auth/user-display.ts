import type { AdminUser } from "@/lib/store/admin-auth-store";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  staff: "Staff",
  viewer: "Viewer",
  system_manager: "System Manager",
};

export function userRoleLabel(user: AdminUser | null | undefined): string {
  const named = user?.roles?.find((r) => r.name)?.name;
  if (named) return named;
  const slug = user?.role ?? "";
  return ROLE_LABELS[slug] ?? (slug ? slug.replace(/_/g, " ") : "User");
}

export function userCompanyLabel(user: AdminUser | null | undefined): string {
  return user?.company_name?.trim() || "—";
}

export function userInitials(user: AdminUser | null | undefined): string {
  const source = user?.name?.trim() || user?.username || "";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  }
  return (source.slice(0, 2) || "U").toUpperCase();
}
