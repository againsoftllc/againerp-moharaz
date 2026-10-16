import type { Metadata } from "next";
import { PublicInvoiceView } from "@/components/sales/public-invoice-view";

export const metadata: Metadata = {
  title: "Invoice",
  robots: { index: false, follow: false },
};

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  return (
    <div className="min-h-screen bg-[#ececec] text-[#212529]">
      <PublicInvoiceView invoiceKey={key} />
    </div>
  );
}
