import { redirect } from "next/navigation";

/** Accounting was a mock dashboard. Live books live under Finance. */
export default function AccountingPage() {
  redirect("/finance/dashboard");
}
