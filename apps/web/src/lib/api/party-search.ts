import { apiFetch } from "@/lib/api/client";

export type PartySearchRole = "customer" | "supplier" | "vendor";

export type PartySearchResult = {
  partyId: string;
  name: string;
  role: PartySearchRole;
};

const ROLE_ENDPOINTS: { role: PartySearchRole; url: (q: string) => string }[] = [
  { role: "customer", url: (q) => `/api/v1/commerce/customers?search=${q}&limit=6` },
  { role: "supplier", url: (q) => `/api/v1/commerce/suppliers?search=${q}&limit=6` },
  { role: "vendor", url: (q) => `/api/v1/vendors?search=${q}&limit=6` },
];

/** Cross-entity search for the Expense "Link to party" picker — Customer + Supplier + Vendor in parallel. */
export async function searchLinkableParties(query: string): Promise<PartySearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const encoded = encodeURIComponent(q);

  const settled = await Promise.allSettled(
    ROLE_ENDPOINTS.map(({ url }) => apiFetch<{ data: Record<string, unknown>[] }>(url(encoded))),
  );

  const results: PartySearchResult[] = [];
  settled.forEach((outcome, i) => {
    if (outcome.status !== "fulfilled") return;
    const { role } = ROLE_ENDPOINTS[i];
    for (const row of outcome.value.data ?? []) {
      const partyId = (row.party_id as string | null) ?? null;
      if (!partyId) continue;
      const name = (row.name as string) ?? (row.company_name as string) ?? "";
      if (!name) continue;
      results.push({ partyId, name, role });
    }
  });
  return results;
}
