import { redirect } from "next/navigation";

/** Legacy URL — Website menu moved to Sites. */
export default function WorkspaceWebsiteRedirect() {
  redirect("/workspace/sites");
}
