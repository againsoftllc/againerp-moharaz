"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageResizeOverlay } from "@/components/products/image-resize-overlay";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code2,
  Eraser,
  Eye,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  MessageSquare,
  Quote,
  Sparkles,
  Strikethrough,
  Underline,
} from "lucide-react";
import { cleanEditorHtml } from "@/lib/editor/editor-clean-html";
import { streamEditorAiIntoEditor } from "@/lib/editor/editor-ai-mock";
import {
  mergePromptVariables,
  type EditorAiContextId,
} from "@/lib/editor/editor-ai-prompts";
import { getEditorPrePrompt } from "@/lib/store/ai-prompts-store";
import {
  applyBlockFormat,
  BLOCK_FORMATS,
  ensureSelectionInside,
  getCurrentBlockFormat,
  type BlockFormat,
} from "@/lib/editor/editor-format";
import {
  buildAnchorHtml,
  cloneVisualSelectionRange,
  insertHtmlIntoContentEditable,
  normalizeEditorHtmlLinks,
  wrapCodeSelectionWithLink,
} from "@/lib/editor/editor-link";
import { countEditorStats } from "@/lib/editor/editor-stats";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { EditorInsertLinkDialog } from "@/components/products/editor-insert-link-dialog";
import { EditorAiChatDrawer } from "@/components/products/editor-ai-chat-drawer";
import { MediaLibraryModal } from "@/components/media/media-library-modal";
import { cn } from "@/lib/utils";

type EditorMode = "visual" | "code";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number;
  /** Label shown in toolbar left of Add Media */
  fieldLabel?: string;
  /** Maps to Settings → AI → Prompts template for preset icon */
  aiContext?: EditorAiContextId;
  aiVariables?: Record<string, string | undefined>;
  /** Override outer shell — e.g. drawer-flush embed in blog article drawer */
  shellClassName?: string;
  /** Extra classes on the contenteditable / code body (e.g. smaller type for short desc) */
  editorClassName?: string;
};

const EDITOR_SHELL_DEFAULT =
  "overflow-hidden rounded-none border border-input bg-background shadow-sm";

/** Full-width drawer embed: no side borders, rounded bottom, flush with drawer edges. */
export const EDITOR_SHELL_DRAWER_FLUSH =
  "overflow-hidden rounded-none border-x-0 border-b border-input bg-background shadow-none";

const TOOLBAR: {
  cmd: string;
  icon: typeof Bold;
  label: string;
  arg?: string;
}[] = [
  { cmd: "bold", icon: Bold, label: "Bold" },
  { cmd: "italic", icon: Italic, label: "Italic" },
  { cmd: "underline", icon: Underline, label: "Underline" },
  { cmd: "strikeThrough", icon: Strikethrough, label: "Strikethrough" },
  { cmd: "insertUnorderedList", icon: List, label: "Bullet list" },
  { cmd: "insertOrderedList", icon: ListOrdered, label: "Numbered list" },
  { cmd: "formatBlock", icon: Quote, label: "Quote", arg: "<blockquote>" },
  { cmd: "justifyLeft", icon: AlignLeft, label: "Align left" },
  { cmd: "justifyCenter", icon: AlignCenter, label: "Align center" },
  { cmd: "justifyRight", icon: AlignRight, label: "Align right" },
];

function getVisualSelectedText(container: HTMLElement | null): string {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !container) return "";
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return "";
  return selection.toString();
}

const LINE_HEIGHT_PX = 24;

