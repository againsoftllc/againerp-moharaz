import { CANDIDATES_SEED, formatSalary } from "@/lib/mock-data/hrm-candidates";

export type OfferStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "negotiation"
  | "declined"
  | "expired";

export type Offer = {
  id: string;
  candidateId: string;
  candidateName: string;
  jobTitle: string;
  jobCode: string;
  department: string;
  salary: number;
  startDate: string;
  expiresOn: string;
  offerDate: string;
  approvedBy: string;
  benefits: string;
  notes: string;
  status: OfferStatus;
  employeeConverted: boolean;
};

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  negotiation: "Negotiation",
  declined: "Declined",
  expired: "Expired",
};

export const OFFER_STATUS_OPTIONS = (Object.keys(OFFER_STATUS_LABEL) as OfferStatus[]).map(
  (k) => ({ value: k, label: OFFER_STATUS_LABEL[k] }),
);

export { formatSalary };

export function createOfferId(existing: Offer[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.id.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `off_${String(max + 1).padStart(2, "0")}`;
}

export function isOfferExpired(expiresOn: string, today = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expiresOn.trim());
  if (!m) return false;
  const exp = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return exp < t;
}

function cand(id: string) {
  return CANDIDATES_SEED.find((c) => c.id === id) ?? CANDIDATES_SEED[0]!;
}

/** Workdo-style demo offers. */
export const OFFERS_SEED: Offer[] = [
  {
    id: "off_01",
    candidateId: "cand_01",
    candidateName: cand("cand_01").name,
    jobTitle: cand("cand_01").jobTitle,
    jobCode: cand("cand_01").jobCode,
    department: cand("cand_01").department,
    salary: 45000,
    startDate: "2026-01-15",
    expiresOn: "2026-01-07",
    offerDate: "2025-12-28",
    approvedBy: "Priya Sharma",
    benefits: "Health coverage, PF, annual bonus.",
    notes: "Offer aligned with expected salary.",
    status: "draft",
    employeeConverted: false,
  },
  {
    id: "off_02",
    candidateId: "cand_04",
    candidateName: cand("cand_04").name,
    jobTitle: cand("cand_04").jobTitle,
    jobCode: cand("cand_04").jobCode,
    department: cand("cand_04").department,
    salary: 105000,
    startDate: "2026-02-01",
    expiresOn: "2026-01-10",
    offerDate: "2025-12-30",
    approvedBy: "Ankit Verma",
    benefits: "Remote allowance, health coverage.",
    notes: "Pending candidate response.",
    status: "sent",
    employeeConverted: false,
  },
  {
    id: "off_03",
    candidateId: "cand_02",
    candidateName: cand("cand_02").name,
    jobTitle: cand("cand_02").jobTitle,
    jobCode: cand("cand_02").jobCode,
    department: cand("cand_02").department,
    salary: 65000,
    startDate: "2026-03-01",
    expiresOn: "2026-03-15",
    offerDate: "2026-01-20",
    approvedBy: "Orpha Nolan",
    benefits: "Learning budget, flexible hours.",
    notes: "",
    status: "sent",
    employeeConverted: false,
  },
  {
    id: "off_04",
    candidateId: "cand_06",
    candidateName: cand("cand_06").name,
    jobTitle: cand("cand_06").jobTitle,
    jobCode: cand("cand_06").jobCode,
    department: cand("cand_06").department,
    salary: 75000,
    startDate: "2026-02-15",
    expiresOn: "2026-02-28",
    offerDate: "2026-01-18",
    approvedBy: "Priya Sharma",
    benefits: "PF, health, laptop.",
    notes: "Accepted verbally; pending paperwork.",
    status: "accepted",
    employeeConverted: false,
  },
];
