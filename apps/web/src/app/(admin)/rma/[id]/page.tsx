import { redirect } from "next/navigation";

/** Claim detail opens as a drawer on the list. Keep old /rma/:id links working. */
export default async function RmaClaimRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/rma?claim=${encodeURIComponent(id)}`);
}
