import { redirect } from "next/navigation";

export default async function ServiceJobRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/service/jobs?job=${encodeURIComponent(id)}`);
}
