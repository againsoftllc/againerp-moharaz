"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent } from "@/components/ui/sheet";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (label: string, asDefault: boolean) => void;
};

export function UnitTypeFormDrawer({ open, onOpenChange, onCreate }: Props) {
  const [label, setLabel] = useState("");
  const [asDefault, setAsDefault] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setLabel("");
      setAsDefault(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  function submit() {
    const trimmed = label.trim();
    if (!trimmed) {
      inputRef.current?.focus();
      return;
    }
    onCreate(trimmed, asDefault);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title="New unit type"
        resizable
        closeButton="inside"
        className="z-[270] w-[280px] min-w-[160px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 border-b border-input px-3 py-2 pr-10">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                className="h-6 rounded-none px-2 text-[11px]"
                onClick={submit}
              >
                Save
              </Button>
              <p className="text-[12px] font-semibold">New unit type</p>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
            <div>
              <Label className="text-[10px] font-medium text-muted-foreground">Name</Label>
              <Input
                ref={inputRef}
                className="mt-1"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder="e.g. Carton"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-[12px]">
              <input
                type="checkbox"
                checked={asDefault}
                onChange={(e) => setAsDefault(e.target.checked)}
                className="h-3.5 w-3.5 rounded-none border border-input accent-foreground"
              />
              Set as default
            </label>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