export function AgaincartClassicEditor({
  value,
  onChange,
  placeholder = "Write your content…",
  minRows = 12,
  fieldLabel,
  aiContext = "generic",
  aiVariables = {},
  shellClassName,
  editorClassName,
}: Props) {
  const [mode, setMode] = useState<EditorMode>("visual");
  const [mediaOpen, setMediaOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [presetRunning, setPresetRunning] = useState(false);
  const [linkDefaultText, setLinkDefaultText] = useState("");
  const [blockFormat, setBlockFormat] = useState<BlockFormat>("p");
  const [editorHeight, setEditorHeight] = useState(minRows * LINE_HEIGHT_PX);
  const visualRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLTextAreaElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const mediaRangeRef = useRef<Range | null>(null);
  const codeSelectionRef = useRef({ start: 0, end: 0 });
  const skipVisualSync = useRef(false);
  const resizeStateRef = useRef({ startY: 0, startHeight: 0 });

  const emitChange = useCallback(
    (html: string) => {
      onChange(normalizeEditorHtmlLinks(html));
    },
    [onChange],
  );

  const exec = useCallback(
    (command: string, arg?: string) => {
      if (mode !== "visual") return;
      visualRef.current?.focus();
      if (savedRangeRef.current) {
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(savedRangeRef.current);
      }
      ensureSelectionInside(visualRef.current);
      document.execCommand(command, false, arg);
      if (visualRef.current) {
        skipVisualSync.current = true;
        emitChange(visualRef.current.innerHTML);
        setBlockFormat(getCurrentBlockFormat(visualRef.current));
      }
    },
    [mode, emitChange],
  );

  const handleBlockFormatChange = useCallback(
    (tag: BlockFormat) => {
      if (mode !== "visual") return;
      visualRef.current?.focus();
      // Restore the saved selection so applyBlockFormat knows which block to change
      if (savedRangeRef.current) {
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(savedRangeRef.current);
      }
      ensureSelectionInside(visualRef.current);
      applyBlockFormat(tag, visualRef.current);
      if (visualRef.current) {
        skipVisualSync.current = true;
        emitChange(visualRef.current.innerHTML);
        setBlockFormat(getCurrentBlockFormat(visualRef.current));
      }
    },
    [mode, emitChange],
  );

  const handleCleanHtml = useCallback(() => {
    const source =
      mode === "code" ? value : (visualRef.current?.innerHTML ?? value);
    const cleaned = cleanEditorHtml(source);

    if (mode === "visual" && visualRef.current) {
      visualRef.current.innerHTML = cleaned;
      skipVisualSync.current = true;
      setBlockFormat(getCurrentBlockFormat(visualRef.current));
    }

    emitChange(cleaned);
  }, [mode, value, emitChange]);

  const applyAiResult = useCallback(
    (html: string) => {
      const cleaned = cleanEditorHtml(html);

      if (mode === "visual" && visualRef.current) {
        visualRef.current.innerHTML = cleaned;
        skipVisualSync.current = true;
        setBlockFormat(getCurrentBlockFormat(visualRef.current));
      }

      emitChange(cleaned);
    },
    [mode, emitChange],
  );

  const runAiPresetIntoEditor = useCallback(async () => {
    if (presetRunning) return;

    const prePrompt = getEditorPrePrompt(aiContext);
    const merged = mergePromptVariables(prePrompt.userPromptTemplate, {
      ...aiVariables,
      current_content: value,
    });
    const prompt = `${prePrompt.systemPrompt}\n\n${merged}`;

    setPresetRunning(true);
    setAiChatOpen(false);

    try {
      await streamEditorAiIntoEditor({
        prompt,
        context: aiContext,
        variables: aiVariables,
        currentContent: value,
        onStream: (partial, done) => {
          if (done) {
            applyAiResult(partial);
            return;
          }

          const typingHtml = `<p>${partial}<span style="opacity:0.55">▌</span></p>`;
          if (mode === "visual" && visualRef.current) {
            skipVisualSync.current = true;
            visualRef.current.innerHTML = typingHtml;
            return;
          }

          if (codeRef.current) {
            codeRef.current.value = `${partial}▌`;
          }
        },
      });
    } finally {
      setPresetRunning(false);
    }
  }, [aiContext, aiVariables, applyAiResult, mode, presetRunning, value]);

  const toggleAiChat = useCallback(() => {
    setAiChatOpen((open) => !open);
  }, []);

  const startResize = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      resizeStateRef.current = { startY: event.clientY, startHeight: editorHeight };

      const onMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientY - resizeStateRef.current.startY;
        const minHeight = minRows * LINE_HEIGHT_PX;
        setEditorHeight(
          Math.max(minHeight, resizeStateRef.current.startHeight + delta),
        );
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [editorHeight, minRows],
  );

  const captureLinkSelection = useCallback(() => {
    if (mode === "visual") {
      savedRangeRef.current = cloneVisualSelectionRange(visualRef.current) ?? savedRangeRef.current;
      setLinkDefaultText(getVisualSelectedText(visualRef.current));
      return;
    }

    if (codeRef.current) {
      codeSelectionRef.current = {
        start: codeRef.current.selectionStart,
        end: codeRef.current.selectionEnd,
      };
      setLinkDefaultText(
        codeRef.current.value.slice(
          codeSelectionRef.current.start,
          codeSelectionRef.current.end,
        ),
      );
      return;
    }

    setLinkDefaultText("");
  }, [mode]);

  const openInsertLink = useCallback(() => {
    captureLinkSelection();
    setLinkOpen(true);
  }, [captureLinkSelection]);

  const handleInsertLinkMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      captureLinkSelection();
    },
    [captureLinkSelection],
  );

  const handleInsertLink = useCallback(
    ({
      url,
      text,
      openInNewWindow,
    }: {
      url: string;
      text: string;
      openInNewWindow: boolean;
    }) => {
      const anchorHtml = buildAnchorHtml({ href: url, text, openInNewWindow });

      if (mode === "code") {
        const { start, end } = codeSelectionRef.current;
        const { next, cursor } = wrapCodeSelectionWithLink(
          value,
          start,
          end,
          anchorHtml,
        );
        emitChange(next);
        requestAnimationFrame(() => {
          if (!codeRef.current) return;
          codeRef.current.focus();
          codeRef.current.setSelectionRange(cursor, cursor);
        });
        return;
      }

      const savedRange = savedRangeRef.current;
      setLinkOpen(false);

      window.setTimeout(() => {
        const container = visualRef.current;
        if (!container) return;

        insertHtmlIntoContentEditable(container, savedRange, anchorHtml);
        skipVisualSync.current = true;
        emitChange(container.innerHTML);
        container.focus();
      }, 0);
    },
    [mode, value, emitChange],
  );

  useEffect(() => {
    if (mode !== "visual" || !visualRef.current || presetRunning) return;
    if (skipVisualSync.current) {
      skipVisualSync.current = false;
      return;
    }
    const normalized = normalizeEditorHtmlLinks(value);
    if (visualRef.current.innerHTML !== normalized) {
      visualRef.current.innerHTML = normalized;
    }
  }, [mode, value, presetRunning]);

  useEffect(() => {
    if (mode !== "visual") return;
    const container = visualRef.current;
    if (!container) return;

    const syncBlockFormat = () => {
      // selectionchange fires for the whole page: a caret in another editor says nothing about this one,
      // so keep this editor's own last caret and block format until the selection is back inside it
      const range = cloneVisualSelectionRange(container);
      if (!range) return;
      setBlockFormat(getCurrentBlockFormat(container));
      // Keep savedRangeRef updated so block format dropdown can restore selection
      savedRangeRef.current = range;
    };

    document.addEventListener("selectionchange", syncBlockFormat);
    container.addEventListener("keyup", syncBlockFormat);
    container.addEventListener("mouseup", syncBlockFormat);
    syncBlockFormat();

    return () => {
      document.removeEventListener("selectionchange", syncBlockFormat);
      container.removeEventListener("keyup", syncBlockFormat);
      container.removeEventListener("mouseup", syncBlockFormat);
    };
  }, [mode]);

  const switchMode = (next: EditorMode) => {
    if (next === mode) return;
    if (mode === "visual" && visualRef.current) {
      emitChange(visualRef.current.innerHTML);
    }
    setMode(next);
  };

  const handleVisualInput = () => {
    if (!visualRef.current) return;
    skipVisualSync.current = true;
    emitChange(visualRef.current.innerHTML);
  };

  const handleCodeChange = (next: string) => {
    emitChange(next);
  };

  const openMediaLibrary = useCallback(() => {
    if (mode === "visual") {
      mediaRangeRef.current = cloneVisualSelectionRange(visualRef.current);
    } else if (codeRef.current) {
      codeSelectionRef.current = {
        start: codeRef.current.selectionStart,
        end: codeRef.current.selectionEnd,
      };
    }
    setMediaOpen(true);
  }, [mode]);

  const handleMediaMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      if (mode === "visual") {
        mediaRangeRef.current = cloneVisualSelectionRange(visualRef.current);
        return;
      }
      if (codeRef.current) {
        codeSelectionRef.current = {
          start: codeRef.current.selectionStart,
          end: codeRef.current.selectionEnd,
        };
      }
    },
    [mode],
  );

  const insertMedia = useCallback(
    (items: { id: string; url: string; alt?: string; title?: string; name: string }[]) => {
      const item = items[0];
      if (!item) return;

      const alt = item.alt ?? item.title ?? item.name;
      const safeAlt = alt.replace(/"/g, "&quot;");
      const imgHtml = `<img data-media-id="${item.id}" src="${item.url}" alt="${safeAlt}" class="alignnone size-medium" />`;

      if (mode === "code") {
        const { start, end } = codeSelectionRef.current;
        const before = value.slice(0, start);
        const after = value.slice(end);
        const spacer = before && !before.endsWith("\n") ? "\n" : "";
        const next = `${before}${spacer}${imgHtml}\n${after}`;
        emitChange(next);
        const cursor = before.length + spacer.length + imgHtml.length + 1;
        requestAnimationFrame(() => {
          if (!codeRef.current) return;
          codeRef.current.focus();
          codeRef.current.setSelectionRange(cursor, cursor);
        });
        return;
      }

      const savedRange = mediaRangeRef.current;

      window.setTimeout(() => {
        const container = visualRef.current;
        if (!container) return;

        insertHtmlIntoContentEditable(container, savedRange, imgHtml);
        skipVisualSync.current = true;
        emitChange(container.innerHTML);
        container.focus();
      }, 0);
    },
    [mode, emitChange, value],
  );

  const isEmpty = !value || value === "<br>" || value === "<div><br></div>";
  const codeValue = normalizeEditorHtmlLinks(value);
  const { words, characters } = countEditorStats(value);
  const minEditorHeight = minRows * LINE_HEIGHT_PX;

  return (
    <>
      <div className={cn(shellClassName ?? EDITOR_SHELL_DEFAULT)}>
        <div className="flex h-7 items-center justify-between border-b border-input bg-muted/30 px-1.5 py-0">
          <div className="flex items-center gap-1">
            {fieldLabel && (
              <span className="mr-0.5 text-[10px] font-medium leading-none text-foreground">
                {fieldLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-5 gap-1 px-1.5 text-[10px]"
              onMouseDown={handleMediaMouseDown}
              onClick={openMediaLibrary}
            >
              <ImagePlus className="h-3 w-3" />
              Add Media
            </Button>
            <div className="flex overflow-hidden rounded-none border border-input bg-background">
            <button
              type="button"
              onClick={() => switchMode("visual")}
              title="Visual"
              aria-label="Visual"
              className={cn(
                "flex h-5 w-6 items-center justify-center transition-colors",
                mode === "visual"
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              <Eye className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => switchMode("code")}
              title="Code"
              aria-label="Code"
              className={cn(
                "flex h-5 w-6 items-center justify-center border-l border-input transition-colors",
                mode === "code"
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              <Code2 className="h-3 w-3" />
            </button>
          </div>
        <div className="flex overflow-hidden rounded-none border border-violet-200 bg-violet-50/50 dark:border-violet-800 dark:bg-violet-950/30">
              <button
                type="button"
                onClick={toggleAiChat}
                title="AI chat — discuss then insert"
                aria-label="AI chat"
                className={cn(
                  "flex h-5 w-6 items-center justify-center transition-colors",
                  aiChatOpen
                    ? "bg-background text-primary"
                    : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                <MessageSquare className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => void runAiPresetIntoEditor()}
                disabled={presetRunning}
                title="AI preset — write into editor from Settings prompt"
                aria-label="AI preset"
                className={cn(
                  "flex h-5 w-6 items-center justify-center border-l border-violet-200 transition-colors dark:border-violet-800",
                  presetRunning
                    ? "bg-background text-violet-600"
                    : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                {presetRunning ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
              </button>
            </div>
          </div>
        </div>

        {mode === "visual" && (
          <div className="flex h-7 flex-wrap items-center gap-0 border-b border-input bg-[#fcfcfc] px-1.5 py-0 dark:bg-muted/20">
            <Select
              value={blockFormat}
              onMouseDown={() => {
                // Save selection before dropdown steals focus (only when it is in this editor)
                savedRangeRef.current =
                  cloneVisualSelectionRange(visualRef.current) ?? savedRangeRef.current;
              }}
              onChange={(e) => handleBlockFormatChange(e.target.value as BlockFormat)}
              className="mr-0.5 h-5 min-w-[100px] items-center border-0 bg-transparent px-1 py-0 text-[10px] leading-none shadow-none focus-visible:ring-1"
              title="Text format"
              aria-label="Text format"
            >
              {BLOCK_FORMATS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
            <div className="mx-0.5 h-3.5 w-px bg-border" />
            {TOOLBAR.map(({ cmd, icon: Icon, label, arg }) => (
              <Button
                key={cmd + (arg ?? "")}
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                title={label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => exec(cmd, arg)}
              >
                <Icon className="h-3 w-3" />
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              title="Insert link"
              onMouseDown={handleInsertLinkMouseDown}
              onClick={openInsertLink}
            >
              <Link2 className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              title="Clean HTML"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleCleanHtml}
            >
              <Eraser className="h-3 w-3" />
            </Button>
          </div>
        )}

        {mode === "code" && (
          <div className="flex items-center justify-end gap-0.5 border-b border-input bg-[#fcfcfc] px-2 py-1 dark:bg-muted/20">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              title="Insert link"
              onMouseDown={handleInsertLinkMouseDown}
              onClick={openInsertLink}
            >
              <Link2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              title="Clean HTML"
              onClick={handleCleanHtml}
            >
              <Eraser className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        <div className="relative">
          {mode === "visual" ? (
            <div className="relative">
              <div
                ref={visualRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleVisualInput}
                className={cn(
                  "overflow-y-auto px-3 py-2 text-sm leading-relaxed outline-none",
                  "[&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-2xl [&_h1]:font-bold",
                  "[&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-xl [&_h2]:font-semibold",
                  "[&_h3]:mb-1.5 [&_h3]:mt-2.5 [&_h3]:text-lg [&_h3]:font-semibold",
                  "[&_h4]:mb-1 [&_h4]:mt-2 [&_h4]:text-base [&_h4]:font-semibold",
                  "[&_p]:mb-1.5",
                  "[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5",
                  "[&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5",
                  "[&_li]:mb-0.5",
                  "[&_blockquote]:border-l-4 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-3 [&_blockquote]:italic",
                  "[&_a]:text-primary [&_a]:underline",
                  "[&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-none",
                  editorClassName,
                )}
                style={{ height: editorHeight, minHeight: minEditorHeight }}
                data-placeholder={placeholder}
              />
              <ImageResizeOverlay
                containerRef={visualRef}
                onResizeEnd={() => {
                  if (visualRef.current) emitChange(visualRef.current.innerHTML);
                }}
              />
              {isEmpty && !presetRunning && (
                <p
                  className={cn(
                    "pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground",
                    editorClassName,
                  )}
                >
                  {placeholder}
                </p>
              )}
            </div>
          ) : (
            <Textarea
              ref={codeRef}
              value={codeValue}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder={placeholder}
              spellCheck={false}
              className="resize-none overflow-y-auto rounded-none border-0 font-mono text-xs leading-relaxed focus-visible:ring-0"
              style={{ height: editorHeight, minHeight: minEditorHeight }}
            />
          )}

          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize editor"
            onMouseDown={startResize}
            className="group flex h-3 cursor-ns-resize items-center justify-center border-t border-input bg-muted/10 hover:bg-muted/30"
          >
            <div className="h-1 w-10 rounded-none bg-border transition-colors group-hover:bg-muted-foreground/40" />
          </div>
        </div>

        <p className="border-t border-input bg-muted/20 px-2 py-1 text-[10px] text-muted-foreground">
          {presetRunning
            ? "AI preset writing into editor…"
            : `${words} ${words === 1 ? "word" : "words"} · ${characters} ${characters === 1 ? "character" : "characters"}`}
        </p>
      </div>

      <EditorAiChatDrawer
        open={aiChatOpen}
        onOpenChange={setAiChatOpen}
        context={aiContext}
        variables={aiVariables}
        currentContent={value}
        onInsert={applyAiResult}
      />

      <EditorInsertLinkDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        defaultText={linkDefaultText}
        onInsert={handleInsertLink}
      />

      <MediaLibraryModal
        open={mediaOpen}
        onOpenChange={setMediaOpen}
        mode="single"
        title="Add Media"
        accept={["image"]}
        onSelect={insertMedia}
      />
    </>
  );
}
