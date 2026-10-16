"use client";

import { AiRobotAvatar } from "@/components/ai/ai-robot-avatar";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store/app-store";
import { useEffect } from "react";

export function TopNavAiAssistant() {
  const setAiDrawerOpen = useAppStore((s) => s.setAiDrawerOpen);
  const toggleAiDrawer = useAppStore((s) => s.toggleAiDrawer);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleAiDrawer();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [toggleAiDrawer]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 shrink-0 rounded-none"
      data-component="WS-HEADER-AI"
      onClick={() => setAiDrawerOpen(true)}
      title="AI Assistant (Ctrl+J)"
      aria-label="Open AI assistant"
      aria-keyshortcuts="Control+J"
    >
      <AiRobotAvatar mood="calm" showGlow={false} className="h-6 w-6 text-violet-500 dark:text-violet-400" />
    </Button>
  );
}
