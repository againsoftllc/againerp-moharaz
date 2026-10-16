import { redirect } from "next/navigation";

export default function AddProductPage() {
  redirect("/dropshipping/products?create=1");
}
