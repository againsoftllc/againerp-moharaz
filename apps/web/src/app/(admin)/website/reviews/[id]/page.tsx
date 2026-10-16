"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { use } from "react";

type Props = { params: Promise<{ id: string }> };

/** Legacy full-page route — opens the list with view drawer. */
export default function ReviewDetailRedirectPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();

  useEffect(() => {
    router.replace(`/website/reviews?view=${encodeURIComponent(id)}`);
  }, [id, router]);

  return null;
}
