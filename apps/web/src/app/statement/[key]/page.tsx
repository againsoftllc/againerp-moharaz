import type { Metadata } from "next";
import { PublicLedgerStatementView } from "@/components/finance/public-ledger-statement-view";

export const metadata: Metadata = {
  title: "Account statement",
  robots: { index: false, follow: false },
};

export default async function PublicLedgerStatementPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  return <PublicLedgerStatementView shareKey={decodeURIComponent(key)} />;
}
