import { redirect } from "next/navigation";

/** Legacy URL — Stores moved under Sites. */
export default function WorkspaceStoresRedirect() {
  redirect("/workspace/sites");
}
