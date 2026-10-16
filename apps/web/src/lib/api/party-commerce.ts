import { apiFetch } from "@/lib/api/client";

export type PartyCommerceRole = "customer" | "supplier" | "vendor";

export type PartnerCommerceKind = "customer" | "supplier" | "both";

export type PartyCommerceLinkRef = {
  id: string;
  name: string;
  code: string | null;
};

export type PartyCommerceLinks = {
  party_id: string;
  roles: string[];
  customer: PartyCommerceLinkRef | null;
  supplier: PartyCommerceLinkRef | null;
  vendor: PartyCommerceLinkRef | null;
};

export async function fetchPartyCommerceLinks(partyId: string): Promise<PartyCommerceLinks> {
  const res = await apiFetch<{ data: PartyCommerceLinks }>(
    `/api/v1/parties/${encodeURIComponent(partyId)}/commerce-links`,
  );
  return res.data;
}

export async function enablePartyCommerceRole(
  partyId: string,
  role: PartyCommerceRole,
  existingId?: string,
): Promise<PartyCommerceLinks> {
  const res = await apiFetch<{ data: PartyCommerceLinks }>(
    `/api/v1/parties/${encodeURIComponent(partyId)}/commerce-links`,
    {
      method: "POST",
      body: JSON.stringify({ role, existing_id: existingId || undefined }),
    },
  );
  return res.data;
}

export async function ensurePartyCommerceKind(
  partyId: string,
  kind: PartnerCommerceKind,
): Promise<PartyCommerceLinks | null> {
  let links: PartyCommerceLinks | null = null;
  if (kind === "customer" || kind === "both") {
    links = await enablePartyCommerceRole(partyId, "customer");
  }
  if (kind === "supplier" || kind === "both") {
    links = await enablePartyCommerceRole(partyId, "supplier");
  }
  return links;
}
