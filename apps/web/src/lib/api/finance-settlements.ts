import { apiFetch } from "@/lib/api/client";
import { formatCurrency } from "@/lib/utils";

const BASE = "/api/v1/finance/settlements";

export type SettlementPartyType = "customer" | "supplier";

export type SettledByRef = { ref: string; amount: string };
export type SettledByMap = Record<string, SettledByRef[]>;

export type ApiSettlementDocument = {
  id: string;
  number: string;
  doc_date: string | null;
  due_date: string | null;
  amount: string;
  paid: string;
  balance: string;
  status: string;
  settled_by: SettledByRef[];
};

export type ApiSettlement = {
  id: string;
  settlement_number: string;
  party_type: SettlementPartyType;
  party_id: string;
  party_name: string | null;
  settlement_date: string;
  total: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  lines: { document_id: string; number: string; amount: string }[];
};

/** "PAY-CUS-00004, STL-2026-00001" — with amounts when `withAmounts` (tooltips, the settlement drawer). */
export function settledByLabel(refs: SettledByRef[] | undefined, withAmounts = false): string {
  if (!refs || refs.length === 0) return "";
  return refs.map((r) => (withAmounts ? `${r.ref} ${formatCurrency(Number(r.amount))}` : r.ref)).join(", ");
}

export async function fetchSettlements(params: { party_type?: SettlementPartyType } = {}) {
  const q = params.party_type ? `?party_type=${params.party_type}` : "";
  return apiFetch<{ data: ApiSettlement[] }>(`${BASE}${q}`);
}

export async function fetchSettlement(id: string) {
  return apiFetch<{ data: ApiSettlement }>(`${BASE}/${encodeURIComponent(id)}`);
}

export async function fetchSettlementDocuments(partyType: SettlementPartyType, partyId: string) {
  return apiFetch<{ data: ApiSettlementDocument[] }>(
    `${BASE}/documents?party_type=${partyType}&party_id=${encodeURIComponent(partyId)}`,
  );
}

export async function fetchSettledBy(docType: "receivable" | "payable", ids: string[]) {
  if (ids.length === 0) return { data: {} as SettledByMap };
  return apiFetch<{ data: SettledByMap }>(`${BASE}/settled-by`, {
    method: "POST",
    body: JSON.stringify({ doc_type: docType, ids }),
  });
}

export async function createSettlement(input: {
  party_type: SettlementPartyType;
  party_id: string;
  settlement_date?: string;
  note?: string | null;
  /** negative = take off this document, positive = put on it */
  lines: { document_id: string; amount: string }[];
}) {
  return apiFetch<{ data: ApiSettlement }>(BASE, { method: "POST", body: JSON.stringify(input) });
}
