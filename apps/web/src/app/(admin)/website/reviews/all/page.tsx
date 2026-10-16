"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy URL — redirects to `/website/reviews`. */
export default function AllReviewsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    const qs = typeof window !== "undefined" ? window.location.search : "";
    router.replace(`/website/reviews${qs}`);
  }, [router]);

  return null;
}
