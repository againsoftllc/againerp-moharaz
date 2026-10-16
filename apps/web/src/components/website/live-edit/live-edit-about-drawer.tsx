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
import { Switch } from "@/components/ui/switch";
import type { AboutSection, HomepageContent } from "@/lib/website/website-homepage";
import { defaultAboutSection } from "@/lib/website/website-homepage";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: HomepageContent;
  onChange?: (content: HomepageContent) => void;
  onSave?: () => void | Promise<void>;
  saving?: boolean;
};

export function LiveEditAboutDrawer({ open, onOpenChange, content, onChange, onSave, saving = false }: Props) {
  const titleId = useId();
  const [section, setSection] = useState<AboutSection>(content.about ?? defaultAboutSection());

  useEffect(() => {
    if (open) setSection(content.about ?? defaultAboutSection());
  }, [open, content.about]);

  const pushSection = useCallback(
    (next: AboutSection) => {
      setSection(next);
      // Defer parent update — editor may emit onChange while mounting/rendering.
      queueMicrotask(() => {
        onChange?.({ ...content, about: next });
      });
    },
    [content, onChange],
  );

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title="About section"
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
            About
          </span>
        </AgainDrawerControlBar>
        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
          <div className="space-y-4">
            <div className="space-y-3 rounded-md border border-border bg-card p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Common
              </p>
              <AgainFormRow label="Title">
                <Input
                  value={section.title}
                  onChange={(e) => pushSection({ ...section, title: e.target.value })}
                  className="h-8 text-[13px]"
                  placeholder="Monarch IT Ltd"
                />
              </AgainFormRow>
              <AgainFormRow label="Sub Title">
                <Input
                  value={section.subtitle}
                  onChange={(e) => pushSection({ ...section, subtitle: e.target.value })}
                  className="h-8 text-[13px]"
                  placeholder="A Trusted Computer Distributor…"
                />
              </AgainFormRow>
              <AgainFormRow
                label="Collapse"
                help="On = body starts collapsed with expand button · Off = full text always visible"
              >
                <div className="flex h-8 items-center">
                  <Switch
                    checked={section.collapseEnabled}
                    onCheckedChange={(checked) =>
                      pushSection({ ...section, collapseEnabled: checked })
                    }
                  />
                </div>
              </AgainFormRow>
            </div>

            <div className="space-y-2">
              <AgaincartClassicEditor
                value={section.bodyHtml}
                onChange={(v) => {
                  if (v === section.bodyHtml) return;
                  pushSection({ ...section, bodyHtml: v });
                }}
                placeholder="Write about content…"
                minRows={14}
                aiContext="generic"
                shellClassName={EDITOR_SHELL_DRAWER_FLUSH}
                aiVariables={{
                  section_title: section.title,
                  section_subtitle: section.subtitle,
                  current_content: section.bodyHtml,
                }}
              />
            </div>
          </div>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}
