"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";

const AiWorkspace = dynamic(() => import("@/components/ai/ai-workspace").then((m) => m.AiWorkspace), {
  ssr: false,
  loading: () => <ListGridOpenFallback label="Opening Aladin…" />,
});

function AiPageBody() {
  const search = useSearchParams();
  const conversationId = search.get("c");
  return <AiWorkspace initialConversationId={conversationId} />;
}

/** /ai — ChatGPT-style workspace: history on the left, active chat on the right (`?c=<id>`). */
export default function AiPage() {
  return (
    <Suspense fallback={<ListGridOpenFallback label="Opening Aladin…" />}>
      <AiPageBody />
    </Suspense>
  );
}
