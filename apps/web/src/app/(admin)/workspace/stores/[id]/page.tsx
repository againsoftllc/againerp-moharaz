import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ id: string }>;
};

/** Legacy URL — store settings now live under Sites. */
export default async function WorkspaceStoreIdRedirect({ params }: Props) {
  const { id } = await params;
  redirect(`/website/configuration/sites/${id}`);
}
