"use client";

import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link2, X } from "lucide-react";
import { normalizeLinkForStorage } from "@/lib/editor/editor-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultUrl?: string;
  defaultText?: string;
  onInsert: (data: { url: string; text: string; openInNewWindow: boolean }) => void;
};

export function EditorInsertLinkDialog({
  open,
  onOpenChange,
  defaultUrl = "",
  defaultText = "",
  onInsert,
}: Props) {
  const [url, setUrl] = useState(defaultUrl);
  const [text, setText] = useState(defaultText);
  const [openInNewWindow, setOpenInNewWindow] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUrl(defaultUrl);
    setText(defaultText);
    setOpenInNewWindow(false);
  }, [open, defaultUrl, defaultText]);

  const normalized = useMemo(() => normalizeLinkForStorage(url), [url]);

  const handleInsert = () => {
    if (!normalized.href) return;
    onInsert({
      url: normalized.href,
      text: text.trim() || normalized.preview || normalized.href,
      openInNewWindow,
    });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[100] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-input bg-background p-4 shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <Dialog.Title className="flex items-center gap-2 text-sm font-semibold">
              <Link2 className="h-4 w-4" />
              Insert link
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="editor-link-url" className="text-xs">
                URL
              </Label>
              <Input
                id="editor-link-url"
                className="mt-1 h-8 text-xs"
                placeholder="https://www.website.com/laptop/hp or /laptop/hp"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleInsert();
                  }
                }}
                autoFocus
              />
              {url.trim() && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {normalized.isInternal ? (
                    <>
                      Internal link → stored as <code className="rounded bg-muted px-1">{normalized.preview}</code>
                    </>
                  ) : (
                    <>External link → full URL will be stored</>
                  )}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="editor-link-text" className="text-xs">
                Link text
              </Label>
              <Input
                id="editor-link-text"
                className="mt-1 h-8 text-xs"
                placeholder="Visible label (optional)"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>

            <Switch
              checked={openInNewWindow}
              onCheckedChange={setOpenInNewWindow}
              label="Open in new window"
              description="Adds target=_blank for this link"
            />
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={!normalized.href} onClick={handleInsert}>
              Insert link
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
