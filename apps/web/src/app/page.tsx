import { redirect } from "next/navigation";

/** Admin app — public root goes to sign-in. */
export default function RootPage() {
  redirect("/login");
}
