import { redirect } from "next/navigation";
import { PURCHASE_HOME } from "@/lib/purchase/purchase-paths";

export default function PurchaseIndexPage() {
  redirect(PURCHASE_HOME);
}
