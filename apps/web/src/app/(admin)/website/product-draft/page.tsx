import { redirect } from "next/navigation";

/** Old URL of the Unlisted page — kept so bookmarks and links keep working. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
  }
  const qs = params.toString();
  redirect(qs ? `/website/unlisted?${qs}` : "/website/unlisted");
}
