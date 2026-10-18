import { redirect } from "next/navigation";

/** Claim detail opens as a drawer on the list. Keep old /inventory/rma/:id links working. */
export default async function RmaClaimRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/inventory/rma?claim=${encodeURIComponent(id)}`);
}
