import { redirect } from "next/navigation";

/**
 * Admin Live Edit for Home → storefront Live Edit (same as :3010 login flow).
 * Server redirect avoids a stuck "Opening…" client page.
 */
export default function WebsiteHomeLiveEditPage() {
  const base = (
    process.env.NEXT_PUBLIC_STOREFRONT_URL?.trim() ||
    "http://localhost:3010"
  ).replace(/\/$/, "");
  redirect(`${base}/website/live-edit/home`);
}
