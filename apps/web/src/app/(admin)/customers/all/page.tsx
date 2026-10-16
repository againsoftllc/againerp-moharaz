import { redirect } from "next/navigation";

/** Legacy route — customers module is a single leaf at /customers. */
export default function AllCustomersRedirect() {
  redirect("/customers");
}
