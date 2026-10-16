import { redirect } from "next/navigation";

/** Legacy catalog tab linked here — send users to the Reports hub. */
export default function CatalogProductReportsRedirect() {
  redirect("/reports");
}
