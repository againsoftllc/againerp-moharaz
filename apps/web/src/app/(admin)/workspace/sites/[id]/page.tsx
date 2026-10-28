import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ id: string }>;
};

/** Sites moved under Website › Configuration. */
export default async function WorkspaceSiteIdRedirect({ params }: Props) {
  const { id } = await params;
  redirect(`/website/configuration/sites/${id}`);
}
