import { redirect } from "next/navigation";

export default function AddProductPage() {
  redirect("/website/products?create=1");
}
