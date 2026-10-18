import { redirect } from "next/navigation";

/** Modules now live under Apps. */
export default function ModulesPage() {
  redirect("/workspace/apps");
}
