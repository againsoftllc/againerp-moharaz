export type QaStatus = "pending" | "answered" | "archived";

export const QA_STATUS_LABELS: Record<QaStatus, string> = {
  pending: "Pending",
  answered: "Answered",
  archived: "Archived",
};

export type CatalogQa = {
  id: string;
  questionId: string;
  status: QaStatus;
  question: string;
  answer?: string;
  answeredBy?: string;
  isVerified: boolean;
  product: {
    id: string;
    name: string;
    sku: string;
    brand: string;
    category: string;
    imageUrl?: string;
  };
  customer: {
    name: string;
  };
  createdAt: string;
  updatedAt: string;
};

export function countQaByStatus(rows: CatalogQa[]) {
  const counts: Record<QaStatus | "all", number> = {
    all: rows.length,
    pending: 0,
    answered: 0,
    archived: 0,
  };
  for (const row of rows) {
    counts[row.status] += 1;
  }
  return counts;
}
