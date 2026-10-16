export const COMMAND_PALETTE_OPEN_EVENT = "againerp:open-command-palette";

export function openCommandPalette() {
  if (typeof document !== "undefined") {
    document.dispatchEvent(new CustomEvent(COMMAND_PALETTE_OPEN_EVENT));
  }
}
