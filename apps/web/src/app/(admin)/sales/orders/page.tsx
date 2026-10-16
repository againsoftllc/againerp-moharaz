import { redirect } from "next/navigation";

/** Legacy route — Sales list lives at `/sales`. */
export default function SalesOrdersRedirectPage() {
  redirect("/sales");
}
