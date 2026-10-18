"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAiChatStore } from "@/lib/store/ai-chat-store";

const AiWorkspace = dynamic(() => import("@/components/ai/ai-workspace").then((m) => m.AiWorkspace), { ssr: false });

/** The AI drawer: Aladin from any page (the AI icon in the top bar). The same chat as /ai and the product-upload drawer. */
export function AiDrawer() {
  const pathname = usePathname();
  const stored = useAiChatStore((s) => s.drawerOpen);
  const setOpen = useAiChatStore((s) => s.setDrawerOpen);
  // on the AI module's own pages the chat is already on screen - the drawer would be a second copy of it
  const open = stored && !pathname.startsWith("/ai");
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        title="Aladin"
        className="flex w-full max-w-none flex-col gap-0 overflow-hidden border-l border-border bg-background p-0 sm:max-w-[520px]"
      >
        {open ? <AiWorkspace variant="drawer" /> : null}
      </SheetContent>
    </Sheet>
  );
}
