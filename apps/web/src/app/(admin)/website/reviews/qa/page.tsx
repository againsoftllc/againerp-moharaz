"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy path — Q&A now lives at /website/qa. */
export default function ReviewsQaRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/website/qa");
  }, [router]);

  return null;
}
