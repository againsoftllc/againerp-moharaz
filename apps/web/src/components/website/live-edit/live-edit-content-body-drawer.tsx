"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { ChevronsRight } from "lucide-react";
import {
  AgainDrawerControlBar,
  AgainDrawerLayout,
  AgainDrawerPanel,
  AgainDrawerScrollBody,
  AGAIN_DRAWER_FIELD_SHEET_CLASS,
  AGAIN_DRAWER_MODULE_LABEL_CLASS,
  AGAIN_DRAWER_RECORD_LABEL_CLASS,
} from "@/components/again/again-drawer";
import { LiveEditDrawerSaveButton } from "@/components/website/live-edit/live-edit-drawer-save-button";
import { AgainFormRow } from "@/components/again/again-form-sheet";
import {
  AgaincartClassicEditor,
  EDITOR_SHELL_DRAWER_FLUSH,
} from "@/components/products/againcart-classic-editor";
import { Input } from "@/components/ui/input";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageName: string;
  bodyHtml: string;
  onChange: (next: { name?: string; bodyHtml?: string }) => void;
  onSave?: () => void | Promise<void>;
  saving?: boolean;
};

export function LiveEditContentBodyDrawer({
  open,
  onOpenChange,
  pageName,
  bodyHtml,
  onChange,
  onSave,
  saving = false,
}: Props) {
  const titleId = useId();
  const [name, setName] = useState(pageName);
  const [html, setHtml] = useState(bodyHtml);

  useEffect(() => {
    if (open) {
      setName(pageName);
      setHtml(bodyHtml);
    }
  }, [open, pageName, bodyHtml]);

  const pushName = useCallback(
    (value: string) => {
      setName(value);
      onChange({ name: value });
    },
    [onChange],
  );

  const pushHtml = useCallback(
    (value: string) => {
      setHtml(value);
      onChange({ bodyHtml: value });
    },
    [onChange],
  );

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title="Page content"
      resizable
      defaultWidth={520}
      widthStorageKey="website-live-edit-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar
          trailing={<LiveEditDrawerSaveButton onSave={onSave} saving={saving} />}
        >
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close drawer"
            title="Close"
            onClick={() => onOpenChange(false)}
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
          <span className={AGAIN_DRAWER_MODULE_LABEL_CLASS}>Website</span>
          <span className="text-muted-foreground">/</span>
          <span className={AGAIN_DRAWER_RECORD_LABEL_CLASS} id={titleId}>
            Content
          </span>
        </AgainDrawerControlBar>
        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
          <div className="space-y-4">
            <div className="space-y-3 rounded-md border border-border bg-card p-2.5">
              <AgainFormRow label="Page title">
                <Input
                  value={name}
                  onChange={(e) => pushName(e.target.value)}
                  className="h-8 text-[13px]"
                />
              </AgainFormRow>
            </div>
            <div className="space-y-2">
              <AgaincartClassicEditor
                value={html}
                onChange={(v) => {
                  if (v === html) return;
                  pushHtml(v);
                }}
                placeholder="Write page content…"
                minRows={16}
                aiContext="generic"
                shellClassName={EDITOR_SHELL_DRAWER_FLUSH}
                aiVariables={{
                  section_title: name,
                  current_content: html,
                }}
              />
            </div>
          </div>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}
