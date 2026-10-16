"use client";

import { Button } from "@/components/ui/button";
import { AGAIN_DRAWER_PRIMARY_BTN, AGAIN_DRAWER_PRIMARY_COLOR } from "@/components/again/again-drawer";

type Props = {
  onSave?: () => void | Promise<void>;
  saving?: boolean;
  disabled?: boolean;
};

/** Primary Save control for live-edit drawer chrome (control bar trailing). */
export function LiveEditDrawerSaveButton({ onSave, saving = false, disabled = false }: Props) {
  if (!onSave) return null;
  return (
    <Button
      type="button"
      size="sm"
      className={AGAIN_DRAWER_PRIMARY_BTN}
      style={{ backgroundColor: AGAIN_DRAWER_PRIMARY_COLOR }}
      disabled={disabled || saving}
      onClick={() => void onSave()}
    >
      {saving ? "Saving…" : "Save"}
    </Button>
  );
}
