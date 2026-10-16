import { create } from "zustand";
import {
  businessPartnersSeed,
  type BusinessPartner,
  type PartnerRole,
  type PartnerStatus,
} from "@/lib/mock-data/business-partners";

type BusinessPartnerStore = {
  partners: BusinessPartner[];
  getById: (id: string) => BusinessPartner | undefined;
  addPartner: (partner: BusinessPartner) => void;
  patchPartner: (id: string, patch: Partial<BusinessPartner>) => void;
  updateStatus: (id: string, status: PartnerStatus) => void;
  toggleRole: (id: string, role: PartnerRole, enabled: boolean) => void;
};

export const useBusinessPartnerStore = create<BusinessPartnerStore>()((set, get) => ({
  partners:
    businessPartnersSeed.length > 0
      ? [...businessPartnersSeed]
      : [...businessPartnersSeed],
  getById: (id) => get().partners.find((p) => p.id === id),
  addPartner: (partner) => set((s) => ({ partners: [partner, ...s.partners] })),
  patchPartner: (id, patch) =>
    set((s) => ({
      partners: s.partners.map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString().slice(0, 10) } : p,
      ),
    })),
  updateStatus: (id, status) =>
    set((s) => ({
      partners: s.partners.map((p) => (p.id === id ? { ...p, status } : p)),
    })),
  toggleRole: (id, role, enabled) =>
    set((s) => ({
      partners: s.partners.map((p) => {
        if (p.id !== id) return p;
        const roles = enabled
          ? p.roles.includes(role)
            ? p.roles
            : [...p.roles, role]
          : p.roles.filter((r) => r !== role);
        return { ...p, roles: roles.length > 0 ? roles : p.roles };
      }),
    })),
}));

export function partnerStatusBadgeVariant(
  status: PartnerStatus,
): "default" | "secondary" | "success" | "warning" | "muted" | "outline" {
  switch (status) {
    case "active":
      return "success";
    case "pending":
    case "draft":
      return "muted";
    case "on_hold":
      return "warning";
    case "blocked":
      return "outline";
    case "archived":
      return "secondary";
    default:
      return "muted";
  }
}

export function partnerRoleBadgeVariant(
  role: PartnerRole,
): "default" | "secondary" | "success" | "warning" | "muted" | "outline" {
  switch (role) {
    case "vendor":
      return "default";
    case "wholesaler":
    case "distributor":
      return "secondary";
    case "retailer":
    case "franchisee":
      return "success";
    case "channel_partner":
      return "warning";
    default:
      return "muted";
  }
}
