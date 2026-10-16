"use client";

import { AgaincartClassicEditor } from "@/components/products/againcart-classic-editor";
import type { EditorAiContextId } from "@/lib/editor/editor-ai-prompts";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number;
  fieldLabel?: string;
  aiContext?: EditorAiContextId;
  aiVariables?: Record<string, string | undefined>;
};

/** Compact rich editor — same engine as Description (drag, counts, AI chat/preset). */
export function RichTextEditor({
  minRows = 3,
  aiContext = "product.short_description",
  ...props
}: Props) {
  return (
    <AgaincartClassicEditor
      minRows={minRows}
      aiContext={aiContext}
      editorClassName="text-xs leading-snug"
      {...props}
    />
  );
}
