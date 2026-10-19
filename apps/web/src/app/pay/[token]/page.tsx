import type { Metadata } from "next";
import { PublicPayView } from "@/components/workspace/public-pay-view";

export const metadata: Metadata = {
  title: "Pay your bill",
  robots: { index: false, follow: false },
};

export default async function PublicPayPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ status?: string; message?: string }>;
}) {
  const { token } = await params;
  const { status, message } = await searchParams;
  return (
    <div className="min-h-screen bg-muted/40 text-foreground">
      <PublicPayView token={token} returnStatus={status} returnMessage={message} />
    </div>
  );
}
