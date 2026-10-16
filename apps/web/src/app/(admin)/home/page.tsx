import { redirect } from "next/navigation";

/** Legacy mobile/home alias — canonical route is `/dashboard`. */
export default function HomeRedirectPage() {
  redirect("/dashboard");
}
